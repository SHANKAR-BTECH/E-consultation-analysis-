// Formatters & Utility Functions for Consultation Analytics React Frontend

export const number = (value) => Number(value || 0).toLocaleString('en-IN');

export const percent = (value) => Number(value || 0).toFixed(1) + '%';

export const title = (value) =>
  String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1).toLowerCase();

export const sentimentClass = (value) =>
  ['positive', 'neutral', 'negative'].includes(String(value).toLowerCase())
    ? String(value).toLowerCase()
    : 'neutral';

export const classOrder = (counts) =>
  ['positive', 'neutral', 'negative', ...Object.keys(counts || {})].filter(
    (key, i, list) => counts && key in counts && list.indexOf(key) === i
  );

const REQUEST_REGEX = /\b(please|should|need(?:s)? to|must|request(?:s|ed)?|would like|suggest(?:s|ed)?|recommend(?:s|ed)?|urge(?:s)?|demand(?:s)?|call(?:s)? for|ought to|could you|hope that|require(?:s)?)\b/i;
const ACTION_VERBS = /\b(extend|repair|fix|provide|improve|increase|expand|upgrade|replace|add|restore|reduce|schedule|install|open|dispatch|publish|conduct|clean|test)\b/i;
const IMPROVEMENT_WORDS = /\b(improv(?:ed|ement|ing)|better|helpful|clean|smoothly|efficient(?:ly)?|on time|resolved|good|satisfied|great|attentive|frequent|welcom(?:e|ed)|fast|prompt|convenient|easier)\b/i;
const CONTRAST_SPLIT = /\b(but|however|although|though|despite|while|yet|except that|still)\b/i;

export function parseResponses(text, separator = 'line') {
  if (!text) return [];
  return text
    .split(separator === 'paragraph' ? /\r?\n[ \t]*\r?\n/ : /\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
}

export function filteredRows(result, filters) {
  if (!result || !Array.isArray(result.responses)) return [];
  const query = (filters.search || '').trim().toLocaleLowerCase();
  const topic =
    filters.topic === '' || filters.topic === null || filters.topic === undefined
      ? null
      : result.topics[Number(filters.topic)];
  const topicIndices = topic ? new Set(topic.response_indices) : null;
  const issueIndices = filters.issueIndices ? new Set(filters.issueIndices) : null;
  const quickFilter = filters.quickFilter || 'all';

  return result.responses.filter((row) => {
    const text = row.text || '';
    const matchesQuery = !query || (text.toLocaleLowerCase().includes(query));
    const matchesSentiment = !filters.sentiment || row.sentiment === filters.sentiment;
    const matchesCategory = !filters.category || row.category === filters.category;
    const matchesTopic = !topicIndices || topicIndices.has(row.row_index);
    const matchesIssue = !issueIndices || issueIndices.has(row.row_index);

    // Quick filter classification
    let matchesQuick = true;
    if (quickFilter === 'positive') {
      matchesQuick = row.sentiment === 'positive';
    } else if (quickFilter === 'negative') {
      matchesQuick = row.sentiment === 'negative';
    } else if (quickFilter === 'mixed_neutral') {
      matchesQuick = row.sentiment === 'neutral' || CONTRAST_SPLIT.test(text);
    } else if (quickFilter === 'requests') {
      matchesQuick = REQUEST_REGEX.test(text) || (ACTION_VERBS.test(text) && row.sentiment !== 'positive');
    } else if (quickFilter === 'problems') {
      matchesQuick = row.sentiment === 'negative';
    } else if (quickFilter === 'improvements') {
      matchesQuick = row.sentiment === 'positive' || (IMPROVEMENT_WORDS.test(text) && row.sentiment !== 'negative');
    }

    return matchesQuery && matchesSentiment && matchesCategory && matchesTopic && matchesIssue && matchesQuick;
  });
}

export function pageRows(rows, pageNumber, pageSize = 10) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.max(1, Math.min(pageNumber, pages));
  const offset = (page - 1) * pageSize;
  const paged = rows.slice(offset, offset + pageSize);
  return {
    rows: paged,
    page,
    pages,
    offset,
    total
  };
}
