// Characterize React helpers without changing frontend files or starting a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {checkHealth, predictFeedback, analyzeResponses, inspectFile, analyzeCsv,
  inspectExcelFile, analyzeExcel, validateAnalysis, APIError} from '../frontend/src/lib/api.js';
import {parseResponses} from '../frontend/src/lib/utils.js';
import {extractRequests, extractNegativeIssues, synthesizeRecommendations}
  from '../frontend/src/lib/consultationIntelligence.js';

const minimal = {schema_version:'2.0', total_received:1, total_responses:1, rejected_count:0,
  sentiment:{}, summary:'fixture', responses:[{row_index:1,text:'Helpful.',sentiment:'positive',confidence:0.8}],
  rejected:[], warnings:[], keywords:[], topics:[], issues:[]};

function intercept(t, reply) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({path, options});
    return {ok:true, status:200, json:async()=>structuredClone(reply)};
  });
  return calls;
}

test('React health sends relative URL and consumes model_loaded', async t => {
  const calls = intercept(t, {status:'ok',model_loaded:true,classes:['positive']});
  assert.equal((await checkHealth()).model_loaded, true);
  assert.equal(calls[0].path, '/health');
});

test('unused predict helper currently sends text, not Flask feedback', async t => {
  const calls = intercept(t, {});
  await predictFeedback('Helpful.');
  assert.equal(calls[0].path, '/predict');
  assert.deepEqual(JSON.parse(calls[0].options.body), {text:'Helpful.'});
});

test('React paste analysis keeps schema 2.0 and strings-to-records payload', async t => {
  const calls = intercept(t, minimal);
  assert.deepEqual(await analyzeResponses(['Helpful.']), minimal);
  assert.equal(calls[0].path, '/analyze');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {responses:[{text:'Helpful.'}]});
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('CSV inspection and analysis resend file and preserve explicit blank mappings', async t => {
  const file = new File(['text\nHelpful.\n'], 'fixture.csv', {type:'text/csv'});
  const calls = intercept(t, {columns:['text'],row_count:1,suggested_mapping:{text_column:'text'}});
  await inspectFile(file);
  assert.equal(calls[0].path, '/analyze-file');
  assert.equal(calls[0].options.body.get('mode'), 'inspect');
  assert.equal(calls[0].options.body.get('file').name, 'fixture.csv');
  t.mock.restoreAll();
  const analyzed = intercept(t, minimal);
  await analyzeCsv(file, {text_column:'text',date_column:'',category_column:''}, ['region']);
  const form = analyzed[0].options.body;
  assert.equal(form.get('mode'), 'analyze');
  assert.equal(form.get('file').name, 'fixture.csv');
  assert.equal(form.get('date_column'), '');
  assert.equal(form.get('category_column'), '');
  assert.equal(form.get('metadata_columns'), '["region"]');
});

test('Excel inspection and analysis send file, sheet and preserve blank mappings', async t => {
  const file = new File(['x'], 'fixture.xlsx', {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const calls = intercept(t, {columns:['text'],row_count:1,suggested_mapping:{text_column:'text'}});
  await inspectExcelFile(file, 'Sheet1');
  assert.equal(calls[0].path, '/analyze-file');
  assert.equal(calls[0].options.body.get('mode'), 'inspect');
  assert.equal(calls[0].options.body.get('sheet'), 'Sheet1');
  assert.equal(calls[0].options.body.get('file').name, 'fixture.xlsx');
  t.mock.restoreAll();
  const analyzed = intercept(t, minimal);
  await analyzeExcel(file, {text_column:'text',date_column:'',category_column:''}, ['region'], 'Sheet1');
  const form = analyzed[0].options.body;
  assert.equal(form.get('mode'), 'analyze');
  assert.equal(form.get('sheet'), 'Sheet1');
  assert.equal(form.get('file').name, 'fixture.xlsx');
  assert.equal(form.get('date_column'), '');
  assert.equal(form.get('category_column'), '');
  assert.equal(form.get('metadata_columns'), '["region"]');
});

test('React validator requires version string but is not a complete nested schema', () => {
  assert.equal(validateAnalysis(minimal), minimal);
  for (const schema_version of ['3.0', 2, null]) {
    assert.throws(()=>validateAnalysis({...minimal,schema_version}), APIError);
  }
  assert.throws(()=>validateAnalysis({...minimal,responses:[{...minimal.responses[0],row_index:'1'}]}), APIError);
  // Trends/categories are needed by components, but not checked by this validator.
  assert.equal('trends' in minimal, false);
});

test('React paste parser trims originals before transport', () => {
  assert.deepEqual(parseResponses('  First. \n\n Second. '), ['First.', 'Second.']);
  assert.deepEqual(parseResponses(' First.\nContinued.\n\n Second. ', 'paragraph'), ['First.\nContinued.', 'Second.']);
});

test('grouped request counts can include multiple sentences from one row', () => {
  const requests = extractRequests([{row_index:7,id:'x',text:'Please repair the water pipe. Please improve water quality.',
    sentiment:'negative',confidence:0.8}], [{issue:'water',priority:{level:'HIGH'}}]);
  assert.equal(requests[0].count, 2);
  assert.deepEqual(requests[0].supportingResponses, [7,7]);
});

test('enriched negativeCount currently uses mentions and retains object evidence', () => {
  const quote = {row_index:1,text:'Evidence.',sentiment:'negative',confidence:0.8};
  const result = extractNegativeIssues([{issue:'water',mentions:3,negative_mentions:2,
    response_indices:[1,2,3],priority:{level:'HIGH'},representative_feedback:[quote]}], [], 4);
  assert.equal(result[0].negativeCount, 3);
  assert.equal(result[0].percentage, 75);
  assert.deepEqual(result[0].representativeFeedback, [quote]);
});

test('recommendation fallbacks are generated text, not response-backed quotations', () => {
  const rec = synthesizeRecommendations([{issue:'water'}], [{title:'Unrelated request.'}], [])[0];
  assert.equal(rec.relatedRequest, 'Unrelated request.');
  assert.equal(rec.evidence, 'Reported concerns regarding water.');
  assert.deepEqual(Object.keys(rec).sort(), ['actionVerb','title','problem','evidence','relatedRequest','guidance'].sort());
});
