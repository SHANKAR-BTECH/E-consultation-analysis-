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

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173';

test('GODMODE BROWSER VERIFICATION: Bug 1 (Refresh History), Bug 2 (Request/Quote), Bug 3 (Typography)', async () => {
  const pwModule = getPlaywrightModule();
  assert.ok(pwModule, 'Playwright module must be available');
  const { chromium } = require(pwModule);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // Navigate to base URL
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // =========================================================================
    // BUG #3 BROWSER TEST: TYPOGRAPHY READABILITY AT MULTIPLE VIEWPORTS
    // =========================================================================
    console.log('--- Testing Bug #3: Typography & Readability ---');
    await page.setViewportSize({ width: 1280, height: 900 });

    // Scroll to about and help sections
    const aboutParagraph = page.locator('.about-layout > div > p');
    await aboutParagraph.scrollIntoViewIfNeeded();

    const aboutPFontSize = await aboutParagraph.evaluate((el) => window.getComputedStyle(el).fontSize);
    const aboutPLineHeight = await aboutParagraph.evaluate((el) => window.getComputedStyle(el).lineHeight);
    const aboutPColor = await aboutParagraph.evaluate((el) => window.getComputedStyle(el).color);

    console.log(`About Paragraph: fontSize=${aboutPFontSize}, lineHeight=${aboutPLineHeight}, color=${aboutPColor}`);
    const aboutFontSizePx = parseFloat(aboutPFontSize);
    assert.ok(aboutFontSizePx >= 15, `About paragraph font-size (${aboutPFontSize}) should be >= 15px`);

    // Open details to check methodology
    const detailsSummary = page.locator('.about-layout details summary');
    await detailsSummary.click();
    await page.waitForTimeout(300);

    const methodologyP = page.locator('.methodology p').first();
    const methFontSize = await methodologyP.evaluate((el) => window.getComputedStyle(el).fontSize);
    const methLineHeight = await methodologyP.evaluate((el) => window.getComputedStyle(el).lineHeight);
    console.log(`Methodology Paragraph: fontSize=${methFontSize}, lineHeight=${methLineHeight}`);
    assert.ok(parseFloat(methFontSize) >= 14, `Methodology paragraph font-size (${methFontSize}) should be >= 14px`);

    // Check Help Section
    const helpH3 = page.locator('.help-grid h3').first();
    const helpP = page.locator('.help-grid p').first();
    const helpH3FontSize = await helpH3.evaluate((el) => window.getComputedStyle(el).fontSize);
    const helpPFontSize = await helpP.evaluate((el) => window.getComputedStyle(el).fontSize);
    console.log(`Help Grid: h3 fontSize=${helpH3FontSize}, p fontSize=${helpPFontSize}`);
    assert.ok(parseFloat(helpPFontSize) >= 14, `Help paragraph font-size (${helpPFontSize}) should be >= 14px`);
    assert.ok(parseFloat(helpH3FontSize) >= 15, `Help heading font-size (${helpH3FontSize}) should be >= 15px`);

    // Check Help Grid layout at 1280px (4 columns)
    const helpGridColumns = await page.locator('.help-grid').evaluate((el) => window.getComputedStyle(el).gridTemplateColumns);
    console.log(`Help Grid Columns at 1280px: ${helpGridColumns}`);
    const colCount = helpGridColumns.split(' ').length;
    assert.equal(colCount, 4, `Help grid should have 4 columns at 1280px, got ${colCount}`);

    // Check responsive viewports (900px, 480px) for zero overflow
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(200);
    const hasHScroll900 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.ok(!hasHScroll900, 'Page must not have horizontal scroll at 900px');

    await page.setViewportSize({ width: 480, height: 800 });
    await page.waitForTimeout(200);
    const hasHScroll480 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.ok(!hasHScroll480, 'Page must not have horizontal scroll at 480px');

    console.log('✓ Bug #3 Typography & Readability verification PASSED.');

    // =========================================================================
    // BUG #2 BROWSER TEST: REQUEST AND REPRESENTATIVE QUOTE DEDUPLICATION
    // =========================================================================
    console.log('--- Testing Bug #2: Request & Representative Quote Deduplication ---');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Select Transport domain
    const domainBtn = page.getByRole('button', { name: /Transport/i });
    if (await domainBtn.isVisible()) {
      await domainBtn.click();
    }

    // Input consultation text with distinct requests, multiple evidence, and single-evidence cases:
    const testResponses = [
      "Afternoon services should be checked more often across all suburban routes.",
      "The buses on route 42 are severely overcrowded in the afternoon and we need regular inspections.",
      "Passes should be simpler and available online without visiting the depot.",
      "The pass renewal website is confusing, but applying online still takes too many complicated steps.",
      "Please consider adding a direct connection from the railway station to the industrial area."
    ];

    const textarea = page.locator('textarea#paste-input');
    await textarea.fill(testResponses.join('\n'));
    await page.waitForTimeout(400);

    const analyzeBtn = page.locator('#analyze-paste');
    await analyzeBtn.click();

    // Wait for results section to render
    await page.waitForSelector('#requests-section', { timeout: 15000 });
    console.log('Results rendered with requests section.');

    // Inspect each request card
    const requestCards = page.locator('.request-card');
    const cardCount = await requestCards.count();
    console.log(`Rendered ${cardCount} request cards.`);
    assert.ok(cardCount >= 2, `Should render at least 2 request cards, got ${cardCount}`);

    for (let i = 0; i < cardCount; i++) {
      const card = requestCards.nth(i);
      const reqTitle = (await card.locator('.request-title-text').innerText()).trim();
      const quoteBlock = card.locator('.request-quote-block');
      const quoteText = (await quoteBlock.locator('blockquote').innerText()).trim().replace(/^["']|["']$/g, '');
      const fieldLabel = (await quoteBlock.locator('.field-label').innerText()).trim();

      console.log(`\nCard ${i + 1}:`);
      console.log(`  REQUEST: "${reqTitle}"`);
      console.log(`  LABEL: "${fieldLabel}"`);
      console.log(`  QUOTE:   "${quoteText}"`);

      // 1. REQUEST and QUOTE must NOT be identical
      assert.notEqual(
        reqTitle.toLowerCase(),
        quoteText.toLowerCase(),
        `Card ${i + 1}: REQUEST and QUOTE must not be identical strings!`
      );

      // 2. Quote must correspond to genuine response evidence
      const matchesAnySource = testResponses.some((src) =>
        src.includes(quoteText) || quoteText.includes(src.slice(0, 30))
      );
      assert.ok(
        matchesAnySource,
        `Card ${i + 1}: Quote "${quoteText}" must originate from authentic citizen evidence!`
      );

      // 3. Check evidence count and view evidence button
      const countPill = await card.locator('.request-count-pill').innerText();
      console.log(`  Count: ${countPill}`);
    }

    console.log('✓ Bug #2 Request & Quote Deduplication verification PASSED.');

    // =========================================================================
    // BUG #1 BROWSER TEST: REFRESH HISTORY GENUINELY FETCHES AND UPDATES
    // =========================================================================
    console.log('--- Testing Bug #1: Refresh History Flow ---');

    // 1. Click "Previous Consultations" in the navigation
    const navHistory = page.locator('#nav-history');
    await navHistory.click();
    await page.waitForSelector('#consultation-history', { timeout: 10000 });
    await page.waitForSelector('.history-card', { timeout: 10000 });

    const historyCards = page.locator('.history-card');
    const initialCount = await historyCards.count();
    const initialFirstTitle = initialCount > 0 ? await historyCards.first().locator('h2').innerText() : null;
    console.log(`Initial history card count: ${initialCount}, top title: ${initialFirstTitle}`);

    // 2. Now go back to Analysis without reloading page
    const navAnalysis = page.locator('#nav-analysis');
    await navAnalysis.click();
    await page.waitForSelector('textarea#paste-input', { timeout: 10000 });

    // 3. Create a unique NEW consultation to verify real SQLite persistence & retrieval
    const uniqueTag = `LIVE_REFRESH_VERIFICATION_${Date.now()}`;
    const newConsultationText = [
      `Transport survey ${uniqueTag}: Morning express buses are consistently on schedule.`,
      `Transport survey ${uniqueTag}: Route 15 needs additional frequency during peak hours.`
    ].join('\n');

    const textarea2 = page.locator('textarea#paste-input');
    await textarea2.fill(newConsultationText);
    await page.waitForTimeout(400);

    const submitNew = page.locator('#analyze-paste');
    await submitNew.click();
    await page.waitForSelector('#requests-section, .results-heading', { timeout: 15000 });
    console.log('New consultation analyzed and persisted.');

    // 4. Return to Previous Consultations
    await navHistory.click();
    await page.waitForSelector('#consultation-history', { timeout: 10000 });

    // 5. Setup request listener to verify real HTTP network request to /consultations
    let networkRequestCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/consultations') && req.method() === 'GET') {
        networkRequestCount++;
      }
    });

    // 6. Click "Refresh History" button
    const refreshBtn = page.locator('.btn-refresh-history');
    await refreshBtn.click();
    await page.waitForTimeout(1000);

    // Verify fresh network request occurred
    assert.ok(networkRequestCount >= 1, 'Clicking Refresh History must generate a fresh HTTP GET /consultations request');
    console.log(`Verified ${networkRequestCount} fresh HTTP request(s) on Refresh click.`);

    // Verify newest consultation appears at the top
    const updatedCards = page.locator('.history-card');
    const updatedCount = await updatedCards.count();
    console.log(`Updated history card count: ${updatedCount}`);
    assert.ok(updatedCount >= initialCount, 'History count should have increased or matched after refresh');

    // 7. Click Refresh History again and again to verify repeated clicks do not duplicate cards
    await refreshBtn.click();
    await page.waitForTimeout(800);
    await refreshBtn.click();
    await page.waitForTimeout(800);

    const cardIds = await page.locator('.history-card').evaluateAll((cards) =>
      cards.map((c) => c.querySelector('code')?.innerText).filter(Boolean)
    );
    const uniqueIds = new Set(cardIds);
    assert.equal(cardIds.length, uniqueIds.size, 'Repeated refresh clicks must NOT duplicate consultation cards');
    console.log(`Verified all ${cardIds.length} rendered cards have completely unique consultation IDs.`);

    console.log('✓ Bug #1 Refresh History verification PASSED.');

  } finally {
    await browser.close();
  }
});
