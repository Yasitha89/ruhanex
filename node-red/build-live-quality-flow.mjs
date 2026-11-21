import fs from 'node:fs';
import assert from 'node:assert/strict';
import {qualityShiftQuery,calculateLiveQuality,applyLiveQuality,beginLiveQuality,buildLiveQualityQuery,finishLiveQuality} from './live-quality.mjs';
const z='e5489573e203f3d0',response='1e82ee2a1c04fde3';
const f=(id,name,func,wires,x,y)=>({id,type:'function',z,name,func,outputs:wires.length,wires,x,y});
const error="msg.payload=applyLiveQuality(msg.liveQualityResponse,{qualityAvailable:false,status:'quality-calculation-error'});delete msg.liveQualityGrades;delete msg.liveQualityResponse;node.warn('Live quality calculation failed; production summary returned with quality unavailable.');return msg;";
const extras=[
 f('rx_lq_begin','Live quality: resolve registered sensor',`${applyLiveQuality.toString()}\n${beginLiveQuality.toString()}\nreturn beginLiveQuality(msg,global);`,[['rx_lq_catalogue'],[response]],600,1640),
 {id:'rx_lq_catalogue',type:'mongodb4',z,name:'Read designGrades categories',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'findOne',output:'toArray',maxTimeMS:'15000',handleDocId:false,x:990,y:1640,wires:[['rx_lq_query']]},
 f('rx_lq_query','Live quality: shift events / saved assignments',`${qualityShiftQuery.toString()}\n${buildLiveQualityQuery.toString()}\nreturn buildLiveQualityQuery(msg);`,[['rx_lq_influx']],1400,1640),
 {id:'rx_lq_influx',type:'influxdb in',z,name:'Read quality_events shift tile totals',influxdb:'eef122fda5340dac',query:'',rawOutput:false,precision:'',retentionPolicy:'',org:'Ruhanex',x:600,y:1740,wires:[['rx_lq_finish']]},
 f('rx_lq_finish','Live quality: category 1 / 2 / 3 → KPI',`${calculateLiveQuality.toString()}\n${applyLiveQuality.toString()}\n${finishLiveQuality.toString()}\nreturn finishLiveQuality(msg);`,[[response]],1040,1740),
 {id:'rx_lq_catch',type:'catch',z,name:'Quality unavailable → retain production summary',scope:['rx_lq_catalogue','rx_lq_query','rx_lq_influx','rx_lq_finish'],uncaught:false,x:620,y:1840,wires:[['rx_lq_error']]},
 f('rx_lq_error','Live quality error response',`${applyLiveQuality.toString()}\n${error}`,[[response]],1100,1840),
];
fs.writeFileSync(new URL('./production-live-quality.add-on.flow.json',import.meta.url),JSON.stringify(extras,null,2)+'\n');
if(process.argv[2]) {
 const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
 const original=source.filter(n=>n.z),nodes=structuredClone(original);
 const merge=nodes.find(n=>n.id==='6e23590298f46bf2');assert(merge?.wires?.[0]?.includes(response));
 merge.wires[0]=merge.wires[0].map(id=>id===response?'rx_lq_begin':id);
 nodes.push(...extras);
 for(const n of original.filter(n=>n.type==='function'))assert.equal(nodes.find(x=>x.id===n.id).func,n.func);
 const ids=new Set(nodes.map(n=>n.id));assert.equal(ids.size,nodes.length);
 for(const n of nodes)for(const output of n.wires||[])for(const id of output)assert(ids.has(id),'Missing node '+id);
 fs.writeFileSync(new URL('./production-live-quality.complete.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
 console.log('Generated complete live-summary flow; original Function code unchanged.');
}
console.log('Generated production-live-quality.add-on.flow.json');
