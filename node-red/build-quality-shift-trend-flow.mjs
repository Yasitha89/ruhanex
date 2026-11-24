import fs from 'node:fs';
import {stockPeriod} from './periodic-stock.mjs';
import {qualityShiftQuery,calculateLiveQuality} from './live-quality.mjs';
import {trendEvent,trendBucketKey,trendCandidate,qualityTrendStep} from './quality-shift-trend.mjs';
const raw=JSON.parse(fs.readFileSync('C:/Users/Yasitha/.codex/attachments/14c40176-1764-4ec4-80b3-b0078031ced4/Pasted text.txt','utf8').replace(/^\uFEFF/,''));
const z='e5489573e203f3d0',nodes=[];
const fn=(id,name,func,to,x,y)=>nodes.push({id,type:'function',z,name,func,outputs:1,wires:[[to]],x,y});
const complete=JSON.parse(JSON.stringify(raw.find(n=>n.id==='60bc202908ebf55d')));
complete.wires[0].push('rx_qtrend_capture');
nodes.push(complete);
fn('rx_qtrend_capture','Committed quality point → shift trend',`if(!Array.isArray(msg.payload))throw Error('Completed quality write has no original payload.');return {qualityTrendAction:'event',payload:msg.payload};`,'rx_qtrend_engine',700,2600);
nodes.push({id:'rx_qtrend_tick',type:'inject',z,name:'Quality trend startup / retry every 5s',props:[{p:'qualityTrendAction',v:'tick',vt:'str'}],repeat:'5',once:true,onceDelay:1,x:700,y:2700,wires:[['rx_qtrend_engine']]});
nodes.push({id:'rx_qtrend_engine',type:'function',z,name:'Cumulative shift quality trend — independent queue',outputs:4,x:1140,y:2600,
  initialize:`const queue=context.get('queue')||[];const job=context.get('job');if(job?.event)queue.unshift(job.event);context.set('queue',queue);context.set('states',{});context.set('job',null);`,
  func:[stockPeriod,qualityShiftQuery,calculateLiveQuality,trendEvent,trendBucketKey,trendCandidate].map(f=>f.toString()).join('\n')+`\nreturn (${qualityTrendStep.toString()})(msg,context,node);`,
  outputLabels:['Read category catalogue','Rebuild shift baseline from quality_events','Save quality_shift_trend','Trend diagnostics'],wires:[['rx_qtrend_catalogue'],['rx_qtrend_restore'],['rx_qtrend_out'],['rx_qtrend_debug']]});
nodes.push({id:'rx_qtrend_catalogue',type:'mongodb4',z,name:'Trend: read current designGrades categories',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'findOne',output:'toArray',maxTimeMS:'15000',handleDocId:false,x:1570,y:2500,wires:[['rx_qtrend_catalogue_reply']]});
fn('rx_qtrend_catalogue_reply','Trend catalogue result',`msg.qualityTrendAction='catalogue';return msg;`,'rx_qtrend_engine',1950,2500);
nodes.push({id:'rx_qtrend_restore',type:'influxdb in',z,name:'Trend baseline: saved shift grade deltas',influxdb:'eef122fda5340dac',query:'',rawOutput:false,org:'Ruhanex',x:1560,y:2600,wires:[['rx_qtrend_restore_reply']]});
fn('rx_qtrend_restore_reply','Trend baseline result',`msg.qualityTrendAction='restored';return msg;`,'rx_qtrend_engine',1940,2600);
const sourceOut=raw.find(n=>n.id==='e73e975b45bf7e98');
nodes.push({...sourceOut,id:'rx_qtrend_out',name:'Save quality_shift_trend',measurement:'quality_shift_trend',x:1550,y:2700,wires:[]});
nodes.push({id:'rx_qtrend_complete',type:'complete',z,name:'Trend saved successfully',scope:['rx_qtrend_out'],uncaught:false,x:1940,y:2700,wires:[['rx_qtrend_saved']]});
fn('rx_qtrend_saved','Commit trend totals after write',`return {qualityTrendAction:'saved',qualityTrendAttempt:msg.qualityTrendAttempt};`,'rx_qtrend_engine',2300,2700);
nodes.push({id:'rx_qtrend_catch',type:'catch',z,name:'Trend failure — retry without affecting source',scope:['rx_qtrend_engine','rx_qtrend_catalogue','rx_qtrend_restore','rx_qtrend_out'],uncaught:false,x:1560,y:2820,wires:[['rx_qtrend_failed']]});
fn('rx_qtrend_failed','Retain pending trend point',`msg.qualityTrendAction='failed';return msg;`,'rx_qtrend_engine',1950,2820);
nodes.push({id:'rx_qtrend_debug',type:'debug',z,name:'Quality trend result',active:true,tosidebar:true,complete:'payload',targetType:'msg',x:1520,y:2940,wires:[]});
fs.writeFileSync(new URL('./quality-shift-trend.add-on.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
const source=raw.filter(n=>!['mqtt-broker','influxdb','global-config','mongodb4-client'].includes(n.type)&&n.id!==complete.id);
fs.writeFileSync(new URL('./quality-telemetry-with-trend.complete.flow.json',import.meta.url),JSON.stringify([...source,...nodes],null,2)+'\n');
console.log('Generated independent quality_shift_trend writer and telemetry integration.');
