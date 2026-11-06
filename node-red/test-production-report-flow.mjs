import assert from 'node:assert/strict';
import { prepareReport, queryActiveReport, queryHybridReport, finishReport, nodes } from './build-production-report-flow.mjs';
import { buildProductionBreakdown, PRODUCTION_CATEGORIES } from '../src/utils/productionBreakdownReport.js';
const cfg = { gl1: { line: 'Glaze Line 1' }, gl3: { line: 'Glaze Line 3' }, kiln1: { line: 'Kiln 1' } };
const global = { get: () => cfg };
const make = (q = {}) => ({ req: { query: { category: 'green', fromDate: '2026-11-04', toDate: '2026-11-04', ...q } } });
const prepare = msg => {
  const now = Date.now;
  Date.now = () => Date.parse('2026-11-06T04:30:00Z');
  try { return prepareReport(msg, global, PRODUCTION_CATEGORIES); } finally { Date.now = now; }
};
let msg = make(); assert.equal(prepare(msg)[0], msg);
assert.deepEqual(msg.report.unavailableLines, ['Glaze Line 2']);
assert.deepEqual(msg.payload[0]['lineStats.shiftDate'], { $gte: '2026-11-04', $lte: '2026-11-04' });
for (const q of [{ category: 'invalid' }, { lines: 'Kiln 1' }, { fromDate: '2026-02-30' }, { toDate: '2026-10-01' }, { fromDate: '2025-01-01', toDate: '2026-11-04' }]) assert.equal(prepare(make(q))[1].statusCode, 400);
const stats = { device: 'gl1', lineName: 'Glaze Line 1', shiftDate: '2026-11-04', shift: '06-14', updatedAt: '2026-11-04T09:00:00Z', tileCount: 509,
  codeWiseProduction: [{ tileSize: '90x45', designCode: 'A', tileCount: 177 }, { tileSize: '60x30', designCode: 'B', tileCount: 332 }] };
msg.payload = [{ lineStats: stats }, { lineStats: { ...stats, updatedAt: '2026-11-04T01:00:00Z', tileCount: 100 } }, { lineStats: { ...stats, shiftDate: '2026-11-03' } }];
assert.equal(queryActiveReport(msg)[1], msg);
finishReport(msg, buildProductionBreakdown);
assert.equal(msg.payload.rowsBySize.reduce((sum, row) => sum + row.tileCount, 0), 509);
assert.equal(Math.round(msg.payload.rowsBySize.reduce((sum, row) => sum + row.production, 0) * 100), 13145);
assert.equal(msg.payload.rowsByDesign.length, 2);
assert.equal(msg.payload.coverage[0].missingShifts, 2);
// Execute the generated aggregation Function as well as the imported helpers.
const generated = new Function('msg', nodes.find(n => n.id === 'rx_report_finish').func);
msg = make({ fromDate: '2026-11-06', toDate: '2026-11-06', lines: 'Glaze Line 1' }); prepare(msg);
msg.payload = [{ lineStats: { ...stats, shiftDate: '2026-11-06', tileCount: 999 } }];
assert.equal(queryActiveReport(msg)[0], msg);
assert.ok(msg.query.includes('2026-11-06T00:30:00.000Z'));
msg.payload = [{ device: 'gl1', tileSize: '60x30', designCode: 'LIVE', _value: 20 }];
generated(msg);
assert.equal(msg.payload.source, 'mongo+influx');
assert.equal(msg.payload.rowsBySize[0].tileCount, 20);
assert.equal(msg.payload.rowsByDesign[0].designCode, 'LIVE');
msg = make({ fromTime: '2026-10-10T08:15:00+05:30', toTime: '2026-10-12T16:45:00+05:30', lines: 'Glaze Line 1' });
assert.equal(prepare(msg)[0], msg);
assert.equal(msg.report.timeMode, true);
msg.payload = [];
queryHybridReport(msg);
assert.ok(msg.query.includes('2026-10-10T02:45:00.000Z'));
assert.ok(msg.query.includes('2026-10-12T11:15:00.000Z'));
msg.payload = [{ device: 'gl1', tileSize: '60x30', designCode: 'TIMED', month: '2026-09-30T18:30:00Z', _value: 10 }];
generated(msg);
assert.equal(msg.payload.rowsBySize[0].tileCount, 10);
assert.equal(msg.payload.rowsBySize[0].intervalStart, '2026-10-10T02:45:00.000Z');
assert.equal(msg.payload.rowsBySize[0].intervalEnd, '2026-10-12T11:15:00.000Z');
assert.equal(msg.payload.rowsBySize[0].month, '2026-10');
// Hybrid: two partial endpoints, three complete saved shifts in between.
msg = make({ fromTime: '2026-10-10T08:00:00+05:30', toTime: '2026-10-11T20:00:00+05:30', lines: 'Glaze Line 1' }); prepare(msg);
msg.payload = [['2026-10-10', '14-22'], ['2026-10-10', '22-06'], ['2026-10-11', '06-14']].map(([date, shift]) => ({ lineStats: { ...stats, shiftDate: date, shift, tileCount: 10, codeWiseProduction: [{ tileSize: '60x30', designCode: 'SAVED', tileCount: 10 }] } }));
assert.equal(queryHybridReport(msg)[0], msg);
assert.equal(msg.report.hybrid.coverage.mongoShifts, 3);
assert.equal(msg.report.hybrid.coverage.influxPartialShifts, 2);
assert.equal(msg.report.hybrid.coverage.influxMissingShifts, 0);
assert.deepEqual(msg.report.hybrid.ranges.map(x => [x.from, x.to]), [
  ['2026-10-10T02:30:00.000Z', '2026-10-10T08:30:00.000Z'],
  ['2026-10-11T08:30:00.000Z', '2026-10-11T14:30:00.000Z'],
]);
msg.payload = [{ device: 'gl1', tileSize: '60x30', designCode: 'PARTIAL', month: '2026-09-30T18:30:00Z', _value: 20 }];
generated(msg);
assert.equal(msg.payload.source, 'mongo+influx');
assert.equal(msg.payload.rowsBySize.reduce((sum, row) => sum + row.tileCount, 0), 50);
assert.equal(msg.payload.rowsByDesign.length, 2);
// Fully covered completed shifts need no Influx request.
msg = make({ fromTime: '2026-11-04T06:00:00+05:30', toTime: '2026-11-04T14:00:00+05:30', lines: 'Glaze Line 1' }); prepare(msg);
msg.payload = [{ lineStats: stats }];
assert.equal(queryHybridReport(msg)[1], msg);
assert.equal(msg.report.hybrid.ranges.length, 0);
generated(msg);
assert.equal(msg.payload.source, 'mongo');
assert.equal(msg.payload.rowsBySize.reduce((sum, row) => sum + row.tileCount, 0), 509);
// A period within one shift is queried once, not as two overlapping boundaries.
msg = make({ fromTime: '2026-11-04T08:00:00+05:30', toTime: '2026-11-04T09:00:00+05:30', lines: 'Glaze Line 1' }); prepare(msg); msg.payload = [];
queryHybridReport(msg); assert.equal(msg.report.hybrid.ranges.length, 1);
assert.equal(msg.report.hybrid.coverage.influxPartialShifts, 1);
// A full shift spanning a month boundary uses timestamped events for calendar allocation.
msg = make({ fromTime: '2026-10-31T22:00:00+05:30', toTime: '2026-11-01T06:00:00+05:30', lines: 'Glaze Line 1' }); prepare(msg); msg.payload = [{ lineStats: { ...stats, shiftDate: '2026-10-31', shift: '22-06' } }];
queryHybridReport(msg); assert.equal(msg.report.hybrid.coverage.influxMonthBoundaryShifts, 1);
assert.equal(prepare(make({ fromTime: '2026-10-10T08:15:00', toTime: '2026-10-12T16:45:00+05:30' }))[1].statusCode, 400);
assert.equal(prepare(make({ fromTime: '2026-10-12T16:45:00+05:30', toTime: '2026-10-10T08:15:00+05:30' }))[1].statusCode, 400);
for (const node of nodes.filter(n => n.type === 'function')) new Function('msg', 'global', node.func);
const ids = new Set(nodes.map(node => node.id));
for (const node of nodes) for (const target of (node.wires || []).flat()) assert.ok(ids.has(target));
console.log('PASS: selected-date queries, category/line validation, unavailable lines, duplicate shifts, mixed sizes, live-source replacement, coverage and generated functions.');
