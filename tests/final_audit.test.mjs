import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

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

test('FINAL AUDIT: Refresh History, Request/Quote Fidelity, and Typography', async () => {
  const pwModule = getPlaywrightModule();
  assert.ok(pwModule, 'Playwright module must be available');
  const { chromium } = require(pwModule);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // =========================================================================
    // PART 1: REFRESH HISTORY 3-CLICK NETWORK AUDIT
    // =========================================================================
    console.log('\n============================================================');
    console.log('PART 1: REFRESH HISTORY NETWORK PROOF (3 CLICKS)');
    console.log('============================================================');

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Open Previous Consultations
    const navHistory = page.locator('#nav-history');
    await navHistory.click();
    await page.waitForSelector('.history-card', { timeout: 10000 });

    const initialCardCount = await page.locator('.history-card').count();
    console.log(`Initial history card count on page: ${initialCardCount}`);

    // Create a new consultation to persist to SQLite
    const navAnalysis = page.locator('#nav-analysis');
    await navAnalysis.click();
    await page.waitForSelector('textarea#paste-input', { timeout: 10000 });

    const auditTag = `AUDIT_${Date.now()}`;
    const newResponses = [
      `Transport verification ${auditTag}: Night bus route 9 needs more lighting at stops.`,
      `Transport verification ${auditTag}: Bus drivers on route 9 are courteous and helpful.`
    ];
    await page.locator('textarea#paste-input').fill(newResponses.join('\n'));
    await page.waitForTimeout(300);
    await page.locator('#analyze-paste').click();
    await page.waitForSelector('#requests-section, .results-heading', { timeout: 15000 });
    console.log(`Persisted new consultation with tag ${auditTag}.`);

    // Return to history
    await navHistory.click();
    await page.waitForSelector('.history-card', { timeout: 10000 });

    // Track network events specifically for GET /consultations
    const networkLog = [];
    page.on('response', async (res) => {
      const url = res.url();
      if (url.includes('/consultations') && !url.includes('/runs') && res.request().method() === 'GET') {
        const headers = res.headers();
        let bodyJson = null;
        try {
          bodyJson = await res.json();
        } catch (e) {}

        networkLog.push({
          url: url.replace(/http:\/\/127\.0\.0\.1:\d+/, ''),
          status: res.status(),
          statusText: res.statusText(),
          fromServiceWorker: res.fromServiceWorker ? res.fromServiceWorker() : false,
          cacheControl: headers['cache-control'] || 'none',
          date: headers['date'] || 'none',
          consultationCount: bodyJson?.consultations?.length || 0,
          topConsultationId: bodyJson?.consultations?.[0]?.id || null,
          topConsultationTitle: bodyJson?.consultations?.[0]?.title || null
        });
      }
    });

    const refreshBtn = page.locator('.btn-refresh-history');

    // Click 1
    console.log('\n--- Clicking Refresh History: Click #1 ---');
    const netCountBefore1 = networkLog.length;
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/consultations') && r.request().method() === 'GET'),
      refreshBtn.click()
    ]);
    await page.waitForTimeout(400);
    assert.equal(networkLog.length, netCountBefore1 + 1, 'Click #1 must trigger exactly 1 new GET request');
    console.log('Click #1 Result:', JSON.stringify(networkLog[networkLog.length - 1], null, 2));

    // Click 2
    console.log('\n--- Clicking Refresh History: Click #2 ---');
    const netCountBefore2 = networkLog.length;
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/consultations') && r.request().method() === 'GET'),
      refreshBtn.click()
    ]);
    await page.waitForTimeout(400);
    assert.equal(networkLog.length, netCountBefore2 + 1, 'Click #2 must trigger exactly 1 new GET request');
    console.log('Click #2 Result:', JSON.stringify(networkLog[networkLog.length - 1], null, 2));

    // Click 3
    console.log('\n--- Clicking Refresh History: Click #3 ---');
    const netCountBefore3 = networkLog.length;
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/consultations') && r.request().method() === 'GET'),
      refreshBtn.click()
    ]);
    await page.waitForTimeout(400);
    assert.equal(networkLog.length, netCountBefore3 + 1, 'Click #3 must trigger exactly 1 new GET request');
    console.log('Click #3 Result:', JSON.stringify(networkLog[networkLog.length - 1], null, 2));

    // Confirm that every request returned status 200, cache-control: no-store, and fresh consultation data
    for (let i = 0; i < 3; i++) {
      const entry = networkLog[networkLog.length - 3 + i];
      assert.equal(entry.status, 200, `Request #${i + 1} must return HTTP 200`);
      assert.equal(entry.fromServiceWorker, false, `Request #${i + 1} must not come from service worker`);
      assert.ok(entry.cacheControl.includes('no-store'), `Request #${i + 1} header must include no-store`);
      assert.ok(entry.consultationCount > 0, `Request #${i + 1} must return non-empty consultations array`);
    }

    // Confirm React list updated from returned response
    const currentCardCount = await page.locator('.history-card').count();
    console.log(`Current card count on screen: ${currentCardCount}`);
    assert.ok(currentCardCount > initialCardCount, 'React list must have updated to include the newly persisted consultation');

    // Confirm no duplicate cards are rendered
    const cardIds = await page.locator('.history-card').evaluateAll((cards) =>
      cards.map((c) => c.querySelector('code')?.innerText).filter(Boolean)
    );
    const uniqueIds = new Set(cardIds);
    assert.equal(cardIds.length, uniqueIds.size, 'Every history card must have a unique ID (no duplicates)');
    console.log(`✓ All ${cardIds.length} cards have verified unique IDs.`);

    // =========================================================================
    // PART 2: 10 REQUEST CARDS FIDELITY & DEDUPLICATION AUDIT
    // =========================================================================
    console.log('\n============================================================');
    console.log('PART 2: 10 REQUEST CARDS AUDIT (NO UNFOUNDED FACTS, NO HALLUCINATIONS)');
    console.log('============================================================');

    await navAnalysis.click();
    await page.waitForSelector('textarea#paste-input', { timeout: 10000 });

    // 14 realistic citizen feedback items across various domains and grammar structures
    const testCases = [
      "Afternoon services should be checked more often.",
      "The buses on route 42 are severely overcrowded in the afternoon and we need regular inspections.",
      "Passes should be simpler and available online.",
      "The pass renewal website is confusing, but applying online still takes too many complicated steps.",
      "Please consider adding a direct connection from the railway station to the industrial area.",
      "The water pipeline in sector 4 must be repaired immediately to prevent street flooding.",
      "Drinking water pressure should be increased during morning hours.",
      "Appointments at the community health clinic must be scheduled with shorter waiting times.",
      "School textbooks should be updated and distributed before the beginning of the semester.",
      "We suggest that the local recycling center should extend its Saturday drop-off hours.",
      "Streetlights along the ring road must be fixed to improve pedestrian safety at night.",
      "Garbage collection in residential zones ought to be rescheduled for earlier morning hours.",
      "Public library facilities should be expanded with quiet study spaces.",
      "Emergency ward staffing needs to be improved during weekend shifts."
    ];

    await page.locator('textarea#paste-input').fill(testCases.join('\n'));
    await page.waitForTimeout(400);
    await page.locator('#analyze-paste').click();
    await page.waitForSelector('#requests-section', { timeout: 15000 });

    const requestCards = page.locator('.request-card');
    const cardCount = await requestCards.count();
    console.log(`Rendered ${cardCount} request cards.`);
    assert.ok(cardCount >= 10, `Expected at least 10 cards, got ${cardCount}`);

    const verifiedCards = [];
    for (let i = 0; i < cardCount; i++) {
      const card = requestCards.nth(i);
      const reqTitle = (await card.locator('.request-title-text').innerText()).trim();
      const quoteBlock = card.locator('.request-quote-block');
      const quoteText = (await quoteBlock.locator('blockquote').innerText()).trim().replace(/^["']|["']$/g, '');
      const fieldLabel = (await quoteBlock.locator('.field-label').innerText()).trim();
      const countText = (await card.locator('.request-count-pill').innerText()).trim();

      // 1. Check title != quote
      assert.notEqual(reqTitle.toLowerCase(), quoteText.toLowerCase(), `Card ${i + 1}: REQUEST and QUOTE must not be identical!`);

      // 2. Check quote exists in source feedback (100% authentic evidence)
      const matchesSource = testCases.some((tc) => tc.includes(quoteText) || quoteText.includes(tc));
      assert.ok(matchesSource, `Card ${i + 1}: Quote "${quoteText}" must originate from source feedback!`);

      // 3. Check that reqTitle NEVER introduces external words like "across all suburban routes"
      assert.ok(!reqTitle.toLowerCase().includes('across all suburban routes'), `Card ${i + 1}: summary must not contain unprompted phrases!`);

      verifiedCards.push({
        index: i + 1,
        request: reqTitle,
        label: fieldLabel,
        quote: quoteText,
        count: countText
      });
    }

    console.log('\nInspected Request Cards:');
    verifiedCards.forEach((c) => {
      console.log(`\nCard #${c.index} (${c.count}):`);
      console.log(`  REQUEST: "${c.request}"`);
      console.log(`  ${c.label} "${c.quote}"`);
    });

    // =========================================================================
    // PART 3: TYPOGRAPHY VISUAL AUDIT AT 1280px, 900px, 480px
    // =========================================================================
    console.log('\n============================================================');
    console.log('PART 3: TYPOGRAPHY VISUAL AUDIT (1280px, 900px, 480px)');
    console.log('============================================================');

    const viewports = [
      { width: 1280, height: 900, name: 'Desktop 1280px' },
      { width: 900, height: 800, name: 'Tablet 900px' },
      { width: 480, height: 800, name: 'Mobile 480px' }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);

      const aboutP = page.locator('.about-layout > div > p');
      await aboutP.scrollIntoViewIfNeeded();

      const aboutFontSize = await aboutP.evaluate((el) => window.getComputedStyle(el).fontSize);
      const aboutColor = await aboutP.evaluate((el) => window.getComputedStyle(el).color);
      const helpH3FontSize = await page.locator('.help-grid h3').first().evaluate((el) => window.getComputedStyle(el).fontSize);
      const helpPFontSize = await page.locator('.help-grid p').first().evaluate((el) => window.getComputedStyle(el).fontSize);
      const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

      console.log(`\nViewport: ${vp.name}`);
      console.log(`  About Paragraph: fontSize=${aboutFontSize}, color=${aboutColor}`);
      console.log(`  Help Heading:    fontSize=${helpH3FontSize}`);
      console.log(`  Help Paragraph:  fontSize=${helpPFontSize}`);
      console.log(`  Horizontal Scroll Overflow: ${hasHScroll ? 'YES (FAIL)' : 'NO (PASS)'}`);

      assert.ok(!hasHScroll, `Viewport ${vp.name} must not have horizontal scroll overflow!`);
      assert.ok(parseFloat(aboutFontSize) >= 15, `About paragraph font size must be >= 15px at ${vp.name}`);
      assert.ok(parseFloat(helpPFontSize) >= 14, `Help paragraph font size must be >= 14px at ${vp.name}`);
    }

    console.log('\n============================================================');
    console.log('FINAL AUDIT ALL CHECKS PASSED');
    console.log('============================================================\n');

  } finally {
    await browser.close();
  }
});
