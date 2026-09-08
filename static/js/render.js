// Rendering only: analytics and evidence membership are supplied by the API.
import {$,escapeHTML as e,number,percent,title,classOrder,sentimentClass,setOptions} from './utils.js';
import {state,filteredRows,pageRows} from './state.js';
import {sentimentChart,trendChart,stack} from './charts.js';

const label = sentiment => '<span class="sentiment-label '+sentimentClass(sentiment)+'"><i class="legend-dot fill-'+sentimentClass(sentiment)+'"></i>'+e(title(sentiment))+'</span>';
const priorityLabel = priority => '<span class="priority '+priority.level.toLowerCase()+'">'+e(title(priority.level))+' · '+number(priority.score)+'</span>';

export function renderAnalysis(data,source) {
  $('results-title').textContent = number(data.total_responses)+(data.total_responses===1?' response analyzed':' responses analyzed');
  $('results-meta').textContent = source+' · '+number(data.total_received)+' received · '+number(data.rejected_count)+' excluded';
  const metrics = [{name:'Responses analyzed',value:number(data.total_responses),sub:'Valid responses',cls:''},
    ...classOrder(data.sentiment.counts).map(key=>({name:title(key),value:percent(data.sentiment.percentages[key]),sub:number(data.sentiment.counts[key])+' responses',cls:sentimentClass(key)})),
    {name:'Average confidence',value:data.sentiment.average_confidence === null ? 'Unavailable' : percent(data.sentiment.average_confidence*100),sub:'Model probability, not accuracy',cls:''}];
  $('metrics').innerHTML = metrics.map(m=>'<div><p class="metric-label">'+e(m.name)+'</p><p class="metric-value '+m.cls+'">'+e(m.value)+'</p><p class="metric-sub">'+e(m.sub)+'</p></div>').join('');
  $('summary').textContent=data.summary;
  $('sentiment-chart').innerHTML=sentimentChart(data.sentiment);
  const notes=[];
  if(data.rejected_count) notes.push(number(data.rejected_count)+(data.rejected_count===1?' response was excluded.':' responses were excluded.')+' Review the data quality section for reasons.');
  if(data.warnings.length) notes.push(number(data.warnings.length)+' date warnings are listed in data quality.');
  if(data.analysis_notes.term_limit_reached) notes.push('The phrase discovery limit was reached; topics and issues cover retained terms only.');
  $('partial-notice').hidden=!notes.length;
  $('partial-notice').textContent=notes.join(' ');
  $('issues-body').innerHTML=data.issues.map((issue,index)=>'<tr><td>'+e(issue.issue)+'</td><td class="numeric">'+number(issue.mentions)+'</td><td class="numeric">'+percent(issue.negative_ratio*100)+'</td><td>'+priorityLabel(issue.priority)+'</td><td><button class="link-button" data-issue="'+index+'" aria-label="View evidence for '+e(issue.issue)+'">View evidence ↗</button></td></tr>').join('');
  $('issues-empty').hidden=!!data.issues.length;
  $('issues-body').closest('.table-scroll').hidden=!data.issues.length;
  $('topics-body').innerHTML=data.topics.map((topic,index)=>'<tr><td><button class="link-button" data-topic="'+index+'">'+e(topic.topic)+'</button></td><td class="numeric">'+number(topic.count)+'</td><td class="numeric">'+percent(topic.count/data.total_responses*100)+'</td><td><span class="topic-sentiments">'+classOrder(topic.sentiment).map(key=>'<span class="'+sentimentClass(key)+'" title="'+e(title(key))+'">'+e(title(key))+' '+number(topic.sentiment[key])+'</span>').join('')+'</span></td></tr>').join('');
  $('topics-empty').hidden=!!data.topics.length;
  $('topics-body').closest('.table-scroll').hidden=!data.topics.length;
  const maximum = Math.max(1,...data.keywords.map(k=>k.count));
  $('keywords-list').innerHTML=data.keywords.length ? data.keywords.map(k=>'<li><div class="ranked-label"><span>'+e(k.keyword)+'</span><span>'+number(k.count)+'</span></div><div class="phrase-bar" aria-hidden="true"><span style="width:'+k.count/maximum*100+'%"></span></div></li>').join('') : '<li class="unavailable">No usable keywords were extracted.</li>';
  $('trends-content').innerHTML=trendChart(data.trends);
  $('categories-content').innerHTML=data.categories.available ? '<p class="small muted">'+number(data.categories.categorized_responses)+' categorized · '+number(data.categories.uncategorized_responses)+' without a category</p><div class="table-scroll"><table class="categories-table"><caption class="sr-only">Category sentiment and recurring issues</caption><thead><tr><th>Category</th><th class="numeric">Responses</th><th>Sentiment / issues</th></tr></thead><tbody>'+data.categories.groups.map(group=>'<tr><td>'+e(group.category)+'</td><td class="numeric">'+number(group.total_responses)+'</td><td>'+stack(group.sentiment.counts)+'<span class="small">'+classOrder(group.sentiment.counts).map(key=>e(title(key))+' '+number(group.sentiment.counts[key])).join(' · ')+'</span>'+(group.issues.length?'<details><summary>'+number(group.issues.length)+' recurring issues</summary>'+group.issues.map(i=>'<p class="small">'+e(i.issue)+' · '+number(i.mentions)+' mentions · '+e(title(i.priority.level))+'</p>').join('')+'</details>':'<p class="small muted">No selected issues meet this category’s thresholds.</p>')+'</td></tr>').join('')+'</tbody></table></div>' : '<div class="unavailable"><strong>Category analysis unavailable</strong>'+e(data.categories.reason || 'Category information was not provided in this dataset.')+'</div>';
  $('quality-counts').innerHTML=[['Received',data.total_received],['Valid',data.total_responses],['Rejected',data.rejected_count]].map(([name,count])=>'<div><strong>'+number(count)+'</strong><span>'+name+'</span></div>').join('');
  $('quality-list').innerHTML=[...data.rejected.map(row=>'<p><strong>Response '+number(row.row_index)+' · Excluded</strong><br>'+e(row.message)+'</p>'),...data.warnings.map(row=>'<p><strong>Response '+number(row.row_index)+' · Date warning</strong><br>'+e(row.message)+'</p>')].join('') || '<p>All submitted responses passed validation. No date warnings were reported.</p>';
  $('quality-details').open=false;
  setOptions($('filter-sentiment'),classOrder(data.sentiment.counts),'All sentiments');
  for(const option of $('filter-sentiment').options) if(option.value) option.textContent=title(option.value);
  setOptions($('filter-category'),data.categories.groups.map(g=>g.category),'All categories');
  $('category-filter-wrap').hidden=!data.categories.available;
  $('filter-topic').replaceChildren(new Option('All topics',''),...data.topics.map((t,i)=>new Option(t.topic,String(i))));
  $('topic-filter-wrap').hidden=!data.topics.length;
  $('search').value='';
  renderExplorer();
}

export function renderExplorer() {
  const result=state.result;
  if(!result) return;
  const rows=filteredRows(result,state.filters), page=pageRows(rows,state.filters);
  state.filters.page=page.page;
  $('feedback-body').innerHTML=page.rows.map(row=>'<tr><td><div class="response-id">Response '+number(row.row_index)+' · ID '+e(row.id)+'</div><div class="feedback-text">'+e(row.text)+'</div></td><td>'+label(row.sentiment)+'</td><td class="numeric">'+percent(row.confidence*100)+'</td><td>'+e(row.category || '—')+'</td><td>'+e(row.date || '—')+'</td></tr>').join('');
  $('explorer-empty').hidden=!!page.total;
  $('feedback-body').closest('.table-scroll').hidden=!page.total;
  $('explorer-count').textContent=number(page.total)+' of '+number(result.total_responses)+' responses match';
  $('page-info').textContent=page.total ? 'Showing '+number(page.offset+1)+'–'+number(page.offset+page.rows.length)+' of '+number(page.total) : 'No matching responses';
  $('page-number').textContent=page.page+' / '+page.pages;
  $('previous-page').disabled=page.page<=1;
  $('next-page').disabled=page.page>=page.pages;
  $('context-filter').hidden=!state.filters.issueIndices;
  $('context-text').textContent='Issue: '+state.filters.issueLabel;
}

export function showIssue(index) {
  const issue=state.result?.issues[index]; if(!issue) return;
  const signals=issue.priority.signals;
  $('issue-detail').innerHTML='<h2 id="issue-title">'+e(issue.issue)+'</h2>'+priorityLabel(issue.priority)+'<div class="issue-facts"><div><strong>'+number(issue.mentions)+'</strong><span>Matching responses</span></div><div><strong>'+percent(issue.negative_ratio*100)+'</strong><span>Negative association</span></div></div><h3>Why this priority?</h3><p class="small muted">Relative to '+number(state.result.total_responses)+' valid responses. This is an explainable heuristic, not verified severity.</p>'+[
    ['Coverage',percent(signals.coverage*100)],['Negative ratio',percent(signals.negative_ratio*100)],
    ['Coverage contribution ('+percent(signals.frequency_weight*100)+' weight)',number(signals.frequency_contribution)+' points'],
    ['Negative contribution ('+percent(signals.negative_weight*100)+' weight)',number(signals.negative_contribution)+' points'],['Priority score',number(issue.priority.score)+' / 100']
  ].map(([name,value])=>'<div class="signal-row"><span>'+e(name)+'</span><strong>'+e(value)+'</strong></div>').join('')+'<h3>In the original words</h3><p class="small muted">Unedited source responses, selected by sentiment, confidence and length.</p>'+issue.representative_feedback.map(row=>'<blockquote>'+e(row.text)+'<footer>Response '+number(row.row_index)+' · '+e(title(row.sentiment))+' · '+percent(row.confidence*100)+' model confidence</footer></blockquote>').join('')+'<button class="button primary" data-explore-issue="'+index+'">Explore matching responses →</button>';
  $('issue-dialog').showModal();
}
