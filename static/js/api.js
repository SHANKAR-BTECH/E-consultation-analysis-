// The only network layer. A successful HTTP response is also shape-checked.
export class APIError extends Error {
  constructor(message, status=0, details=null) { super(message); this.status=status; this.details=details; }
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const counts = value => object(value) && Object.keys(value).length > 0 && Object.values(value).every(v => Number.isInteger(v) && v >= 0);
const distribution = value => object(value) && counts(value.counts) && object(value.percentages) && Object.keys(value.counts).every(k => finite(value.percentages[k])) && (value.average_confidence === null || finite(value.average_confidence));
const indices = value => Array.isArray(value) && value.every(Number.isInteger);
const priority = value => object(value) && finite(value.score) && ['HIGH','MEDIUM','LOW'].includes(value.level) && object(value.signals) && ['coverage','negative_ratio','frequency_weight','negative_weight','frequency_contribution','negative_contribution'].every(k => finite(value.signals[k]));
export function validateAnalysis(data) {
  try {
  const valid = object(data) && data.schema_version === '2.0' &&
    ['total_received','total_responses','rejected_count'].every(k => Number.isInteger(data[k]) && data[k] >= 0) &&
    distribution(data.sentiment) && typeof data.summary === 'string' &&
    ['responses','rejected','warnings','keywords','topics','issues'].every(k => Array.isArray(data[k])) &&
    data.responses.every(r => object(r) && Number.isInteger(r.row_index) && typeof r.text === 'string' && typeof r.sentiment === 'string' && finite(r.confidence)) &&
    data.responses.length === data.total_responses && data.total_received === data.total_responses + data.rejected_count &&
    Object.values(data.sentiment.counts).reduce((a,b)=>a+b,0) === data.total_responses &&
    [...data.rejected,...data.warnings].every(r => Number.isInteger(r.row_index) && typeof r.message === 'string') &&
    data.keywords.every(k => typeof k.keyword === 'string' && finite(k.count)) &&
    data.topics.every(t => typeof t.topic === 'string' && finite(t.count) && counts(t.sentiment) && indices(t.response_indices)) &&
    data.issues.every(i => typeof i.issue === 'string' && finite(i.mentions) && finite(i.negative_ratio) && priority(i.priority) && indices(i.response_indices) && Array.isArray(i.representative_feedback) && i.representative_feedback.every(r=>typeof r.text === 'string' && finite(r.confidence))) &&
    object(data.trends) && typeof data.trends.available === 'boolean' && Array.isArray(data.trends.points) &&
    data.trends.points.every(p=>typeof p.date === 'string' && finite(p.total_responses) && distribution(p.sentiment)) &&
    object(data.categories) && typeof data.categories.available === 'boolean' && Array.isArray(data.categories.groups) &&
    data.categories.groups.every(g=>typeof g.category === 'string' && finite(g.total_responses) && distribution(g.sentiment) && Array.isArray(g.issues) && g.issues.every(i=>typeof i.issue === 'string' && finite(i.mentions) && priority(i.priority))) &&
    object(data.analysis_notes);
  if (!valid) throw new APIError('The service returned an unexpected response. Your inputs are still available; please try again.');
  return data;
  } catch {
    throw new APIError('The service returned an unexpected response. Your inputs are still available; please try again.');
  }
}
export async function request(path, options={}, fetcher=fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 90000);
  try {
    const response = await fetcher(path,{...options,signal:controller.signal});
    let data;
    try { data = await response.json(); }
    catch { throw new APIError('The service returned an unreadable response. Please try again.',response.status); }
    if (!response.ok || data?.error) throw new APIError(typeof data?.message === 'string' ? data.message : response.status === 503 ? 'The analysis service is unavailable. Please try again shortly.' : 'We could not complete the request. Please try again.',response.status,data?.details);
    return data;
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError(error.name === 'AbortError' ? 'The request took too long. Please retry with fewer responses. The server may still be processing the original request.' : 'Unable to reach the analysis service. Check your connection and try again.');
  } finally { clearTimeout(timeout); }
}
export async function analyzeResponses(responses) {
  return validateAnalysis(await request('/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({responses:responses.map(text=>({text}))})}));
}
export async function inspectPdfFile(file) {
  const form = new FormData(); form.append('file',file);form.append('mode','inspect');
  const data = await request('/analyze-file',{method:'POST',body:form});
  if (!Number.isInteger(data?.page_count) || !Number.isInteger(data.row_count) || !Array.isArray(data.preview) || !data.preview.every(v=>typeof v==='string'))
    throw new APIError('The service could not provide usable PDF text. Please check the file.');
  return data;
}
export async function analyzePdfFile(file) {
  const form = new FormData();form.append('file',file);form.append('mode','analyze');
  return validateAnalysis(await request('/analyze-file',{method:'POST',body:form}));
}
export async function inspectExcelFile(file, sheet='') {
  const form = new FormData(); form.append('file',file);form.append('mode','inspect');
  form.append('sheet',sheet);
  const data = await request('/analyze-file',{method:'POST',body:form});
  if (!Array.isArray(data?.columns) || !data.columns.every(c=>typeof c==='string') || !Number.isInteger(data.row_count) || !object(data.suggested_mapping))
    throw new APIError('The service could not provide usable columns. Please check the file.');
  return data;
}
export async function analyzeExcelFile(file,mapping,metadata,sheet='') {
  const form = new FormData();form.append('file',file);form.append('mode','analyze');
  Object.entries(mapping).forEach(([key,value])=>form.append(key,value));
  form.append('metadata_columns',JSON.stringify(metadata));
  if(sheet)form.append('sheet',sheet);
  return validateAnalysis(await request('/analyze-file',{method:'POST',body:form}));
}
