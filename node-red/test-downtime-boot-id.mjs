import assert from 'node:assert/strict';
import fs from 'node:fs';
const nodes = JSON.parse(fs.readFileSync(new URL('./downtime-boot-id.patch.flow.json', import.meta.url)));
const timer = nodes.find(n => n.name === 'ALL Lines: Downtime + Shift Change');
assert.equal(timer.id, 'a46402eec7818bf5');
assert.equal(timer.outputs, 3);
const run = new Function('msg', 'flow', 'global', 'node', 'Date', timer.func);
let now = Date.parse('2026-11-17T10:00:00+05:30');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const id = 'RX-CNT-1000';
const counter = { bootId: 'boot-A', shiftName: '06-14', shiftDate: '2026-11-17', shiftCount: 20, lastSignal: now - 120000 };
const down = { status: 'Running', lastObservedSignal: counter.lastSignal, runningSince: null, lastEventTs: now - 3600000 };
const values = { counterRestoreReady: true, downtimeRestoreReady: true, counters: { [id]: counter }, downtimeStates: { [id]: down } };
const flow = { get: k => values[k], set: (k, v) => { values[k] = v; } };
const config = { counterConfig: { [id]: { enabled: true, line: 'Keda 1' } }, lineSettings: { 'Keda 1': { stopDelayMs: 60000, maxPulseGapMs: 10000, requiredRunTimeMs: 60000 } } };
const global = { get: k => config[k] };
const node = { status() {}, warn() {}, error(message) { throw Error(message); } };
const first = run({}, flow, global, node, Clock);
const insert = first[0].find(m => m.operation === 'insertOne');
assert.equal(insert.collection, 'stoppages');
assert.equal(insert.payload[0].bootIdAtStopStart, 'boot-A');
assert.equal(insert.payload[0].bootIdAtStopEnd, null);
assert.equal(insert.payload[0].stopStart_ts, now - 120000); // Existing backdating unchanged.
assert.equal(insert.payload[0].bootIdStartObservedAt, new Date(now).toISOString());
now += 1200000; counter.bootId = 'boot-B'; counter.lastSignal = now; down.lastObservedSignal = now; down.runningSince = now - 60000;
const recovered = run({}, flow, global, node, Clock);
const update = recovered[0].find(m => m.operation === 'updateOne');
assert.equal(update.payload[1].$set.bootIdAtStopEnd, 'boot-B');
assert.equal(update.payload[1].$set.stopStop_ts, now - 60000);
assert.equal(update.payload[1].$set.bootIdAtStopStart, undefined); // Do not replace the original ID.
assert.equal(update.payload[0].device, id); assert.equal(update.payload[0].stopStop_ts, null);
// Unknown identities stay null; numeric zero is a valid identity.
now += 120000; counter.bootId = 0; counter.lastSignal = now - 120000;
const numeric = run({}, flow, global, node, Clock)[0].find(m => m.operation === 'insertOne');
assert.equal(numeric.payload[0].bootIdAtStopStart, '0');
// Shift-boundary close/reopen calls also capture observed IDs without declaring recovery.
now = Date.parse('2026-11-17T14:00:00+05:30'); counter.bootId = 'boot-C';
const boundary = run({}, flow, global, node, Clock)[0];
assert.ok(boundary.some(m => m.operation === 'updateOne' && m.payload[1].$set.bootIdAtStopEnd === 'boot-C'));
assert.ok(boundary.some(m => m.operation === 'insertOne' && m.payload[0].bootIdAtStopStart === 'boot-C'));
delete counter.bootId;
now += 60000; counter.lastSignal = now; down.lastObservedSignal = now; down.runningSince = now - 60000;
const unknown = run({}, flow, global, node, Clock)[0].find(m => m.operation === 'updateOne');
assert.equal(unknown.payload[1].$set.bootIdAtStopEnd, null);
values.counterRestoreReady = false; assert.equal(run({}, flow, global, node, Clock), null);
console.log('PASS: boot IDs at stop/recovery, observation timestamps, unchanged backdating/filter, shift close/reopen, numeric/unknown IDs and startup restore gate.');
