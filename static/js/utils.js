export const $ = id => document.getElementById(id);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const number = value => Number(value).toLocaleString('en-IN');
export const percent = value => Number(value).toFixed(1) + '%';
export const title = value => String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
export const sentimentClass = value => ['positive','neutral','negative'].includes(value) ? value : 'neutral';
export const classOrder = counts => ['positive','neutral','negative', ...Object.keys(counts)].filter((key,i,list) => key in counts && list.indexOf(key) === i);
export function setOptions(select, entries, placeholder, selected = '') {
  select.replaceChildren(new Option(placeholder, ''), ...entries.map(value => new Option(value, value)));
  select.value = selected || '';
}
