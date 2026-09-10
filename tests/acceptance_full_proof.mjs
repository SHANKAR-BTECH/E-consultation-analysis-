import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

function queryDb() {
  const pyCode = `
import sqlite3, json
conn = sqlite3.connect("consultation_history.sqlite3")
conn.row_factory = sqlite3.Row
row = conn.execute("""
    SELECT c.id, c.title, c.domain, c.created_at,
           COUNT(DISTINCT i.id) AS file_count,
           (SELECT r.id FROM analysis_runs r WHERE r.consultation_id = c.id ORDER BY r.created_at DESC LIMIT 1) AS run_id,
           (SELECT r.response_count FROM analysis_runs r WHERE r.consultation_id = c.id ORDER BY r.created_at DESC LIMIT 1) AS response_count
    FROM consultations c
    LEFT JOIN imports i ON i.consultation_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC LIMIT 1
""").fetchone()
print(json.dumps(dict(row) if row else {}))
conn.close()
`;
  const res = spawnSync('.\\venv\\Scripts\\python.exe', ['-c', pyCode], { encoding: 'utf-8' });
  if (res.error) throw res.error;
  return JSON.parse(res.stdout.trim());
}

function insertConsultationDirectly(tag) {
  const pyCode = `
import sqlite3, uuid
from datetime import datetime, timezone
conn = sqlite3.connect("consultation_history.sqlite3")
cid = str(uuid.uuid4())
now = datetime.now(timezone.utc).isoformat()
conn.execute("INSERT INTO consultations (id, title, status, created_at, updated_at, domain, input_format) VALUES (?, ?, ?, ?, ?, ?, ?)",
             (cid, "Direct External Consultation " + "${tag}", "ACTIVE", now, now, "Transport", "paste"))
conn.commit()
conn.close()
print(cid)
`;
  const res = spawnSync('.\\venv\\Scripts\\python.exe', ['-c', pyCode], { encoding: 'utf-8' });
  return res.stdout.trim();
}

async function runFullAcceptanceProof() {
  const pw = getPlaywrightModule();
  const { chromium } = require(pw);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const networkLog = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/consultations') && !url.includes('/runs') && res.request().method() === 'GET') {
      let bodyJson = null;
      try {
        bodyJson = await res.json();
      } catch (e) {}
      networkLog.push({
        url,
        status: res.status(),
        statusText: res.statusText(),
        fromServiceWorker: res.fromServiceWorker(),
        headers: res.headers(),
        consultationCount: bodyJson?.consultations?.length || 0,
        topConsultationId: bodyJson?.consultations?.[0]?.id || null,
        topConsultationTitle: bodyJson?.consultations?.[0]?.title || null,
        timestamp: Date.now()
      });
    }
  });

  try {
    console.log('============================================================');
    console.log('STEP 13 & 14 ACCEPTANCE TEST: REAL BROWSER EXECUTION');
    console.log('============================================================\n');

    // 1. Open Previous Consultations
    console.log('Step 1: Opening Previous Consultations...');
    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
    await page.locator('#nav-history').click();
    await page.waitForSelector('.btn-refresh-history', { timeout: 10000 });
    await page.waitForSelector('.history-card', { timeout: 10000 });

    // 2. Record top consultation ID
    const initialTopId = await page.locator('.history-card code').first().innerText();
    const initialCount = await page.locator('.history-card').count();
    console.log(`Step 2: Initial top consultation ID on UI: ${initialTopId}`);
    console.log(`        Initial card count on UI: ${initialCount}`);

    // 3. Go to Analysis
    console.log('\nStep 3: Navigating to Analysis...');
    await page.locator('#nav-analysis').click();
    await page.waitForSelector('textarea#paste-input', { timeout: 10000 });

    // 4. Create a new Transport consultation
    console.log('Step 4: Creating a new Transport consultation...');
    const uniqueTag = `AUDIT_PROOF_${Date.now()}`;
    const feedbackItems = [
      `Transport validation ${uniqueTag}: Route 15 needs more frequent buses during morning hours.`,
      `Transport validation ${uniqueTag}: The bus drivers on route 15 are helpful and polite.`
    ];
    await page.locator('textarea#paste-input').fill(feedbackItems.join('\n'));
    await page.waitForTimeout(300);

    // 5. Confirm analysis succeeds
    console.log('Step 5: Submitting analysis and awaiting results...');
    await page.locator('#analyze-paste').click();
    await page.waitForSelector('.results-heading', { timeout: 15000 });
    console.log('        Analysis succeeded. Results rendered.');

    // 6. Confirm consultation persists in SQLite directly
    console.log('\nStep 6: Verifying direct persistence in SQLite...');
    const sqliteRecord = queryDb();
    console.log('        SQLite Record:');
    console.log(`          ID: ${sqliteRecord.id}`);
    console.log(`          Title: ${sqliteRecord.title}`);
    console.log(`          Domain: ${sqliteRecord.domain}`);
    console.log(`          Created at: ${sqliteRecord.created_at}`);
    console.log(`          File count: ${sqliteRecord.file_count}`);
    console.log(`          Response count: ${sqliteRecord.response_count}`);

    assert.ok(sqliteRecord.id, 'SQLite must contain consultation ID');
    assert.equal(sqliteRecord.response_count, 2, 'SQLite must show 2 responses');

    // 7. Go to Previous Consultations
    console.log('\nStep 7: Returning to Previous Consultations...');
    await page.locator('#nav-history').click();
    await page.waitForSelector('.btn-refresh-history', { timeout: 10000 });
    await page.waitForSelector('.history-card', { timeout: 10000 });

    const cardCountBeforeRefresh = await page.locator('.history-card').count();
    const topCardIdBeforeRefresh = await page.locator('.history-card code').first().innerText();
    console.log(`        Top consultation on page: ${topCardIdBeforeRefresh}`);
    console.log(`        Card count on page: ${cardCountBeforeRefresh}`);

    // Insert an external consultation directly into SQLite while staying on this page
    // to test that Refresh History dynamically pulls new backend state without page reload!
    console.log('\nSimulating concurrent consultation creation in SQLite while staying on history page...');
    const externalTag = `CONCURRENT_${Date.now()}`;
    const externalCid = insertConsultationDirectly(externalTag);
    console.log(`Created external consultation in SQLite: ${externalCid}`);

    // Clear network log to isolate the 3 Refresh clicks
    networkLog.length = 0;
    const refreshBtn = page.locator('.btn-refresh-history');

    // CLICK 1
    console.log('\n------------------------------------------------------------');
    console.log('STEP 14: CLICK 1');
    console.log('------------------------------------------------------------');
    await refreshBtn.click();
    await page.waitForTimeout(1000);

    const click1Net = networkLog[0];
    const click1TopId = await page.locator('.history-card code').first().innerText();
    const click1Count = await page.locator('.history-card').count();

    console.log(`CLICK 1`);
    console.log(`Endpoint: ${click1Net?.url || 'NONE'}`);
    console.log(`HTTP status: ${click1Net?.status || 'NONE'}`);
    console.log(`Network request generated: ${click1Net ? 'YES' : 'NO'}`);
    console.log(`Response consultation count: ${click1Net?.consultationCount}`);
    console.log(`Newest consultation ID: ${click1Net?.topConsultationId}`);
    console.log(`UI Top Card ID: ${click1TopId}`);
    console.log(`UI Card Count: ${click1Count}`);

    assert.ok(click1Net, 'Click 1 must generate a network request');
    assert.equal(click1Net.status, 200, 'Click 1 must return 200 OK');
    assert.equal(click1TopId, externalCid, 'Click 1 UI must show the newly inserted consultation at the top');

    // CLICK 2
    console.log('\n------------------------------------------------------------');
    console.log('STEP 14: CLICK 2');
    console.log('------------------------------------------------------------');
    await refreshBtn.click();
    await page.waitForTimeout(1000);

    const click2Net = networkLog[1];
    const click2TopId = await page.locator('.history-card code').first().innerText();
    const click2Count = await page.locator('.history-card').count();

    console.log(`CLICK 2`);
    console.log(`Endpoint: ${click2Net?.url || 'NONE'}`);
    console.log(`HTTP status: ${click2Net?.status || 'NONE'}`);
    console.log(`Network request generated: ${click2Net ? 'YES' : 'NO'}`);
    console.log(`Response consultation count: ${click2Net?.consultationCount}`);
    console.log(`Newest consultation ID: ${click2Net?.topConsultationId}`);
    console.log(`UI Top Card ID: ${click2TopId}`);
    console.log(`UI Card Count: ${click2Count}`);

    assert.ok(click2Net, 'Click 2 must generate a network request');
    assert.equal(click2Net.status, 200, 'Click 2 must return 200 OK');
    assert.equal(click2TopId, externalCid, 'Click 2 UI top ID must remain identical');
    assert.equal(click2Count, click1Count, 'Click 2 card count must remain identical (no duplicates)');

    // CLICK 3
    console.log('\n------------------------------------------------------------');
    console.log('STEP 14: CLICK 3');
    console.log('------------------------------------------------------------');
    await refreshBtn.click();
    await page.waitForTimeout(1000);

    const click3Net = networkLog[2];
    const click3TopId = await page.locator('.history-card code').first().innerText();
    const click3Count = await page.locator('.history-card').count();

    console.log(`CLICK 3`);
    console.log(`Endpoint: ${click3Net?.url || 'NONE'}`);
    console.log(`HTTP status: ${click3Net?.status || 'NONE'}`);
    console.log(`Network request generated: ${click3Net ? 'YES' : 'NO'}`);
    console.log(`Response consultation count: ${click3Net?.consultationCount}`);
    console.log(`Newest consultation ID: ${click3Net?.topConsultationId}`);
    console.log(`UI Top Card ID: ${click3TopId}`);
    console.log(`UI Card Count: ${click3Count}`);

    assert.ok(click3Net, 'Click 3 must generate a network request');
    assert.equal(click3Net.status, 200, 'Click 3 must return 200 OK');
    assert.equal(click3TopId, externalCid, 'Click 3 UI top ID must remain identical');
    assert.equal(click3Count, click1Count, 'Click 3 card count must remain identical (no duplicates)');

    // Verify all cards have 100% unique IDs on UI
    const allRenderedIds = await page.locator('.history-card code').allInnerTexts();
    const uniqueIds = new Set(allRenderedIds);
    console.log(`\nVerified ${allRenderedIds.length} cards on screen, all ${uniqueIds.size} have unique IDs (0 duplicates).`);
    assert.equal(allRenderedIds.length, uniqueIds.size, 'No duplicate cards on screen');

    console.log('\n============================================================');
    console.log('ALL ACCEPTANCE STEPS AND VERIFICATIONS COMPLETED SUCCESSFULLY');
    console.log('============================================================\n');
  } finally {
    await browser.close();
  }
}

runFullAcceptanceProof();
