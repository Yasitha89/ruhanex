const snapshot=(Array.isArray(msg.payload)?msg.payload:[])[0]||null;
const now=new Date();
const p={};
for(const x of new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Colombo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now)){
 if(x.type!=="literal")p[x.type]=x.value;
}
const today=`${p.year}-${p.month}-${p.day}`;
const hour=Number(p.hour);
let shift,shiftDate,shiftStart;
if(hour>=6&&hour<14){shift="06-14";shiftDate=today;shiftStart=`${today}T06:00:00+05:30`;}
else if(hour>=14&&hour<22){shift="14-22";shiftDate=today;shiftStart=`${today}T14:00:00+05:30`;}
else if(hour>=22){shift="22-06";shiftDate=today;shiftStart=`${today}T22:00:00+05:30`;}
else {shift="22-06";const d=new Date(`${today}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1);shiftDate=d.toISOString().slice(0,10);shiftStart=`${shiftDate}T22:00:00+05:30`;}
const expectedStart=Date.parse(shiftStart);
let start=snapshot?Date.parse(snapshot.shiftEnd):expectedStart;
if(!Number.isFinite(start)){
 msg.statusCode=500;msg.payload={success:false,error:"Latest floorStocks snapshot has invalid shiftEnd"};return [null,msg];
}
if(start>now.getTime()+5000){msg.statusCode=500;msg.payload={success:false,error:"Latest floorStocks snapshot shiftEnd is in the future"};return [null,msg];}
// Do not re-count completed production included in the latest snapshot.
// If missing snapshot, begin at current shift start (zero baseline).
const cfg=global.get("counterConfig")||{};
const roles=global.get("floorStockDeviceRoles")||{};
const devices={};
for(const [id,c] of Object.entries(cfg)){
 if(!c||c.enabled!==true)continue;
 let role=String(roles[id]||'').toLowerCase();
 if(role!=="kiln"&&role!=="keda"){
  const line=String(c.line||'');
  role=/kiln|firing/i.test(line)?"kiln":/keda|sorting/i.test(line)?"keda":"";
 }
 if(role)devices[id]=role;
}
msg.floorLive={snapshot,now:now.toISOString(),shift,shiftDate,shiftStart:new Date(expectedStart).toISOString(),from:new Date(start).toISOString(),deviceRoles:devices,
 warnings:[]};
if(start<expectedStart){msg.floorLive.warnings.push("Latest floorStocks snapshot is behind the active shift; live production is counted from the snapshot end. A missing shift snapshot may change historical zero-floor clamping.");}
if(!snapshot){msg.floorLive.warnings.push("No floorStocks snapshot found. Opening floor stock initialized to zero at the current shift start.");}
const ids=Object.keys(devices);
if(!ids.length){msg.statusCode=503;msg.payload={success:false,error:"No enabled kiln or KEDA counters were identified in global.counterConfig"};return [null,msg];}
if(start>=now.getTime()){msg.payload=[];return [msg,null];}
const idSet=ids.map(v=>JSON.stringify(v)).join(',');
msg.query=`from(bucket:"RCLH")
 |> range(start:time(v:${JSON.stringify(new Date(start).toISOString())}),stop:time(v:${JSON.stringify(now.toISOString())}))
 |> filter(fn:(r)=>r._measurement=="tile_events" and r._field=="count_delta")
 |> filter(fn:(r)=>contains(value:r.device,set:[${idSet}]))
 |> filter(fn:(r)=>exists r.tileSize and r.tileSize!="")
 |> filter(fn:(r)=>r._value>0)
 |> group(columns:["device","tileSize"])
 |> sum(column:"_value")
 |> keep(columns:["device","tileSize","_value"])`;
return [msg,null];