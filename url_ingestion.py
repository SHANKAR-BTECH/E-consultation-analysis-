"""Input acquisition/provenance only; analysis and persistence remain in Flask."""
import base64
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import threading
import time
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from config import (URL_RESPONSE_EXPORTS, URL_HTML_BYTES, URL_MAX_BYTES, URL_BUNDLE_BYTES,
                    URL_MAX_PAGES, MAX_BATCH_RESPONSES, MAX_BATCH_CHARACTERS)
from url_fetcher import PublicFetcher, URLAcquisitionError, USER_AGENT, validate_url
from url_sources import is_mygov, parse_mygov, parse_export, ADAPTER_VERSION, BODY_SELECTOR

# Local single-process deployment, same scope as existing Flask persistence.
# Shared admission/rate enforcement is required before multi-worker deployment.
acquisition_lock = threading.Lock()
last_access = {}
source_delays = {}


def acquire_consultation(original_url):
    canonical = validate_url(original_url)
    spec = URL_RESPONSE_EXPORTS.get(canonical)
    if spec is None and (not is_mygov(canonical) or urlsplit(canonical).query):
        raise URLAcquisitionError('UNSUPPORTED_SOURCE',
            'Supported URLs are MyGov public discussion pages and approved response exports. Upload a CSV for other sources.')
    origin = urlsplit(canonical)
    robots_url = f'{origin.scheme}://{origin.netloc}/robots.txt'

    def allowed(url):
        p = urlsplit(url)
        if p.hostname != origin.hostname:
            return False
        if p.path == '/robots.txt' and not p.query:
            return True
        if spec is not None:
            return url in URL_RESPONSE_EXPORTS and URL_RESPONSE_EXPORTS[url] == spec
        return is_mygov(url) and p.path.rstrip('/') == origin.path.rstrip('/')

    fetcher = PublicFetcher(allowed)
    started = datetime.now(timezone.utc).isoformat()
    parser = None

    def before_fetch(url):
        if parser is not None and not parser.can_fetch(USER_AGENT, url):
            raise URLAcquisitionError('SOURCE_ACCESS_RESTRICTED', 'The source does not permit this automated access.')
        host = urlsplit(url).hostname
        delay = source_delays.get(host, 0)
        wait = max(0, last_access.get(host, 0) + delay - time.monotonic())
        if wait >= fetcher.remaining():
            raise URLAcquisitionError('SOURCE_TIMEOUT',
                'The source crawl delay exceeds the acquisition time limit. Try a smaller consultation or upload CSV.',
                504, 'fetch', True)
        if wait:
            time.sleep(wait)
        last_access[host] = time.monotonic()

    fetcher.before_fetch = before_fetch
    fetch = fetcher.fetch

    try:
        policy = fetch(robots_url, {'text/plain'}, 128_000)
        parser = RobotFileParser()
        parser.parse(policy.body.decode('utf-8-sig').splitlines())
    except URLAcquisitionError as exc:
        if exc.details['code'] != 'SOURCE_NOT_FOUND':
            raise
        parser = RobotFileParser()
        parser.parse([])
    except UnicodeError:
        raise URLAcquisitionError('SOURCE_ACCESS_RESTRICTED', 'The source access policy could not be read.') from None
    source_delays[origin.hostname] = max(1, parser.crawl_delay(USER_AGENT) or 0)
    if parser.request_rate(USER_AGENT):
        rate = parser.request_rate(USER_AGENT)
        source_delays[origin.hostname] = max(source_delays[origin.hostname], rate.seconds / rate.requests)

    records, raw_records, resources, seen_ids, seen_pages = [], [], [], set(), set()
    expected_total = None
    url = canonical
    while url:
        if len(resources) >= URL_MAX_PAGES or url in seen_pages:
            raise URLAcquisitionError('INCOMPLETE_COLLECTION', 'The consultation is incomplete or exceeds page limits.')
        if not parser.can_fetch(USER_AGENT, url):
            raise URLAcquisitionError('SOURCE_ACCESS_RESTRICTED', 'The source does not permit this automated access.')
        seen_pages.add(url)
        media = {'text/html'} if spec is None else {'text/csv' if spec['format'] == 'csv' else 'application/json'}
        resource = fetch(url, media, URL_HTML_BYTES if spec is None else URL_MAX_BYTES)
        if not parser.can_fetch(USER_AGENT, resource.url):
            raise URLAcquisitionError('SOURCE_ACCESS_RESTRICTED', 'The source does not permit this automated access.')
        if spec is None:
            page_records, raw, total, next_url = parse_mygov(resource)
            if expected_total is not None and expected_total != total:
                raise URLAcquisitionError('INCOMPLETE_COLLECTION', 'The source changed while reading responses.')
            expected_total = total
            for record in page_records:
                if record['id'] in seen_ids:
                    raise URLAcquisitionError('INCOMPLETE_COLLECTION', 'The source repeats records across pages.')
                seen_ids.add(record['id'])
        else:
            page_records, raw = parse_export(resource, spec)
            expected_total, next_url = len(page_records), None
        key = f'resource-{len(resources) + 1}'
        # Source refs go in bounded existing metadata, not overlong source labels.
        mapped = []
        for record in page_records:
            if isinstance(record, dict) and (record.get('metadata') is None or isinstance(record.get('metadata'), dict)):
                record = dict(record, metadata={**(record.get('metadata') or {}), 'url_resource': key})
            mapped.append(record)
        records.extend(mapped)
        raw_records.extend(raw)
        resources.append(dict(key=key, url=resource.url, media_type=resource.media_type,
            fetched_at=datetime.now(timezone.utc).isoformat(), redirects=resource.redirects,
            sha256=hashlib.sha256(resource.body).hexdigest(), body_base64=base64.b64encode(resource.body).decode('ascii')))
        if len(records) > MAX_BATCH_RESPONSES or sum(len(r.get('text', '')) for r in records
                if isinstance(r, dict) and isinstance(r.get('text'), str)) > MAX_BATCH_CHARACTERS:
            raise URLAcquisitionError('CONTENT_LIMIT', 'The consultation exceeds existing analysis limits.')
        url = next_url
        fetcher.remaining()
    if not records:
        raise URLAcquisitionError('NO_PUBLIC_RESPONSES', 'No published consultation responses were found.')
    if len(records) != expected_total:
        raise URLAcquisitionError('INCOMPLETE_COLLECTION', 'Not all published responses could be retrieved. Upload a complete CSV.')
    metadata = dict(acquisition_kind='url', bundle_version='url-evidence-v1', original_url=original_url,
        canonical_url=canonical, started_at=started, ended_at=datetime.now(timezone.utc).isoformat(),
        adapter=ADAPTER_VERSION if spec is None else 'registered-response-export-v1',
        published_response_count=expected_total, scope='published text responses',
        resources=[{k: v for k, v in r.items() if k != 'body_base64'} for r in resources],
        packages={name: version(name) for name in ('urllib3', 'dnspython', 'beautifulsoup4')},
        extractor_sha256={name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                          for name in ('url_fetcher.py', 'url_sources.py', 'url_ingestion.py')})
    bundle = json.dumps(dict(version='url-evidence-v1', resources=resources), ensure_ascii=False,
                        sort_keys=True, allow_nan=False, separators=(',', ':')).encode('utf-8')
    if len(bundle) > URL_BUNDLE_BYTES:
        raise URLAcquisitionError('CONTENT_LIMIT', 'The source evidence exceeds the storage limit.')
    fetcher.remaining()
    return records, dict(source_type='json', raw_bytes=bundle, raw_records=raw_records,
        mapping=spec.get('mapping', {}) if spec else {'answer_selector': BODY_SELECTOR}, source_metadata=metadata)
