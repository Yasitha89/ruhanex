import fs from 'node:fs';
import assert from 'node:assert/strict';
import {shiftQualityTarget,savedShiftQualityFields,markInitialShiftQuality,prepareFinalShiftQuality,attachFinalShiftQuality,preparePendingShiftQuality,buildPendingShiftQualityUpdate} from './shift-summary-quality.mjs';
const z='e5489573e203f3d0',finalSave='ceb7f2b046b165ff';
const fn=(id,name,func,wires,x,y)=>({id,z,type:'function',name,func,outputs:wires.length,wires,x,y});
const db=(id,name,collection,operation,next,x,y)=>({id,z,type:'mongodb4',name,clientNode:'8120871193b8f276',mode:'collection',collection,operation,output:'toArray',maxTimeMS:'15000',handleDocId:false,x,y,wires:[[next]]});
const base=[shiftQualityTarget,savedShiftQualityFields].map(f=>f.toString()).join('\n');
const nodes=[
 fn('rx_eq_initial','Shift quality: mark measured / assumed / pending',base+'\n'+markInitialShiftQuality.toString()+'\nreturn markInitialShiftQuality(msg,global);',[['94b054dbc6125d09']],650,2140),
 fn('rx_eq_prepare','Final code-wise save: read matching quality',base+'\n'+prepareFinalShiftQuality.toString()+'\nreturn prepareFinalShiftQuality(msg);',[['rx_eq_quality'],[finalSave]],650,2240),
 db('rx_eq_quality','Read completed quality for this sensor/shift','quality','findOne','rx_eq_attach',1120,2240),
 fn('rx_eq_attach','Attach category quality + OLE / OEE',base+'\n'+attachFinalShiftQuality.toString()+'\nreturn attachFinalShiftQuality(msg);',[[finalSave]],1560,2240),
 {id:'rx_eq_read_catch',z,type:'catch',name:'Quality read error: save production as pending',scope:['rx_eq_quality'],uncaught:false,x:1110,y:2340,wires:[['rx_eq_read_failed']]},
 fn('rx_eq_read_failed','Keep production update; quality retries later',base+'\n'+attachFinalShiftQuality.toString()+"\nnode.warn('Quality read failed; preserving production save with pending quality.');delete msg.error;msg.payload=null;return attachFinalShiftQuality(msg);",[[finalSave]],1580,2340),
 fn('rx_eq_queue','After confirmed code-wise save: queue quality storage',"const r=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;if(r?.acknowledged!==true||Number(r.matchedCount||0)<1||!msg.codeWiseTarget)return null;const t=msg.codeWiseTarget;return {qualityShift:{line:t.line,date:t.shiftDate,shift:t.shift}};",[['rx_eq_storage_link']],650,2440),
 {id:'rx_eq_storage_link',z,type:'link out',name:'Queue separate quality collection shift job',mode:'link',links:['rx_qs_link'],x:1000,y:2440,wires:[]},
 {id:'rx_eq_tick',z,type:'inject',name:'Reconcile pending shift quality every 60 sec',props:[],repeat:'60',once:true,onceDelay:15,x:250,y:2560,wires:[['rx_eq_find']]},
 fn('rx_eq_find','Read saved production shifts awaiting quality',"return {payload:[{'lineStats.qualityStatus':'pending'},{sort:{'lineStats.qualityLastCheckedAt':1,'lineStats.shiftDate':1},limit:100}]};",[['rx_eq_pending_db']],650,2560),
 db('rx_eq_pending_db','Pending shifts (durable recovery)','shifts','find','rx_eq_each',1110,2560),
 fn('rx_eq_each','Each pending production shift',"if(!Array.isArray(msg.payload))throw Error('Pending shift query must return an array.');const messages=msg.payload.map(doc=>({shiftQualityProduction:doc}));return messages.length?[messages]:null;",[['rx_eq_pending_prepare']],1550,2560),
 fn('rx_eq_pending_prepare','Pending shift: use captured sensor identity',base+'\n'+preparePendingShiftQuality.toString()+'\nreturn preparePendingShiftQuality(msg,global);',[['rx_eq_pending_quality'],['rx_eq_pending_build']],650,2680),
 db('rx_eq_pending_quality','Read pending shift quality result','quality','findOne','rx_eq_pending_build',1120,2680),
 fn('rx_eq_pending_build','Recalculate pending OLE; preserve other shift fields',base+'\n'+buildPendingShiftQualityUpdate.toString()+'\nreturn buildPendingShiftQualityUpdate(msg);',[['rx_eq_update']],1570,2680),
 db('rx_eq_update','Update only shift quality fields','shifts','updateOne','rx_eq_result',1120,2800),
 fn('rx_eq_result','Shift quality update confirmed',"const r=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;if(r?.acknowledged!==true)throw Error('Shift quality update was not acknowledged.');if(r.matchedCount!==1||msg.shiftQualityCheckOnly)return null;return {payload:{updated:true,shiftId:String(msg.shiftQualityProduction._id),qualityDocumentId:msg.shiftQualityTarget.qualityDocumentId||null}};",[['rx_eq_debug']],1570,2800),
 {id:'rx_eq_catch',z,type:'catch',name:'Pending quality integration error',scope:['rx_eq_find','rx_eq_pending_db','rx_eq_each','rx_eq_pending_prepare','rx_eq_pending_quality','rx_eq_pending_build','rx_eq_update','rx_eq_result'],uncaught:false,x:650,y:2920,wires:[['rx_eq_error']]},
 fn('rx_eq_error','Safe quality retry notice',"return {payload:{updated:false,message:'Pending shift quality could not be reconciled; will retry.',phase:msg.error?.source?.name||'unknown'}};",[['rx_eq_debug']],1120,2920),
 {id:'rx_eq_debug',z,type:'debug',name:'Saved production shift quality result',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:1550,y:2920,wires:[]},
];
fs.writeFileSync(new URL('./shift-summary-quality.add-on.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
if(process.argv[2]){
 const original=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
 const existing=original.filter(n=>n.z),all=structuredClone(existing);
 const connect=(id,old,next)=>{const n=all.find(x=>x.id===id);assert(n?.wires[0].includes(old));n.wires[0]=n.wires[0].map(x=>x===old?next:x);};
 connect('62aa149752abd2c2','94b054dbc6125d09','rx_eq_initial');
 connect('c5d1ae1272e15109',finalSave,'rx_eq_prepare');
 all.find(n=>n.id===finalSave).wires[0].push('rx_eq_queue');
 all.push(...nodes);
 for(const n of existing.filter(n=>n.type==='function'))assert.equal(all.find(x=>x.id===n.id).func,n.func);
 const ids=new Set(all.map(n=>n.id));assert.equal(ids.size,all.length);
 const external=new Set();for(const n of existing)for(const output of n.wires||[])for(const id of output)if(!ids.has(id))external.add(id);
 for(const n of all)for(const output of n.wires||[])for(const id of output)assert(ids.has(id)||external.has(id),'Unexpected missing target '+id);
 fs.writeFileSync(new URL('./shift-summary-quality.complete.flow.json',import.meta.url),JSON.stringify(all,null,2)+'\n');
 console.log('Generated complete shift-end flow; all original Function bodies and external branches preserved.');
}
console.log('Generated shift-summary-quality.add-on.flow.json');
