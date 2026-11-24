export function prepareQualityTrendApi(msg,now=Date.now()) {
  const fail=(code,error)=>{msg.statusCode=code;msg.payload={success:false,error};return [null,msg];};
  const headers=msg.req?.headers||{};
  if(!headers['x-ruhanex-user']||!['Admin','Manager','Engineer','Supervisor','Line Supervisor','JE'].includes(headers['x-ruhanex-role']))return fail(401,'Sign in to view quality.');
  const q=msg.req?.query||{},line=q.line,date=q.date,shift=q.shift;
  if(!/^Keda [123]$/.test(line||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!['06-14','14-22','22-06'].includes(shift))return fail(400,'Valid Keda line, date and shift are required.');
  if(!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)return fail(400,'Invalid shift date.');
  const from=Date.parse(`${date}T${shift.slice(0,2)}:00:00+05:30`),end=from+28800000;
  if(from>now)return fail(400,'The requested shift has not started.');
  const windows={'5s':5000,'15s':15000,'30s':30000,'1m':60000,'5m':300000};
  const interval=q.interval||'15s';
  if(!Object.hasOwn(windows,interval))return fail(400,'interval must be 5s, 15s, 30s, 1m or 5m.');
  if(q.device!=null&&(typeof q.device!=='string'||!/^RX-QLT-[A-Za-z0-9_-]+$/.test(q.device)))return fail(400,'Invalid quality device ID.');
  msg.qualityTrendMeta={line,date,shift,from:new Date(from).toISOString(),to:new Date(end).toISOString(),interval};
  const fields=['first_quality','normal_damage_quality','cut_damage_quality','undetected_percent','unclassified_percent','total_tiles','total_boxes'];
  msg.query=`from(bucket:"RCLH") |> range(start:time(v:${JSON.stringify(new Date(from).toISOString())}),stop:time(v:${JSON.stringify(new Date(Math.min(end,now+1)).toISOString())}))
|> filter(fn:(r)=>r._measurement=="quality_shift_trend" and r.line==${JSON.stringify(line)} and r.shift==${JSON.stringify(shift)} and r.shiftDate==${JSON.stringify(date)}${q.device?' and r.device=='+JSON.stringify(q.device):''})
|> filter(fn:(r)=>contains(value:r._field,set:${JSON.stringify(fields)}))
|> aggregateWindow(every:${interval},fn:last,createEmpty:false)
|> toString() |> group(columns:["device"]) |> pivot(rowKey:["_time"],columnKey:["_field"],valueColumn:"_value")
|> keep(columns:["device","_time",${fields.map(x=>JSON.stringify(x)).join(',')}])`;
  return [msg,null];
}

export function qualityTrendApiResponse(msg) {
  if(!Array.isArray(msg.payload))throw Error('Invalid quality trend query result.');
  if(msg.payload.length>18000)throw Error('Too many quality trend points.');
  const number=v=>v==null||v===''?null:Number.isFinite(Number(v))?Number(v):null;
  const points=msg.payload.filter(r=>Number.isFinite(Date.parse(r._time))).map(r=>({device:r.device,time:new Date(r._time).toISOString(),
    firstQuality:number(r.first_quality),normalDamageQuality:number(r.normal_damage_quality),cutDamageQuality:number(r.cut_damage_quality),
    undetectedPercent:number(r.undetected_percent),unclassifiedPercent:number(r.unclassified_percent),totalTiles:number(r.total_tiles),totalBoxes:number(r.total_boxes)}))
    .sort((a,b)=>a.time.localeCompare(b.time)||String(a.device).localeCompare(String(b.device)));
  msg.statusCode=200;msg.headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  msg.payload={success:true,...msg.qualityTrendMeta,source:'quality_shift_trend',valueUnit:'percent',aggregation:'last-point-per-window',points};
  return msg;
}
