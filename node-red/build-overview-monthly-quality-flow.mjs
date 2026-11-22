import fs from 'node:fs';
import {prepareMonthlyQuality,monthlyQualityResponse} from './overview-monthly-quality-api.mjs';
import {prepareOverviewLiveQuality,buildOverviewLiveQuery,mergeOverviewLiveQuality} from './overview-live-quality.mjs';
import {stockPeriod} from './periodic-stock.mjs';
import {qualityShiftQuery,calculateLiveQuality} from './live-quality.mjs';
import {qualityReportDocument} from './quality-report-storage.mjs';
const z='rx_overview_quality_api';
const nodes=[
  {id:z,type:'tab',label:'Overview monthly quality API'},
  {id:'rx_omq_http',type:'http in',z,name:'GET monthly Keda quality',method:'get',url:'/api/production/monthly-quality',x:200,y:160,wires:[['rx_omq_prepare']]},
  {id:'rx_omq_prepare',type:'function',z,name:'Validate identity / month',func:`return (${prepareMonthlyQuality.toString()})(msg);`,outputs:2,x:490,y:160,wires:[['rx_omq_mongo'],['rx_omq_response']]},
  {id:'rx_omq_mongo',type:'mongodb4',z,name:'Read monthly quality_reports',clientNode:'8120871193b8f276',mode:'collection',collection:'quality_reports',operation:'find',output:'toArray',maxTimeMS:'15000',handleDocId:false,x:800,y:160,wires:[['rx_omq_build']]},
  {id:'rx_omq_build',type:'function',z,name:'Sum Keda category tiles / calculate percentages',func:`return (${monthlyQualityResponse.toString()})(msg);`,outputs:1,x:1150,y:160,wires:[['rx_omq_response']]},
  {id:'rx_omq_response',type:'http response',z,name:'Return monthly quality',statusCode:'',headers:{},x:1510,y:160,wires:[]},
  {id:'rx_omq_catch',type:'catch',z,name:'Monthly quality API errors',scope:['rx_omq_prepare','rx_omq_mongo','rx_omq_build'],uncaught:false,x:550,y:280,wires:[['rx_omq_error']]},
  {id:'rx_omq_error',type:'function',z,name:'Quality data unavailable',func:`node.warn('Monthly quality API failed at '+(msg.error?.source?.name||'unknown'));msg.statusCode=503;msg.payload={success:false,error:'Monthly quality data is temporarily unavailable.'};return msg;`,outputs:1,x:950,y:280,wires:[['rx_omq_response']]}
];
nodes.find(n=>n.id==='rx_omq_mongo').wires=[['rx_omq_live_prepare']];
nodes.push(
  {id:'rx_omq_live_prepare',type:'function',z,name:'Include active shift once / resolve Keda sensors',func:`${stockPeriod.toString()}\nreturn (${prepareOverviewLiveQuality.toString()})(msg,global);`,outputs:2,x:1100,y:440,wires:[['rx_omq_catalogue'],['rx_omq_build']]},
  {id:'rx_omq_catalogue',type:'mongodb4',z,name:'Read categories for current-shift quality',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'findOne',output:'toArray',maxTimeMS:'15000',handleDocId:false,x:1480,y:440,wires:[['rx_omq_live_query']]},
  {id:'rx_omq_live_query',type:'function',z,name:'Query live Keda quality deltas',func:`${qualityShiftQuery.toString()}\nreturn (${buildOverviewLiveQuery.toString()})(msg);`,outputs:1,x:1840,y:440,wires:[['rx_omq_live_influx']]},
  {id:'rx_omq_live_influx',type:'influxdb in',z,name:'Read current shift quality_events',influxdb:'eef122fda5340dac',query:'',rawOutput:false,org:'Ruhanex',x:2180,y:440,wires:[['rx_omq_live_merge']]},
  {id:'rx_omq_live_merge',type:'function',z,name:'Combine saved reports + live category/design totals',func:`${calculateLiveQuality.toString()}\n${qualityReportDocument.toString()}\nreturn (${mergeOverviewLiveQuality.toString()})(msg);`,outputs:1,x:2540,y:440,wires:[['rx_omq_build']]}
);
nodes.find(n=>n.id==='rx_omq_catch').scope.push('rx_omq_live_prepare','rx_omq_catalogue','rx_omq_live_query','rx_omq_live_influx','rx_omq_live_merge');
fs.writeFileSync(new URL('./overview-monthly-quality-api.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
// Preserve IDs/tab of the user's latest deployed API export.
const original=JSON.parse(fs.readFileSync('C:/Users/Yasitha/.codex/attachments/2b862f93-bbe8-4239-b67b-0196de9cfca9/Pasted text.txt','utf8').replace(/^\uFEFF/,''));
const mapping={rx_omq_http:'9d0ce193e5d9bfc8',rx_omq_prepare:'f6bc9804082ec239',rx_omq_mongo:'8e7305b0149fe64f',rx_omq_build:'2c1f7a5c4dd6334c',rx_omq_response:'b168c7cb89f4cc76',rx_omq_catch:'a0fb20a62d89409a',rx_omq_error:'e6dc5418a1063dbe'};
const mapped=nodes.filter(n=>n.type!=='tab').map(n=>{
  const copy={...n,id:mapping[n.id]||n.id,z:'b490c7cde81b738c'};
  copy.wires=n.wires.map(output=>output.map(id=>mapping[id]||id));
  if(n.scope)copy.scope=n.scope.map(id=>mapping[id]||id);
  const prior=original.find(p=>p.id===copy.id);
  if(prior){copy.x=prior.x;copy.y=prior.y;}
  return copy;
});
fs.writeFileSync(new URL('./overview-monthly-quality-live.complete.flow.json',import.meta.url),JSON.stringify(mapped,null,2)+'\n');
console.log('Generated overview monthly quality API.');
