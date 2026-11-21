import fs from 'node:fs';
import assert from 'node:assert/strict';
import {qualityPeriod,decodeQualityPoint,nextQualityState,restoredQualityStates,qualityCurrentShiftView,qualityRestoreEngine} from './quality-restore-runtime.mjs';
const z='e5489573e203f3d0',write='5192007de14ed9bf';
const fn=(id,name,func,wires,x,y,extra={})=>({id,z,type:'function',name,func,outputs:wires.length,wires,x,y,...extra});
const prelude=[qualityPeriod,decodeQualityPoint,nextQualityState,restoredQualityStates,qualityCurrentShiftView,qualityRestoreEngine].map(f=>f.toString()).join('\n');
const nodes=[
 fn('rx_qr_engine','Quality ONLY: restore gate + reboot-safe counts',prelude+"\ntry{return qualityRestoreEngine(msg,flow,global,node,env);}catch(e){node.error(e.message);return null;}",[[write],['rx_qr_read'],['rx_qr_debug']],660,1720,{initialize:"flow.set('qualityRestoreReady',false);flow.set('qualityRestoreBusy',false);flow.set('qualityWriteBusy',false);flow.set('qualityWriteCandidate',null);flow.set('qualityRestoreQueue',[]);flow.set('qualityRestoreEpoch',Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));"}),
 {id:'rx_qr_tick',z,type:'inject',name:'Quality startup / retry every 5 seconds',props:[{p:'qualityAction',v:'tick',vt:'str'}],repeat:'5',once:true,onceDelay:1,x:260,y:1800,wires:[['rx_qr_engine']]},
 {id:'rx_qr_read',z,type:'influxdb in',influxdb:'eef122fda5340dac',name:'Quality ONLY: restore latest quality_events',query:'',rawOutput:false,precision:'',retentionPolicy:'',org:'Ruhanex',x:1090,y:1800,wires:[['rx_qr_restored']]},
 fn('rx_qr_restored','Quality restore finished',"msg.qualityAction='restored';return msg;",[['rx_qr_engine']],1480,1800),
 {id:'rx_qr_complete',z,type:'complete',name:'Quality Influx write completed successfully',scope:[write],uncaught:false,x:280,y:1900,wires:[['rx_qr_saved']]},
 fn('rx_qr_saved','Commit quality counts only after save',"return {qualityAction:'saved',qualityWriteId:msg.qualityWriteId};",[['rx_qr_engine']],720,1900),
 {id:'rx_qr_catch_write',z,type:'catch',name:'Quality write failed → retain candidate',scope:[write],uncaught:false,x:280,y:1980,wires:[['rx_qr_write_failed']]},
 fn('rx_qr_write_failed','Retry same quality point on next tick',"return {qualityAction:'write_failed',qualityWriteId:msg.qualityWriteId};",[['rx_qr_engine']],720,1980),
 {id:'rx_qr_catch_restore',z,type:'catch',name:'Quality restore failed → keep gate closed',scope:['rx_qr_read'],uncaught:false,x:1100,y:1980,wires:[['rx_qr_restore_failed']]},
 fn('rx_qr_restore_failed','Retry quality restore on next tick',"return {qualityAction:'restore_failed',qualityEpoch:msg.qualityEpoch};",[['rx_qr_engine']],1500,1980),
 {id:'rx_qr_debug',z,type:'debug',name:'Quality committed counts',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:1080,y:1720,wires:[]},
];
fs.writeFileSync(new URL('./quality-restore.add-on.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
if(process.argv[2]) {
 const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
 const original=input.filter(n=>n.z),all=structuredClone(original);
 const validator=all.find(n=>n.id==='47f5060cde6f1579');
 const output=all.find(n=>n.id===write);
 assert(validator&&output,'Expected attached quality validator and output IDs.');
 assert.equal(output.measurement,'quality_events');
 assert(validator.wires[0].includes(write));
 validator.wires[0]=validator.wires[0].map(id=>id===write?'rx_qr_engine':id);
 all.push(...nodes);
 for(const n of original.filter(n=>n.type==='function'))assert.equal(all.find(m=>m.id===n.id).func,n.func);
 const ids=new Set(all.map(n=>n.id));assert.equal(ids.size,all.length);
 for(const n of all)for(const wire of n.wires||[])for(const target of wire)assert(ids.has(target),'Missing target '+target);
 fs.writeFileSync(new URL('./quality-restore.complete.flow.json',import.meta.url),JSON.stringify(all,null,2)+'\n');
 console.log('Generated complete quality flow; existing validator unchanged, existing Influx Out retained.');
}
console.log('Generated quality-restore.add-on.flow.json');
