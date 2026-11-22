import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stockSnapshotResponse } from './periodic-stock-api.mjs';
const now = Date.parse('2026-11-22T05:00:00Z');
for (const kind of ['floor', 'car']) {
  const msg = { req: {}, res: {}, payload: [{ _id: '2026-11-22|06-14', status: 'live', shiftEnd: '2026-11-22T08:30:00Z', calculationTo: '2026-11-22T04:59:00Z', stocks: [{ tileSize: '80x80', closingStock: 100 }] }] };
  const result = stockSnapshotResponse(msg, kind, now);
  assert.equal(result.statusCode, 200);
  assert.equal(result.payload.stocks[0][kind + 'StockM2'], 64);
  assert.equal(result.payload[kind === 'floor' ? 'totalFloorStockM2' : 'totalCarStockM2'], 64);
  assert.equal(result.payload.asOf, '2026-11-22T04:59:00Z');
  assert.equal(result.payload.stale, false);
  assert.equal(result, msg);
}
assert.deepEqual(stockSnapshotResponse({ payload: [] }, 'floor', now).payload.stocks, []);
assert.throws(() => stockSnapshotResponse({ payload: [{ stocks: [{ tileSize: 'bad', closingStock: 1 }] }] }, 'floor', now), /Invalid tile/);
const nodes = JSON.parse(fs.readFileSync(new URL('./periodic-stock-api.complete.flow.json', import.meta.url)));
const ids = new Set(nodes.map(n => n.id));
assert(nodes.every(n => (n.wires || []).flat().every(id => ids.has(id))));
assert(!nodes.some(n => n.type.startsWith('influx')));
for (const n of nodes.filter(n => n.type === 'mongodb4')) assert.equal(n.operation, 'find');
for (const n of nodes.filter(n => n.type === 'function')) new Function('msg', n.func);
console.log('Stock API checks passed: live future shift end, chart fields, timestamps, empty data, invalid data and flow wiring.');
