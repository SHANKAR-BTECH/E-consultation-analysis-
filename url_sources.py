"""Explicit MyGov comment boundaries and operator-registered response exports."""
from datetime import datetime
from zoneinfo import ZoneInfo
import io
import json
import re
from urllib.parse import urlsplit, urljoin, parse_qs

from bs4 import BeautifulSoup
from csv_ingestion import parse_csv, map_csv
from analysis_service import AnalysisError
from url_fetcher import URLAcquisitionError

ADAPTER_VERSION = 'mygov-published-comments-v1'
BODY_SELECTOR = '#comment-list .comments-row .field--name-comment-body'


def is_mygov(url):
    p = urlsplit(url)
    return (p.hostname == 'www.mygov.in'
            and re.fullmatch(r'/group-issue/[a-z0-9]+(?:-[a-z0-9]+)*/?', p.path) is not None
            and (not p.query or re.fullmatch(r'page=[0-9]{1,3}', p.query) is not None))


def text_body(node):
    # Plain-text evidence only. Inline formatting must not split words or sentences.
    for unwanted in node.select('script,style,nav,header,footer,form,button,iframe,object,svg, '
                                  '[hidden],[aria-hidden="true"],.cookie-banner,.advertisement'):
        unwanted.decompose()
    for br in node.find_all('br'):
        br.replace_with('\n')
    for block in node.find_all(['p', 'div', 'li', 'blockquote']):
        block.insert_before('\n')
        block.insert_after('\n')
    lines = [re.sub(r'[\t\r\f\v \u00a0]+', ' ', line).strip()
             for line in node.get_text().split('\n')]
    return '\n'.join(line for line in lines if line)


def parse_mygov(resource):
    try:
        html = resource.body.decode('utf-8-sig')
    except UnicodeError:
        raise URLAcquisitionError('UNSUPPORTED_FORMAT', 'The source must use UTF-8 text.') from None
    soup = BeautifulSoup(html, 'html.parser')
    if soup.select_one('#challenge-form,.g-recaptcha,#cf-challenge-running,form[action*="captcha"]'):
        raise URLAcquisitionError('SOURCE_ACCESS_RESTRICTED',
            'CAPTCHA or anti-bot protection prevents extraction. Upload a CSV instead.')
    if not soup.select_one('#comment-list'):
        if soup.select_one('input[type="password"]'):
            raise URLAcquisitionError('SOURCE_ACCESS_RESTRICTED',
                'This source requires authentication. Upload a CSV instead.')
        if soup.select_one('noscript') and re.search(r'enable javascript|javascript is required',
                                                      soup.select_one('noscript').get_text(), re.I):
            raise URLAcquisitionError('JS_REQUIRED',
                'This source requires JavaScript rendering, which is unsupported. Upload a CSV instead.')
        raise URLAcquisitionError('UNSUPPORTED_SOURCE',
            'A supported public consultation response structure was not found. Upload a CSV instead.')
    counts = soup.select('.discuss-comment-stats .total-submission span')
    endings = soup.select('.end-date strong')
    if len(counts) != 1 or len(endings) != 1 or not soup.select_one('h1'):
        raise URLAcquisitionError('EXTRACTION_CHANGED', 'The consultation structure could not be verified.')
    try:
        total_text = counts[0].get_text(strip=True).replace(',', '')
        if not total_text.isdecimal():
            raise ValueError()
        total = int(total_text)
        closed = datetime.strptime(endings[0].get_text(strip=True), '%d/%m/%Y - %H:%M').replace(
            tzinfo=ZoneInfo('Asia/Kolkata')) < datetime.now(ZoneInfo('Asia/Kolkata'))
    except ValueError:
        raise URLAcquisitionError('EXTRACTION_CHANGED', 'The source count or closing date is unsupported.') from None
    rows = soup.select('#comment-list .comments-row')
    if not rows:
        raise URLAcquisitionError('NO_PUBLIC_RESPONSES', 'No published consultation responses were found.')
    records, raw_records = [], []
    for row in rows:
        identity = row.get('id', '')
        bodies = row.select('.field--name-comment-body')
        if not re.fullmatch(r'comment-[0-9]+', identity) or len(bodies) != 1 or row.select('.comments-row'):
            raise URLAcquisitionError('EXTRACTION_CHANGED', 'The response boundaries could not be verified.')
        if row.select('.comment-file, .file, .field--type-file, .field--type-image'):
            raise URLAcquisitionError('UNSUPPORTED_FORMAT',
                'This consultation includes response attachments. Upload a complete text or CSV export instead.')
        raw = dict(source_id=identity, answer_html=str(bodies[0]))
        time_node = row.select_one('.commnet-time')
        if time_node:
            raw['source_timestamp'] = time_node.get_text(' ', strip=True)[:256]
        records.append(dict(id=identity, text=text_body(bodies[0]),
                            source='Published comments: www.mygov.in'))
        raw_records.append(raw)
    next_links = soup.select('.pager__item--next a')
    next_url = urljoin(resource.url, next_links[0]['href']) if len(next_links) == 1 else None
    if len(next_links) > 1 or (soup.select('.pager__item') and total > len(rows) and not next_url
                             and not parse_qs(urlsplit(resource.url).query).get('page')):
        raise URLAcquisitionError('INCOMPLETE_COLLECTION', 'The source pagination could not be verified.')
    if next_url and not closed:
        raise URLAcquisitionError('INCOMPLETE_COLLECTION',
            'Live paginated discussions are unsupported. Use a completed consultation or complete CSV export.')
    return records, raw_records, total, next_url


def parse_export(resource, spec):
    """Only exact operator-reviewed URLs may reach this mapping. No sniffing."""
    try:
        if spec['format'] == 'csv':
            columns, rows = parse_csv(io.BytesIO(resource.body))
            return map_csv(columns, rows, spec.get('mapping', {})), rows
        def pairs(items):
            result = {}
            for key, value in items:
                if key in result:
                    raise ValueError('duplicate key')
                result[key] = value
            return result
        def nonfinite(value):
            raise ValueError('non-finite JSON')
        data = json.loads(resource.body.decode('utf-8-sig'), object_pairs_hook=pairs, parse_constant=nonfinite)
        if not isinstance(data, dict) or not isinstance(data.get('responses'), list) or not data['responses']:
            raise ValueError('response envelope')
        return data['responses'], data['responses']
    except AnalysisError as exc:
        raise URLAcquisitionError('AMBIGUOUS_MAPPING',
            'The response export mapping is unsupported. Upload the CSV and select its columns.') from exc
    except (ValueError, UnicodeError, RecursionError):
        raise URLAcquisitionError('UNSUPPORTED_FORMAT', 'The response export is not valid supported JSON.') from None
