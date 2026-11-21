import {calculateLiveQuality} from './live-quality.mjs';

export function qualityStorageRange(date,shift) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||!['06-14','14-22','22-06'].includes(shift))throw Error('Invalid quality shift date/name.');
  const next=new Date(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const from=`${date}T${shift.slice(0,2)}:00:00+05:30`;
  const to=`${shift==='22-06'?next.toISOString().slice(0,10):date}T${shift.slice(3)}:00:00+05:30`;
  return {from,to};
}

export function qualityPreviousShift(now) {
  const d=new Date(now+330*60000),hour=d.getUTCHours(),date=d.toISOString().slice(0,10);
  if(hour>=14&&hour<22)return {date,shift:'06-14'};
  if(hour>=22)return {date,shift:'14-22'};
  if(hour>=6){d.setUTCDate(d.getUTCDate()-1);return {date:d.toISOString().slice(0,10),shift:'22-06'};}
  d.setUTCDate(d.getUTCDate()-1);return {date:d.toISOString().slice(0,10),shift:'14-22'};
}

export function qualityStorageJobs(msg,global,now) {
  if(global.get('devicesReady')!==true||global.get('settingsReady')!==true)return [];
  const request=msg.qualityShift||msg.codeWiseTarget||msg.payload?.lineStats||msg.summaryRequest;
  const previous=qualityPreviousShift(now);
  const date=String(request?.date||request?.shiftDate||previous.date),shift=String(request?.shift||previous.shift);
  const range=qualityStorageRange(date,shift),end=Date.parse(range.to);
  if(end>now)throw Error('Quality summaries can only be saved for completed shifts.');
  const line=request?.line||request?.lineName;
  const cfg=global.get('devices')||{};
  const ops=[];
  for(const [device,d] of Object.entries(cfg)) {
    if(!device.startsWith('RX-QLT-')||d?.enabled!==true||!/^Keda [123]$/.test(d.line||'')||(line&&d.line!==line))continue;
    const id=JSON.stringify([device,d.line,date,shift]);
    const job={_id:id,version:1,status:'pending',device,deviceLabel:d.deviceLabel||'',line:d.line,tenantId:d.tenantId||'',siteId:d.siteId||'',shiftDate:date,shift,
      shiftFromTime:range.from,shiftToTime:range.to,shiftEnd:new Date(end),readyAt:new Date(end+90000),createdAt:new Date(now),attempts:0};
    ops.push({updateOne:{filter:{_id:id},update:{$setOnInsert:job},upsert:true}});
    if(msg.rebuildQuality===true)ops.push({updateOne:{filter:{_id:id,status:{$ne:'processing'}},update:{$set:{status:'pending',readyAt:new Date(Math.max(end+90000,now))},$unset:{retryAt:''}}}});
  }
  return ops;
}

export function qualityShiftDocument(job,rows,grades,now) {
  const all=calculateLiveQuality(rows,grades);
  const catalog=new Map(grades.map(g=>[String(g.grade||'').trim().toLowerCase(),g]));
  const groups=new Map();
  for(const row of rows) {
    if(typeof row.design_code!=='string'||!row.design_code||typeof row.tile_size!=='string'||!row.tile_size)throw Error('Saved quality product metadata is missing.');
    const id=JSON.stringify([row.design_code,row.tile_size]);
    let group=groups.get(id);
    if(!group){group={designCode:row.design_code,tileSize:row.tile_size,rows:[],grades:new Map(),segments:[]};groups.set(id,group);}
    group.rows.push(row);
    const assignments=JSON.parse(row.design_grades_json),factor=Number(row.tiles_per_box);
    const segment={tilesPerBox:factor,gradeAssignments:assignments,totalBoxes:0,totalTiles:0,grades:[]};
    for(let number=0;number<16;number++) {
      const boxes=Number(row[`grade_${number}_delta`]),tiles=boxes*factor;
      const assignedGrade=number===0?null:assignments[String(number)]||null;
      const definition=assignedGrade?catalog.get(String(assignedGrade).trim().toLowerCase()):null;
      const category=number===0?null:['1','2','3'].includes(String(definition?.category).trim())?Number(definition.category):null;
      const entry={gradeNumber:number,grade:assignedGrade,description:String(definition?.description||''),category,
        classification:number===0?'undetected':category===1?'first':category===2?'normalDamage':category===3?'cutDamage':'unclassified',boxes,tiles};
      segment.grades.push(entry);segment.totalBoxes+=boxes;segment.totalTiles+=tiles;
      const gradeKey=JSON.stringify([number,assignedGrade,category]);
      if(!group.grades.has(gradeKey))group.grades.set(gradeKey,{...entry,boxes:0,tiles:0});
      const total=group.grades.get(gradeKey);total.boxes+=boxes;total.tiles+=tiles;
    }
    group.segments.push(segment);
  }
  const productGroups=[...groups.values()].map(g=>{
    const totals=calculateLiveQuality(g.rows,grades);delete totals.segments;
    const gradeTotals=[...g.grades.values()].map(item=>({...item,percentOfProductTiles:totals.totalTiles?Math.round(item.tiles/totals.totalTiles*10000)/100:null}));
    return {designCode:g.designCode,tileSize:g.tileSize,...totals,grades:gradeTotals,segments:g.segments};
  });
  delete all.segments;
  const doc={device:job.device,deviceLabel:job.deviceLabel||'',line:job.line,tenantId:job.tenantId||'',siteId:job.siteId||'',
    shift:job.shift,shiftDate:job.shiftDate,shiftFromTime:job.shiftFromTime,shiftToTime:job.shiftToTime,
    ...all,productGroups,categoryRules:{first:1,normalDamage:2,cutDamage:3,undetectedGrade:0},
    gradeCatalogueSnapshot:grades.map(g=>({grade:g.grade,category:g.category??'',description:g.description||''})),
    sourceMeasurement:'quality_events',countBasis:'saved-box-deltas-times-saved-tiles-per-box',
    categorySnapshotAt:new Date(now),updatedAt:new Date(now),completedAt:new Date(now),
    dataStatus:all.totalTiles>0?'tracked-data':'no-tracked-tiles',
    quality:all.firstQuality,coverage:'tracked-deltas-only',status:'complete'};
  // Keep comfortably below MongoDB's 16 MiB document limit.
  if(Buffer.byteLength(JSON.stringify(doc),'utf8')>10000000)throw Error('Quality shift document exceeds 10 MB; split storage before retrying.');
  return doc;
}
