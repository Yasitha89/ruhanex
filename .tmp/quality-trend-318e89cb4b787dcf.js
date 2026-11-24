function qualityShiftQuery(device,from,to,bucket='RCLH') {
  const names=Array.from({length:16},(_,i)=>`grade_${i}_delta`);
  const fields=[...names,'tiles_per_box','design_grades_json','design_code','tile_size'];
  const selected=fields.map(x=>`r._field==${JSON.stringify(x)}`).join(' or ');
  const identity=['points:0',...names.map(n=>`${n}:0.0`)].join(',');
  const accum=['points:accumulator.points+1',...names.map(n=>`${n}:accumulator.${n}+float(v:r.${n})`)].join(',');
  return `from(bucket:${JSON.stringify(bucket)}) |> range(start:time(v:${JSON.stringify(from)}),stop:time(v:${JSON.stringify(to)})) |> filter(fn:(r)=>r._measurement=="quality_events" and r.device==${JSON.stringify(device)} and (${selected})) |> toString() |> group(columns:["device"]) |> pivot(rowKey:["_time"],columnKey:["_field"],valueColumn:"_value") |> filter(fn:(r)=>exists r.grade_0_delta) |> group(columns:["device","design_grades_json","tiles_per_box","design_code","tile_size"]) |> reduce(identity:{${identity}},fn:(r,accumulator)=>({${accum}}))`;
}
function buildLiveQualityQuery(msg) {
  const doc=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  if(!Array.isArray(doc?.grades))throw Error('Design grade catalogue is missing.');
  msg.liveQualityGrades=doc.grades;
  const s=msg.liveQualityResponse;
  const end=Math.min(Number(s.timestamp)+1,Date.parse(s.shiftToTime));
  if(!Number.isFinite(end)||!Number.isFinite(Date.parse(s.shiftFromTime)))throw Error('Invalid quality shift interval.');
  msg.query=qualityShiftQuery(msg.liveQualityDevice,s.shiftFromTime,new Date(end).toISOString());
  delete msg.payload;
  return msg;
}
return buildLiveQualityQuery(msg);