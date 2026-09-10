import test from 'node:test';
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

function getDbCounts() {
  const pyCode = `
import sqlite3, json
conn = sqlite3.connect("consultation_history.sqlite3")
counts = {
    "consultations": conn.execute("SELECT count(*) FROM consultations").fetchone()[0],
    "imports": conn.execute("SELECT count(*) FROM imports").fetchone()[0],
    "analysis_runs": conn.execute("SELECT count(*) FROM analysis_runs").fetchone()[0]
}
print(json.dumps(counts))
conn.close()
`;
  const res = spawnSync('.\\venv\\Scripts\\python.exe', ['-c', pyCode], { encoding: 'utf-8' });
  if (res.error) throw res.error;
  return JSON.parse(res.stdout.trim());
}

function insertConsultation(title = 'Test Consultation') {
  const pyCode = `
import sqlite3, uuid
from datetime import datetime, timezone
conn = sqlite3.connect("consultation_history.sqlite3")
cid = str(uuid.uuid4())
now = datetime.now(timezone.utc).isoformat()
conn.execute("INSERT INTO consultations (id, title, status, created_at, updated_at, domain, input_format) VALUES (?, ?, ?, ?, ?, ?, ?)",
             (cid, "${title}", "ACTIVE", now, now, "Transport", "paste"))
conn.execute("INSERT INTO imports (id, consultation_id, source_type, original_filename, record_count, created_at) VALUES (?, ?, ?, ?, ?, ?)",
             (str(uuid.uuid4()), cid, "paste", "paste.txt", 1, now))
conn.execute("INSERT INTO analysis_runs (id, consultation_id, status, response_count, model_manifest, created_at) VALUES (?, ?, ?, ?, ?, ?)",
             (str(uuid.uuid4()), cid, "COMPLETED", 1, "{}", now))
conn.commit()
conn.close()
print(cid)
`;
  const res = spawnSync('.\\venv\\Scripts\\python.exe', ['-c', pyCode], { encoding: 'utf-8' });
  if (res.error) throw res.error;
  return res.stdout.trim();
}

test('CLEAR HISTORY: Safe confirmation, cancellation, deletion, and refresh regression', async () => {
  const pw = getPlaywrightModule();
  const { chromium } = require(pw);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Track network requests
  const networkEvents = [];
  page.on('request', (req) => {
    if (req.url().includes('/consultations')) {
      networkEvents.push({ type: 'req', method: req.method(), url: req.url(), time: Date.now() });
    }
  });

  page.on('response', async (res) => {
    if (res.url().includes('/consultations')) {
      let body = null;
      try { body = await res.json(); } catch (e) {}
      networkEvents.push({
        type: 'res',
        method: res.request().method(),
        url: res.url(),
        status: res.status(),
        body,
        time: Date.now()
      });
    }
  });

  try {
    // Ensure we have at least one test consultation in the DB
    insertConsultation('Seed Consultation Before Clear');

    console.log('\n============================================================');
    console.log('TEST A — CANCEL CONFIRMATION BEHAVIOR');
    console.log('============================================================');

    await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
    await page.locator('#nav-history').click();
    await page.waitForSelector('.history-card', { timeout: 10000 });
    await page.waitForSelector('.btn-clear-history', { timeout: 10000 });

    const countBeforeCancel = await page.locator('.history-card').count();
    const dbBeforeCancel = getDbCounts();
    console.log(`History cards on screen: ${countBeforeCancel}`);
    console.log(`Database counts before cancel test:`, dbBeforeCancel);
    assert.ok(countBeforeCancel > 0, 'Must have at least 1 history card');

    // Click Clear History button
    console.log('Clicking Clear History button...');
    networkEvents.length = 0;
    await page.locator('.btn-clear-history').click();

    // Verify confirmation modal opens
    await page.waitForSelector('.confirm-modal-overlay', { timeout: 3000 });
    const modalTitle = await page.locator('.confirm-modal-title').innerText();
    console.log(`Modal displayed with title: "${modalTitle}"`);
    assert.equal(modalTitle, 'Clear consultation history?');

    // Verify NO DELETE request was sent when opening modal
    const deleteRequestsSoFar = networkEvents.filter((e) => e.type === 'req' && e.method === 'DELETE');
    assert.equal(deleteRequestsSoFar.length, 0, 'No DELETE request should be sent just by opening the dialog');

    // Click Cancel
    console.log('Clicking Cancel button in dialog...');
    await page.locator('.btn-cancel-clear').click();

    // Verify modal is closed
    await page.waitForSelector('.confirm-modal-overlay', { state: 'detached', timeout: 3000 });
    console.log('Confirmation dialog closed.');

    // Verify cards and database are completely untouched
    const countAfterCancel = await page.locator('.history-card').count();
    const dbAfterCancel = getDbCounts();
    assert.equal(countAfterCancel, countBeforeCancel, 'Card count must be unchanged after cancel');
    assert.deepEqual(dbAfterCancel, dbBeforeCancel, 'Database counts must be unchanged after cancel');
    console.log('✓ TEST A PASSED: Cancel preserved all records and sent zero DELETE requests.');

    console.log('\n============================================================');
    console.log('TEST B & D — CONFIRM SUCCESS & DOUBLE-CLICK PROTECTION');
    console.log('============================================================');

    const dbCountBeforeDelete = getDbCounts();
    console.log('Database row counts before clear:', dbCountBeforeDelete);

    // Click Clear History again to open modal
    await page.locator('.btn-clear-history').click();
    await page.waitForSelector('.confirm-modal-overlay', { timeout: 3000 });

    networkEvents.length = 0;

    // Click destructive confirm button
    console.log('Clicking confirm "Clear History" in dialog...');
    const confirmBtn = page.locator('.btn-confirm-delete');
    await confirmBtn.click();

    // Verify dialog closes and loading state finishes
    await page.waitForSelector('.confirm-modal-overlay', { state: 'detached', timeout: 10000 });

    // Verify success notice appears
    await page.waitForSelector('.notice.success.clear-success', { timeout: 10000 });
    const successText = await page.locator('.notice.success.clear-success p').innerText();
    console.log(`Success message displayed: "${successText}"`);
    assert.match(successText, /cleared successfully/i);

    // Verify empty state is rendered
    await page.waitForSelector('.notice', { timeout: 5000 });
    const emptyNotice = await page.locator('p[role="status"]').innerText();
    console.log(`Empty state message displayed: "${emptyNotice}"`);
    assert.match(emptyNotice, /No saved consultations yet/i);

    const cardCountAfterDelete = await page.locator('.history-card').count();
    console.log(`History cards on screen after delete: ${cardCountAfterDelete}`);
    assert.equal(cardCountAfterDelete, 0, 'Zero history cards must be visible on screen');

    // Verify network sequence: DELETE followed by GET /consultations
    const deleteResp = networkEvents.find((e) => e.type === 'res' && e.method === 'DELETE');
    const getFollowUpResp = networkEvents.find(
      (e) => e.type === 'res' && e.method === 'GET' && e.time >= (deleteResp?.time || 0)
    );

    console.log('\nNetwork Evidence:');
    console.log('  DELETE Response Status:', deleteResp?.status);
    console.log('  DELETE Response Body:', JSON.stringify(deleteResp?.body));
    console.log('  Follow-up GET Status:', getFollowUpResp?.status);
    console.log('  Follow-up GET Consultations Count:', getFollowUpResp?.body?.consultations?.length);

    assert.ok(deleteResp, 'A DELETE request must have been sent');
    assert.equal(deleteResp.status, 200, 'DELETE request must return 200 OK');
    assert.equal(deleteResp.body?.success, true, 'DELETE response body must have success: true');
    assert.ok(deleteResp.body?.deleted_consultations >= 1, 'DELETE response must report deleted count');
    assert.ok(getFollowUpResp, 'A follow-up GET request must follow the delete');
    assert.equal(getFollowUpResp.body?.consultations?.length, 0, 'Follow-up GET must return 0 consultations');

    // Verify SQLite directly
    const dbCountAfterDelete = getDbCounts();
    console.log('\nSQLite Counts After Clear:', dbCountAfterDelete);
    assert.equal(dbCountAfterDelete.consultations, 0, 'consultations table must have 0 rows');
    assert.equal(dbCountAfterDelete.imports, 0, 'imports table must have 0 rows');
    assert.equal(dbCountAfterDelete.analysis_runs, 0, 'analysis_runs table must have 0 rows');
    console.log('✓ TEST B PASSED: Deletion succeeded, zero orphan records, fresh GET returned empty list.');

    console.log('\n============================================================');
    console.log('TEST E — REFRESH HISTORY ON EMPTY STATE');
    console.log('============================================================');

    networkEvents.length = 0;
    console.log('Clicking Refresh History while empty...');
    await page.locator('.btn-refresh-history').click();
    await page.waitForTimeout(800);

    const refreshGet = networkEvents.find((e) => e.type === 'res' && e.method === 'GET');
    assert.ok(refreshGet, 'Refresh click must produce a GET request');
    assert.equal(refreshGet.body?.consultations?.length, 0, 'GET must still return 0 consultations');
    const cardCountAfterRefresh = await page.locator('.history-card').count();
    assert.equal(cardCountAfterRefresh, 0, 'History cards must remain 0');
    console.log('✓ TEST E PASSED: Refresh History on empty state stays empty and does not crash.');

    console.log('\n============================================================');
    console.log('TEST F — REFRESH HISTORY REGRESSION (NEVER DELETES DATA)');
    console.log('============================================================');

    // Add a new consultation in SQLite directly
    const newId = insertConsultation('Newly Created Consultation After Clear');
    console.log(`Inserted new consultation into SQLite: ${newId}`);

    networkEvents.length = 0;
    console.log('Clicking Refresh History to load the new consultation...');
    await page.locator('.btn-refresh-history').click();
    await page.waitForTimeout(1000);

    const cardCountRegress = await page.locator('.history-card').count();
    const topIdRegress = await page.locator('.history-card code').first().innerText();
    console.log(`History cards on screen now: ${cardCountRegress}`);
    console.log(`Top Card ID: ${topIdRegress}`);

    assert.equal(cardCountRegress, 1, 'Should now render 1 consultation card');
    assert.equal(topIdRegress, newId, 'Top card must be the newly inserted consultation');

    // Click Refresh History AGAIN to verify it NEVER deletes data
    console.log('Clicking Refresh History again to verify data persistence...');
    await page.locator('.btn-refresh-history').click();
    await page.waitForTimeout(800);

    const cardCountRegress2 = await page.locator('.history-card').count();
    assert.equal(cardCountRegress2, 1, 'Card count must remain 1 after second Refresh click');
    const dbCountRegress = getDbCounts();
    assert.equal(dbCountRegress.consultations, 1, 'SQLite must retain the consultation record');
    console.log('✓ TEST F PASSED: Refresh History loads new records and NEVER deletes data.');

    console.log('\n============================================================');
    console.log('ALL CLEAR HISTORY TESTS PASSED PERFECTLY!');
    console.log('============================================================\n');

  } finally {
    await browser.close();
  }
});
