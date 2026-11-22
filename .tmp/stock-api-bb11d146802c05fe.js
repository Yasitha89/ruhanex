const m=msg.floorLive||{};
if(!m.now){msg.statusCode=500;msg.payload={success:false,error:"Live floor stock context missing"};return msg;}
const data=new Map();
function norm(v){return String(v??'').toLowerCase().trim().replace(/\s+/g,'').replace(/Ã—/g,'x');}
function get(size){const key=norm(size);if(!data.has(key))data.set(key,{tileSize:key,openingStock:0,kilnOutput:0,kedaOutput:0});return data.get(key);}
function area(s){const v=s.split('x').map(Number);return v.length===2&&v.every(x=>Number.isFinite(x)&&x>0)?v[0]*v[1]/10000:0;}
function rnd(v){return Math.round((v+Number.EPSILON)*100)/100;}
for(const item of m.snapshot?.stocks||[]){
 const k=norm(item.tileSize);if(!k)continue;
 const v=Number(item.closingStock);
 if(!Number.isFinite(v)){msg.statusCode=500;msg.payload={success:false,error:"Snapshot contains invalid closingStock",tileSize:k};return msg;}
 get(k).openingStock=Math.max(0,v);
}
for(const r of (Array.isArray(msg.payload)?msg.payload:[])){
 const k=norm(r.tileSize),n=Number(r._value),role=m.deviceRoles?.[String(r.device)];
 if(!k||k==='unknown'||!Number.isFinite(n)||n<0||!role)continue;
 const a=get(k);
 if(role==='kiln')a.kilnOutput+=n;
 else if(role==='keda')a.kedaOutput+=n;
}
const stocks=[...data.values()].map(v=>{
 const raw=v.openingStock+v.kilnOutput-v.kedaOutput;
 const closing=Math.max(0,raw);
 return {...v,rawFloorStock:raw,currentFloorStock:closing,closingStock:closing,floorStockM2:rnd(closing*area(v.tileSize)),clampedToZero:raw<0};
}).sort((a,b)=>a.tileSize.localeCompare(b.tileSize));
msg.statusCode=200;
msg.payload={success:true,source:"mongo+influx",shift:m.shift,shiftDate:m.shiftDate,
 currentShiftStart:m.shiftStart,asOf:m.now,
 snapshot:m.snapshot?{id:m.snapshot._id,shiftDate:m.snapshot.shiftDate,shift:m.snapshot.shift,shiftEnd:m.snapshot.shiftEnd}:null,
 liveFrom:m.from,liveTo:m.now,
 stocks,totalFloorStockM2:rnd(stocks.reduce((n,v)=>n+v.floorStockM2,0)),warnings:m.warnings||[]};
return msg;