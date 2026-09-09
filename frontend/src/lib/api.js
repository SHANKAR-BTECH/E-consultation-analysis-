// Centralized HTTP API Client for Consultation Analytics React Frontend
// Communicates with Flask analysis engine via proxy or direct URL

export class APIError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateAnalysis(data) {
  try {
    const valid =
      object(data) &&
      data.schema_version === '2.0' &&
      ['total_received', 'total_responses', 'rejected_count'].every(
        (k) => Number.isInteger(data[k]) && data[k] >= 0
      ) &&
      object(data.sentiment) &&
      typeof data.summary === 'string' &&
      ['responses', 'rejected', 'warnings', 'keywords', 'topics', 'issues'].every((k) =>
        Array.isArray(data[k])
      ) &&
      data.responses.every(
        (r) =>
          object(r) &&
          Number.isInteger(r.row_index) &&
          typeof r.text === 'string' &&
          typeof r.sentiment === 'string' &&
          finite(r.confidence)
      );

    if (!valid) {
      throw new APIError(
        'The analysis service returned an unexpected response format. Your inputs are still intact.'
      );
    }
    return data;
  } catch (err) {
    if (err instanceof APIError) throw err;
    throw new APIError(
      'The analysis service returned an unexpected response format. Your inputs are still intact.'
    );
  }
}

export async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new APIError(
        'The service returned an unreadable response. Please try again.',
        response.status
      );
    }

    if (!response.ok || data?.error) {
      const message =
        typeof data?.message === 'string'
          ? data.message
          : response.status === 503
          ? 'The analysis engine is unavailable. Please check the backend service.'
          : 'Unable to complete the analysis request. Please try again.';
      throw new APIError(message, response.status, data?.details);
    }

    return data;
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError(
      error.name === 'AbortError'
        ? 'The request took too long. Please retry with fewer responses.'
        : 'Unable to reach the analysis service. Please verify the Flask backend is running.'
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkHealth() {
  return await request('/health');
}

export async function analyzeUrl(url) {
  return validateAnalysis(await request('/analyze-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }));
}

export async function analyzeResponses(responses) {
  // responses is an array of raw strings
  const payload = {
    responses: responses.map((text) => ({ text }))
  };
  const data = await request('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return validateAnalysis(data);
}

export async function inspectFile(file) {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', 'inspect');

  const data = await request('/analyze-file', {
    method: 'POST',
    body: form
  });

  if (!Array.isArray(data?.columns) || !Number.isInteger(data?.row_count) || !object(data?.suggested_mapping)) {
    throw new APIError('The service could not provide usable CSV columns. Please check the file.');
  }

  return data;
}

export async function analyzeCsv(file, mapping, metadata = []) {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', 'analyze');

  Object.entries(mapping).forEach(([key, value]) => {
    form.append(key, value || '');
  });

  form.append('metadata_columns', JSON.stringify(metadata));

  const data = await request('/analyze-file', {
    method: 'POST',
    body: form
  });

  return validateAnalysis(data);
}

export async function predictFeedback(text) {
  return await request('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
}

const runStates = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'];
const validRun = (run) => object(run) && typeof run.id === 'string' &&
  runStates.includes(run.status) && typeof run.created_at === 'string' &&
  Number.isInteger(run.response_count) && run.response_count >= 0 &&
  (run.accepted_count === null || (Number.isInteger(run.accepted_count) && run.accepted_count >= 0));
// Optional additive provenance: null/absent for non-URL consultations.
const validSource = (source) => source === null || source === undefined ||
  (object(source) && typeof source.original_url === 'string' &&
    (source.canonical_url === undefined || typeof source.canonical_url === 'string' || source.canonical_url === null) &&
    (source.adapter === undefined || typeof source.adapter === 'string' || source.adapter === null) &&
    (source.published_response_count === undefined || source.published_response_count === null ||
      Number.isInteger(source.published_response_count)));
const validConsultation = (item) => object(item) && typeof item.id === 'string' &&
  typeof item.title === 'string' && typeof item.created_at === 'string' && validSource(item.source);

function historyFormat(valid) {
  if (!valid) throw new APIError('The service returned an unexpected consultation history format.');
}

export async function listConsultations() {
  const data = await request('/consultations');
  historyFormat(Array.isArray(data?.consultations) && data.consultations.every((item) =>
    validConsultation(item) && (item.latest_run === null || validRun(item.latest_run))));
  return data.consultations;
}

export async function getConsultation(id) {
  const data = await request(`/consultations/${encodeURIComponent(id)}`);
  historyFormat(validConsultation(data) && Array.isArray(data.runs) && data.runs.every(validRun));
  return data;
}

export async function getConsultationRun(consultationId, runId) {
  const data = await request(`/consultations/${encodeURIComponent(consultationId)}/runs/${encodeURIComponent(runId)}`);
  historyFormat(validRun(data?.run) && (data.run.status === 'COMPLETED' || data.result === null));
  if (data.run.status === 'COMPLETED') validateAnalysis(data.result);
  return data;
}
