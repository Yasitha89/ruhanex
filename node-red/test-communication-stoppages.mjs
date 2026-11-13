import assert from 'node:assert/strict';
import fs from 'node:fs';
import { annotateCommunication } from './build-communication-stoppages-patch.mjs';
import { isCommunicationAffected, stoppageBarColor } from '../src/utils/stoppageCommunication.js';
const now=Date.parse('2026-11-13T15:00:00+05:30'), id='RX-CNT-1006';
const values={counters:{[id]:{lastSeen:now-70000,sensorStatus:'Online'}}};
const flow={get:k=>values[k],set:(k,v)=>values[k]=v};
const config={counterConfig:{[id]:{enabled:true,line:'Kiln 3'}},lineSettings:{}};
const global={get:k=>config[k]};
const row={device:id,stopStart_ts:now-70000,stopStop_ts:null};
const result=annotateCommunication([[{collection:'stoppages',operation:'insertOne',payload:[row]}],null,null],flow,global,now);
assert.equal(row.communicationAffected,true);
assert.equal(row.communicationEvidence,'telemetry_timeout');
assert.equal(result[0][1].operation,'updateMany');
assert.equal(result[0][1].payload[0].device,id);
assert.equal(stoppageBarColor(row),'#8b5cf6');
assert.equal(stoppageBarColor({isOpen:true}),'#ff7a45');
assert.equal(stoppageBarColor({isOpen:false}),'#ff4d4f');
assert.equal(isCommunicationAffected({reason:'WiFi'}),false); // never infer from free text
assert.equal(annotateCommunication([null,null,null],flow,global,now+1000)[0],null); // throttled
values.counters[id].lastSeen=now+5000;
const recovered=annotateCommunication([null,null,null],flow,global,now+5000);
assert.equal(recovered[0][0].operation,'updateMany');
assert.equal(values.communicationGapTracking[id],undefined);
assert.equal(annotateCommunication([null,null,null],flow,global,now+6000)[0],null);
values.counters[id].sensorStatus='Offline';
const offline=annotateCommunication([null,null,null],flow,global,now+7000);
assert.equal(offline[0][0].payload[1].$set.communicationEvidence,'mqtt_offline');
assert.equal(annotateCommunication(null,flow,global,now),null);
// Execute the actual patched timer, including its stop creation and wrapper.
const patch=JSON.parse(fs.readFileSync(new URL('./communication-stoppages.patch.flow.json',import.meta.url),'utf8'))[0];
const FixedDate=class extends Date {static now(){return now;}};
const runtime={counterRestoreReady:true,downtimeRestoreReady:true,
  counters:{[id]:{lastSeen:now-70000,lastSignal:now-70000,shiftCount:100,shiftName:'14-22',shiftDate:'2026-11-13',sensorStatus:'Online'}},
  downtimeStates:{[id]:{status:'Running',lastObservedSignal:now-70000,runningSince:null}}};
const actualFlow={get:k=>runtime[k],set:(k,v)=>runtime[k]=v};
const actual=new Function('msg','flow','global','node','Date',patch.func)({},actualFlow,global,{status(){}},FixedDate);
const inserted=actual[0].find(m=>m.operation==='insertOne');
assert.equal(inserted.payload[0].communicationAffected,true);
assert.equal(runtime.downtimeStates[id].status,'Stopped'); // existing state machine retained
console.log('PASS: telemetry timeouts, MQTT offline, fresh connection, overlap metadata, throttling, colors and actual timer patch.');
