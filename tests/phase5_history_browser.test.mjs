import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Opt-in, read-only smoke tests against the real Vite -> Flask -> PostgreSQL stack.
// HISTORY_BASE_URL=http://127.0.0.1:5173 PLAYWRIGHT_MODULE=<playwright module path>
const enabled = Boolean(process.env.HISTORY_BASE_URL && process.env.PLAYWRIGHT_MODULE);
test('Refresh History updates the list from both list and saved consultation views',
  { skip: !enabled }, async () => {
    const require = createRequire(import.meta.url);
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      // Remote web fonts are unrelated to the local integration under test.
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const base = process.env.HISTORY_BASE_URL;
      const response = await fetch(base + '/consultations');
      assert.equal(response.status, 200);
      const { consultations } = await response.json();
      assert.ok(consultations.length);
      await page.goto(base + '/#consultation-history', { waitUntil: 'domcontentloaded' });
      await page.locator('.history-card').first().waitFor();
      assert.equal(await page.locator('.history-card').count(), consultations.length);
      for (const item of consultations) {
        assert.equal(await page.locator('.history-card code').filter({ hasText: item.id }).count(), 1);
      }
      const refresh = page.getByRole('button', { name: 'Refresh History', exact: true });
      let release;
      let requests = 0;
      await page.route('**/consultations', async route => {
        requests++;
        await new Promise(resolve => { release = resolve; });
        await route.continue();
      });
      await refresh.click();
      await page.waitForFunction(() => document.querySelector('.btn-refresh-history')?.disabled);
      await page.getByRole('button', { name: 'Refreshing...', exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Refreshing...', exact: true }).isDisabled(), true);
      assert.equal(requests, 1);
      release();
      await refresh.waitFor();
      await page.unroute('**/consultations');
      const selected = consultations.find(c => c.latest_run?.status === 'COMPLETED');
      assert.ok(selected);
      await page.getByRole('button', { name: `Open consultation ${selected.id}`, exact: true }).click();
      await page.locator('#results').waitFor();
      let releaseRun;
      let runStarted;
      const runPending = new Promise(resolve => { runStarted = resolve; });
      await page.route(`**/consultations/${selected.id}/runs/*`, async route => {
        await new Promise(resolve => { releaseRun = resolve; runStarted(); });
        await route.continue();
      });
      const listRefresh = page.waitForResponse(r => new URL(r.url()).pathname === '/consultations', { timeout: 5000 });
      await refresh.click();
      assert.equal((await listRefresh).status(), 200);
      // Finishing the list cannot unlock the button while the saved run is pending.
      await runPending;
      assert.equal(await page.getByRole('button', { name: 'Refreshing...', exact: true }).isDisabled(), true);
      releaseRun();
      await refresh.waitFor();
      await page.unroute(`**/consultations/${selected.id}/runs/*`);
      await page.route('**/consultations', route => route.abort('failed'));
      await refresh.click();
      await page.getByRole('alert').waitFor();
      await refresh.waitFor();
      assert.equal(await refresh.isEnabled(), true);
      await page.unroute('**/consultations');
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await refresh.waitFor();
      await page.getByRole('button', { name: 'Back to consultations', exact: false }).click();
      assert.equal(await page.locator('.history-card').count(), consultations.length);
      await page.route('**/consultations', route => route.abort('failed'));
      await refresh.click();
      await page.getByRole('alert').waitFor();
      assert.equal(await refresh.isEnabled(), true);
      await page.unroute('**/consultations');
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.locator('.history-card').first().waitFor();
      await page.getByRole('link', { name: 'Consultation Analytics home', exact: true }).click();
      await page.locator('#workspace').waitFor();
      await page.getByRole('link', { name: 'Previous Consultations', exact: true }).click();
      await page.getByRole('button', { name: `Open consultation ${selected.id}`, exact: true }).click();
      await page.locator('#results').waitFor();
      await page.getByRole('button', { name: 'New analysis', exact: true }).first().click();
      await page.locator('#workspace').waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
