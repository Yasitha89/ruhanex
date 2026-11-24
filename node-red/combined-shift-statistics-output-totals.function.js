// Calculate production statistics before initializing quality for the shift save.
const calculatedMessage = function calculateShiftStatistics(msg) {
  const rows = Array.isArray(msg.payload) ? [...msg.payload] : [];
  const r = msg.summaryRequest;
  if (!r) return null;

  // ========================================================
  // GET CONFIGURATION
  // ========================================================

  const cfgAll = global.get("counterConfig") || {};
  const cfg = cfgAll[r.device] || {};
  const allSettings = global.get("lineSettings") || {};
  const ls = allSettings[r.line] || allSettings[String(r.line).toLowerCase()] || {};
  const lineSpeed = Math.max(0, Number(ls.lineSpeed ?? cfg.lineSpeed ?? 0));
  const tileSize = String(ls.tileSize ?? cfg.tileSize ?? "").trim();
  const configuredPlannedDowntime = Math.max(0, Number(ls.plannedDowntime ?? cfg.plannedDowntime ?? 0));

  // ========================================================
  // SHIFT TIME RANGE
  // ========================================================

  const fromMs = new Date(r.fromTime).getTime();
  const toMs = new Date(r.toTime).getTime();
  const now = Date.now();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    node.error("Invalid shift time range", msg);
    return null;
  }

  // ========================================================
  // HELPERS
  // ========================================================

  function round(v, n = 2) {
    const p = 10 ** n;
    return Math.round((Number(v || 0) + Number.EPSILON) * p) / p;
  }
  function tileAreaM2(size) {
    const d = String(size || "").toLowerCase().replace(/\s+/g, "").split("x").map(Number);
    if (d.length !== 2 || !d.every(v => Number.isFinite(v) && v > 0)) {
      return 0;
    }

    // Tile dimensions assumed to be centimetres.
    return d[0] * d[1] / 10000;
  }

  // ========================================================
  // SHIFT TIME
  // ========================================================

  const calculationEndMs = Math.min(Math.max(now, fromMs), toMs);
  const fullShiftMinutes = Math.max(0, (toMs - fromMs) / 60000);
  const elapsedMinutes = Math.max(0, (calculationEndMs - fromMs) / 60000);

  // ========================================================
  // CLASSIFY DOWNTIME
  //
  // FINAL RULE:
  //
  // Planned -> Standard
  //     Actual recorded duration is planned,
  //     but limited by configured standard allowance.
  //
  //     Any duration above the allowance becomes
  //     UNPLANNED.
  //
  // Planned -> Additional
  //     Entire recorded duration is planned.
  //
  // Everything else
  //     Unplanned.
  //
  // IMPORTANT:
  //
  // Unused configured standard allowance is NOT
  // automatically distributed across the shift.
  // ========================================================

  let totalDowntimeMinutes = 0;
  let standardActualMinutes = 0;
  let additionalPlannedMinutes = 0;
  let explicitUnplannedMinutes = 0;
  let completedStops = 0;
  let openStop = false;
  let currentOpenStopMinutes = 0;
  let maximumDowntimeMinutes = 0;
  for (const stop of rows) {
    let start = Number(stop.stopStart_ts);
    if (!Number.isFinite(start)) {
      continue;
    }

    // Clamp start to shift boundary.
    start = Math.max(start, fromMs);
    const isOpen = stop.stopStop_ts === null || stop.stopStop_ts === undefined;
    let end;
    if (isOpen) {
      end = calculationEndMs;
    } else {
      end = Number(stop.stopStop_ts);
      if (!Number.isFinite(end)) {
        continue;
      }
      end = Math.min(end, calculationEndMs, toMs);
    }
    if (end <= start) {
      continue;
    }
    const durationMinutes = (end - start) / 60000;

    // ----------------------------------------
    // TOTAL ACTUAL DOWNTIME
    // ----------------------------------------

    totalDowntimeMinutes += durationMinutes;
    maximumDowntimeMinutes = Math.max(maximumDowntimeMinutes, durationMinutes);

    // ----------------------------------------
    // CLASSIFICATION
    // ----------------------------------------

    const downtimeType = String(stop.downtimeType || "unplanned").toLowerCase();
    const plannedCategory = String(stop.plannedCategory || "").toLowerCase();
    if (downtimeType === "planned" && plannedCategory === "standard") {
      standardActualMinutes += durationMinutes;
    } else if (downtimeType === "planned" && plannedCategory === "additional") {
      additionalPlannedMinutes += durationMinutes;
    } else {
      explicitUnplannedMinutes += durationMinutes;
    }

    // ----------------------------------------
    // STOP COUNTS
    // ----------------------------------------

    if (isOpen) {
      openStop = true;
      currentOpenStopMinutes = Math.max(currentOpenStopMinutes, durationMinutes);
    } else {
      completedStops += 1;
    }
  }

  // ========================================================
  // STANDARD PLANNED DOWNTIME
  // ========================================================

  const allowance = configuredPlannedDowntime;

  // IMPORTANT:
  //
  // If allowance = 0,
  // manually classified Standard Planned downtime
  // remains planned.
  //
  // This matches the live KPI rule.

  const standardUsed = allowance > 0 ? Math.min(standardActualMinutes, allowance) : standardActualMinutes;
  const remainingStandardAllowance = allowance > 0 ? Math.max(0, allowance - standardUsed) : 0;
  const standardExcess = allowance > 0 ? Math.max(0, standardActualMinutes - allowance) : 0;
  const standardApplied = standardUsed;

  // ========================================================
  // PLANNED / UNPLANNED DOWNTIME
  // ========================================================

  const plannedDowntimeMinutes = standardApplied + additionalPlannedMinutes;

  // Everything not accepted as planned is unplanned.
  //
  // This automatically includes:
  //     explicit unplanned
  //     standard excess

  const unplannedDowntimeMinutes = Math.max(0, totalDowntimeMinutes - plannedDowntimeMinutes);

  // // ========================================================
  // // PRODUCTION TIME
  // // ========================================================

  // // Planned production time:
  // //
  // // Elapsed shift time minus accepted planned downtime.

  // const plannedProductionMinutes =
  //     Math.max(
  //         0,
  //         elapsedMinutes -
  //         plannedDowntimeMinutes
  //     );

  // // IMPORTANT:
  // //
  // // Physical operating time depends ONLY on
  // // actual stoppage duration.
  // //
  // // Planned/unplanned classification does not
  // // change physical operating time.

  // // ========================================================
  // // RUN CONFIRMATION CORRECTION
  // // ========================================================
  // //
  // // STOP_END is confirmed only after the line has been running
  // // continuously for requiredRunTimeMs.
  // //
  // // Tiles are already counted during this confirmation period,
  // // while that same period is still included in the recorded
  // // downtime. Add it back once for every COMPLETED stop.
  // //
  // // Open stops are intentionally excluded because they have not
  // // completed the recovery-confirmation period yet.

  // const requiredRunTimeMs =
  //     Math.max(
  //         0,
  //         Number(
  //             ls.requiredRunTimeMs ??
  //             cfg.requiredRunTimeMs ??
  //             60000
  //         )
  //     );

  // const runConfirmationMinutes =
  //     requiredRunTimeMs / 60000;

  // const recoveryCorrectionMinutes =
  //     completedStops *
  //     runConfirmationMinutes;

  // const actualOperatingMinutes =
  //     Math.max(
  //         0,
  //         Math.min(
  //             elapsedMinutes,
  //             elapsedMinutes -
  //             totalDowntimeMinutes +
  //             recoveryCorrectionMinutes
  //         )
  //     );

  // // ========================================================
  // // AVAILABILITY
  // // ========================================================

  // const availability =
  //     plannedProductionMinutes > 0
  //         ? (
  //             actualOperatingMinutes /
  //             (plannedProductionMinutes+recoveryCorrectionMinutes)
  //         ) * 100
  //         : 0;

  // ========================================================
  // PRODUCTION TIME
  // ========================================================

  const plannedProductionMinutes = Math.max(0, elapsedMinutes - plannedDowntimeMinutes);

  // Stored STOP_END is already backdated to runningSince.
  // The confirmation minute is therefore already operating time.
  const actualOperatingMinutes = Math.max(0, Math.min(elapsedMinutes, elapsedMinutes - totalDowntimeMinutes));

  // ========================================================
  // AVAILABILITY
  // ========================================================

  const availability = plannedProductionMinutes > 0 ? actualOperatingMinutes / plannedProductionMinutes * 100 : 0;

  // ========================================================
  // PRODUCTION
  // ========================================================

  const tileCount = Math.max(0, Number(r.tileCount || 0));
  const areaPerTile = tileAreaM2(tileSize);
  const production = tileCount * areaPerTile;

  // ========================================================
  // TARGET PRODUCTION
  //
  // Target is based on PHYSICAL OPERATING TIME.
  //
  // Example:
  //
  // Operating time = 400 min
  // Rated speed    = 12 tiles/min
  //
  // Target = 4,800 tiles
  // ========================================================

  const targetTiles = lineSpeed > 0 ? lineSpeed * actualOperatingMinutes : 0;
  const targetProduction = targetTiles * areaPerTile;

  // ========================================================
  // PERFORMANCE
  // ========================================================

  const performance = targetTiles > 0 ? tileCount / targetTiles * 100 : 0;

  // ========================================================
  // QUALITY
  // ========================================================

  // No reject / quality counter is currently available.
  // Therefore quality remains 100%.

  const quality = 100;

  // ========================================================
  // OLE
  // ========================================================

  const ole = availability * performance * quality / 10000;

  // ========================================================
  // BUILD SHIFT SUMMARY
  // ========================================================

  msg.payload = {
    lineStats: {
      // ----------------------------------------
      // IDENTIFICATION
      // ----------------------------------------

      device: r.device,
      lineName: r.line,
      machine: r.machine || "",
      shift: r.shift,
      shiftDate: r.shiftDate,
      shiftStart: r.fromTime,
      shiftEnd: r.toTime,
      status: r.shiftStatus || "Unknown",
      // Configuration at the end of this shift. Run IDs inside
      // codeWiseProduction / Timeline identify individual production.
      productionRunId: r.productionRunIdAtShiftEnd || null,
      productionRunStartTime: r.productionRunStartTimeAtShiftEnd || null,
      // ----------------------------------------
      // KPI
      // ----------------------------------------

      ole: round(ole),
      availability: round(availability),
      performance: round(performance),
      quality: quality,
      // ----------------------------------------
      // PRODUCTION
      // ----------------------------------------

      tileCount: Math.round(tileCount),
      production: round(production),
      productionUnit: "m²",
      targetTiles: round(targetTiles, 0),
      targetProduction: round(targetProduction),
      // ----------------------------------------
      // SHIFT TIME
      // ----------------------------------------

      fullShiftMinutes: round(fullShiftMinutes),
      elapsedShiftMinutes: round(elapsedMinutes),
      plannedProductionMinutes: round(plannedProductionMinutes),
      actualOperatingMinutes: round(actualOperatingMinutes),
      // ----------------------------------------
      // DOWNTIME
      // ----------------------------------------

      totalDowntimeMinutes: round(totalDowntimeMinutes),
      plannedDowntimeMinutes: round(plannedDowntimeMinutes),
      unplannedDowntimeMinutes: round(unplannedDowntimeMinutes),
      // ----------------------------------------
      // STANDARD PLANNED
      // ----------------------------------------

      configuredPlannedDowntime: round(configuredPlannedDowntime),
      recordedStandardDowntimeMinutes: round(standardActualMinutes),
      standardPlannedDowntimeMinutes: round(standardApplied),
      remainingStandardAllowanceMinutes: round(remainingStandardAllowance),
      standardExcessDowntimeMinutes: round(standardExcess),
      // ----------------------------------------
      // ADDITIONAL PLANNED
      // ----------------------------------------

      additionalPlannedDowntimeMinutes: round(additionalPlannedMinutes),
      appliedPlannedDowntime: round(plannedDowntimeMinutes),
      // ----------------------------------------
      // STOP INFORMATION
      // ----------------------------------------

      completedStops: completedStops,
      totalStops: rows.length,
      openStop: openStop,
      currentOpenStopMinutes: round(currentOpenStopMinutes),
      maximumDowntimeMinutes: round(maximumDowntimeMinutes),
      // ----------------------------------------
      // LINE CONFIGURATION
      // ----------------------------------------

      ratedLineSpeed: lineSpeed,
      tileSize: tileSize,
      stopDelayMs: Number(ls.stopDelayMs ?? cfg.stopDelayMs ?? 60000),
      maxPulseGapMs: Number(ls.maxPulseGapMs ?? cfg.maxPulseGapMs ?? 10000),
      requiredRunTimeMs: Number(ls.requiredRunTimeMs ?? cfg.requiredRunTimeMs ?? 60000),
      // Availability may legitimately exceed
      // 100% under this planned-downtime model.
      availabilityMayExceed100: true,
      source: "shift-summary",
      updatedAt: new Date().toISOString()
    }
  };

  // ========================================================
  // SAVE TO MONGODB
  // ========================================================

  msg.collection = "shifts";
  msg.operation = "insertOne";
  return msg;
}(msg);
if (calculatedMessage == null) return null;
return function initializeShiftQuality(msg) {
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
function directCodeWiseQuality(entries,target,rows,grades) {
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
function directInitialQuality(msg,global) {
  const s=msg.payload?.lineStats;
  if(!s)throw Error('Missing calculated shift statistics.');
  msg.directQualityTarget=directQualityTarget(s,global);
  Object.assign(s,directQualityFields(msg.directQualityTarget,null,[],Date.now()));
  return msg;
}
return directInitialQuality(msg,global);
}(calculatedMessage);
