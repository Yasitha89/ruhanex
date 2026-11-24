import fs from 'node:fs';
import assert from 'node:assert/strict';
import { qualityShiftQuery, calculateLiveQuality } from './live-quality.mjs';
import { directQualityTarget, directQualityQuery, directQualityFields, directCodeWiseQuality } from './shift-end-codewise-quality.mjs';

const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
const nodes = source.filter(n => n.z);
const live = nodes.find(n => n.id === 'b82b48c5e8ca2a1d');
const response = 'f4eba7a43a9cc668', z = live.z;
assert(live.wires[0].includes(response));
live.wires[0] = live.wires[0].map(id => id === response ? 'rx_ssq_begin' : id);
const fn = (id, name, func, wires, x, y) => ({id, type:'function', z, name, func, outputs:wires.length, wires, x, y});
const finish = `const response=msg.shiftQualityResponse;
const s=response.lineStats,t=msg.shiftQualityTarget;
const rows=t.sensor&&!msg.shiftQualityFailed?msg.payload:null;
const grades=msg.shiftQualityGrades||[];
Object.assign(s,directQualityFields(t,rows,grades,Date.now()));
s.codeWiseProduction=directCodeWiseQuality(s.codeWiseProduction||[],t,rows,grades);
s.codeWiseProductionTimeline=directCodeWiseQuality(s.codeWiseProductionTimeline||[],t,rows,grades);
msg.payload=response;
delete msg.shiftQualityResponse;delete msg.shiftQualityTarget;delete msg.shiftQualityGrades;
return msg;`;
const extras = [
  fn('rx_ssq_begin','Live shift: resolve code-wise quality sensor',`${directQualityTarget.toString()}
if(msg.payload?.success!==true||!/^Keda [123]$/.test(msg.payload.line||''))return [null,msg];
const s=msg.payload.lineStats,m=msg.summaryMeta;
msg.shiftQualityResponse=msg.payload;
msg.shiftQualityTarget=directQualityTarget({...s,shiftStart:m.from,shiftEnd:new Date(Math.min(Date.now(),Date.parse(m.to))).toISOString()},global);
if(!msg.shiftQualityTarget.sensor)return [null,msg];
msg.payload=[{_id:'designGrades'}];return [msg,null];`,[['rx_ssq_catalogue'],['rx_ssq_finish']],600,4700),
  {id:'rx_ssq_catalogue',type:'mongodb4',z,name:'Live code quality: read grade catalogue',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'findOne',output:'toArray',maxTimeMS:'15000',handleDocId:false,x:960,y:4700,wires:[['rx_ssq_query']]},
  fn('rx_ssq_query','Live code quality: query saved grade deltas',`${qualityShiftQuery.toString()}\n${directQualityQuery.toString()}
const catalogue=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
if(!Array.isArray(catalogue?.grades))throw Error('Missing design grade catalogue.');
msg.shiftQualityGrades=catalogue.grades;
msg.query=directQualityQuery(msg.shiftQualityTarget);delete msg.payload;return msg;`,[['rx_ssq_influx']],1340,4700),
  {id:'rx_ssq_influx',type:'influxdb in',z,name:'Live code quality: read quality_events',influxdb:'eef122fda5340dac',query:'',rawOutput:false,org:'Ruhanex',x:1700,y:4700,wires:[['rx_ssq_finish']]},
  fn('rx_ssq_finish','Attach live shift / code-wise quality',`${calculateLiveQuality.toString()}\n${directQualityFields.toString()}\n${directCodeWiseQuality.toString()}\n${finish}`,[[response]],2060,4700),
  {id:'rx_ssq_catch',type:'catch',z,name:'Live quality failure: retain production summary',scope:['rx_ssq_begin','rx_ssq_catalogue','rx_ssq_query','rx_ssq_influx','rx_ssq_finish'],uncaught:false,x:950,y:4800,wires:[['rx_ssq_error']]},
  fn('rx_ssq_error','Return production with quality pending on failure',`${calculateLiveQuality.toString()}\n${directQualityFields.toString()}\n${directCodeWiseQuality.toString()}
if(!msg.shiftQualityResponse)throw Error('Missing production summary.');
msg.shiftQualityFailed=true;
msg.shiftQualityTarget={...msg.shiftQualityTarget,status:'pending'};
node.warn('Live code-wise quality lookup failed; production summary retained.');
${finish}`,[[response]],1430,4800),
];
nodes.push(...extras);
const ids=new Set(nodes.map(n=>n.id));assert.equal(ids.size,nodes.length);
for(const n of nodes.filter(n=>n.type==='function'))new Function('msg','global','flow','context','node','RED',n.func);
fs.writeFileSync(new URL('./shift-summary-live-code-quality.complete.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
fs.writeFileSync(new URL('./shift-summary-live-code-quality.patch.flow.json',import.meta.url),JSON.stringify([live,...extras],null,2)+'\n');
console.log('Generated complete flow and patch (existing live response node + seven quality nodes). Connection configuration excluded.');
