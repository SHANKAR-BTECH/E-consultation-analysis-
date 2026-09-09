import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';
import { listConsultations, getConsultation, getConsultationRun, APIError } from '../frontend/src/lib/api.js';

// Render the real JSX through the project's existing Vite/React toolchain.
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const vite = await createServer({ root: fileURLToPath(new URL('../frontend', import.meta.url)),
  server: { middlewareMode: true }, appType: 'custom' });
after(() => vite.close());
const { HistoryPanel } = await vite.ssrLoadModule('/src/components/ConsultationHistory.jsx');
const { default: NegativeFeedbackSection } = await vite.ssrLoadModule('/src/components/NegativeFeedbackSection.jsx');
const { default: RecommendationsSection } = await vite.ssrLoadModule('/src/components/RecommendationsSection.jsx');
const ok = (data) => ({ status: 'success', data });
const loading = { status: 'loading' };
const failed = { status: 'error', error: 'History could not be loaded.' };
const run = { id: 'run-one', status: 'COMPLETED', response_count: 1, accepted_count: 1,
  created_at: '2026-09-09T10:00:00+00:00', ended_at: '2026-09-09T10:01:00+00:00', failure: null };
const item = { id: 'consultation-one', title: 'Saved consultation', status: 'ACTIVE',
  created_at: run.created_at, latest_run: run };
const analysis = { schema_version: '2.0', total_received: 1, total_responses: 1, rejected_count: 0,
  sentiment: { counts: { positive: 1, negative: 0, neutral: 0 },
    percentages: { positive: 100, negative: 0, neutral: 0 }, average_confidence: 0.9 },
  responses: [{ row_index: 1, id: 1, text: 'The process was quick and very helpful.',
    sentiment: 'positive', confidence: 0.9, date: null, category: null, source: null, metadata: null }],
  summary: 'Stored summary', rejected: [], warnings: [], keywords: [], topics: [], issues: [] };
const noop = () => {};
function render(props = {}) {
  return renderToStaticMarkup(React.createElement(HistoryPanel, {
    list: loading, detail: loading, saved: loading, selectedId: null,
    onSelect: noop, onSelectRun: noop, onBack: noop, onRetry: noop,
    onNewAnalysis: noop, onOpenIssue: noop, ...props }));
}

test('history renders loading and empty states separately', () => {
  assert.match(render(), /Loading consultations/);
  const empty = render({ list: ok([]) });
  assert.match(empty, /No saved consultations yet/);
  assert.doesNotMatch(empty, /Loading consultations/);
});

test('history list renders saved identifiers, counts, dates and status', () => {
  const html = render({ list: ok([item]) });
  for (const text of [item.title, item.id, '1 responses', 'COMPLETED', '2026', 'Open consultation']) {
    assert.ok(html.includes(text), text);
  }
});

test('list, detail and run failures offer retry without stale results', () => {
  for (const props of [{ list: failed }, { selectedId: item.id, detail: failed },
    { selectedId: item.id, detail: ok({ ...item, runs: [run] }), saved: failed }]) {
    const html = render(props);
    assert.match(html, /role="alert"/);
    assert.match(html, /Try again/);
    assert.doesNotMatch(html, /id="results"/);
  }
});

test('consultation and run loading states and no-runs state', () => {
  assert.match(render({ selectedId: item.id }), /Loading consultation/);
  assert.match(render({ selectedId: item.id, detail: ok({ ...item, runs: [run] }) }), /Loading saved analysis/);
  assert.match(render({ selectedId: item.id, detail: ok({ ...item, runs: [] }) }), /No analysis runs/);
});

test('failed and unfinished runs never render a successful analysis', () => {
  for (const status of ['FAILED', 'RUNNING', 'PENDING']) {
    const metadata = { ...run, status, failure: { message: 'Safe failure reason.' } };
    const html = render({ selectedId: item.id, detail: ok({ ...item, runs: [metadata] }),
      saved: ok({ run: metadata, result: null }) });
    assert.ok(html.includes(status));
    assert.doesNotMatch(html, /id="results"/);
    assert.match(html, status === 'FAILED' ? /This analysis failed.*Safe failure reason/ : /No completed results/);
  }
});

test('completed run reuses results and source evidence without browser trend history', () => {
  const html = render({ selectedId: item.id, detail: ok({ ...item, runs: [run] }),
    saved: ok({ run, result: analysis }) });
  assert.match(html, /id="results"/);
  assert.match(html, /The process was quick and very helpful/);
  assert.match(html, /New analysis/);
  assert.doesNotMatch(html, /Trend History|Edit inputs/);
});

test('structured representative evidence renders its verbatim text in results', () => {
  const quote = { row_index: 2, id: 'duplicate', text: 'Poor internet connectivity. <original>',
    sentiment: 'negative', confidence: 0.9 };
  const html = renderToStaticMarkup(React.createElement(NegativeFeedbackSection, {
    negativeIssues: [{ issue: 'internet', displayTitle: 'Internet', priority: 'HIGH',
      linkedRequests: [], workflow: {}, representativeFeedback: [quote], negativeCount: 2,
      percentage: 100, supportingResponses: [1, 2] }] }));
  const recommendations = renderToStaticMarkup(React.createElement(RecommendationsSection, {
    recommendations: [{ title: 'Review internet', evidence: quote }] }));
  for (const markup of [html, recommendations]) {
    assert.match(markup, /Poor internet connectivity\. &lt;original&gt;/);
    assert.doesNotMatch(markup, /\[object Object\]/);
  }
});

test('history API uses scoped read paths and validates saved results', async (t) => {
  const calls = [];
  const replies = [{ consultations: [item] }, { ...item, runs: [run] }, { run, result: analysis }];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, options });
    return { ok: true, status: 200, json: async () => replies.shift() };
  });
  assert.deepEqual(await listConsultations(), [item]);
  assert.equal((await getConsultation(item.id)).id, item.id);
  assert.deepEqual((await getConsultationRun(item.id, run.id)).result, analysis);
  assert.deepEqual(calls.map((call) => call.path), ['/consultations',
    '/consultations/consultation-one', '/consultations/consultation-one/runs/run-one']);
  assert.ok(calls.every((call) => !call.options.method || call.options.method === 'GET'));
});

test('history API errors and malformed history cannot become empty success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503,
    json: async () => ({ error: true, message: 'Database unavailable.' }) }));
  await assert.rejects(listConsultations(), (error) => error instanceof APIError && error.status === 503);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200, json: async () => ({}) }));
  await assert.rejects(listConsultations(), APIError);
  await assert.rejects(getConsultation(item.id), APIError);
  await assert.rejects(getConsultationRun(item.id, run.id), APIError);
});

test('actual saved PostgreSQL data reaches React through the Vite Flask proxy',
  { skip: !process.env.HISTORY_BASE_URL }, async () => {
    const response = await fetch(process.env.HISTORY_BASE_URL + '/consultations');
    assert.equal(response.status, 200);
    const { consultations } = await response.json();
    const selected = consultations.find((entry) => entry.latest_run?.status === 'COMPLETED');
    assert.ok(selected, 'Expected the existing Phase 5D saved records');
    const detailResponse = await fetch(`${process.env.HISTORY_BASE_URL}/consultations/${selected.id}`);
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    const savedResponse = await fetch(`${process.env.HISTORY_BASE_URL}/consultations/${selected.id}/runs/${selected.latest_run.id}`);
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    const html = render({ selectedId: selected.id, detail: ok(detail), saved: ok(saved) });
    assert.ok(html.includes(selected.id));
    assert.match(html, /id="results"/);
    assert.match(html, /COMPLETED/);
  });
