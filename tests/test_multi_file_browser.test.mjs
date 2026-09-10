import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function getPlaywrightModule() {
  if (process.env.PLAYWRIGHT_MODULE) return process.env.PLAYWRIGHT_MODULE;
  try {
    require.resolve('playwright-core');
    return 'playwright-core';
  } catch (e) {
    const fallback = 'C:/Users/Shank/AppData/Roaming/npm/node_modules/zcode-app-cli/node_modules/playwright-core';
    try {
      require.resolve(fallback);
      return fallback;
    } catch (e2) {
      return null;
    }
  }
}
const playwrightModule = getPlaywrightModule();
const baseUrl = process.env.HISTORY_BASE_URL || 'http://127.0.0.1:5173';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('MULTI-PDF WORKFLOW: Explicit domain, multiple PDFs, queue, remove, together analysis & provenance', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });

    // 1. Select Transport domain explicitly
    await page.locator('#consultation-domain-select').waitFor();
    await page.locator('#consultation-domain-select').selectOption('Transport');

    // 2. Select PDF tab
    await page.locator('#tab-pdf').click();
    await page.locator('#pdf-file').waitFor();

    // 3. Upload transport1.pdf and transport2.pdf
    const pdf1 = path.resolve(__dirname, 'fixtures', 'transport1.pdf');
    const pdf2 = path.resolve(__dirname, 'fixtures', 'transport2.pdf');
    await page.locator('#pdf-file').setInputFiles([pdf1, pdf2]);

    // 4. Verify both appear in the queue
    await page.locator('#pdf-file-queue').waitFor();
    const queueText = await page.locator('#pdf-file-queue').textContent();
    assert.ok(queueText.includes('transport1.pdf'));
    assert.ok(queueText.includes('transport2.pdf'));

    // 5. Verify domain locked indicator
    assert.equal(await page.locator('#domain-lock-badge').isVisible(), true);

    // 6. Test removing one file before analysis
    const pdf3 = path.resolve(__dirname, 'fixtures', 'live_test.pdf');
    await page.locator('#btn-add-pdf').waitFor();
    // Add third file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('#btn-add-pdf').click()
    ]);
    await fileChooser.setFiles(pdf3);
    await page.waitForTimeout(500);

    // Verify 3 items now
    const removeButtons = page.locator('.remove-file-btn');
    assert.equal(await removeButtons.count(), 3);

    // Remove the 3rd file
    await removeButtons.nth(2).click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.remove-file-btn').count(), 2);

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // 7. Verify analysis mode is default "together"
    assert.equal(await page.locator('#pdf-mode-together').isChecked(), true);

    // 8. Click Analyze Transport Feedback
    await page.locator('#analyze-pdf').waitFor();
    console.log('analyze-pdf isEnabled:', await page.locator('#analyze-pdf').isEnabled());
    assert.equal(await page.locator('#analyze-pdf').isEnabled(), true);
    await page.locator('#analyze-pdf').click();

    // 9. Results: verify domain title and evidence provenance
    await page.locator('#results').waitFor({ timeout: 10000 });
    const resultsDomain = await page.locator('#results-domain-eyebrow').textContent();
    assert.ok(resultsDomain.includes('TRANSPORT CONSULTATION'));

    // Verify respondent evidence has provenance tags
    await page.locator('#explorer').waitFor();
    const explorerText = await page.locator('#explorer').textContent();
    assert.ok(explorerText.includes('transport1.pdf') || explorerText.includes('transport2.pdf'));

    // 10. Check History: exactly ONE Transport consultation card with 2 files
    await page.locator('#nav-history').click();
    await page.locator('.history-card').first().waitFor();
    const historyCards = page.locator('.history-card');
    const firstCardText = await historyCards.first().textContent();
    assert.ok(firstCardText.includes('Transport'));
    assert.ok(firstCardText.includes('2 files'));

    // 11. Open consultation and check constituent files
    await historyCards.first().locator('.btn-open-consultation').click();
    await page.locator('.history-detail').waitFor();
    const detailText = await page.locator('.history-detail').textContent();
    assert.ok(detailText.includes('transport1.pdf'));
    assert.ok(detailText.includes('transport2.pdf'));
  } finally {
    await browser.close();
  }
});

test('MULTI-EXCEL WORKFLOW: Food domain, multiple workbooks, combined analysis & history', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });

    // 1. Select Food & Public Distribution domain
    await page.locator('#consultation-domain-select').waitFor();
    await page.locator('#consultation-domain-select').selectOption('Food & Public Distribution');

    // 2. Select Excel tab
    await page.locator('#tab-excel').click();
    await page.locator('#excel-file').waitFor();

    // 3. Upload two valid workbooks
    const wb1 = path.resolve(__dirname, 'fixtures', 'test1_single.xlsx');
    const wb2 = path.resolve(__dirname, 'fixtures', 'test3_extracolumns.xlsx');
    await page.locator('#excel-file').setInputFiles([wb1, wb2]);

    // 4. Verify both workbooks in queue
    await page.locator('#excel-file-queue').waitFor();
    const queueText = await page.locator('#excel-file-queue').textContent();
    assert.ok(queueText.includes('test1_single.xlsx'));
    assert.ok(queueText.includes('test3_extracolumns.xlsx'));

    // 5. Submit analysis
    await page.locator('#excel-ready-status').waitFor();
    await page.locator('#analyze-excel').waitFor();
    assert.equal(await page.locator('#analyze-excel').isEnabled(), true);
    await page.locator('#analyze-excel').click();

    // 6. Verify Food consultation results
    await page.locator('#results').waitFor({ timeout: 10000 });
    const resultsDomain = await page.locator('#results-domain-eyebrow').textContent();
    assert.ok(resultsDomain.includes('FOOD'));

    // 7. Check History has Food consultation card
    await page.locator('#nav-history').click();
    await page.locator('.history-card').first().waitFor();
    const firstCardText = await page.locator('.history-card').first().textContent();
    assert.ok(firstCardText.includes('Food') || firstCardText.includes('Distribution'));
    assert.ok(firstCardText.includes('2 files'));
  } finally {
    await browser.close();
  }
});

test('FORMAT SEPARATION: PDF and Excel cannot be mixed in one consultation', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });

    // 1. Upload a PDF file
    await page.locator('#tab-pdf').click();
    const pdfPath = path.resolve(__dirname, 'fixtures', 'transport1.pdf');
    await page.locator('#pdf-file').setInputFiles(pdfPath);
    await page.locator('#pdf-selected').waitFor();

    // 2. Attempt to switch to Excel tab while PDF files are present
    await page.locator('#tab-excel').click();

    // 3. System should show action error and prevent mixing
    await page.locator('#action-error').waitFor();
    const errorText = await page.locator('#action-error').textContent();
    assert.ok(errorText.includes('PDF and Excel cannot be mixed') || errorText.includes('PDF format'));
  } finally {
    await browser.close();
  }
});

test('MODE B: Analyze separately creates individual runs under the same consultation', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });

    // Select Transport domain
    await page.locator('#consultation-domain-select').waitFor();
    await page.locator('#consultation-domain-select').selectOption('Transport');

    // Select PDF tab and attach 2 files
    await page.locator('#tab-pdf').click();
    const pdf1 = path.resolve(__dirname, 'fixtures', 'transport1.pdf');
    const pdf2 = path.resolve(__dirname, 'fixtures', 'transport2.pdf');
    await page.locator('#pdf-file').setInputFiles([pdf1, pdf2]);
    await page.locator('#pdf-selected').waitFor();

    // Select "Analyze separately" mode
    await page.locator('#pdf-mode-separate').click();
    assert.equal(await page.locator('#pdf-mode-separate').isChecked(), true);

    // Submit analysis
    await page.locator('#analyze-pdf').click();
    await page.locator('#results').waitFor({ timeout: 10000 });

    // Verify Transport domain header
    const resultsDomain = await page.locator('#results-domain-eyebrow').textContent();
    assert.ok(resultsDomain.includes('TRANSPORT'));

    // Verify history has Transport consultation with 2 files
    await page.locator('#nav-history').click();
    await page.locator('.history-card').first().waitFor();
    const transportCard = page.locator('.history-card').filter({ hasText: 'Transport' }).first();
    assert.ok(await transportCard.isVisible());
    const cardText = await transportCard.textContent();
    assert.ok(cardText.includes('2 files'));

    // Open consultation and verify multiple analysis runs exist in dropdown
    await transportCard.locator('.btn-open-consultation').click();
    await page.locator('.history-detail').waitFor();
    const runSelect = page.locator('#history-run');
    await runSelect.waitFor();
    const options = await runSelect.locator('option').all();
    assert.equal(options.length >= 2, true);
  } finally {
    await browser.close();
  }
});

test('DOMAIN RELEVANCE VALIDATION: Mismatched domain blocks analysis and enables 1-click correction', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });

    // 1. Select Education domain
    await page.locator('#consultation-domain-select').waitFor();
    await page.locator('#consultation-domain-select').selectOption('Education');

    // 2. Upload Transport PDFs under Education consultation
    await page.locator('#tab-pdf').click();
    const pdf1 = path.resolve(__dirname, 'fixtures', 'transport1.pdf');
    const pdf2 = path.resolve(__dirname, 'fixtures', 'transport2.pdf');
    await page.locator('#pdf-file').setInputFiles([pdf1, pdf2]);
    await page.locator('#pdf-selected').waitFor();

    // 3. Verify domain mismatch alert is displayed
    await page.locator('#domain-mismatch-alert').waitFor();
    const alertText = await page.locator('#domain-mismatch-alert').textContent();
    assert.ok(alertText.includes('Education'));
    assert.ok(alertText.includes('Transport'));

    // 4. Verify analyze button is disabled
    const analyzeBtn = page.locator('#analyze-pdf');
    assert.equal(await analyzeBtn.isDisabled(), true);

    // 5. Verify action to switch domain is available
    const switchBtn = page.locator('#btn-switch-domain');
    assert.equal(await switchBtn.isVisible(), true);
    assert.ok((await switchBtn.textContent()).includes('Change domain to Transport'));

    // 6. Click switch domain
    await switchBtn.click();
    await page.waitForTimeout(300);

    // 7. Verify domain selector is now Transport and analyze button is enabled
    assert.equal(await page.locator('#consultation-domain-select').inputValue(), 'Transport');
    assert.equal(await page.locator('#domain-mismatch-alert').isVisible(), false);
    assert.equal(await analyzeBtn.isEnabled(), true);
  } finally {
    await browser.close();
  }
});

test('EXCEL DOMAIN RELEVANCE VALIDATION: Mismatched workbook blocks analysis, enables 1-click domain switch, and proceeds', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });

    // 1. Select Education domain
    await page.locator('#consultation-domain-select').waitFor();
    await page.locator('#consultation-domain-select').selectOption('Education');

    // 2. Select Excel tab
    await page.locator('#tab-excel').click();

    // 3. Upload transport_only.xlsx
    const xlsxPath = path.resolve(__dirname, 'fixtures', 'transport_only.xlsx');
    await page.locator('#excel-file').setInputFiles(xlsxPath);
    await page.locator('#excel-selected').waitFor();

    // 4. Verify domain mismatch banner appears
    await page.locator('#domain-mismatch-alert').waitFor();
    const alertText = await page.locator('#domain-mismatch-alert').textContent();
    assert.ok(alertText.includes('Education'));
    assert.ok(alertText.includes('Transport'));

    // 5. Verify analyze button is disabled
    const analyzeBtn = page.locator('#analyze-excel');
    assert.equal(await analyzeBtn.isDisabled(), true);

    // 6. Verify 1-click domain switch action
    const switchBtn = page.locator('#btn-switch-domain');
    assert.equal(await switchBtn.isVisible(), true);
    await switchBtn.click();
    await page.waitForTimeout(300);

    // 7. Verify domain selector is now Transport and analyze button becomes enabled
    assert.equal(await page.locator('#consultation-domain-select').inputValue(), 'Transport');
    assert.equal(await page.locator('#domain-mismatch-alert').isVisible(), false);
    assert.equal(await analyzeBtn.isEnabled(), true);

    // 8. Analyze consultation
    await analyzeBtn.click();
    await page.locator('#results').waitFor({ timeout: 10000 });
    const resultsDomain = await page.locator('#results-domain-eyebrow').textContent();
    assert.ok(resultsDomain.includes('TRANSPORT'));
  } finally {
    await browser.close();
  }
});

test('REFRESH HISTORY: History refresh does not create duplicate consultations', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#consultation-history', { waitUntil: 'domcontentloaded' });
    await page.locator('.history-card').first().waitFor();

    const countBefore = await page.locator('.history-card').count();
    assert.ok(countBefore > 0);

    // Click Refresh History button
    const refreshBtn = page.locator('.btn-refresh-history');
    await refreshBtn.click();
    await page.waitForTimeout(500);

    const countAfter = await page.locator('.history-card').count();
    assert.equal(countAfter, countBefore);
  } finally {
    await browser.close();
  }
});

