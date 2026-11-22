import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const merged=JSON.parse(fs.readFileSync(new URL('./combined-codewise-production-quality.flow.json',import.meta.url)))[0];
const ids=['955d480a43e4ce3a','cbd957204cb12b6c','6182707e19555fb2'];
const originals=ids.map(id=>source.find(n=>n.id===id));
assert.equal(merged.id,ids[0]);assert.equal(merged.outputs,2);assert.deepEqual(merged.wires,originals[2].wires);
const time=Date.parse('2026-11-21T08:30:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
const normal=v=>JSON.parse(JSON.stringify(v??null));
function execute(input,combined){
 const calls=[];
 const ctx={Date:Clock,global:{get:()=>({})},flow:{get:()=>({})},node:{status:v=>calls.push(['status',v]),warn:v=>calls.push(['warn',v]),error:v=>calls.push(['error',v])}};
 let message=structuredClone(input),error;
 try{
   if(combined)message=vm.runInNewContext(`(function(msg){${merged.func}\n})`,ctx)(message);
   else for(const n of originals){message=vm.runInNewContext(`(function(msg){${n.func}\n})`,ctx)(message);if(message==null)break;}
 }catch(e){error={name:e.name,message:e.message};}
 return normal({message,error,calls});
}
const target={device:'RX-CNT-1004',line:'Keda 2',shiftDate:'2026-11-21',shift:'06-14'};
const rows=[{_time:'2026-11-21T01:00:00Z',_value:10,designCode:'YKM',tileSize:'80x80',productionRunId:'run1'},{_time:'2026-11-21T02:00:00Z',_value:14,designCode:'ABC',tileSize:'60x60',productionRunId:'run2'}];
const cases=[{}, {codeWiseTarget:target,payload:[],directQualityTarget:{status:'assumed'}},
 {codeWiseTarget:target,payload:rows,directQualityTarget:{sensor:'RX-QLT-4000'}},
 {codeWiseTarget:target,payload:rows,directQualityTarget:{status:'assumed'}},
 {codeWiseTarget:target,payload:[...rows,{...rows[1],_value:3,_time:'2026-11-21T03:00:00Z'}],directQualityTarget:{sensor:'RX-QLT-4000'}},
 {codeWiseTarget:target,payload:[{...rows[0],tileSize:'bad'}],directQualityTarget:{sensor:'RX-QLT-4000'}},
 {codeWiseTarget:target,payload:rows}];
for(const input of cases)assert.deepEqual(execute(input,true),execute(input,false));
const sensor=execute(cases[2],true);assert.equal(sensor.message[0].payload[0]._id,'designGrades');
const assumed=execute(cases[3],true);assert.equal(assumed.message[1].payload[1].$set['lineStats.production'],7.84);
console.log('Combined Function matches the original chain for sensor/no-sensor routes, empty data, invalid target/size, rollbacks and missing quality metadata.');
