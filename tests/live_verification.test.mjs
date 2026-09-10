import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright-core';
const baseUrl = process.env.HISTORY_BASE_URL || 'http://127.0.0.1:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('LIVE VERIFICATION: PDF flow (PDF -> analysis -> SQLite -> history -> open)', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // 1. Navigate to workspace
    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#nav-analysis').waitFor();

    // 2. Select PDF tab
    await page.locator('#tab-pdf').click();
    await page.locator('#pdf-file').waitFor();

    // 3. Attach PDF fixture
    const pdfPath = path.resolve(__dirname, 'fixtures', 'live_test.pdf');
    await page.locator('#pdf-file').setInputFiles(pdfPath);

    // 4. Wait for PDF inspection preview
    await page.locator('#pdf-summary').waitFor();
    await page.locator('#analyze-pdf').waitFor();

    // 5. Click Analyze consultation
    await page.locator('#analyze-pdf').click();

    // 6. Wait for results section
    await page.locator('#results').waitFor({ timeout: 10000 });
    const resultsText = await page.locator('#results').textContent();
    assert.ok(resultsText.includes('Sentiment Overview') || resultsText.includes('Key Findings') || resultsText.includes('positive') || resultsText.includes('negative'));

    // 7. Verify SQLite record was persisted
    const resp = await fetch(baseUrl + '/consultations');
    assert.equal(resp.status, 200);
    const { consultations } = await resp.json();
    assert.ok(consultations.length > 0);
    const latest = consultations[0];
    assert.equal(latest.latest_run?.status, 'COMPLETED');

    // 8. Navigate to Previous Consultations
    await page.locator('#nav-history').click();
    await page.locator('.history-card').first().waitFor();

    // 9. Verify the latest consultation appears in history
    const latestCard = page.locator('.history-card').filter({ hasText: latest.id });
    await latestCard.waitFor();
    assert.equal(await latestCard.count(), 1);

    // 10. Open the consultation from history
    const openBtn = page.getByRole('button', { name: `Open consultation ${latest.id}`, exact: true });
    await openBtn.click();
    await page.locator('#results').waitFor();

    // 11. Return to workspace via "New analysis"
    await page.getByRole('button', { name: 'New analysis', exact: true }).first().click();
    await page.locator('#workspace').waitFor();

    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
});

test('LIVE VERIFICATION: Excel flow (Excel -> analysis -> SQLite -> history -> open)', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // 1. Navigate to workspace
    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#nav-analysis').waitFor();

    // 2. Select Excel tab
    await page.locator('#tab-excel').click();
    await page.locator('#excel-file').waitFor();

    // 3. Attach Excel fixture
    const xlsxPath = path.resolve(__dirname, 'fixtures', 'live_test.xlsx');
    await page.locator('#excel-file').setInputFiles(xlsxPath);

    // 4. Wait for Excel inspection & mapping
    await page.locator('#excel-mapping').waitFor();
    await page.locator('#analyze-excel').waitFor();

    // Verify response column is mapped
    const selectVal = await page.locator('#excel-map-text').inputValue();
    if (!selectVal) {
      await page.locator('#excel-map-text').selectOption({ label: 'Feedback' });
    }

    // 5. Click Analyze consultation
    await page.locator('#analyze-excel').click();

    // 6. Wait for results section
    await page.locator('#results').waitFor({ timeout: 10000 });
    const resultsText = await page.locator('#results').textContent();
    assert.ok(resultsText.includes('Sentiment Overview') || resultsText.includes('Key Findings') || resultsText.includes('positive') || resultsText.includes('negative'));

    // 7. Verify SQLite record was persisted
    const resp = await fetch(baseUrl + '/consultations');
    assert.equal(resp.status, 200);
    const { consultations } = await resp.json();
    assert.ok(consultations.length > 0);
    const latest = consultations[0];
    assert.equal(latest.latest_run?.status, 'COMPLETED');

    // 8. Navigate to Previous Consultations
    await page.locator('#nav-history').click();
    await page.locator('.history-card').first().waitFor();

    // 9. Verify the latest consultation appears in history
    const latestCard = page.locator('.history-card').filter({ hasText: latest.id });
    await latestCard.waitFor();
    assert.equal(await latestCard.count(), 1);

    // 10. Open the consultation from history
    const openBtn = page.getByRole('button', { name: `Open consultation ${latest.id}`, exact: true });
    await openBtn.click();
    await page.locator('#results').waitFor();

    // 11. Return to workspace via "New analysis"
    await page.getByRole('button', { name: 'New analysis', exact: true }).first().click();
    await page.locator('#workspace').waitFor();

    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
});

test('LIVE VERIFICATION: Refresh History flow (create -> Previous Consultations -> Refresh History -> newly created appears -> open)', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    // 1. Navigate to Previous Consultations view
    await page.goto(baseUrl + '/#consultation-history', { waitUntil: 'domcontentloaded' });
    await page.locator('.history-card').first().waitFor();

    // Get count before creation
    const initialCards = await page.locator('.history-card').count();

    // 2. Create a new consultation via backend /analyze
    const createResp = await fetch(baseUrl + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responses: [
          { text: 'Live verification refresh test response: Excellent public service and support.', category: 'LiveTest' }
        ]
      })
    });
    assert.equal(createResp.status, 200);

    // Fetch the consultations list directly to obtain the new ID
    const listResp = await fetch(baseUrl + '/consultations');
    const { consultations } = await listResp.json();
    const newest = consultations[0];
    assert.ok(newest);

    // Before refresh, verify that the new card is not yet in the browser DOM if page hasn't reloaded
    // 3. Click "Refresh History"
    const refreshBtn = page.getByRole('button', { name: 'Refresh History', exact: true });
    await refreshBtn.click();

    // Wait for refresh to complete
    await refreshBtn.waitFor();

    // 4. Verify newly created consultation appears in history
    const newlyCreatedCard = page.locator('.history-card').filter({ hasText: newest.id });
    await newlyCreatedCard.waitFor({ timeout: 5000 });
    assert.equal(await newlyCreatedCard.count(), 1);
    assert.equal(await page.locator('.history-card').count(), initialCards + 1);

    // 5. Open the newly created consultation
    const openBtn = page.getByRole('button', { name: `Open consultation ${newest.id}`, exact: true });
    await openBtn.click();

    // 6. Verify results view is displayed for this consultation
    await page.locator('#results').waitFor();
    const resultsText = await page.locator('#results').textContent();
    assert.ok(resultsText.includes('Live verification refresh test response') || resultsText.includes('Excellent public service'));

    assert.deepEqual(pageErrors, []);
  } finally {
    await browser.close();
  }
});
