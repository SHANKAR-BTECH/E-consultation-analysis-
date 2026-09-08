"""Protect the canonical Flask frontend and its local update behavior."""
import unittest
from server import app


class FrontendSourceTests(unittest.TestCase):
    def test_canonical_page_and_assets(self):
        with app.test_client() as client:
            page = client.get('/')
            self.assertEqual(page.status_code, 200)
            self.assertIn(b'Understand what people', page.data)
            self.assertIn(b'type="module"', page.data)
            self.assertIn(b'/static/js/app.js', page.data)
            self.assertIn(b'/static/css/style.css', page.data)
            self.assertIn(b'"maxResponses"', page.data)
            self.assertEqual(page.headers['Cache-Control'], 'no-store')
            for path in ('css/style.css', 'js/app.js', 'js/render.js', 'js/api.js'):
                asset = client.get('/static/' + path)
                self.assertEqual(asset.status_code, 200)
                self.assertEqual(asset.headers['Cache-Control'], 'no-cache')
                asset.close()

    def test_template_reload_enabled_without_debug_mode(self):
        self.assertTrue(app.config['TEMPLATES_AUTO_RELOAD'])
        self.assertTrue(app.jinja_env.auto_reload)


if __name__ == '__main__':
    unittest.main()
