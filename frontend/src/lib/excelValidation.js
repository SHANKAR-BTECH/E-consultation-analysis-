// Excel Feedback Column Detection & Validation for Consultation Analytics

export const FEEDBACK_ALIASES = [
  'feedback',
  'feedback text',
  'response',
  'response text',
  'responses',
  'citizen feedback',
  'citizen response',
  'comment',
  'comments',
  'citizen comments',
  'citizen comment',
  'remarks',
  'suggestion',
  'suggestions',
  'opinion',
  'opinions',
  'public comment',
  'public comments',
  'public opinion',
  'public opinions',
  'citizen views',
  'citizen input',
  'review',
  'reviews',
  'text'
];

export const METADATA_COLUMNS = [
  'district',
  'city',
  'state',
  'region',
  'zone',
  'area',
  'locality',
  'ward',
  'pincode',
  'pin code',
  'zip',
  'zipcode',
  'country',
  'date',
  'timestamp',
  'time',
  'created at',
  'created_at',
  'submitted at',
  'submitted_at',
  'day',
  'month',
  'year',
  'id',
  'response id',
  'response_id',
  'feedback id',
  'feedback_id',
  's no',
  's.no',
  'sno',
  'sl no',
  'sl.no',
  'serial',
  'serial number',
  'index',
  'row',
  'uuid',
  'source',
  'channel',
  'medium',
  'platform',
  'portal',
  'department',
  'dept',
  'ministry',
  'division',
  'agency',
  'branch',
  'org',
  'organization',
  'category',
  'classification',
  'topic',
  'type',
  'group',
  'sentiment',
  'expected sentiment',
  'expected_sentiment',
  'predicted sentiment',
  'predicted_sentiment',
  'label',
  'polarity',
  'score',
  'rating',
  'stars',
  'gender',
  'sex',
  'age',
  'email',
  'phone',
  'mobile',
  'name',
  'user',
  'author'
];

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
}

export function isMetadataColumn(columnName) {
  if (!columnName) return false;
  const norm = normalizeName(columnName);

  // If it's an ID column (e.g. "response id", "feedback id", "id", "citizen id"), it's metadata
  if (
    norm === 'id' ||
    norm.endsWith(' id') ||
    norm.startsWith('id ') ||
    norm === 'response id' ||
    norm === 'feedback id' ||
    norm === 'citizen id'
  ) {
    return true;
  }

  // Exact match against known metadata column names
  if (METADATA_COLUMNS.some((m) => norm === m)) {
    return true;
  }

  // If the column contains an explicit feedback term (e.g. "District Feedback"), it is considered feedback
  const feedbackKeywords = [
    'feedback', 'comment', 'response', 'suggestion', 'remark', 'opinion',
    'review', 'views', 'input'
  ];
  if (feedbackKeywords.some((fk) => norm.includes(fk))) {
    return false;
  }

  // Keywords that indicate metadata
  const metadataKeywords = [
    'district', 'city', 'state', 'region', 'zone', 'area', 'locality', 'ward',
    'pincode', 'pin code', 'zipcode', 'zip', 'country',
    'date', 'timestamp', 'time',
    'sno', 'serial', 'department', 'dept', 'ministry', 'division',
    'category', 'classification', 'sentiment', 'rating', 'score',
    'email', 'phone', 'mobile', 'gender'
  ];

  if (metadataKeywords.some((mk) => norm.includes(mk))) {
    return true;
  }

  return false;
}

export function isFeedbackColumn(columnName) {
  if (!columnName) return false;
  if (isMetadataColumn(columnName)) return false;
  const norm = normalizeName(columnName);
  return FEEDBACK_ALIASES.some((alias) => norm === alias || norm.includes(alias));
}

export function findLikelyFeedbackColumn(columns, backendSuggested) {
  if (!Array.isArray(columns) || columns.length === 0) return '';

  // 1. If backend suggested a column, accept it ONLY if it is genuinely a feedback column
  if (backendSuggested && columns.includes(backendSuggested) && isFeedbackColumn(backendSuggested)) {
    return backendSuggested;
  }

  // 2. Search for exact feedback alias matches first (excluding metadata)
  for (const alias of FEEDBACK_ALIASES) {
    const match = columns.find((c) => !isMetadataColumn(c) && normalizeName(c) === alias);
    if (match) return match;
  }

  // 3. Search for contains matches (excluding metadata)
  for (const alias of FEEDBACK_ALIASES) {
    const match = columns.find((c) => !isMetadataColumn(c) && normalizeName(c).includes(alias));
    if (match) return match;
  }

  // Ambiguous workbooks (e.g., Column A, Column B, Column C) must NOT be guessed blindly.
  return '';
}

export function findLikelySheet(sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) return '';
  const preferred = ['feedback', 'response', 'responses', 'comment', 'comments', 'citizen feedback', 'consultation', 'data'];

  for (const kw of preferred) {
    const match = sheets.find((s) => normalizeName(s) === kw);
    if (match) return match;
  }
  for (const kw of preferred) {
    const match = sheets.find((s) => normalizeName(s).includes(kw));
    if (match) return match;
  }
  return sheets[0];
}

export function validateFeedbackValues(values) {
  if (!values) {
    return { isValid: true, reason: 'no_values' };
  }
  const arr = Array.isArray(values) ? values : [values];
  const nonEmpties = arr
    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter(Boolean);

  if (nonEmpties.length === 0) {
    return { isValid: false, reason: 'empty', message: 'No textual responses found.' };
  }

  const DATE_REGEX = /^(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{4}-\d{2}-\d{2}T[\d:.]*Z?|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b)/i;
  const NUMERIC_OR_ID_REGEX = /^(\d+(\.\d+)?|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

  const KNOWN_METADATA_VALUES = new Set([
    'chennai', 'madurai', 'coimbatore', 'salem', 'delhi', 'mumbai', 'bangalore', 'kolkata', 'hyderabad',
    'north', 'south', 'east', 'west', 'central', 'urban', 'rural',
    'positive', 'negative', 'neutral',
    'department a', 'department b', 'department c', 'dept a', 'dept b',
    'government', 'govt', 'public', 'private',
    'male', 'female', 'other',
    'true', 'false', 'yes', 'no', 'null', 'na', 'n/a', 'none'
  ]);

  const FEEDBACK_INDICATORS = [
    'good', 'bad', 'improve', 'improving', 'improvement', 'useful', 'useless',
    'poor', 'great', 'terrible', 'worst', 'best', 'nice', 'help', 'helpful',
    'need', 'needs', 'service', 'services', 'issue', 'issues', 'problem', 'problems',
    'happy', 'unhappy', 'please', 'complaint', 'complaints', 'suggestion', 'suggestions',
    'buses', 'bus', 'train', 'roads', 'road', 'water', 'electricity', 'health', 'hospital',
    'school', 'education', 'unreliable', 'reliable', 'accessibility', 'accessible',
    'smooth', 'slow', 'fast', 'delay', 'delayed', 'support', 'care', 'frequency',
    'increase', 'decrease', 'fix', 'broken', 'satisfied', 'unsatisfied', 'difficulty',
    'difficult', 'easy', 'fair', 'unfair', 'clean', 'dirty', 'safe', 'unsafe', 'fine',
    'okay', 'ok', 'excellent', 'satisfactory', 'unsatisfactory', 'prompt', 'late', 'early'
  ];

  let metadataCount = 0;
  let feedbackCount = 0;
  let totalLength = 0;
  let multiWordCount = 0;

  for (const val of nonEmpties) {
    const lower = val.toLowerCase();
    totalLength += val.length;
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      multiWordCount++;
    }

    const hasFeedbackWord = FEEDBACK_INDICATORS.some((w) =>
      words.includes(w) || lower.includes(w)
    );
    if (hasFeedbackWord) {
      feedbackCount++;
    }

    const isDate = DATE_REGEX.test(val);
    const isNum = NUMERIC_OR_ID_REGEX.test(val);
    const isMetaVal = KNOWN_METADATA_VALUES.has(lower);

    if (isDate || isNum || isMetaVal) {
      metadataCount++;
    }
  }

  // If there are explicit feedback indicators or multi-word feedback sentences, accept
  if (feedbackCount > 0 || multiWordCount / nonEmpties.length >= 0.5) {
    return { isValid: true, reason: 'feedback_detected' };
  }

  // If average length is long (typical feedback sentence > 25 chars), accept
  const avgLength = totalLength / nonEmpties.length;
  if (avgLength >= 25 && metadataCount / nonEmpties.length < 0.5) {
    return { isValid: true, reason: 'sentence_length' };
  }

  // If high proportion of metadata/dates/ids/locations/categories, reject
  if (metadataCount / nonEmpties.length >= 0.5) {
    return {
      isValid: false,
      reason: 'metadata_values',
      message: "This column does not appear to contain citizen feedback. Please choose the column containing the actual comments or responses."
    };
  }

  // Short non-feedback words that are proper nouns or codes (e.g. Chennai, North)
  if (avgLength < 15 && multiWordCount === 0 && feedbackCount === 0) {
    return {
      isValid: false,
      reason: 'short_non_feedback',
      message: "This column does not appear to contain citizen feedback. Please choose the column containing the actual comments or responses."
    };
  }

  return { isValid: true, reason: 'default_acceptable' };
}

export function validateSelectedFeedbackColumn(columnName, inspection, sampleValues) {
  if (!columnName) {
    return {
      isValid: false,
      status: 'unselected',
      message: "Choose the column containing citizen feedback"
    };
  }

  // 1. Check if the column name itself indicates metadata
  if (isMetadataColumn(columnName)) {
    return {
      isValid: false,
      status: 'metadata_rejected',
      message: "This column does not appear to contain citizen feedback. Please choose the column containing the actual comments or responses."
    };
  }

  // 2. Check sample values if provided
  const valuesToCheck =
    sampleValues ||
    (inspection?.sample_values && inspection.sample_values[columnName]) ||
    (inspection?.samples && inspection.samples[columnName]);

  if (valuesToCheck && Array.isArray(valuesToCheck) && valuesToCheck.length > 0) {
    const valueResult = validateFeedbackValues(valuesToCheck);
    if (!valueResult.isValid) {
      return {
        isValid: false,
        status: 'metadata_rejected',
        message: "This column does not appear to contain citizen feedback. Please choose the column containing the actual comments or responses."
      };
    }
  }

  // 3. Check inspection row count
  if (inspection && inspection.row_count === 0) {
    return {
      isValid: false,
      status: 'empty_sheet',
      message: "No feedback responses found in the selected sheet."
    };
  }

  return {
    isValid: true,
    status: 'ready',
    message: null
  };
}
