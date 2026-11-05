import assert from 'node:assert/strict';
import fs from 'node:fs';
const nodes = JSON.parse(fs.readFileSync(new URL('./floor-stock-count-discrepancies.patch.flow.json', import.meta.url)));
const verify = new Function('msg', 'node', nodes.find(n => n.name === 'FS: Verify ALL device summaries').func);
const build = new Function('msg', 'node', nodes.find(n => n.name === 'FS: Build rolling snapshot').func);
const messages = [];
const node = { warn: value => messages.push(value), status: () => {}, error: value => { throw Error(value); } };
const make = () => ({ floorStock: { snapshotId: '2026-11-05|06-14', shiftDate: '2026-11-05', shift: '06-14', expectedDevices: ['kiln', 'keda'], roles: { kiln: 'kiln', keda: 'keda' } }, payload: [
  { lineStats: { device: 'kiln', tileCount: 100, codeWiseUpdatedAt: '2026-11-05T08:30:00Z', shiftEnd: '2026-11-05T08:30:00Z', codeWiseProduction: [{ tileSize: '60x60', tileCount: 90 }] } },
  { lineStats: { device: 'keda', tileCount: 40, codeWiseUpdatedAt: '2026-11-05T08:30:00Z', shiftEnd: '2026-11-05T08:30:00Z', codeWiseProduction: [{ tileSize: '60x60', tileCount: 40 }] } },
] });
let msg = make();
assert.equal(verify(msg, node), msg);
assert.equal(msg.collection, 'floorStocks');
assert.deepEqual(msg.floorStock.discrepancies, [{ device: 'kiln', summaryTiles: 100, codeWiseTiles: 90, differenceTiles: -10 }]);
msg.payload = [];
assert.equal(build(msg, node), msg);
assert.equal(msg.floorStockDocument.stocks[0].closingStock, 50);
assert.equal(msg.floorStockDocument.productionCountDiscrepancies.length, 1);
assert.ok(messages.some(message => message.includes('using codeWiseProduction')));
msg = make(); msg.payload.pop(); assert.equal(verify(msg, node), null);
msg = make(); msg.payload[0].lineStats.codeWiseProduction[0].tileCount = -1; assert.equal(verify(msg, node), null);
msg = make(); msg.payload[0].lineStats.codeWiseProduction[0].tileSize = 'unknown'; assert.equal(verify(msg, node), null);
msg = make(); msg.payload[0].lineStats.tileCount = 90; verify(msg, node);
assert.deepEqual(msg.floorStock.discrepancies, []);
console.log('PASS: discrepancies permitted and saved; code-wise counts used; missing/invalid summaries blocked.');
