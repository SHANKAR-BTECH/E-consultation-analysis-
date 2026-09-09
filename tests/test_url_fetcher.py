"""No external requests: injected DNS/transport tests assert SSRF boundaries."""
import socket
import threading
import time
import unittest
from unittest.mock import MagicMock, patch

import dns.exception
import dns.resolver
from url_fetcher import PublicFetcher, URLAcquisitionError, validate_url, public_address

URL = 'https://www.mygov.in/group-issue/consultation'


class URLSecurityTests(unittest.TestCase):
    def test_public_http_and_https_syntax(self):
        for scheme in ('http', 'https'):
            self.assertEqual(validate_url(URL.replace('https', scheme)), URL.replace('https', scheme))

    def test_unsafe_urls(self):
        for url in (None, '', 'mygov.in', 'file:///etc/passwd', 'ftp://www.mygov.in/x',
                    'http://localhost/x', 'http://a.localhost/x', 'http://127.0.0.1/x',
                    'http://10.1.2.3/x', 'http://169.254.169.254/', 'http://[::1]/',
                    'http://2130706433/', 'http://0x7f000001/', 'http://127.1/',
                    'https://user:password@www.mygov.in/x', 'https://www.mygov.in:5432/',
                    'https://www.mygov.in\\@localhost/', 'https://www.mygov.in/\r\nX:1',
                    'https://www.mygov.in/%0d%0a', 'https://www.mygov.in/#x',
                    'https://www.mygov.in./', 'https://www.mygov.in/%zz'):
            with self.subTest(url=url), self.assertRaises(URLAcquisitionError):
                validate_url(url)

    def test_nonpublic_addresses_including_ipv6(self):
        for ip in ('127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254',
                   '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.1', '::1', 'fc00::1',
                   'fe80::1', '::', 'ff02::1', '::ffff:8.8.8.8', '64:ff9b::a00:1'):
            with self.subTest(ip=ip), self.assertRaises(URLAcquisitionError):
                public_address(ip)
        self.assertEqual(public_address('8.8.8.8'), '8.8.8.8')

    def test_all_dns_answers_checked_before_connection(self):
        fetcher = PublicFetcher(lambda _: True)
        with patch('url_fetcher.dns.resolver.Resolver') as resolver, patch.object(fetcher, '_request') as request:
            resolver.return_value.resolve.side_effect = [['8.8.8.8'], ['::1']]
            with self.assertRaises(URLAcquisitionError):
                fetcher.fetch(URL, {'text/html'}, 100)
            request.assert_not_called()

    def test_dns_timeout_is_safe(self):
        with patch('url_fetcher.dns.resolver.Resolver') as resolver:
            resolver.return_value.resolve.side_effect = dns.exception.Timeout('private resolver details')
            with self.assertRaises(URLAcquisitionError) as caught:
                PublicFetcher(lambda _: True).resolve('www.mygov.in')
            self.assertEqual(caught.exception.status, 504)
            self.assertNotIn('private', str(caught.exception))

    def test_redirect_to_private_never_connects(self):
        fetcher = PublicFetcher(lambda _: True)
        with patch.object(fetcher, 'resolve', return_value=['8.8.8.8']) as resolve, \
                patch.object(fetcher, '_request', return_value=(302, 'http://127.0.0.1/admin', None, b'')) as request:
            with self.assertRaises(URLAcquisitionError):
                fetcher.fetch(URL, {'text/html'}, 100)
            self.assertEqual(request.call_count, 1)
            self.assertEqual(resolve.call_count, 1)

    def test_redirect_rechecks_dns_and_policy(self):
        fetcher = PublicFetcher(lambda u: u.startswith('https://www.mygov.in/'))
        with patch.object(fetcher, 'resolve', side_effect=[['8.8.8.8'], URLAcquisitionError('URL_NOT_ALLOWED','blocked')]) as resolve, \
                patch.object(fetcher, '_request', return_value=(302, '/new', None, b'')) as request:
            with self.assertRaises(URLAcquisitionError):
                fetcher.fetch(URL, {'text/html'}, 100)
            self.assertEqual(resolve.call_count, 2)
            self.assertEqual(request.call_count, 1)

    def test_redirect_limit_and_https_downgrade(self):
        for target in ('http://www.mygov.in/new', '/new'):
            fetcher = PublicFetcher(lambda _: True)
            with patch.object(fetcher, 'resolve', return_value=['8.8.8.8']), \
                    patch.object(fetcher, '_request', side_effect=[(302, target + str(i), None, b'') for i in range(5)]) as call:
                with self.assertRaises(URLAcquisitionError):
                    fetcher.fetch(URL, {'text/html'}, 100)
                self.assertLessEqual(call.call_count, 4)

    def transport(self, headers=None, chunks=None, status=200):
        response = MagicMock(status=status, headers=headers or {'Content-Type': 'text/html'})
        response.read1.side_effect = chunks or [b'<html/>', b'']
        connection = MagicMock()
        connection.getresponse.return_value = response
        return connection, response

    def test_pinned_tls_host_and_no_automatic_credentials(self):
        connection, response = self.transport()
        with patch('url_fetcher.HTTPSConnection', return_value=connection) as factory:
            result = PublicFetcher(lambda _: True)._request(URL, ['8.8.8.8'], 100, {'text/html'})
        self.assertEqual(result[3], b'<html/>')
        self.assertEqual(factory.call_args.kwargs['host'], '8.8.8.8')
        self.assertEqual(factory.call_args.kwargs['server_hostname'], 'www.mygov.in')
        self.assertEqual(factory.call_args.kwargs['assert_hostname'], 'www.mygov.in')
        headers = connection.request.call_args.kwargs['headers']
        self.assertEqual(headers['Host'], 'www.mygov.in')
        self.assertNotIn('Authorization', headers)
        self.assertNotIn('Cookie', headers)
        response.close.assert_called_once()
        connection.close.assert_called_once()

    def test_content_limits_mime_compression_and_failures(self):
        cases = [({'Content-Type':'image/png'}, [b''], 200, 'UNSUPPORTED_FORMAT'),
                 ({'Content-Type':'text/html','Content-Length':'101'}, [b''], 200, 'CONTENT_LIMIT'),
                 ({'Content-Type':'text/html'}, [b'x'*101], 200, 'CONTENT_LIMIT'),
                 ({'Content-Type':'text/html','Content-Encoding':'gzip'}, [b''], 200, 'UNSUPPORTED_FORMAT'),
                 ({'Content-Type':'text/html'}, [b''], 403, 'SOURCE_ACCESS_RESTRICTED'),
                 ({'Content-Type':'text/html'}, [b''], 500, 'SOURCE_UNAVAILABLE')]
        for headers, chunks, status, code in cases:
            with self.subTest(code=code):
                connection, response = self.transport(headers, chunks, status)
                with patch('url_fetcher.HTTPSConnection', return_value=connection), self.assertRaises(URLAcquisitionError) as caught:
                    PublicFetcher(lambda _: True)._request(URL, ['8.8.8.8'], 100, {'text/html'})
                self.assertEqual(caught.exception.details['code'], code)
                response.close.assert_called_once()

    def test_connection_timeout(self):
        connection, _ = self.transport()
        connection.connect.side_effect = socket.timeout()
        with patch('url_fetcher.HTTPSConnection', return_value=connection), self.assertRaises(URLAcquisitionError) as caught:
            PublicFetcher(lambda _: True)._request(URL, ['8.8.8.8'], 100, {'text/html'})
        self.assertEqual(caught.exception.status, 504)

    def test_total_deadline_interrupts_body_even_after_connection_releases_socket(self):
        connection, response = self.transport()
        stopped = threading.Event()
        sock = connection.sock
        sock.shutdown.side_effect = lambda _: stopped.set()
        def headers():
            connection.sock = None  # HTTP/1.0 / Connection: close response owns its socket.
            return response
        connection.getresponse.side_effect = headers
        def read(*args, **kwargs):
            stopped.wait(1)
            raise OSError('connection interrupted')
        response.read1.side_effect = read
        start = time.monotonic()
        with patch('url_fetcher.HTTPSConnection', return_value=connection), self.assertRaises(URLAcquisitionError) as caught:
            PublicFetcher(lambda _: True, seconds=.05)._request(URL, ['8.8.8.8'], 100, {'text/html'})
        self.assertEqual(caught.exception.status, 504)
        self.assertLess(time.monotonic() - start, .5)
