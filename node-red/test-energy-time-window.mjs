import fs from 'node:fs';
import assert from 'node:assert/strict';
import { productionToolkit } from './production-ai-toolkit.mjs';
const nodes = JSON.parse(fs.readFileSync(new URL('./energy-time-window.patch.flow.json', import.meta.url)));
const query = new Function('msg', nodes.find(n => n.id === 'a00404334d5d5f7c').func);
const format = new Function('msg', 'global', nodes.find(n => n.id === 'fe83c684e92dd30b').func);
const base = { panel: 'ATS1', device_ids: '1,3,5', from_time: '2026-10-01T00:00:00+05:30', to_time: '2026-11-01T00:00:00+05:30', interval: '1d', daily_start: '18:30', daily_end: '22:30' };
const make = q => ({ req: { query: { ...base, ...q } } });
let msg = make();
assert.equal(query(msg)[0], msg);
assert.equal((msg.query.match(/window\d+ = from/g) || []).length, 31);
assert.ok(!msg.query.includes('date.hour'));
assert.ok(msg.query.includes('2026-10-01T13:00:00.000Z'));
assert.ok(msg.query.includes('2026-10-01T17:00:00.000Z'));
assert.ok(msg.query.includes('union(tables:'));
msg.payload = [
  { panel: 'ATS1', device_id: '1', intervalStart: '2026-10-01T00:00:00+05:30', intervalEnd: '2026-10-02T00:00:00+05:30', energyUsageKwh: 10.004 },
  { panel: 'ATS1', device_id: '3', intervalStart: '2026-10-01T00:00:00+05:30', intervalEnd: '2026-10-02T00:00:00+05:30', energyUsageKwh: 20.004 },
];
format(msg, { get: () => ({ ATS1: { 1: 'ATS CEB', 3: 'MSB CEB' } }) });
assert.equal(msg.payload.totalEnergyUsageKwh, 30.01);
assert.equal(msg.payload.byMeter[2].energyUsageKwh, null);
assert.deepEqual(msg.payload.missingMeters, [5]);
msg = make({ daily_start: '22:30', daily_end: '05:30' }); query(msg);
assert.equal((msg.query.match(/window\d+ = from/g) || []).length, 31);
assert.ok(msg.query.includes('2026-10-01T17:00:00.000Z'));
assert.ok(msg.query.includes('2026-10-02T00:00:00.000Z'));
assert.ok(msg.query.includes('intervalEnd:r.windowEnd'));
assert.equal(msg.energyRequest.fromTime, '2026-10-01T17:00:00.000Z');
assert.equal(msg.energyRequest.toTime, '2026-10-31T18:30:00.000Z');
assert.equal(msg.energyRequest.dailyWindow.dateBasis, 'overnight-start-date');
msg.payload = [{ panel: 'ATS1', device_id: '1', intervalStart: '2026-10-31T17:00:00Z', intervalEnd: '2026-11-01T00:00:00Z', energyUsageKwh: 25 }];
format(msg, { get: () => ({}) });
assert.equal(msg.payload.data[0].intervalEnd, '2026-10-31T18:30:00.000Z');
assert.equal(msg.payload.totalEnergyUsageKwh, 25);
for (const interval of ['1h', '6h', '1d', '1mo', '1y']) {
  msg = make({ daily_start: '22:30', daily_end: '05:30', interval });
  assert.equal(query(msg)[0], msg);
  assert.ok(msg.query.includes('intervalEnd:r.windowEnd'));
  assert.equal(msg.energyRequest.dailyWindow.intervalBasis, 'selected-window');
  if (interval === '6h') {
    assert.ok(msg.query.includes('offset:18000000ms'));
    assert.ok(msg.query.includes('location:timezone.location(name:"UTC")'));
    // UTC 17:00 + 6h is local 04:30; final range end is local 05:30.
    assert.equal(new Date(Date.parse(msg.energyRequest.fromTime) + 6 * 3600000).toISOString(), '2026-10-01T23:00:00.000Z');
  }
  if (interval === '1h') assert.ok(msg.query.includes('every:1h,offset:0ms'));
  if (interval === '1mo' || interval === '1y') {
    assert.ok(!msg.query.includes('aggregateWindow('));
    assert.ok(msg.query.includes('windowEnd:time(v:"2026-10-31T18:30:00.000Z")'));
  }
  const stops = [...msg.query.matchAll(/stop:time\(v:"([^"]+)"\)/g)].map(match => Date.parse(match[1]));
  assert.ok(stops.length > 0);
  assert.ok(stops.every(stop => stop <= Date.parse(base.to_time)), 'No source range may read beyond the selected end date');
}
for (const q of [{ daily_end: '18:30' }, { daily_start: '24:00' }, { timezone: 'UTC' }, { device_ids: '1,bad' }, { from_time: '2026-10-01' }]) assert.equal(query(make(q))[1].statusCode, 400);
msg = make(); delete msg.req.query.daily_start; delete msg.req.query.daily_end;
assert.equal(query(msg)[0], msg); assert.equal(msg.energyRequest.dailyWindow, undefined);
const kit = productionToolkit();
const args = { panel: 'ATS1', deviceIds: '1,3,5', fromTime: base.from_time, toTime: base.to_time, dailyStart: '18:30', dailyEnd: '22:30', interval: '1d' };
assert.equal(kit.plan('get_energy_time_window', args, []).query.daily_start, '18:30');
assert.throws(() => kit.plan('get_energy_time_window', { ...args, deviceIds: '1,bad' }, []));
console.log('PASS: pre-aggregation local time filtering, overnight windows, multiple meters, unrounded totals, missing meters, validation, legacy compatibility and AI mapping.');
