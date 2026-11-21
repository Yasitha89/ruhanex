import fs from 'node:fs';
import assert from 'node:assert/strict';
import {qualityShiftQuery,calculateLiveQuality} from './live-quality.mjs';
import {directQualityTarget,directQualityQuery,directQualityFields,directCodeWiseQuality,directInitialQuality,directPrepareQuality,directCatalogueQuery,directAttachQuality} from './shift-end-codewise-quality.mjs';
const z='e5489573e203f3d0',save='ceb7f2b046b165ff';
const base=[qualityShiftQuery,calculateLiveQuality,directQualityTarget,directQualityQuery,directQualityFields,directCodeWiseQuality].map(f=>f.toString()).join('\n');
const fn=(id,name,func,wires,x,y)=>({id,z,type:'function',name,func,outputs:wires.length,wires,x,y});
const db=(id,name,collection,operation,next,x,y)=>({id,z,type:'mongodb4',name,clientNode:'8120871193b8f276',mode:'collection',collection,operation,output:'toArray',maxTimeMS:'15000',handleDocId:false,x,y,wires:[[next]]});
const nodes=[
 fn('rx_dq_initial','Shift summary: initialize direct quality',base+'\n'+directInitialQuality.toString()+'\nreturn directInitialQuality(msg,global);',[['94b054dbc6125d09']],600,2100),
 fn('rx_dq_prepare','Code-wise production: calculate quality directly',directPrepareQuality.toString()+'\nreturn directPrepareQuality(msg);',[['rx_dq_catalogue'],['rx_dq_attach']],600,2200),
 db('rx_dq_catalogue','Read grade categories only (ruhanex_config)','ruhanex_config','findOne','rx_dq_query',1080,2200),
 fn('rx_dq_query','Read quality_events for completed shift',base+'\n'+directCatalogueQuery.toString()+'\nreturn directCatalogueQuery(msg);',[['rx_dq_influx']],1530,2200),
 {id:'rx_dq_influx',z,type:'influxdb in',name:'Direct quality by design / size / run',influxdb:'eef122fda5340dac',query:'',rawOutput:false,precision:'',retentionPolicy:'',org:'Ruhanex',x:600,y:2320,wires:[['rx_dq_attach']]},
 fn('rx_dq_attach','Add quality to each code-wise entry + OLE',base+'\n'+directAttachQuality.toString()+'\nreturn directAttachQuality(msg);',[[save]],1100,2320),
 {id:'rx_dq_catch_final',z,type:'catch',name:'Direct quality failed: preserve production save',scope:['rx_dq_catalogue','rx_dq_query','rx_dq_influx','rx_dq_attach'],uncaught:false,x:550,y:2440,wires:[['rx_dq_final_error']]},
 fn('rx_dq_final_error','Save production with pending quality',base+'\n'+directAttachQuality.toString()+"\nnode.warn('Direct quality calculation failed; production saved with pending quality.');msg.directQualityFailed=true;return directAttachQuality(msg);",[[save]],1100,2440),
 {id:'rx_dq_tick',z,type:'inject',name:'Recheck direct quality after grace / failures',props:[],once:true,onceDelay:15,repeat:'60',x:250,y:2580,wires:[['rx_dq_pending_query']]},
 fn('rx_dq_pending_query','Pending / settling shift quality',"return {payload:[{'lineStats.qualitySource':'quality_events-direct','lineStats.codeWiseProduction':{$exists:true},$or:[{'lineStats.qualityStatus':'pending'},{'lineStats.directQualitySettled':{$ne:true}}]},{sort:{'lineStats.directQualityCheckedAt':1},limit:50}]};",[['rx_dq_pending_db']],650,2580),
 db('rx_dq_pending_db','Read saved shifts for direct quality reconciliation','shifts','find','rx_dq_each',1110,2580),
 fn('rx_dq_each','Recalculate with saved production metadata',base+`\nif(!Array.isArray(msg.payload))throw Error('Invalid pending shifts result.');const messages=[];
   for(const doc of msg.payload){const s=doc.lineStats;if(!Array.isArray(s.codeWiseProduction))continue;
    let target;if(s.qualitySensorDevice)target={line:s.lineName,device:s.device,shift:s.shift,shiftDate:s.shiftDate,from:s.shiftStart,to:s.shiftEnd,availability:s.availability,performance:s.performance,sensor:s.qualitySensorDevice,status:'pending'};else target=directQualityTarget(s,global);
    messages.push({directQualityProduction:doc,directQualityTarget:target,directQualityReconcile:true,payload:[{_id:'designGrades'}]});}
   return messages.length?[messages]:null;`,[['rx_dq_reconcile_route']],1540,2580),
 fn('rx_dq_reconcile_route','Direct quality recheck routing',"return msg.directQualityTarget.sensor?[msg,null]:[null,msg];",[['rx_dq_reconcile_catalogue'],['rx_dq_reconcile_build']],650,2700),
 db('rx_dq_reconcile_catalogue','Read current grade categories for recheck','ruhanex_config','findOne','rx_dq_reconcile_query',1110,2700),
 fn('rx_dq_reconcile_query','Query shift quality directly again',base+'\n'+directCatalogueQuery.toString()+'\nreturn directCatalogueQuery(msg);',[['rx_dq_reconcile_influx']],1540,2700),
 {id:'rx_dq_reconcile_influx',z,type:'influxdb in',name:'Recheck persisted quality deltas',influxdb:'eef122fda5340dac',query:'',rawOutput:false,precision:'',retentionPolicy:'',org:'Ruhanex',x:650,y:2820,wires:[['rx_dq_reconcile_build']]},
 fn('rx_dq_reconcile_build','Update saved code-wise quality (conditional)',base+`\nconst doc=msg.directQualityProduction,s=doc.lineStats,t=msg.directQualityTarget;
   const rows=t.sensor?msg.payload:null,grades=msg.directQualityGrades||[];
   const fields=directQualityFields(t,rows,grades,Date.now());
   const set={};for(const[k,v]of Object.entries(fields))set['lineStats.'+k]=v;
   set['lineStats.codeWiseProduction']=directCodeWiseQuality(s.codeWiseProduction,t,rows,grades);
   set['lineStats.directQualityCheckedAt']=new Date();
   set['lineStats.directQualitySettled']=fields.qualityStatus!=='pending'&&Date.now()>=Date.parse(t.to)+90000;
   msg.payload=[{_id:doc._id,'lineStats.availability':s.availability,'lineStats.performance':s.performance,'lineStats.codeWiseProduction':{$eq:s.codeWiseProduction}},{$set:set,$unset:{'lineStats.qualityDocumentId':''}}];return msg;`,[['rx_dq_reconcile_save']],1130,2820),
 db('rx_dq_reconcile_save','Save direct quality fields to shifts','shifts','updateOne','rx_dq_result',1550,2820),
 fn('rx_dq_result','Direct code-wise quality saved',"const r=msg.payload;if(r?.acknowledged!==true)throw Error('Direct quality update not acknowledged.');if(r.matchedCount!==1)return null;return {payload:{updated:true,shiftId:String(msg.directQualityProduction._id)}};",[['rx_dq_debug']],650,2940),
 {id:'rx_dq_catch_reconcile',z,type:'catch',name:'Direct quality recheck failed: retry later',scope:['rx_dq_pending_db','rx_dq_each','rx_dq_reconcile_catalogue','rx_dq_reconcile_query','rx_dq_reconcile_influx','rx_dq_reconcile_build','rx_dq_reconcile_save','rx_dq_result'],uncaught:false,x:1100,y:2940,wires:[['rx_dq_safe_error']]},
 fn('rx_dq_safe_error','Safe direct quality error',"return {payload:{updated:false,message:'Direct shift quality recheck failed; will retry.',phase:msg.error?.source?.name}};",[['rx_dq_debug']],650,3060),
 {id:'rx_dq_debug',z,type:'debug',name:'Direct shift quality result',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:1110,y:3060,wires:[]},
];
fs.writeFileSync(new URL('./shift-end-codewise-quality.add-on.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
if(process.argv[2]) {
 const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
 const original=source.filter(n=>n.z),all=structuredClone(original);
 const wire=(id,old,next)=>{const n=all.find(x=>x.id===id);assert(n.wires[0].includes(old));n.wires[0]=n.wires[0].map(x=>x===old?next:x);};
 wire('62aa149752abd2c2','94b054dbc6125d09','rx_dq_initial');wire('c5d1ae1272e15109',save,'rx_dq_prepare');all.push(...nodes);
 for(const n of original.filter(n=>n.type==='function'))assert.equal(all.find(x=>x.id===n.id).func,n.func);
 fs.writeFileSync(new URL('./shift-end-codewise-quality.complete.flow.json',import.meta.url),JSON.stringify(all,null,2)+'\n');
 console.log('Generated direct code-wise quality complete flow; existing Function bodies unchanged.');
}
console.log('Generated shift-end-codewise-quality.add-on.flow.json');
