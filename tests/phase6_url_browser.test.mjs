import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Opt-in real Vite -> Flask browser check. Requires configured PostgreSQL.
// Uses an unsupported URL: no remote acquisition or database writes occur.
const base = process.env.HISTORY_BASE_URL;
const modulePath = process.env.PLAYWRIGHT_MODULE;

test('URL tab renders and same-origin submit reaches source validation',
  { skip: !base || !modulePath }, async () => {
    const require = createRequire(import.meta.url);
    const { chromium } = require(modulePath);
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.locator('#workspace').waitFor();
      assert.ok(await page.getByRole('tab', { name: 'Paste responses', exact: true }).isVisible());
      assert.ok(await page.getByRole('tab', { name: 'Upload CSV', exact: true }).isVisible());
      await page.getByRole('tab', { name: 'Public URL', exact: true }).click();
      const input = page.getByLabel('Public consultation URL');
      const submit = page.locator('#analyze-url');
      assert.ok(await input.isVisible());
      assert.ok(await submit.isVisible());
      assert.ok(await submit.isDisabled());
      const url = 'https://example.com/unsupported-consultation';
      await input.fill(url);
      assert.ok(await submit.isEnabled());
      const pending = page.waitForResponse(response =>
        new URL(response.url()).pathname === '/analyze-url');
      await submit.click();
      const response = await pending;
      assert.equal(response.status(), 422);
      assert.equal((await response.json()).details.code, 'UNSUPPORTED_SOURCE');
      await page.getByRole('alert').first().waitFor();
      assert.equal(await input.inputValue(), url);
      assert.ok(await submit.isEnabled());
      assert.deepEqual(errors, []);

      // Preserving Host must not make a foreign Origin acceptable.
      const foreign = await fetch(base + '/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
        body: JSON.stringify({ url }),
      });
      assert.equal(foreign.status, 403);
      assert.equal((await foreign.json()).message, 'Cross-origin URL analysis is not allowed.');
    } finally {
      await browser.close();
    }
  });
