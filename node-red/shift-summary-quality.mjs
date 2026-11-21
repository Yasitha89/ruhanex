export function shiftQualityTarget(stats,global) {
  const base={line:stats.lineName,device:stats.device,shift:stats.shift,shiftDate:stats.shiftDate,availability:stats.availability,performance:stats.performance};
  const devices=global.get('devices');
  if(!devices||typeof devices!=='object'||global.get('devicesReady')!==true)return {...base,status:'pending',reason:'device-registry-unavailable'};
  const sensors=Object.entries(devices).filter(([id,d])=>id.startsWith('RX-QLT-')&&d?.enabled===true&&d.line===base.line);
  if(!sensors.length)return {...base,status:'assumed',reason:'no-enabled-quality-sensor'};
  if(sensors.length>1)return {...base,status:'configuration-error',reason:'multiple-quality-sensors'};
  const sensor=sensors[0][0];
  return {...base,status:'pending',sensor,qualityDocumentId:JSON.stringify([sensor,base.line,base.shiftDate,base.shift])};
}

export function savedShiftQualityFields(target,qualityDoc,now) {
  const usable=qualityDoc?.status==='complete'&&qualityDoc.device===target.sensor&&qualityDoc.line===target.line&&qualityDoc.shift===target.shift&&qualityDoc.shiftDate===target.shiftDate&&qualityDoc._id===target.qualityDocumentId;
  const measured=usable&&qualityDoc.qualityAvailable===true&&Number.isFinite(qualityDoc.firstQuality)&&qualityDoc.firstQuality>=0&&qualityDoc.firstQuality<=100;
  const assumed=target.status==='assumed';
  const quality=assumed?100:measured?qualityDoc.firstQuality:null;
  const round=v=>Math.round(v*100)/100;
  const metric=quality===null?null:round(Number(target.availability)*Number(target.performance)*quality/10000);
  const status=assumed?'assumed':measured?'measured':usable?'unavailable':target.status==='configuration-error'?'configuration-error':'pending';
  const details=usable?{
    qualityDocumentId:target.qualityDocumentId,device:target.sensor,status:qualityDoc.dataStatus,
    totalBoxes:qualityDoc.totalBoxes,totalTiles:qualityDoc.totalTiles,
    firstBoxes:qualityDoc.firstBoxes,firstTiles:qualityDoc.firstTiles,
    normalDamageBoxes:qualityDoc.normalDamageBoxes,normalDamageTiles:qualityDoc.normalDamageTiles,
    cutDamageBoxes:qualityDoc.cutDamageBoxes,cutDamageTiles:qualityDoc.cutDamageTiles,
    undetectedBoxes:qualityDoc.undetectedBoxes,undetectedTiles:qualityDoc.undetectedTiles,
    unclassifiedBoxes:qualityDoc.unclassifiedBoxes,unclassifiedTiles:qualityDoc.unclassifiedTiles,
    classificationComplete:qualityDoc.classificationComplete,coverage:qualityDoc.coverage,
    sourceUpdatedAt:qualityDoc.updatedAt,
  }:{status:target.reason||'waiting-for-quality-document'};
  return {
    quality,firstQuality:quality,normalDamageQuality:measured?qualityDoc.normalDamageQuality:null,cutDamageQuality:measured?qualityDoc.cutDamageQuality:null,
    totalQualityTiles:usable?qualityDoc.totalTiles:null,qualityAvailable:measured,qualityAssumed:assumed,
    qualityStatus:status,qualitySensorDevice:target.sensor||null,qualityDocumentId:target.qualityDocumentId||null,
    qualitySummary:details,ole:metric,oee:metric,qualityUpdatedAt:new Date(now).toISOString(),
  };
}

export function markInitialShiftQuality(msg,global) {
  const stats=msg.payload?.lineStats;
  if(!stats?.device||!stats.lineName||!stats.shiftDate||!stats.shift)throw Error('Missing shift identity for quality integration.');
  const target=shiftQualityTarget(stats,global);
  msg.shiftQualityTarget=target;
  Object.assign(stats,savedShiftQualityFields(target,null,Date.now()));
  return msg;
}

export function prepareFinalShiftQuality(msg) {
  const target=msg.shiftQualityTarget;
  if(!target||!Array.isArray(msg.payload)||!msg.payload[1]?.$set)throw Error('Missing quality target / final code-wise update.');
  msg.shiftQualityOriginalUpdate=msg.payload;
  if(!target.qualityDocumentId) {
    const fields=savedShiftQualityFields(target,null,Date.now());
    for(const [k,v] of Object.entries(fields))msg.payload[1].$set['lineStats.'+k]=v;
    delete msg.shiftQualityOriginalUpdate;
    return [null,msg];
  }
  msg.payload=[{_id:target.qualityDocumentId,status:'complete'}];
  msg.collection='quality';msg.operation='findOne';return [msg,null];
}

export function attachFinalShiftQuality(msg) {
  const doc=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  const fields=savedShiftQualityFields(msg.shiftQualityTarget,doc,Date.now());
  const original=msg.shiftQualityOriginalUpdate;
  if(!original?.[1]?.$set)throw Error('Missing original code-wise update.');
  for(const [k,v] of Object.entries(fields))original[1].$set['lineStats.'+k]=v;
  msg.payload=original;msg.collection='shifts';msg.operation='updateOne';
  delete msg.shiftQualityOriginalUpdate;
  return msg;
}

export function preparePendingShiftQuality(msg,global) {
  const production=msg.shiftQualityProduction;
  const stats=production.lineStats;
  let target;
  if(stats.qualitySensorDevice&&stats.qualityDocumentId)target={line:stats.lineName,device:stats.device,shift:stats.shift,shiftDate:stats.shiftDate,availability:stats.availability,performance:stats.performance,sensor:stats.qualitySensorDevice,qualityDocumentId:stats.qualityDocumentId,status:'pending'};
  else target=shiftQualityTarget(stats,global);
  msg.shiftQualityTarget=target;
  if(!target.qualityDocumentId)return [null,msg];
  msg.payload=[{_id:target.qualityDocumentId,status:'complete'}];return [msg,null];
}

export function buildPendingShiftQualityUpdate(msg) {
  const production=msg.shiftQualityProduction,stats=production.lineStats;
  const doc=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  const fields=savedShiftQualityFields(msg.shiftQualityTarget,doc,Date.now());
  if(fields.qualityStatus==='pending') {
    msg.shiftQualityCheckOnly=true;
    msg.payload=[{_id:production._id,'lineStats.qualityStatus':'pending'},{$set:{'lineStats.qualityLastCheckedAt':new Date()}}];
    return msg;
  }
  const set={};for(const [k,v] of Object.entries(fields))set['lineStats.'+k]=v;
  msg.payload=[{_id:production._id,'lineStats.qualityStatus':'pending','lineStats.availability':stats.availability,'lineStats.performance':stats.performance},{$set:set}];
  return msg;
}
