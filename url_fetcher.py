"""Bounded public HTTP acquisition. No ambient credentials, proxies or redirects."""
from dataclasses import dataclass
import ipaddress
from http.client import HTTPException
import re
import socket
import ssl
import threading
import time
from urllib.parse import urlsplit, urlunsplit, urljoin

import dns.exception
import dns.resolver
from urllib3.connection import HTTPConnection, HTTPSConnection
from urllib3.exceptions import HTTPError, TimeoutError as HTTPTimeout

from config import URL_TOTAL_SECONDS, URL_MAX_BYTES, URL_MAX_REDIRECTS, URL_MAX_REQUESTS

USER_AGENT = 'ConsultationAnalytics/1.0'


class URLAcquisitionError(ValueError):
    def __init__(self, code, message, status=422, stage='extraction', retryable=False):
        super().__init__(message)
        self.status = status
        self.details = dict(code=code, stage=stage, retryable=retryable,
                            suggested_action='retry_later' if retryable else 'upload_csv')


def blocked():
    return URLAcquisitionError('URL_NOT_ALLOWED',
        'This URL destination is not allowed. Use a supported public consultation URL.', 400, 'validation')


def public_address(value):
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        raise blocked() from None
    if (not address.is_global or address.is_multicast or address.is_reserved
            or address.is_loopback or address.is_link_local or address.is_unspecified
            or getattr(address, 'ipv4_mapped', None) or getattr(address, 'sixtofour', None)
            or getattr(address, 'teredo', None)
            or address in ipaddress.ip_network('64:ff9b::/96')
            or address in ipaddress.ip_network('64:ff9b:1::/48')):
        raise blocked()
    return str(address)


def validate_url(value):
    """Syntax/address checks precede source policy and DNS. Never repairs input."""
    if (not isinstance(value, str) or not value or len(value) > 2048
            or re.search(r'[\x00-\x20\x7f\\]', value)
            or re.search(r'%(?![0-9a-fA-F]{2})|%(?:0[0-9a-f]|1[0-9a-f]|7f)', value, re.I)):
        raise URLAcquisitionError('INVALID_URL', 'Enter a valid public HTTP or HTTPS URL.', 400, 'validation')
    try:
        parts = urlsplit(value)
        host, port = parts.hostname, parts.port
        if (parts.scheme not in ('http', 'https') or not host or parts.username is not None
                or parts.password is not None or parts.fragment or '#' in value
                or not re.fullmatch(r'[a-zA-Z0-9.-]+', host)
                or host.endswith('.') or '..' in host
                or port not in (None, 80 if parts.scheme == 'http' else 443)):
            raise blocked()
        if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
            raise blocked()
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise blocked()  # IP-literal input is outside the source registry.
        if not re.fullmatch(r'(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}', host):
            raise blocked()
        return urlunsplit((parts.scheme, host, parts.path or '/', parts.query, ''))
    except (ValueError, UnicodeError) as exc:
        if isinstance(exc, URLAcquisitionError):
            raise
        raise blocked() from None


@dataclass
class Resource:
    url: str
    body: bytes
    media_type: str
    redirects: list


class PublicFetcher:
    def __init__(self, allowed, seconds=URL_TOTAL_SECONDS):
        self.allowed = allowed
        self.deadline = time.monotonic() + seconds
        self.byte_count = 0
        self.request_count = 0
        self.before_fetch = lambda url: None

    def remaining(self):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise URLAcquisitionError('SOURCE_TIMEOUT', 'The public source took too long. Try again later.',
                                      504, 'fetch', True)
        return remaining

    def check_url(self, url):
        url = validate_url(url)
        if not self.allowed(url):
            raise blocked()
        return url

    def resolve(self, host):
        addresses = []
        resolver = dns.resolver.Resolver()
        deadline = time.monotonic() + min(3, self.remaining())
        try:
            for kind in ('A', 'AAAA'):
                lifetime = min(deadline - time.monotonic(), self.remaining())
                if lifetime <= 0:
                    raise dns.exception.Timeout()
                try:
                    answers = resolver.resolve(host + '.', kind, search=False, lifetime=lifetime)
                    addresses.extend(public_address(str(answer)) for answer in answers)
                except dns.resolver.NoAnswer:
                    continue
        except dns.exception.Timeout:
            raise URLAcquisitionError('SOURCE_TIMEOUT', 'The public source took too long. Try again later.',
                                      504, 'fetch', True) from None
        except dns.exception.DNSException:
            raise URLAcquisitionError('SOURCE_UNAVAILABLE', 'The public source could not be reached.',
                                      502, 'fetch', True) from None
        if not addresses:
            raise blocked()
        return addresses

    def _request(self, url, addresses, max_bytes, accepted_types):
        parts = urlsplit(url)
        # Pin the actual socket to a validated numeric address; TLS still verifies
        # the original host. No second DNS lookup, cookies, .netrc or proxy env.
        kwargs = dict(host=addresses[0], port=443 if parts.scheme == 'https' else 80,
                      timeout=min(3, self.remaining()))
        if parts.scheme == 'https':
            connection = HTTPSConnection(**kwargs, server_hostname=parts.hostname,
                assert_hostname=parts.hostname, cert_reqs=ssl.CERT_REQUIRED)
        else:
            connection = HTTPConnection(**kwargs)
        expired = threading.Event()
        active_socket = [None]

        def expire():
            expired.set()
            sock = active_socket[0]
            if sock is not None:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass

        timer = threading.Timer(self.remaining(), expire)
        timer.daemon = True
        response = None
        timer.start()
        try:
            connection.connect()
            active_socket[0] = connection.sock
            self.remaining()
            connection.sock.settimeout(min(5, self.remaining()))
            target = parts.path + ('?' + parts.query if parts.query else '')
            connection.request('GET', target, headers={
                'Host': parts.hostname, 'User-Agent': USER_AGENT,
                'Accept': ', '.join(sorted(accepted_types)), 'Accept-Encoding': 'identity',
                'Connection': 'close'}, preload_content=False, decode_content=False)
            response = connection.getresponse()
            if sum(len(k) + len(v) for k, v in response.headers.items()) > 65_536:
                raise URLAcquisitionError('CONTENT_LIMIT', 'The source response exceeds supported limits.')
            if response.status in (301, 302, 303, 307, 308):
                return response.status, response.headers.get('Location'), None, b''
            if response.status in (401, 403):
                raise URLAcquisitionError('SOURCE_ACCESS_RESTRICTED',
                    'The source requires authentication or blocks automated access. Upload a CSV instead.')
            if response.status == 404:
                raise URLAcquisitionError('SOURCE_NOT_FOUND', 'The public source was not found.')
            if response.status == 429:
                raise URLAcquisitionError('SOURCE_RATE_LIMITED', 'The source is rate limiting access. Try later.',
                                          502, 'fetch', True)
            if response.status != 200:
                raise URLAcquisitionError('SOURCE_UNAVAILABLE', 'The public source could not be read.',
                                          502, 'fetch', True)
            content_type = response.headers.get('Content-Type', '')
            media_type = content_type.split(';', 1)[0].strip().lower()
            charset = re.search(r'charset\s*=\s*["\']?([^;"\'\s]+)', content_type, re.I)
            if media_type not in accepted_types or (charset and charset[1].lower() not in ('utf-8', 'utf8')):
                raise URLAcquisitionError('UNSUPPORTED_FORMAT', 'The source content type or encoding is unsupported.')
            if response.headers.get('Content-Encoding', 'identity').lower() != 'identity':
                raise URLAcquisitionError('UNSUPPORTED_FORMAT', 'Compressed source responses are unsupported.')
            limit = min(max_bytes, URL_MAX_BYTES - self.byte_count)
            length = response.headers.get('Content-Length')
            if length and (not length.isdecimal() or int(length) > limit):
                raise URLAcquisitionError('CONTENT_LIMIT', 'The source exceeds the download size limit.')
            chunks, size = [], 0
            while True:
                self.remaining()
                chunk = response.read1(min(65_536, limit - size + 1), decode_content=False)
                self.remaining()
                if not chunk:
                    break
                size += len(chunk)
                self.byte_count += len(chunk)
                if size > limit:
                    raise URLAcquisitionError('CONTENT_LIMIT', 'The source exceeds the download size limit.')
                chunks.append(chunk)
            if expired.is_set():
                self.remaining()
            return response.status, None, media_type, b''.join(chunks)
        except (OSError, HTTPError, HTTPException, ValueError) as exc:
            if isinstance(exc, URLAcquisitionError):
                raise
            if expired.is_set() or isinstance(exc, (TimeoutError, HTTPTimeout)):
                raise URLAcquisitionError('SOURCE_TIMEOUT', 'The public source took too long. Try again later.',
                                          504, 'fetch', True) from None
            raise URLAcquisitionError('SOURCE_UNAVAILABLE', 'The public source could not be read securely.',
                                      502, 'fetch', True) from None
        finally:
            timer.cancel()
            if response is not None:
                response.close()
            connection.close()

    def fetch(self, url, accepted_types, max_bytes):
        redirects = []
        for hop in range(URL_MAX_REDIRECTS + 1):
            url = self.check_url(url)
            self.remaining()
            self.before_fetch(url)
            self.remaining()
            self.request_count += 1
            if self.request_count > URL_MAX_REQUESTS:
                raise URLAcquisitionError('CONTENT_LIMIT', 'The source needs too many requests.')
            addresses = self.resolve(urlsplit(url).hostname)
            status, location, media_type, body = self._request(url, addresses, max_bytes, accepted_types)
            self.remaining()
            if status == 200:
                return Resource(url, body, media_type, redirects)
            if not location or hop == URL_MAX_REDIRECTS:
                raise URLAcquisitionError('SOURCE_UNAVAILABLE', 'The source redirects too many times.', 502, 'fetch')
            target = self.check_url(urljoin(url, location))
            if urlsplit(url).scheme == 'https' and urlsplit(target).scheme != 'https':
                raise blocked()
            if target == url or target in redirects:
                raise URLAcquisitionError('SOURCE_UNAVAILABLE', 'The source has a redirect loop.', 502, 'fetch')
            redirects.append(url)
            url = target
