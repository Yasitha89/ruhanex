export function buildQualitySnapshotQuery(msg) {
  const s=msg.liveQualityResponse;
  const end=Math.min(Number(s.timestamp)+1,Date.parse(s.shiftToTime));
  if(!Number.isFinite(end)||!Number.isFinite(Date.parse(s.shiftFromTime)))throw Error('Invalid shift window.');
  const fields=['total_tiles','total_boxes','first_tiles','normal_damage_tiles','cut_damage_tiles','undetected_tiles','unclassified_tiles','first_quality','normal_damage_quality','cut_damage_quality','output_production_sqm','output_production_complete','calculated_at_ms'];
  msg.query=`from(bucket:"RCLH") |> range(start:time(v:${JSON.stringify(s.shiftFromTime)}),stop:time(v:${JSON.stringify(new Date(end).toISOString())})) |> filter(fn:(r)=>r._measurement=="quality_shift_trend" and r.device==${JSON.stringify(msg.liveQualityDevice)} and r.line==${JSON.stringify(s.line)} and r.shift==${JSON.stringify(s.currentShift)} and r.shiftDate==${JSON.stringify(s.shiftDate)} and (${fields.map(f=>`r._field==${JSON.stringify(f)}`).join(' or ')})) |> last() |> toString() |> group(columns:["device"]) |> pivot(rowKey:["_time"],columnKey:["_field"],valueColumn:"_value") |> filter(fn:(r)=>exists r.total_tiles) |> sort(columns:["_time"],desc:true) |> limit(n:1)`;
  delete msg.payload;return msg;
}

export function finishQualitySnapshot(msg) {
  if(!Array.isArray(msg.payload))throw Error('Invalid quality snapshot result.');
  const s=msg.liveQualityResponse,r=msg.payload[0];
  const counts=['totalTiles','totalBoxes','firstTiles','normalDamageTiles','cutDamageTiles','undetectedTiles','unclassifiedTiles'];
  const fields=['total_tiles','total_boxes','first_tiles','normal_damage_tiles','cut_damage_tiles','undetected_tiles','unclassified_tiles'];
  const details={device:msg.liveQualityDevice,shift:s.currentShift,shiftDate:s.shiftDate,source:'quality_shift_trend',qualityAvailable:false,status:'quality-trend-not-recorded'};
  if(r){
    fields.forEach((f,i)=>{const n=Number(r[f]);if(r[f]==null||!Number.isSafeInteger(n)||n<0)throw Error('Invalid snapshot counts.');details[counts[i]]=n;});
    if(details.firstTiles+details.normalDamageTiles+details.cutDamageTiles+details.undetectedTiles+details.unclassifiedTiles!==details.totalTiles)throw Error('Snapshot category totals disagree.');
    const pct=n=>details.totalTiles>0?Math.round(n/details.totalTiles*10000)/100:null;
    Object.assign(details,{qualityAvailable:details.totalTiles>0,status:details.totalTiles>0?'available':'no-tracked-quality-tiles',firstQuality:pct(details.firstTiles),normalDamageQuality:pct(details.normalDamageTiles),cutDamageQuality:pct(details.cutDamageTiles),snapshotAt:new Date(r._time).toISOString(),calculatedAt:Number(r.calculated_at_ms)||null});
    if((r.output_production_complete===true||r.output_production_complete==='true')&&r.output_production_sqm!=null&&Number.isFinite(Number(r.output_production_sqm))&&Number(r.output_production_sqm)>=0)details.outputProductionSqm=Number(r.output_production_sqm);
  }
  const noOutput=details.totalTiles===0;
  Object.assign(s,{qualityDetails:details,qualityAvailable:details.qualityAvailable,qualityAssumed:false,totalQualityTiles:details.totalTiles??null,
    firstQuality:details.qualityAvailable?details.firstQuality:noOutput?0:null,normalDamageQuality:details.qualityAvailable?details.normalDamageQuality:noOutput?0:null,cutDamageQuality:details.qualityAvailable?details.cutDamageQuality:noOutput?0:null,
    qualityOutputProductionSqm:details.outputProductionSqm??null,qualitySnapshotAt:details.snapshotAt??null,qualitySource:'quality_shift_trend'});
  s.totalOutputTiles=details.totalTiles??null;
  s.totalOutputProductionSqm=details.outputProductionSqm??null;
  s.quality=s.firstQuality;
  s.ole=s.quality===null||noOutput?null:Math.round(Number(s.availability)*Number(s.performance)*s.quality/100)/100;
  s.oee=s.ole;
  msg.payload=s;delete msg.liveQualityResponse;delete msg.liveQualityGrades;return msg;
}
