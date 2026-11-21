import fs from 'node:fs';
import {qualityShiftQuery,calculateLiveQuality} from './live-quality.mjs';
import {qualityStorageRange,qualityPreviousShift,qualityStorageJobs,qualityShiftDocument} from './quality-shift-storage.mjs';
const z='rx_quality_storage_tab';
const fn=(id,name,func,wires,x,y)=>({id,z,type:'function',name,func,outputs:wires.length,wires,x,y});
const db=(id,name,operation,next,x,y,collection='quality')=>({id,z,type:'mongodb4',name,clientNode:'8120871193b8f276',mode:'collection',collection,operation,output:'toArray',maxTimeMS:'30000',handleDocId:false,x,y,wires:[[next]]});
const nodes=[
 {id:z,type:'tab',label:'Quality — Mongo shift storage',disabled:false,info:'See quality-shift-storage.README.md. Separate quality collection; no production counter or summary changes.'},
 {id:'rx_qs_tick',z,type:'inject',name:'Quality previous-shift jobs / retry every 60 sec',props:[],once:true,onceDelay:10,repeat:'60',x:250,y:100,wires:[['rx_qs_schedule']]},
 {id:'rx_qs_manual',z,type:'inject',name:'Manual: queue previous shift (safe repeat)',props:[],once:false,repeat:'',x:250,y:160,wires:[['rx_qs_schedule']]},
 {id:'rx_qs_link',z,type:'link in',name:'After completed production shift save (optional)',links:[],x:110,y:220,wires:[['rx_qs_schedule']]},
 fn('rx_qs_schedule','Queue quality jobs from registered devices',[qualityStorageRange,qualityPreviousShift,qualityStorageJobs].map(f=>f.toString()).join('\n')+"\ntry{if(global.get('devicesReady')!==true||global.get('settingsReady')!==true)return null;const ops=qualityStorageJobs(msg,global,Date.now());return ops.length?[{payload:[ops,{ordered:false}]},null]:[null,{}];}catch(e){node.error(e.message);return null;}",[['rx_qs_enqueue'],['rx_qs_claim']],650,160),
 db('rx_qs_enqueue','Create pending quality documents (idempotent)','bulkWrite','rx_qs_claim',1100,100),
 fn('rx_qs_claim','Claim one pending / failed / expired job',`const now=Date.now();
   if(flow.get('qualityStorageBusyUntil')>now)return null;
   const owner=now.toString(36)+'-'+Math.random().toString(36).slice(2);
   flow.set('qualityStorageOwner',owner);flow.set('qualityStorageBusyUntil',now+360000);
   return {qualityStorageOwner:owner,payload:[{version:1,readyAt:{$lte:new Date(now)},$or:[{status:'pending'},{status:'failed',retryAt:{$lte:new Date(now)}},{status:'processing',leaseUntil:{$lte:new Date(now)}}]},{$set:{status:'processing',leaseOwner:owner,leaseUntil:new Date(now+300000)},$inc:{attempts:1}},{sort:{shiftEnd:1},returnDocument:'after'}]};`,[['rx_qs_claim_db']],650,300),
 db('rx_qs_claim_db','Lease quality job (five minutes)','findOneAndUpdate','rx_qs_catalogue_prepare',1100,300),
 fn('rx_qs_catalogue_prepare','Read category catalogue for claimed shift',`let result=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
   const job=result&&Object.prototype.hasOwnProperty.call(result,'value')?result.value:result;
   if(!job?._id){if(flow.get('qualityStorageOwner')===msg.qualityStorageOwner)flow.set('qualityStorageBusyUntil',0);return null;}
   if(job.leaseOwner!==msg.qualityStorageOwner)throw Error('Quality job lease mismatch.');
   msg.qualityStorageJob=job;msg.payload=[{_id:'designGrades'}];return msg;`,[['rx_qs_catalogue_db']],650,420),
 db('rx_qs_catalogue_db','Read ruhanex_config designGrades','findOne','rx_qs_query',1100,420,'ruhanex_config'),
 fn('rx_qs_query','Read shift quality deltas by design / size',qualityShiftQuery.toString()+`\nconst doc=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
   if(!Array.isArray(doc?.grades))throw Error('Missing designGrades catalogue.');
   msg.qualityStorageGrades=doc.grades;
   const j=msg.qualityStorageJob;msg.query=qualityShiftQuery(j.device,j.shiftFromTime,j.shiftToTime,'RCLH',j.line);delete msg.payload;return msg;`,[['rx_qs_influx']],650,540),
 {id:'rx_qs_influx',z,type:'influxdb in',name:'Aggregate quality_events completed shift',influxdb:'eef122fda5340dac',query:'',rawOutput:false,precision:'',retentionPolicy:'',org:'Ruhanex',x:1100,y:540,wires:[['rx_qs_document']]},
 fn('rx_qs_document','Build design / size / grade tile document',calculateLiveQuality.toString()+'\n'+qualityShiftDocument.toString()+`\nconst job=msg.qualityStorageJob;
   const doc=qualityShiftDocument(job,msg.payload,msg.qualityStorageGrades,Date.now());
   msg.payload=[{_id:job._id,status:'processing',leaseOwner:msg.qualityStorageOwner},{$set:doc,$unset:{leaseOwner:'',leaseUntil:'',retryAt:'',lastError:''}}];return msg;`,[['rx_qs_save']],650,660),
 db('rx_qs_save','Save completed quality summary','updateOne','rx_qs_saved',1100,660),
 fn('rx_qs_saved','Quality save acknowledged → next job',`const r=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
   if(r?.acknowledged!==true||r.matchedCount!==1)throw Error('Quality save was not confirmed or lease expired.');
   if(flow.get('qualityStorageOwner')===msg.qualityStorageOwner)flow.set('qualityStorageBusyUntil',0);
   return [{},{payload:{saved:true,collection:'quality',id:msg.qualityStorageJob._id,line:msg.qualityStorageJob.line,shiftDate:msg.qualityStorageJob.shiftDate,shift:msg.qualityStorageJob.shift}}];`,[['rx_qs_claim'],['rx_qs_debug']],650,780),
 {id:'rx_qs_catch',z,type:'catch',name:'Quality storage job errors',scope:['rx_qs_enqueue','rx_qs_claim_db','rx_qs_catalogue_prepare','rx_qs_catalogue_db','rx_qs_query','rx_qs_influx','rx_qs_document','rx_qs_save','rx_qs_saved'],uncaught:false,x:250,y:900,wires:[['rx_qs_failed']]},
 fn('rx_qs_failed','Retain failed job for retry (safe error)',`if(flow.get('qualityStorageOwner')===msg.qualityStorageOwner)flow.set('qualityStorageBusyUntil',0);
   node.warn('Quality shift save failed; job retained for retry.');
   if(!msg.qualityStorageJob?._id)return [null,{payload:{saved:false,message:'Quality scheduling/claim failed; will retry.'}}];
   return [{payload:[{_id:msg.qualityStorageJob._id,status:'processing',leaseOwner:msg.qualityStorageOwner},{$set:{status:'failed',retryAt:new Date(Date.now()+60000),lastError:'Quality aggregation/storage failed; inspect configured connections and saved grade metadata.'},$unset:{leaseOwner:'',leaseUntil:''}}]},null];`,[['rx_qs_fail_db'],['rx_qs_debug']],650,900),
 db('rx_qs_fail_db','Mark failed quality job / retry later','updateOne','rx_qs_fail_result',1100,900),
 fn('rx_qs_fail_result','Retry status stored',"return {payload:{saved:false,message:'Quality job remains pending for retry.'}};",[['rx_qs_debug']],650,1020),
 {id:'rx_qs_catch_fail',z,type:'catch',name:'Retry-status write error',scope:['rx_qs_fail_db'],uncaught:false,x:1100,y:1020,wires:[['rx_qs_last_error']]},
 fn('rx_qs_last_error','Safe retry-status error',"return {payload:{saved:false,message:'Could not store retry status; expired job lease will allow recovery.'}};",[['rx_qs_debug']],650,1100),
 {id:'rx_qs_debug',z,type:'debug',name:'Quality Mongo save result',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:1100,y:1120,wires:[]},
];
fs.writeFileSync(new URL('./quality-shift-storage.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated quality-shift-storage.flow.json');
