// Accessible HTML charts; all widths and labels come from returned measurements.
import {escapeHTML as e,number,percent,title,classOrder,sentimentClass} from './utils.js';
export function stack(values, label='Sentiment distribution') {
  const total = Object.values(values).reduce((a,b)=>a+b,0);
  const parts = classOrder(values).map(key=>'<span class="fill-'+sentimentClass(key)+'" style="width:'+(total ? values[key]/total*100 : 0)+'%" title="'+e(title(key)+': '+number(values[key]))+'"></span>').join('');
  return '<div class="stacked-bar" role="img" aria-label="'+e(label+': '+Object.entries(values).map(([k,v])=>title(k)+' '+number(v)).join(', '))+'">'+parts+'</div>';
}
export function sentimentChart(sentiment) {
  return stack(sentiment.counts) + '<ul class="sentiment-legend">'+classOrder(sentiment.counts).map(key=>'<li><span class="legend-name"><i class="legend-dot fill-'+sentimentClass(key)+'"></i>'+e(title(key))+'</span><span class="legend-values">'+percent(sentiment.percentages[key])+'<span>'+number(sentiment.counts[key])+' responses</span></span></li>').join('')+'</ul>';
}
export function trendChart(trends) {
  if(!trends.available) return '<div class="unavailable"><strong>Trend analysis unavailable</strong>'+e(trends.reason || 'Date information was not provided in this dataset.')+'</div>';
  return '<p class="small muted">'+number(trends.dated_responses)+' dated responses · '+number(trends.undated_responses)+' without usable dates. Observed dates only.</p><div class="trend-scroll"><table class="trend-table"><caption class="sr-only">Dated response volume and sentiment</caption><thead><tr><th>Date</th><th class="numeric">Responses</th><th>Sentiment counts</th></tr></thead><tbody>'+trends.points.map(p=>'<tr><td>'+e(p.date)+'</td><td class="numeric">'+number(p.total_responses)+'</td><td>'+stack(p.sentiment.counts)+'<small>'+classOrder(p.sentiment.counts).map(k=>e(title(k))+' '+number(p.sentiment.counts[k])).join(' · ')+'</small></td></tr>').join('')+'</tbody></table></div>';
}
