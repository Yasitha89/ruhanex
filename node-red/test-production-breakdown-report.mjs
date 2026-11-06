import assert from 'node:assert/strict';
import { buildProductionBreakdown, PRODUCTION_CATEGORIES } from '../src/utils/productionBreakdownReport.js';
import { canAccessPage } from '../src/utils/permissions.js';
const shift = { shift: '06-14', production: 131.45, tileCount: 509,
  sizes: [{ size: '90x45', tileCount: 177, production: 71.69 }, { size: '60x30', tileCount: 332, production: 59.76 }],
  codeWiseProduction: [{ designCode: 'A', tileSize: '90x45', tileCount: 174, production: 70.47 }, { designCode: 'A', tileSize: '90x45', tileCount: 3, production: 1.22 }, { designCode: 'B', tileSize: '60x30', tileCount: 332, production: 59.76 }] };
const input = [{ line: 'Glaze Line 1', month: '2026-11', data: { days: [{ date: '2026-11-04', shifts: [shift] }, { date: '2026-11-05', shifts: [shift] }] } }];
for (const design of [false, true]) {
  const result = buildProductionBreakdown(input, '2026-11-04', '2026-11-04', design);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows.reduce((sum, row) => sum + row.tileCount, 0), 509);
  assert.equal(Math.round(result.rows.reduce((sum, row) => sum + row.production, 0) * 100), 13145);
}
const partial = structuredClone(input); partial[0].data.days[0].shifts[0].codeWiseProduction.pop();
const report = buildProductionBreakdown(partial, '2026-11-04', '2026-11-04', true);
assert.equal(report.rows.find(row => row.designCode === 'Unassigned').production, 59.76);
assert.equal(buildProductionBreakdown(input, '2026-10-01', '2026-10-31', true).rows.length, 0);
assert.equal(PRODUCTION_CATEGORIES.sorted.lines.length, 3);
assert.equal(PRODUCTION_CATEGORIES.green.lines.length, 3);
assert.equal(PRODUCTION_CATEGORIES.kiln.lines.length, 3);
for (const role of ['Admin', 'Manager']) assert.equal(canAccessPage(role, '/production_breakdown'), true);
assert.equal(canAccessPage('Line Supervisor', '/production_breakdown'), false);
console.log('PASS: multi-size totals, repeated design runs, exact-date filtering, unassigned production, category lines and report access.');
