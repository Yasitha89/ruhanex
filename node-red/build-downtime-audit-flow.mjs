import fs from 'node:fs';
import {prepareDowntimeAudit,captureDowntimeBefore,buildDowntimeAuditWrite,finishDowntimeAudit} from './downtime-audit.mjs';
const z='b490c7cde81b738c',response='e77e4bc92ffd6b11';
const fn=(id,name,f,next,x,y)=>({id,type:'function',z,name,func:`return (${f.toString()})(msg);`,outputs:2,wires:[[next],[response]],x,y});
const db=(id,name,collection,operation,next,x,y)=>({id,type:'mongodb4',z,name,clientNode:'8120871193b8f276',mode:'collection',collection,operation,output:'toArray',maxTimeMS:'15000',handleDocId:false,wires:[[next]],x,y});
const nodes=[
  fn('rx_da_prepare','Audit: capture verified user + read old values',prepareDowntimeAudit,'rx_da_read',460,1040),
  db('rx_da_read','Audit: read stoppage before edit','stoppages','findOne','rx_da_before',840,1040),
  fn('rx_da_before','Audit: previous values + concurrent edit guard',captureDowntimeBefore,'1dca19134e960bb9',1220,1040),
  fn('rx_da_build','Audit: acknowledged update → log',buildDowntimeAuditWrite,'rx_da_save',460,1140),
  db('rx_da_save','Save ruhanex_audit_logs','ruhanex_audit_logs','updateOne','rx_da_finish',840,1140),
  fn('rx_da_finish','Audit saved → existing shift recalculation',finishDowntimeAudit,'940c7e9bf259add4',1220,1140),
  {id:'rx_da_catch',type:'catch',z,name:'Audit database errors',scope:['rx_da_read','rx_da_save'],uncaught:false,x:450,y:1240,wires:[['rx_da_error']]},
  {id:'rx_da_error',type:'function',z,name:'Audit error: explicit partial result',outputs:1,x:850,y:1240,wires:[[response]],func:"const updated=!!msg.downtimeAudit?.updateResult; node.warn(updated?'Downtime saved but audit database write failed.':'Downtime audit pre-read failed; no update performed.'); msg.statusCode=500;msg.payload={success:false,downtimeUpdated:updated,auditSaved:false,shiftSummaryUpdated:false,error:updated?'Downtime updated, but audit logging failed. Contact an administrator.':'Unable to read downtime for audit. No change was made.'};return msg;"},
];
fs.writeFileSync(new URL('./downtime-audit.add-on.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated downtime-audit.add-on.flow.json');
