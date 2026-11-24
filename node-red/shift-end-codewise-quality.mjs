import {qualityShiftQuery,calculateLiveQuality} from './live-quality.mjs';

export function directQualityTarget(stats,global) {
  const t={line:stats.lineName,device:stats.device,shift:stats.shift,shiftDate:stats.shiftDate,from:stats.shiftStart,to:stats.shiftEnd,availability:stats.availability,performance:stats.performance};
  const devices=global.get('devices');
  if(!devices||global.get('devicesReady')!==true)return {...t,status:'pending',reason:'device-registry-unavailable'};
  const sensors=Object.entries(devices).filter(([id,d])=>id.startsWith('RX-QLT-')&&d?.enabled===true&&d.line===t.line);
  return sensors.length===0?{...t,status:'assumed'}:sensors.length===1?{...t,status:'pending',sensor:sensors[0][0]}:{...t,status:'configuration-error'};
}

export function directQualityQuery(target) {
  if(!Number.isFinite(Date.parse(target.from))||!Number.isFinite(Date.parse(target.to)))throw Error('Missing shift interval for direct quality calculation.');
  // Run identity is needed because the supplied code-wise array separates production runs.
  return qualityShiftQuery(target.sensor,target.from,target.to,'RCLH',target.line)
    .replace(' and (',' and (r._field=="production_run_id" or ')
    .replace('"design_code","tile_size"]','"design_code","tile_size","production_run_id"]');
}

export function directQualityFields(target,rows,grades,now) {
  const q=rows===null?null:calculateLiveQuality(rows,grades);
  if(q)q.gradeSegments=rows.map(r=>({designCode:r.design_code,tileSize:r.tile_size,productionRunId:r.production_run_id||'',
    tilesPerBox:Number(r.tiles_per_box),designGrades:JSON.parse(r.design_grades_json),
    gradeBoxes:Array.from({length:16},(_,i)=>Number(r[`grade_${i}_delta`]))}));
  const assumed=target.status==='assumed',measured=q?.qualityAvailable===true;
  let outputProductionSqm=q?0:null;
  if(q)for(const segment of q.segments){
    if(!segment.totalTiles)continue;
    const dimensions=String(segment.tileSize||'').toLowerCase().replace(/\s+/g,'').replace(/×/g,'x').split('x').map(Number);
    if(dimensions.length!==2||!dimensions.every(n=>Number.isFinite(n)&&n>0)){outputProductionSqm=null;break;}
    outputProductionSqm+=segment.totalTiles*dimensions[0]*dimensions[1]/10000;
  }
  if(outputProductionSqm!==null)outputProductionSqm=Math.round((outputProductionSqm+Number.EPSILON)*100)/100;
  const quality=assumed?100:measured?q.firstQuality:null;
  const metric=quality===null?null:Math.round(Number(target.availability)*Number(target.performance)*quality/100)/100;
  return {quality,firstQuality:quality,normalDamageQuality:measured?q.normalDamageQuality:null,cutDamageQuality:measured?q.cutDamageQuality:null,
    totalQualityTiles:q?.totalTiles??null,totalOutputTiles:q?.totalTiles??null,totalOutputProductionSqm:outputProductionSqm,qualityOutputProductionSqm:outputProductionSqm,qualityAvailable:measured,qualityAssumed:assumed,
    qualityStatus:assumed?'assumed':measured?'measured':rows!==null?'unavailable':target.status==='configuration-error'?'configuration-error':'pending',
    qualitySensorDevice:target.sensor||null,qualitySource:assumed?'assumed-no-enabled-sensor':'quality_events-direct',
    qualitySummary:q,qualityCatalogueSnapshot:rows===null?null:grades.map(g=>({grade:g.grade,category:g.category??'',description:g.description||''})),qualityUpdatedAt:new Date(now).toISOString(),ole:metric,oee:metric};
}

export function directCodeWiseQuality(entries,target,rows,grades) {
  const code=v=>String(v??'').trim();
  const size=v=>code(v).toLowerCase().replace(/\s+/g,'').replace(/×/g,'x');
  const product=e=>JSON.stringify([code(e.designCode),size(e.tileSize)]);
  const run=e=>code(e.productionRunId);
  const counts=new Map(),runs=new Map();
  for(const e of entries){const p=product(e),r=p+'|'+run(e);counts.set(p,(counts.get(p)||0)+1);runs.set(r,(runs.get(r)||0)+1);}
  return entries.map(entry=>{
    const p=product(entry),id=run(entry);
    const productRows=(rows||[]).filter(r=>product({designCode:r.design_code,tileSize:r.tile_size})===p);
    let selected=[],scope='production-run';
    if(rows!==null) {
      if(id&&runs.get(p+'|'+id)===1)selected=productRows.filter(r=>code(r.production_run_id)===id);
      if(!selected.length&&counts.get(p)===1){selected=productRows;scope='design-size';}
    }
    const q=rows===null?null:calculateLiveQuality(selected,grades);
    const measured=q?.qualityAvailable===true,assumed=target.status==='assumed';
    const quality=assumed?100:measured?q.firstQuality:null;
    return {...entry,quality,firstQuality:quality,normalDamageQuality:measured?q.normalDamageQuality:null,cutDamageQuality:measured?q.cutDamageQuality:null,
      qualityTotalBoxes:q?.totalBoxes??null,qualityTotalTiles:q?.totalTiles??null,
      firstQualityTiles:q?.firstTiles??null,normalDamageTiles:q?.normalDamageTiles??null,cutDamageTiles:q?.cutDamageTiles??null,
      undetectedTiles:q?.undetectedTiles??null,unclassifiedTiles:q?.unclassifiedTiles??null,
      qualityAvailable:measured,qualityAssumed:assumed,
      qualityStatus:assumed?'assumed':measured?'measured':rows===null?'pending':productRows.length?'run-match-unavailable':'no-matching-quality-data',
      qualityScope:scope,qualitySource:assumed?'assumed-no-enabled-sensor':'quality_events-direct',
      qualityDetails:q};
  });
}

export function directInitialQuality(msg,global) {
  const s=msg.payload?.lineStats;
  if(!s)throw Error('Missing calculated shift statistics.');
  msg.directQualityTarget=directQualityTarget(s,global);
  Object.assign(s,directQualityFields(msg.directQualityTarget,null,[],Date.now()));
  return msg;
}

export function directPrepareQuality(msg) {
  const t=msg.directQualityTarget;
  if(!t||!msg.payload?.[1]?.$set)throw Error('Missing direct quality target / code-wise update.');
  msg.directQualityOriginalUpdate=msg.payload;
  if(!t.sensor)return [null,msg];
  msg.payload=[{_id:'designGrades'}];return [msg,null];
}

export function directCatalogueQuery(msg) {
  const doc=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  if(!Array.isArray(doc?.grades))throw Error('Missing design grade catalogue.');
  msg.directQualityGrades=doc.grades;
  msg.query=directQualityQuery(msg.directQualityTarget);delete msg.payload;
  return msg;
}

export function directAttachQuality(msg) {
  const original=msg.directQualityOriginalUpdate;
  if(!original?.[1]?.$set)throw Error('Missing original shift update.');
  const t=msg.directQualityTarget,rows=t.sensor&&!msg.directQualityFailed?msg.payload:null;
  const grades=msg.directQualityGrades||[];
  const fields=directQualityFields(t,rows,grades,Date.now());
  const entries=original[1].$set['lineStats.codeWiseProduction']||[];
  original[1].$set['lineStats.codeWiseProduction']=directCodeWiseQuality(entries,t,rows,grades);
  for(const [k,v] of Object.entries(fields))original[1].$set['lineStats.'+k]=v;
  // Drop legacy references: this calculation does not read collection quality.
  original[1].$unset={...original[1].$unset,'lineStats.qualityDocumentId':''};
  msg.payload=original;msg.collection='shifts';msg.operation='updateOne';
  return msg;
}
