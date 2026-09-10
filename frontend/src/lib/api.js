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
          : typeof data?.error === 'string'
          ? data.error
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

export async function analyzeResponses(responses, domain = null) {
  // responses is an array of raw strings
  const payload = {
    responses: responses.map((text) => ({ text })),
    ...(domain ? { domain } : {})
  };
  const data = await request('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return validateAnalysis(data);
}

export async function inspectPdfFile(file) {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', 'inspect');

  const data = await request('/analyze-file', {
    method: 'POST',
    body: form
  });

  if (!Number.isInteger(data?.page_count) || !Number.isInteger(data?.row_count) || !Array.isArray(data?.preview)) {
    throw new APIError('The service could not provide usable PDF text. Please check the file.');
  }

  return data;
}

export async function analyzePdf(fileOrFiles, domain = '', analysisMode = 'together') {
  const form = new FormData();
  const fileList = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  form.append('mode', 'analyze');
  if (domain) form.append('domain', domain);
  if (analysisMode) form.append('analysis_mode', analysisMode);

  if (fileList.length === 1) {
    form.append('file', fileList[0]);
  } else {
    fileList.forEach((f) => form.append('files', f));
  }

  const data = await request('/analyze-file', {
    method: 'POST',
    body: form
  });

  return validateAnalysis(data);
}

export async function inspectExcelFile(file, sheet = '', domain = '') {
  const form = new FormData();
  form.append('file', file);
  form.append('mode', 'inspect');
  if (sheet) form.append('sheet', sheet);
  if (domain) form.append('domain', domain);

  const data = await request('/analyze-file', {
    method: 'POST',
    body: form
  });

  if (!Array.isArray(data?.columns) || !Number.isInteger(data?.row_count) || !object(data?.suggested_mapping)) {
    throw new APIError('The service could not provide usable columns. Please check the file.');
  }

  return data;
}

export async function analyzeExcel(
  fileOrFiles,
  mapping = {},
  metadata = [],
  sheet = '',
  domain = '',
  analysisMode = 'together',
  fileConfigs = []
) {
  const form = new FormData();
  const fileList = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  form.append('mode', 'analyze');
  if (domain) form.append('domain', domain);
  if (analysisMode) form.append('analysis_mode', analysisMode);

  if (fileList.length === 1) {
    form.append('file', fileList[0]);
  } else {
    fileList.forEach((f) => form.append('files', f));
  }

  if (sheet) form.append('sheet', sheet);

  Object.entries(mapping).forEach(([key, value]) => {
    form.append(key, value || '');
  });

  form.append('metadata_columns', JSON.stringify(metadata));

  // If per-file configs were provided for multiple workbooks
  if (Array.isArray(fileConfigs) && fileConfigs.length > 0) {
    fileConfigs.forEach((cfg) => {
      if (!cfg || !cfg.filename) return;
      if (cfg.sheet) form.append(`sheet_${cfg.filename}`, cfg.sheet);
      if (cfg.text_column) form.append(`text_column_${cfg.filename}`, cfg.text_column);
      if (cfg.date_column) form.append(`date_column_${cfg.filename}`, cfg.date_column);
      if (cfg.category_column) form.append(`category_column_${cfg.filename}`, cfg.category_column);
    });
  }

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
const validConsultation = (item) => object(item) && typeof item.id === 'string' &&
  typeof item.title === 'string' && typeof item.created_at === 'string' &&
  (item.source === undefined || item.source === null || typeof item.source === 'string');

function historyFormat(valid) {
  if (!valid) throw new APIError('The service returned an unexpected consultation history format.');
}

export async function listConsultations(options = {}) {
  const data = await request('/consultations', {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    },
    ...options
  });
  historyFormat(Array.isArray(data?.consultations) && data.consultations.every((item) =>
    validConsultation(item) && (item.latest_run === null || validRun(item.latest_run))));
  return data.consultations;
}

export async function getConsultation(id, options = {}) {
  const data = await request(`/consultations/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    },
    ...options
  });
  historyFormat(validConsultation(data) && Array.isArray(data.runs) && data.runs.every(validRun));
  return data;
}

export async function getConsultationRun(consultationId, runId, options = {}) {
  const data = await request(`/consultations/${encodeURIComponent(consultationId)}/runs/${encodeURIComponent(runId)}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    },
    ...options
  });
  historyFormat(validRun(data?.run) && (data.run.status === 'COMPLETED' || data.result === null));
  if (data.run.status === 'COMPLETED') validateAnalysis(data.result);
  return data;
}

export async function clearConsultationHistory() {
  const data = await request('/consultations', {
    method: 'DELETE',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    }
  });
  if (!data || !data.success) {
    throw new APIError(data?.error || data?.message || 'Failed to clear consultation history.');
  }
  return data;
}

