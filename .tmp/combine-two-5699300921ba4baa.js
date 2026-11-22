function qualityShiftQuery(device,from,to,bucket='RCLH',line) {
  const names=Array.from({length:16},(_,i)=>`grade_${i}_delta`);
  const fields=[...names,'tiles_per_box','design_grades_json','design_code','tile_size'];
  const selected=fields.map(x=>`r._field==${JSON.stringify(x)}`).join(' or ');
  const identity=['points:0',...names.map(n=>`${n}:0.0`)].join(',');
  const accum=['points:accumulator.points+1',...names.map(n=>`${n}:accumulator.${n}+float(v:r.${n})`)].join(',');
  return `from(bucket:${JSON.stringify(bucket)}) |> range(start:time(v:${JSON.stringify(from)}),stop:time(v:${JSON.stringify(to)})) |> filter(fn:(r)=>r._measurement=="quality_events" and r.device==${JSON.stringify(device)}${line?' and r.line=='+JSON.stringify(line):''} and (${selected})) |> toString() |> group(columns:["device"]) |> pivot(rowKey:["_time"],columnKey:["_field"],valueColumn:"_value") |> filter(fn:(r)=>exists r.grade_0_delta) |> group(columns:["device","design_grades_json","tiles_per_box","design_code","tile_size"]) |> reduce(identity:{${identity}},fn:(r,accumulator)=>({${accum}}))`;
}
function calculateLiveQuality(rows,grades) {
  if(!Array.isArray(rows)||!Array.isArray(grades))throw Error('Invalid quality events or grade catalogue.');
  const key=v=>String(v||'').trim().toLowerCase();
  const categories=new Map();
  for(const g of grades){const k=key(g.grade);if(!k)continue;if(categories.has(k))throw Error('Duplicate grade name in catalogue.');categories.set(k,String(g.category??'').trim());}
  const totals={totalBoxes:0,totalTiles:0,firstBoxes:0,firstTiles:0,normalDamageBoxes:0,normalDamageTiles:0,cutDamageBoxes:0,cutDamageTiles:0,undetectedBoxes:0,undetectedTiles:0,unclassifiedBoxes:0,unclassifiedTiles:0};
  const segments=[];
  for(const row of rows) {
    const factor=Number(row.tiles_per_box),map=JSON.parse(row.design_grades_json);
    if(!Number.isSafeInteger(factor)||factor<=0||!map||typeof map!=='object'||Array.isArray(map))throw Error('Invalid saved quality tiles-per-box or grade assignments.');
    const segment={device:row.device,designCode:row.design_code,tileSize:row.tile_size,tilesPerBox:factor,totalBoxes:0,totalTiles:0};
    for(let grade=0;grade<16;grade++) {
      const boxes=Number(row[`grade_${grade}_delta`]);
      if(!Number.isSafeInteger(boxes)||boxes<0)throw Error('Invalid saved quality box delta.');
      const tiles=boxes*factor;if(!Number.isSafeInteger(tiles))throw Error('Quality tile count exceeds safe integer range.');
      const category=grade===0?'undetected':categories.get(key(map[String(grade)]));
      const label=category==='1'?'first':category==='2'?'normalDamage':category==='3'?'cutDamage':grade===0?'undetected':'unclassified';
      totals.totalBoxes+=boxes;totals.totalTiles+=tiles;
      totals[label+'Boxes']+=boxes;totals[label+'Tiles']+=tiles;
      segment.totalBoxes+=boxes;segment.totalTiles+=tiles;
    }
    segments.push(segment);
  }
  if(!Number.isSafeInteger(totals.totalTiles)||!Number.isSafeInteger(totals.totalBoxes))throw Error('Quality total exceeds safe integer range.');
  const pct=tiles=>totals.totalTiles>0?Math.round(tiles/totals.totalTiles*10000)/100:null;
  return {...totals,firstQuality:pct(totals.firstTiles),normalDamageQuality:pct(totals.normalDamageTiles),cutDamageQuality:pct(totals.cutDamageTiles),undetectedPercent:pct(totals.undetectedTiles),unclassifiedPercent:pct(totals.unclassifiedTiles),segments,
    qualityAvailable:totals.totalTiles>0,classificationComplete:totals.unclassifiedTiles===0,
    categorySource:'current-designGrades-catalogue',countSource:'quality_events-grade-deltas'};
}
function directQualityTarget(stats,global) {
  const t={line:stats.lineName,device:stats.device,shift:stats.shift,shiftDate:stats.shiftDate,from:stats.shiftStart,to:stats.shiftEnd,availability:stats.availability,performance:stats.performance};
  const devices=global.get('devices');
  if(!devices||global.get('devicesReady')!==true)return {...t,status:'pending',reason:'device-registry-unavailable'};
  const sensors=Object.entries(devices).filter(([id,d])=>id.startsWith('RX-QLT-')&&d?.enabled===true&&d.line===t.line);
  return sensors.length===0?{...t,status:'assumed'}:sensors.length===1?{...t,status:'pending',sensor:sensors[0][0]}:{...t,status:'configuration-error'};
}
function directQualityQuery(target) {
  if(!Number.isFinite(Date.parse(target.from))||!Number.isFinite(Date.parse(target.to)))throw Error('Missing shift interval for direct quality calculation.');
  // Run identity is needed because the supplied code-wise array separates production runs.
  return qualityShiftQuery(target.sensor,target.from,target.to,'RCLH',target.line)
    .replace(' and (',' and (r._field=="production_run_id" or ')
    .replace('"design_code","tile_size"]','"design_code","tile_size","production_run_id"]');
}
function directQualityFields(target,rows,grades,now) {
  const q=rows===null?null:calculateLiveQuality(rows,grades);
  if(q)q.gradeSegments=rows.map(r=>({designCode:r.design_code,tileSize:r.tile_size,productionRunId:r.production_run_id||'',
    tilesPerBox:Number(r.tiles_per_box),designGrades:JSON.parse(r.design_grades_json),
    gradeBoxes:Array.from({length:16},(_,i)=>Number(r[`grade_${i}_delta`]))}));
  const assumed=target.status==='assumed',measured=q?.qualityAvailable===true;
  const quality=assumed?100:measured?q.firstQuality:null;
  const metric=quality===null?null:Math.round(Number(target.availability)*Number(target.performance)*quality/100)/100;
  return {quality,firstQuality:quality,normalDamageQuality:measured?q.normalDamageQuality:null,cutDamageQuality:measured?q.cutDamageQuality:null,
    totalQualityTiles:q?.totalTiles??null,qualityAvailable:measured,qualityAssumed:assumed,
    qualityStatus:assumed?'assumed':measured?'measured':rows!==null?'unavailable':target.status==='configuration-error'?'configuration-error':'pending',
    qualitySensorDevice:target.sensor||null,qualitySource:assumed?'assumed-no-enabled-sensor':'quality_events-direct',
    qualitySummary:q,qualityCatalogueSnapshot:rows===null?null:grades.map(g=>({grade:g.grade,category:g.category??'',description:g.description||''})),qualityUpdatedAt:new Date(now).toISOString(),ole:metric,oee:metric};
}
function directCodeWiseQuality(entries,target,rows,grades) {
  const code=v=>String(v??'').trim();
  const size=v=>code(v).toLowerCase().replace(/\s+/g,'').replace(/Ã—/g,'x');
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
function directInitialQuality(msg,global) {
  const s=msg.payload?.lineStats;
  if(!s)throw Error('Missing calculated shift statistics.');
  msg.directQualityTarget=directQualityTarget(s,global);
  Object.assign(s,directQualityFields(msg.directQualityTarget,null,[],Date.now()));
  return msg;
}
return directInitialQuality(msg,global);