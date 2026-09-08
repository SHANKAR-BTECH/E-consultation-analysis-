// Start Flask first; BASE_URL may override the local verification server.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseResponses,filteredRows,pageRows} from '../static/js/state.js';
import {escapeHTML} from '../static/js/utils.js';
import {request,validateAnalysis,APIError} from '../static/js/api.js';
import {sentimentChart,trendChart} from '../static/js/charts.js';

const base=process.env.BASE_URL || 'http://localhost:5000';
const inputs=[
  {text:'The portal keeps failing and nobody answers my complaint. Poor internet connectivity.',category:'Rural',date:'2026-01-02'},
  {text:'The portal keeps failing and nobody answers my complaint. Poor internet connectivity.',category:'Rural',date:'2026-01-03'},
  {text:'The process was quick and very helpful.',category:'Urban'},
  {text:'Applications will open on Monday according to the official notice.'}
];
const response=await fetch(base+'/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({responses:inputs})});
assert.equal(response.status,200);
const result=validateAnalysis(await response.json());
const filters={search:'',sentiment:'',category:'',topic:'',issueIndices:null,page:1,pageSize:2};

test('line and paragraph parsing preserve source text',()=>{
  assert.deepEqual(parseResponses(' one \n\n two '),[' one ',' two ']);
  assert.deepEqual(parseResponses('one\ncontinued\n\ntwo','paragraph'),['one\ncontinued','two']);
  assert.deepEqual(parseResponses(' \n\t'),[]);
});
test('search, sentiment and category use returned records',()=>{
  assert.equal(filteredRows(result,{...filters,search:'HELPFUL'}).length,1);
  assert.equal(filteredRows(result,{...filters,category:'Rural'}).length,2);
  assert.equal(filteredRows(result,{...filters,search:'helpful',sentiment:'negative'}).length,0);
});
test('topic and issue membership follow backend row indices',()=>{
  const index=result.topics.findIndex(t=>t.topic==='poor internet connectivity');
  assert.ok(index>=0);
  assert.deepEqual(filteredRows(result,{...filters,topic:String(index)}).map(r=>r.row_index),result.topics[index].response_indices);
  assert.deepEqual(filteredRows(result,{...filters,issueIndices:[2]}).map(r=>r.row_index),[2]);
});
test('pagination clamps and handles empty results',()=>{
  assert.equal(pageRows(result.responses,{...filters,page:2}).rows.length,2);
  assert.equal(pageRows(result.responses,{...filters,page:99}).page,2);
  assert.equal(pageRows([],{...filters,page:99}).page,1);
});
test('charts show actual counts and unavailable temporal state',()=>{
  assert.ok(sentimentChart(result.sentiment).includes('50.0%'));
  assert.ok(trendChart(result.trends).includes('2026-01-02'));
  assert.ok(trendChart({available:false,reason:'No valid dates.'}).includes('Trend analysis unavailable'));
});
test('source markup is escaped',()=>{
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('malformed and inconsistent analysis responses fail clearly',()=>{
  for(const value of [null,{},[],{...result,total_responses:100},{...result,issues:[null]},{...result,topics:null},{...result,categories:{...result.categories,groups:result.categories.groups.map(g=>({...g,issues:[null]}))}}])
    assert.throws(()=>validateAnalysis(value),APIError);
});
for(const status of [400,503,500]) test('HTTP '+status+' is a controlled API error',async()=>{
  await assert.rejects(request('/analyze',{},async()=>({ok:false,status,json:async()=>({error:true,message:'Controlled error'})})),error=>error instanceof APIError && error.status===status);
});
test('unreadable JSON is handled',async()=>{
  await assert.rejects(request('/analyze',{},async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError();}})),/unreadable response/);
});
test('network and timeout failures have useful messages',async()=>{
  await assert.rejects(request('/analyze',{},async()=>{throw new TypeError('Failed to fetch');}),/Unable to reach/);
  await assert.rejects(request('/analyze',{},async()=>{throw new DOMException('Timeout','AbortError');}),/took too long/);
});
