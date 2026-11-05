import assert from 'node:assert/strict';
import { startStock, queryStockGap, buildStockGap, nodes } from './build-stock-gap-saving-flow.mjs';
const cfg = { kiln: { enabled: true, line: 'Kiln 1' }, keda: { enabled: true, line: 'Keda 1' }, glaze: { enabled: true, line: 'Glaze Line 1' } };
const global = { get: key => key === 'counterConfig' ? cfg : {} };
for (const kind of ['floor', 'car']) {
  const msg = { codeWiseTarget: { shiftDate: '2026-11-05', shift: '14-22', device: 'kiln' }, payload: { acknowledged: true, matchedCount: 1 } };
  // Use a completed date irrespective of test execution time.
  const NativeDate = Date;
  const originalNow = Date.now;
  Date.now = () => NativeDate.parse('2026-11-06T00:00:00Z');
  try { assert.equal(startStock(msg, global, kind), msg); } finally { Date.now = originalNow; }
  msg.payload = [{ _id: '2026-11-04|22-06', shiftEnd: '2026-11-05T00:30:00.000Z', stocks: [{ tileSize: '60x60', closingStock: 0 }] }];
  assert.equal(queryStockGap(msg)[0], msg);
  assert.ok(msg.query.includes('2026-11-05T00:30:00.000Z'));
  assert.ok(msg.query.includes('2026-11-05T16:30:00.000Z'));
  assert.ok(msg.query.includes('aggregateWindow(every:8h,offset:30m'));
  msg.payload = [
    { device: kind === 'floor' ? 'keda' : 'kiln', tileSize: '60x60', _time: '2026-11-05T08:30:00Z', _value: 100 },
    { device: kind === 'floor' ? 'kiln' : 'glaze', tileSize: '60x60', _time: '2026-11-05T16:30:00Z', _value: 150 },
  ];
  buildStockGap(msg);
  const doc = msg.stockGapDocument;
  assert.equal(doc._id, '2026-11-05|14-22');
  assert.equal(doc.coveredShifts, 2);
  assert.equal(doc.recoveredMissingShifts, 1);
  assert.equal(doc.stocks[0].closingStock, 150);
  assert.equal(doc.stocks[0].zeroClampAdjustment, 100);
  assert.equal(doc.intervalBalances[0].stocks[0].closingStock, 0);
  assert.equal(doc.intervalBalances[1].stocks[0].closingStock, 150);
  assert.equal(doc[kind === 'floor' ? 'totalFloorStockM2' : 'totalCarStockM2'], 54);
  msg.payload = [];
  assert.equal(queryStockGap(msg)[0], msg);
  msg.payload = [];
  buildStockGap(msg);
  assert.equal(msg.stockGapDocument.openingStockInitializedToZero, true);
  assert.equal(msg.stockGapDocument.coveredShifts, 1);
  assert.equal(msg.stockGapDocument.stocks.length, 0);
  msg.payload = [{ _id: '2026-11-04|14-22', shiftEnd: '2026-11-04T16:30:00Z', stocks: [{ tileSize: '60x60', closingStock: 20 }] }];
  queryStockGap(msg);
  msg.payload = [];
  buildStockGap(msg);
  assert.equal(msg.stockGapDocument.coveredShifts, 3);
  assert.equal(msg.stockGapDocument.stocks[0].closingStock, 20);
  msg.payload = [{ _id: doc._id, shiftEnd: doc.shiftEnd }];
  assert.equal(queryStockGap(msg)[1], msg);
}
const msg = { stockGap: { from: Date.parse('2026-11-05T00:30:00Z'), end: Date.parse('2026-11-05T08:30:00Z'), roles: { kiln: 'kiln' } }, payload: [{ device: 'kiln', tileSize: 'unknown', _value: 100, _time: '2026-11-05T08:30:00Z' }] };
assert.throws(() => buildStockGap(msg), /Invalid production bucket/);
for (const node of nodes.filter(n => n.type === 'function')) new Function('msg', 'node', 'flow', 'global', node.func);
const ids = new Set(nodes.map(n => n.id));
for (const node of nodes) for (const target of (node.wires || []).flat()) assert.ok(ids.has(target));
// Exercise the single-flight queue with two saves.
const store = new Map(), flow = { get: key => store.get(key), set: (key, value) => store.set(key, value) };
const entry = new Function('msg', 'flow', nodes.find(n => n.id === 'rx_gap_floor_entry').func);
const finish = new Function('msg', 'flow', nodes.find(n => n.id === 'rx_gap_floor_finish').func);
const a = { id: 'a' }, b = { id: 'b' };
assert.equal(entry(a, flow), a); assert.equal(entry(b, flow), null);
assert.equal(finish(a, flow)[1], b); assert.equal(finish(b, flow)[1], null);
assert.equal(store.get('rx_gap_floor_busy'), false);
console.log('PASS: floor/car gaps, chronological clamping, target snapshot, query range, duplicate skip, invalid sizes, wiring and single-flight queue.');
