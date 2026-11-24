
function norm(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function escapeFlux(v){return String(v||"").replace(/\\/g,"\\\\").replace(/"/g,'\\"');}
function resolveDevice(q){
  const cfg=global.get("counterConfig")||{};
  const requested=String(q.device||"").trim();
  if(requested && cfg[requested]) return requested;
  const line=String(q.line||q.lineName||"").trim();
  if(!line) return "";
  const n=norm(line);
  return Object.keys(cfg).find(id=>cfg[id]?.enabled!==false && (norm(cfg[id]?.line)===n || norm(cfg[id]?.shortId)===n || norm(id)===n))||"";
}
function addDays(ds,days){const [y,m,d]=ds.split("-").map(Number);const x=new Date(Date.UTC(y,m-1,d));x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10);}
function shiftRange(shift,date){
  if(shift==="06-14") return {from:`${date}T06:00:00+05:30`,to:`${date}T14:00:00+05:30`};
  if(shift==="14-22") return {from:`${date}T14:00:00+05:30`,to:`${date}T22:00:00+05:30`};
  if(shift==="22-06") return {from:`${date}T22:00:00+05:30`,to:`${addDays(date,1)}T06:00:00+05:30`};
  return null;
}
function currentShiftInfo(ts=Date.now()){
  const p={};
  for(const part of new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(ts))){if(part.type!=="literal")p[part.type]=part.value;}
  const date=`${p.year}-${p.month}-${p.day}`; const h=Number(p.hour||0);
  if(h>=6&&h<14) return {shift:"06-14",date,...shiftRange("06-14",date)};
  if(h>=14&&h<22) return {shift:"14-22",date,...shiftRange("14-22",date)};
  if(h>=22) return {shift:"22-06",date,...shiftRange("22-06",date)};
  const prev=addDays(date,-1); return {shift:"22-06",date:prev,...shiftRange("22-06",prev)};
}

const q=msg.req?.query||{}; const cfgAll=global.get("counterConfig")||{}; const device=resolveDevice(q);
if(!device||!cfgAll[device]){msg.statusCode=400;msg.payload={success:false,error:"Valid line/device is required"};return [null,null,msg];}
const cfg=cfgAll[device]; const line=String(cfg.line||device); const allSettings=global.get("lineSettings")||{}; const ls=allSettings[line]||allSettings[line.toLowerCase()]||{}; const s=currentShiftInfo();
const requestId=`${msg._msgid||"live"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
msg.live={requestId,device,line,shift:s.shift,date:s.date,from:s.from,to:s.to,tileSize:String(ls.tileSize??cfg.tileSize??""),designCode: String(
        ls.designCode ??
        cfg.designCode ??
        ""
    ),configuredLineSpeed:Number(ls.lineSpeed??cfg.lineSpeed??0),plannedDowntime:Number(ls.plannedDowntime??cfg.plannedDowntime??0),stopDelayMs:Number(ls.stopDelayMs??cfg.stopDelayMs??60000)};
const d=escapeFlux(device), sh=escapeFlux(s.shift), dt=escapeFlux(s.date);

/*
 * IMPORTANT PERFORMANCE OPTIMIZATION
 *
 * The live dashboard only needs the latest shift_count and last_signal.
 * Do NOT scan the complete 8-hour shift every 5 seconds.
 *
 * Counter telemetry is published every few seconds, so a 5-minute
 * lookback gives a large safety margin while keeping the query small.
 */
msg.query=`
from(bucket:"RCLH")
    |> range(start:-60s)
    |> filter(fn:(r)=>
        r._measurement=="tile_events" and
        r.device=="${d}" and
        r.shift=="${sh}" and
        r.shiftDate=="${dt}" and
        r._field=="shift_count"
    )
    |> group(columns:["device","_field"])
    |> sort(columns:["_time"])
    |> map(fn:(r)=>({r with metric:"speedSample"}))
`;

const influxMsg=RED.util.cloneMessage(msg);
const mongoMsg=RED.util.cloneMessage(msg);
mongoMsg.collection="stoppages";
mongoMsg.operation="find";
mongoMsg.payload=[
  {device,date:s.date,shift:s.shift},
  {sort:{stopStart_ts:1}}
];
return [influxMsg,mongoMsg,null];
