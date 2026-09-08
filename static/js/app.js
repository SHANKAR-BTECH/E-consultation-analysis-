import {$,number,setOptions} from './utils.js';
import {state,parseResponses,resetFilters} from './state.js';
import {request,analyzeResponses,inspectFile,analyzeFile,APIError} from './api.js';
import {renderAnalysis,renderExplorer,showIssue} from './render.js';
import {SAMPLES,SAMPLE_LABELS} from './samples.js';

const limits=JSON.parse($('app-config').textContent);
let disabledControls=[];
let searchTimer;
function showError(error) {
  $('error-message').textContent=error.message || 'Please try again.';
  const rejected=Array.isArray(error.details?.rejected) ? error.details.rejected : [];
  $('error-details').replaceChildren(...rejected.slice(0,20).map(row=>{
    const li=document.createElement('li');li.textContent='Response '+row.row_index+': '+row.message;return li;
  }));
  if(rejected.length>20) {
    const li=document.createElement('li');li.textContent=number(rejected.length-20)+' more responses were rejected.';$('error-details').append(li);
  }
  $('action-error').hidden=false;
  $('action-error').focus({preventScroll:true});
  $('action-error').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function hideError() { $('action-error').hidden=true; }
function setBusy(busy) {
  state.busy=busy;
  $('workspace').setAttribute('aria-busy',String(busy));
  if(busy) {
    disabledControls=[...document.querySelectorAll('#workspace button,#workspace input,#workspace textarea,#workspace select')].map(el=>[el,el.disabled]);
    disabledControls.forEach(([el])=>el.disabled=true);
  } else {
    disabledControls.forEach(([el,disabled])=>el.disabled=disabled);
    disabledControls=[];
  }
}
function selectTab(mode) {
  if(state.busy)return;
  state.mode=mode;hideError();
  ['paste','csv','url'].forEach(key=>{
    const active=key===mode;
    $('tab-'+key).setAttribute('aria-selected',String(active));$('tab-'+key).tabIndex=active?0:-1;
    $('pane-'+key).hidden=!active;
  });
}
function updateCounters() {
  const text=$('paste-input').value;
  $('response-count').textContent=number(parseResponses(text,$('separator').value).length);
  $('character-count').textContent=number([...text].length);
  $('paste-help').textContent=$('separator').value==='paragraph' ? 'Separate responses with a blank line. Line breaks within a response are preserved.' : 'One response per line. Empty lines are ignored.';
}
function showWorkspace() {
  if(state.busy)return;
  $('results').hidden=true;$('processing').hidden=true;$('workspace').hidden=false;
  $('empty-state').hidden=!!state.result;hideError();
}
async function submit() {
  if(state.busy)return;
  hideError();
  let operation,source=state.source;
  try {
    if(state.mode==='paste') {
      const rows=parseResponses($('paste-input').value,$('separator').value);
      if(!rows.length)throw new APIError('Paste at least one response or choose an illustrative sample.');
      if(rows.length>limits.maxResponses)throw new APIError('Use at most '+number(limits.maxResponses)+' responses per analysis.');
      if(rows.reduce((sum,text)=>sum+[...text].length,0)>limits.maxCharacters)throw new APIError('The combined responses exceed '+number(limits.maxCharacters)+' characters.');
      operation=()=>analyzeResponses(rows);
    } else if(state.mode==='csv') {
      if(!state.file || !state.inspection)throw new APIError('Choose a CSV and inspect its columns first.');
      if(!$('map-text').value)throw new APIError('Select the response text column before analyzing.');
      const mapping={text_column:$('map-text').value,date_column:$('map-date').value,category_column:$('map-category').value,id_column:$('map-id').value,source_column:$('map-source').value};
      const metadata=[...document.querySelectorAll('#metadata-columns input:checked')].map(input=>input.value);
      source='CSV · '+state.file.name;
      operation=()=>analyzeFile(state.file,mapping,metadata);
    } else return;
  } catch(error) { showError(error);return; }
  setBusy(true);
  $('workspace').hidden=true;$('results').hidden=true;$('processing').hidden=false;
  $('processing-title').focus({preventScroll:true});$('processing').scrollIntoView({block:'start'});
  try {
    const data=await operation();
    if(!data.total_responses)throw new APIError('No valid responses were available for analysis.');
    state.result=data;resetFilters();renderAnalysis(data,source);
    $('processing').hidden=true;$('results').hidden=false;
    $('results-title').focus({preventScroll:true});$('results').scrollIntoView({block:'start'});
  } catch(error) {
    $('processing').hidden=true;$('workspace').hidden=false;
    showError(error instanceof APIError ? error : new APIError('The results could not be displayed. Your inputs are still available; please try again.'));
  } finally {setBusy(false);}
}
function resetFile() {
  state.file=null;state.inspection=null;$('csv-file').value='';
  $('csv-selected').hidden=true;$('csv-mapping').hidden=true;$('drop-zone').hidden=false;
}
async function chooseFile(file) {
  if(!file || state.busy)return;
  hideError();resetFile();
  if(!file.name.toLowerCase().endsWith('.csv')){showError(new APIError('Choose a CSV file with a .csv filename.'));return;}
  if(file.size>limits.maxCsvBytes){showError(new APIError('The CSV exceeds '+number(limits.maxCsvBytes/1000000)+' MB.'));return;}
  state.file=file;$('drop-zone').hidden=true;$('csv-selected').hidden=false;
  $('file-name').textContent=file.name;$('file-description').textContent='Inspecting columns…';
  setBusy(true);
  try {
    const inspection=await inspectFile(file);
    state.inspection=inspection;
    $('file-description').textContent=number(inspection.row_count)+' records detected · '+(file.size/1024).toFixed(1)+' KB';
    setOptions($('map-text'),inspection.columns,'Select a response column',inspection.suggested_mapping.text_column);
    setOptions($('map-date'),inspection.columns,'Do not use',inspection.suggested_mapping.date_column);
    setOptions($('map-category'),inspection.columns,'Do not use',inspection.suggested_mapping.category_column);
    setOptions($('map-id'),inspection.columns,'Use row number');
    setOptions($('map-source'),inspection.columns,'Do not use');
    $('metadata-columns').replaceChildren(...inspection.columns.map(column=>{
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=column;
      label.append(input,document.createTextNode(column));return label;
    }));
    $('csv-mapping').hidden=false;
  } catch(error) {resetFile();showError(error);}
  finally{setBusy(false);}
}
async function checkHealth() {
  try {
    const health=await request('/health');
    if(!health?.model_loaded)throw new APIError('The saved model is unavailable. Please restart the server after checking its artifacts.');
    $('system-status').className='system-status ready';
    $('system-status').replaceChildren(Object.assign(document.createElement('i'),{}),document.createTextNode('System ready'));
    $('system-error').hidden=true;
  } catch(error) {
    $('system-status').className='system-status unavailable';$('system-status').textContent='Service unavailable';
    $('system-error').textContent=error.message;$('system-error').hidden=false;
  }
}

for(const mode of ['paste','csv','url']) {
  $('tab-'+mode).addEventListener('click',()=>selectTab(mode));
  $('tab-'+mode).addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const modes=['paste','csv','url'];let index=modes.indexOf(mode);
    index=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;
    selectTab(modes[index]);$('tab-'+modes[index]).focus();
  });
}
$('paste-input').addEventListener('input',()=>{state.source='Pasted responses';$('sample-note').hidden=true;updateCounters();hideError();});
$('separator').addEventListener('change',updateCounters);
$('paste-input').addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();submit();}});
$('clear-paste').addEventListener('click',()=>{$('paste-input').value='';state.source='Pasted responses';$('sample-note').hidden=true;updateCounters();hideError();$('paste-input').focus();});
$('analyze-paste').addEventListener('click',submit);$('analyze-csv').addEventListener('click',submit);
$('url-use-csv').addEventListener('click',()=>selectTab('csv'));
$('csv-file').addEventListener('change',event=>chooseFile(event.target.files[0]));
$('remove-file').addEventListener('click',()=>{resetFile();hideError();});
$('drop-zone').addEventListener('dragover',event=>{event.preventDefault();if(!state.busy)$('drop-zone').classList.add('dragover');});
$('drop-zone').addEventListener('dragleave',()=>$('drop-zone').classList.remove('dragover'));
$('drop-zone').addEventListener('drop',event=>{event.preventDefault();$('drop-zone').classList.remove('dragover');if(event.dataTransfer.files.length!==1){showError(new APIError('Please choose one CSV at a time.'));return;}chooseFile(event.dataTransfer.files[0]);});
document.querySelectorAll('[data-sample]').forEach(button=>button.addEventListener('click',()=>{
  const name=button.dataset.sample;selectTab('paste');$('paste-input').value=SAMPLES[name].join('\n');$('separator').value='line';
  state.source='Illustrative sample · '+SAMPLE_LABELS[name];
  $('sample-note').hidden=false;$('sample-note').textContent='Illustrative '+SAMPLE_LABELS[name]+' inputs, not verified citizen submissions. All results will be calculated by the analysis service.';
  updateCounters();$('paste-input').focus();
}));
$('edit-input').addEventListener('click',()=>{showWorkspace();$('workspace').scrollIntoView({block:'start'});});
document.querySelectorAll('a[href="#workspace"]').forEach(link=>link.addEventListener('click',()=>showWorkspace()));
$('dismiss-error').addEventListener('click',hideError);
$('issues-body').addEventListener('click',event=>{const button=event.target.closest('[data-issue]');if(button)showIssue(Number(button.dataset.issue));});
$('topics-body').addEventListener('click',event=>{
  const button=event.target.closest('[data-topic]');if(!button)return;
  state.filters.topic=button.dataset.topic;state.filters.issueIndices=null;state.filters.issueLabel='';state.filters.page=1;
  $('filter-topic').value=state.filters.topic;renderExplorer();$('explorer').scrollIntoView({block:'start'});$('search').focus({preventScroll:true});
});
$('close-issue').addEventListener('click',()=>$('issue-dialog').close());
$('issue-detail').addEventListener('click',event=>{
  const button=event.target.closest('[data-explore-issue]');if(!button)return;
  const issue=state.result.issues[Number(button.dataset.exploreIssue)];
  state.filters.issueIndices=issue.response_indices;state.filters.issueLabel=issue.issue;state.filters.topic='';state.filters.page=1;
  $('filter-topic').value='';$('issue-dialog').close();renderExplorer();$('explorer').scrollIntoView({block:'start'});$('search').focus({preventScroll:true});
});
$('clear-context').addEventListener('click',()=>{state.filters.issueIndices=null;state.filters.issueLabel='';state.filters.page=1;renderExplorer();});
$('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.filters.search=$('search').value;state.filters.page=1;renderExplorer();},120);});
for(const name of ['sentiment','category','topic']) $('filter-'+name).addEventListener('change',()=>{state.filters[name]=$('filter-'+name).value;state.filters.page=1;renderExplorer();});
$('reset-filters').addEventListener('click',()=>{clearTimeout(searchTimer);resetFilters();$('search').value='';for(const name of ['sentiment','category','topic'])$('filter-'+name).value='';renderExplorer();});
$('previous-page').addEventListener('click',()=>{state.filters.page--;renderExplorer();});
$('next-page').addEventListener('click',()=>{state.filters.page++;renderExplorer();});
$('csv-limit').textContent=number(limits.maxCsvBytes/1000000)+' MB';
$('limits-help').textContent='Up to '+number(limits.maxResponses)+' responses per analysis, '+number(limits.maxPerResponse)+' characters per response, and '+number(limits.maxCharacters)+' combined characters.';
updateCounters();checkHealth();
