import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./downtime-check-a46402eec7818bf5.js',import.meta.url),'utf8');
const observed=Date.parse('2026-11-18T16:31:18.450Z');
class Clock extends Date {static now(){return observed;}}
for(const previousShift of ['14-22','22-06']) {
 const f=new Map(Object.entries({counterRestoreReady:true,downtimeRestoreReady:true,counters:{'RX-CNT-1006':{shiftName:previousShift,shiftDate:'2026-11-18',shiftCount:0,lastSignal:1795016994141,previousBootId:'592588547',lastSeen:observed,sensorStatus:'Online'}},downtimeStates:{'RX-CNT-1006':{status:'Running',runningSince:null,lastObservedSignal:1795016994141}}}));
 const g=new Map(Object.entries({counterConfig:{'RX-CNT-1006':{enabled:true,line:'Kiln 1'}},lineSettings:{'Kiln 1':{stopDelayMs:60000}}}));
 const context={Date:Clock,Intl,flow:{get:k=>f.get(k),set:(k,v)=>f.set(k,v)},global:{get:k=>g.get(k)},node:{status:()=>{}}};
 const result=vm.runInNewContext(`(function(){${source}\n})()`,context);
 const starts=(result[0]||[]).filter(x=>x.operation==='insertOne').map(x=>({shift:x.payload[0].shift,stopStart_ts:x.payload[0].stopStart_ts}));
 console.log(JSON.stringify({previousShift,statusBefore:'Running',starts}));
}
