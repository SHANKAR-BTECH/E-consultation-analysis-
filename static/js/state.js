// Only client-side input parsing and exploration. Analytics stay in the backend.
export const state = {
  mode:'paste', busy:false, file:null, inspection:null, result:null, source:'Pasted responses',
  filters:{search:'', sentiment:'', category:'', topic:'', issueIndices:null, issueLabel:'', page:1, pageSize:10}
};
export function parseResponses(text, separator = 'line') {
  return text.split(separator === 'paragraph' ? /\r?\n[ \t]*\r?\n/ : /\r?\n/).filter(row => row.trim().length);
}
export function resetFilters() {
  Object.assign(state.filters,{search:'',sentiment:'',category:'',topic:'',issueIndices:null,issueLabel:'',page:1});
}
export function filteredRows(result, filters) {
  const query = filters.search.trim().toLocaleLowerCase();
  const topic = filters.topic === '' ? null : result.topics[Number(filters.topic)];
  const topicIndices = topic ? new Set(topic.response_indices) : null;
  const issueIndices = filters.issueIndices ? new Set(filters.issueIndices) : null;
  return result.responses.filter(row =>
    (!query || row.text.toLocaleLowerCase().includes(query)) &&
    (!filters.sentiment || row.sentiment === filters.sentiment) &&
    (!filters.category || row.category === filters.category) &&
    (!topicIndices || topicIndices.has(row.row_index)) &&
    (!issueIndices || issueIndices.has(row.row_index))
  );
}
export function pageRows(rows, filters) {
  const pages = Math.max(1, Math.ceil(rows.length / filters.pageSize));
  const page = Math.max(1, Math.min(filters.page, pages));
  const offset = (page - 1) * filters.pageSize;
  return {rows:rows.slice(offset,offset + filters.pageSize), page,pages,offset,total:rows.length};
}
