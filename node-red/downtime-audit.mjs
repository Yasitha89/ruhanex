export function prepareDowntimeAudit(msg) {
  const fail=(status,error)=>{msg.statusCode=status;msg.payload={success:false,error};return [null,msg];};
  const headers=msg.req?.headers||{};
  const username=headers['x-ruhanex-user'],role=headers['x-ruhanex-role'];
  if(typeof username!=='string'||!username.trim()||username.length>100||!['Admin','Manager','Line Supervisor','JE'].includes(role))return fail(401,'Authenticated user identity is required for this change.');
  const args=msg.payload;
  if(!Array.isArray(args)||!args[0]||!args[1]?.$set||!msg._msgid)return fail(500,'Unable to prepare downtime audit.');
  msg.downtimeAudit={id:'downtime:'+msg._msgid,username,role,filter:args[0],update:args[1]};
  msg.payload=[args[0]];msg.operation='findOne';msg.collection='stoppages';
  return [msg,null];
}

export function captureDowntimeBefore(msg) {
  const doc=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  const fail=(status,error)=>{msg.statusCode=status;msg.payload={success:false,error};return [null,msg];};
  if(!doc)return fail(404,'Downtime record was not found.');
  const a=msg.downtimeAudit;
  const fields=['reason','machine','machineCode','downtimeType','plannedCategory','downtimeCode'];
  a.before={};a.after={};const conditions=[];
  for(const field of [...fields,'updatedAt']) {
    const exists=Object.prototype.hasOwnProperty.call(doc,field);
    conditions.push(exists?{[field]:{$eq:doc[field],$exists:true}}:{[field]:{$exists:false}});
    if(fields.includes(field)){a.before[field]=exists?doc[field]:null;a.after[field]=a.update.$set[field]??null;}
  }
  a.stoppageId=String(doc._id);
  a.timestamp=a.update.$set.updatedAt||new Date().toISOString();
  const filter={...a.filter,_id:doc._id,$and:conditions};
  msg.payload=[filter,a.update];msg.operation='updateOne';msg.collection='stoppages';
  return [msg,null];
}

export function buildDowntimeAuditWrite(msg) {
  const result=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  const fail=(status,error)=>{msg.statusCode=status;msg.payload={success:false,error};return [null,msg];};
  if(result?.acknowledged!==true)return fail(500,'Downtime update was not acknowledged.');
  if(Number(result.matchedCount||0)!==1)return fail(409,'Downtime changed or was removed by another process. Refresh and try again.');
  const a=msg.downtimeAudit;
  a.updateResult=result;
  const d=msg.downtimeUpdate||{};
  const record={timestamp:new Date(a.timestamp),username:a.username,role:a.role,
    action:'downtime.details.updated',result:'success',source:'ruhanex-api',
    endpoint:'/api/update-downtime-reason',requestId:msg._msgid,
    line:d.line,date:d.date,shift:d.shift,stopStart_ts:d.stopStart_ts,stoppageId:a.stoppageId,
    before:a.before,after:a.after,
    changedFields:Object.keys(a.after).filter(k=>JSON.stringify(a.before[k])!==JSON.stringify(a.after[k])),
    scope:'stoppage-update-only'};
  msg.payload=[{_id:a.id},{$setOnInsert:record},{upsert:true}];
  msg.operation='updateOne';msg.collection='ruhanex_audit_logs';
  return [msg,null];
}

export function finishDowntimeAudit(msg) {
  const r=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  if(r?.acknowledged!==true) {
    msg.statusCode=500;msg.payload={success:false,downtimeUpdated:true,auditSaved:false,shiftSummaryUpdated:false,error:'Downtime updated, but the audit log could not be confirmed. Contact an administrator.'};
    return [null,msg];
  }
  msg.payload=msg.downtimeAudit.updateResult;
  delete msg.downtimeAudit;
  return [msg,null];
}
