import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isMetadataColumn,
  isFeedbackColumn,
  findLikelyFeedbackColumn,
  validateFeedbackValues,
  validateSelectedFeedbackColumn,
  findLikelySheet
} from '../frontend/src/lib/excelValidation.js';

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

test('TEST A, B, C, D: 20-row workbook auto-selection, metadata rejection, and re-selection', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-excel').click();
    await page.locator('#excel-file').waitFor();

    const fixture = path.resolve(__dirname, 'fixtures', 'test_consultation_20rows.xlsx');
    await page.locator('#excel-file').setInputFiles(fixture);

    // --- TEST A: Correct workbook ---
    // Columns: Feedback | District | Date
    // Expected: Feedback automatically selected, Analyze enabled, 20 responses ready
    await page.locator('#excel-map-text').waitFor();
    assert.equal(await page.locator('#excel-map-text').inputValue(), 'Feedback');

    await page.locator('#excel-ready-status').waitFor();
    const readyText = await page.locator('#excel-ready-status').textContent();
    assert.ok(readyText.includes('20 feedback responses ready for analysis'));
    assert.equal(await page.locator('#analyze-excel').isEnabled(), true);

    // --- TEST B: Metadata column (District) ---
    // User manually selects: District
    // Expected: District is rejected as feedback. Analyze remains disabled. Show clear validation message.
    await page.locator('#excel-map-text').selectOption({ label: 'District' });
    assert.equal(await page.locator('#excel-ready-status').count(), 0);
    assert.equal(await page.locator('#analyze-excel').isDisabled(), true);

    const validationMsgLoc = page.locator('.notice.error');
    await validationMsgLoc.waitFor();
    const msgB = await validationMsgLoc.textContent();
    assert.ok(
      msgB.includes('This column does not appear to contain citizen feedback') ||
      msgB.includes('Please choose the column containing the actual comments')
    );

    // --- TEST C: Another metadata column (Date) ---
    // User selects: Date
    // Expected: Rejected. Analyze remains disabled.
    await page.locator('#excel-map-text').selectOption({ label: 'Date' });
    assert.equal(await page.locator('#excel-ready-status').count(), 0);
    assert.equal(await page.locator('#analyze-excel').isDisabled(), true);
    assert.ok((await page.locator('.notice.error').textContent()).includes('This column does not appear to contain citizen feedback'));

    // --- TEST D: Actual feedback column (Feedback) ---
    // User selects: Feedback
    // Expected: Accepted. Analyze enabled. 20 responses ready.
    await page.locator('#excel-map-text').selectOption({ label: 'Feedback' });
    await page.locator('#excel-ready-status').waitFor();
    assert.ok((await page.locator('#excel-ready-status').textContent()).includes('20 feedback responses ready for analysis'));
    assert.equal(await page.locator('#analyze-excel').isEnabled(), true);

    // Submit analysis and verify success
    await page.locator('#analyze-excel').click();
    await page.locator('#results').waitFor({ timeout: 10000 });
    assert.ok(await page.locator('#results').isVisible());
  } finally {
    await browser.close();
  }
});

test('TEST E: Short feedback values and safe validation boundaries', () => {
  // Short feedback must be accepted
  const shortFeedback = ['Good', 'Bad', 'Improve buses', 'Very useful'];
  const resValid = validateFeedbackValues(shortFeedback);
  assert.equal(resValid.isValid, true);

  // Sentences must be accepted
  assert.equal(
    validateFeedbackValues(['The bus service is unreliable and needs improvement.']).isValid,
    true
  );
  assert.equal(
    validateFeedbackValues(['Please increase the frequency of buses during peak hours.']).isValid,
    true
  );
  assert.equal(
    validateFeedbackValues(['The new service is helpful, but accessibility could be improved.']).isValid,
    true
  );

  // Metadata values must be rejected
  assert.equal(validateFeedbackValues(['Chennai', 'Madurai', 'North']).isValid, false);
  assert.equal(validateFeedbackValues(['12/03/2026', '13/03/2026']).isValid, false);
  assert.equal(validateFeedbackValues(['Positive', 'Negative', 'Neutral']).isValid, false);
  assert.equal(validateFeedbackValues(['Department A', 'Department B']).isValid, false);
  assert.equal(validateFeedbackValues(['123', '456', '789']).isValid, false);
  assert.equal(validateFeedbackValues(['Government', 'Public']).isValid, false);

  // Column name checks
  assert.equal(isMetadataColumn('District'), true);
  assert.equal(isMetadataColumn('City'), true);
  assert.equal(isMetadataColumn('State'), true);
  assert.equal(isMetadataColumn('Date'), true);
  assert.equal(isMetadataColumn('ID'), true);
  assert.equal(isMetadataColumn('Response ID'), true);
  assert.equal(isMetadataColumn('Source'), true);
  assert.equal(isMetadataColumn('Department'), true);
  assert.equal(isMetadataColumn('Category'), true);
  assert.equal(isMetadataColumn('Sentiment'), true);
  assert.equal(isMetadataColumn('Expected_Sentiment'), true);

  // Feedback names
  assert.equal(isFeedbackColumn('Feedback'), true);
  assert.equal(isFeedbackColumn('Citizen Feedback'), true);
  assert.equal(isFeedbackColumn('Response Text'), true);
  assert.equal(isFeedbackColumn('Public Comment'), true);
});

test('TEST F: Ambiguous workbook does not guess blindly and enables on valid selection', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-excel').click();

    const fixture = path.resolve(__dirname, 'fixtures', 'test4_ambiguous.xlsx');
    await page.locator('#excel-file').setInputFiles(fixture);

    await page.locator('#excel-mapping').waitFor();

    // Verify no automatic guess
    assert.equal(await page.locator('#excel-map-text').inputValue(), '');

    // Verify user is asked to choose feedback column
    assert.ok(await page.locator('.notice.error').isVisible());
    assert.ok((await page.locator('.notice.error').textContent()).includes("couldn't find a column containing feedback responses"));
    assert.equal(await page.locator('#analyze-excel').isDisabled(), true);

    // Select Column B (contains actual feedback responses)
    await page.locator('#excel-map-text').selectOption({ label: 'Column B' });

    // Verify ready status appears and Analyze button unlocks
    await page.locator('#excel-ready-status').waitFor();
    assert.equal(await page.locator('#analyze-excel').isEnabled(), true);

    // Analyze
    await page.locator('#analyze-excel').click();
    await page.locator('#results').waitFor({ timeout: 10000 });
    assert.ok(await page.locator('#results').isVisible());
  } finally {
    await browser.close();
  }
});

test('TEST G: Multiple sheets prioritizes Feedback sheet without manual configuration', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-excel').click();

    const fixture = path.resolve(__dirname, 'fixtures', 'test_multisheet_g.xlsx');
    await page.locator('#excel-file').setInputFiles(fixture);

    // Verify Feedback sheet was prioritized over Instructions and Metadata
    await page.locator('#excel-sheet-select').waitFor();
    assert.equal(await page.locator('#excel-sheet').inputValue(), 'Feedback');

    // Verify feedback column was automatically selected
    await page.locator('#excel-map-text').waitFor();
    assert.equal(await page.locator('#excel-map-text').inputValue(), 'Feedback');

    // Verify ready status and analyze
    await page.locator('#excel-ready-status').waitFor();
    assert.ok((await page.locator('#excel-ready-status').textContent()).includes('2 feedback responses ready for analysis'));
    assert.equal(await page.locator('#analyze-excel').isEnabled(), true);

    await page.locator('#analyze-excel').click();
    await page.locator('#results').waitFor({ timeout: 10000 });
    assert.ok(await page.locator('#results').isVisible());
  } finally {
    await browser.close();
  }
});

test('REGRESSION: Single-sheet workbook auto-detects column, hides sheet selector, and analyzes', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-excel').click();
    await page.locator('#excel-file').waitFor();

    const fixture = path.resolve(__dirname, 'fixtures', 'test1_single.xlsx');
    await page.locator('#excel-file').setInputFiles(fixture);

    await page.locator('#excel-file-name').waitFor();
    assert.equal(await page.locator('#excel-file-name').textContent(), 'test1_single.xlsx');
    assert.equal(await page.locator('#excel-sheet-select').count(), 0);

    await page.locator('#excel-map-text').waitFor();
    assert.equal(await page.locator('#excel-map-text').inputValue(), 'Feedback');

    await page.locator('#excel-ready-status').waitFor();
    const readyText = await page.locator('#excel-ready-status').textContent();
    assert.ok(readyText.includes('3 feedback responses ready for analysis'));

    assert.equal(await page.locator('#analyze-excel').isEnabled(), true);
    await page.locator('#analyze-excel').click();

    await page.locator('#results').waitFor({ timeout: 10000 });
    assert.ok(await page.locator('#results').isVisible());
  } finally {
    await browser.close();
  }
});

test('REGRESSION: Workbook with extra columns auto-selects Feedback and requires no extra configuration', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-excel').click();

    const fixture = path.resolve(__dirname, 'fixtures', 'test3_extracolumns.xlsx');
    await page.locator('#excel-file').setInputFiles(fixture);

    await page.locator('#excel-map-text').waitFor();
    assert.equal(await page.locator('#excel-map-text').inputValue(), 'Feedback');

    assert.equal(await page.locator('#excel-map-date').count(), 0);
    assert.equal(await page.locator('#excel-map-category').count(), 0);
    assert.equal(await page.locator('#excel-map-id').count(), 0);
    assert.equal(await page.locator('#excel-map-source').count(), 0);
    assert.equal(await page.locator('#excel-metadata-columns').count(), 0);

    await page.locator('#analyze-excel').click();
    await page.locator('#results').waitFor({ timeout: 10000 });
    assert.ok(await page.locator('#results').isVisible());
  } finally {
    await browser.close();
  }
});

test('REGRESSION: Empty sheet safely reports backend validation error', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#workspace', { waitUntil: 'domcontentloaded' });
    await page.locator('#tab-excel').click();

    const fixture = path.resolve(__dirname, 'fixtures', 'test5_empty.xlsx');
    await page.locator('#excel-file').setInputFiles(fixture);

    await page.locator('#action-error, .notice.error').first().waitFor({ timeout: 5000 });
    assert.ok(await page.locator('#action-error, .notice.error').first().isVisible());
    assert.equal(await page.locator('#analyze-excel').count(), 0);
  } finally {
    await browser.close();
  }
});

test('REGRESSION: History persistence and Refresh History work seamlessly with redesigned Excel', async () => {
  const { chromium } = require(playwrightModule);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort());

    await page.goto(baseUrl + '/#consultation-history', { waitUntil: 'domcontentloaded' });
    await page.locator('.history-card').first().waitFor();

    const refreshBtn = page.getByRole('button', { name: 'Refresh History', exact: true });
    await refreshBtn.click();
    await refreshBtn.waitFor();

    const openBtn = page.locator('.btn-open-consultation').first();
    await openBtn.click();

    await page.locator('#results').waitFor({ timeout: 10000 });
    assert.ok(await page.locator('#results').isVisible());
  } finally {
    await browser.close();
  }
});
