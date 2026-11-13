import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getSizeProduction } from '../src/utils/sizeProduction.js';

// Exercise the component's actual selection callback: a current shift must
// keep the authoritative summary even when live-summary has the old total.
const source = fs.readFileSync(new URL('../src/components/ProductionLineDashboard.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  const selectedDetails = useMemo(() => {');
const end = source.indexOf('  }, [isSelectedCurrentShift, live, selectedShiftStats]);', start);
assert.ok(start >= 0 && end > start);
const body = source.slice(start + '  const selectedDetails = useMemo(() => {'.length, end);
const select = new Function('selectedShiftStats', 'isSelectedCurrentShift', 'live', 'calculateTileSqm', body);
const stats = {
  tileSize: '80x80', tileCount: 102, production: 39.24,
  sizeWiseProduction: [
    { tileSize: '60x60', tileCount: 93, production: 33.48 },
    { tileSize: '80x80', tileCount: 9, production: 5.76 },
  ],
  codeWiseProduction: [
    { designCode: '22YKM.PL', tileSize: '60x60', tileCount: 93, production: 33.48 },
    { designCode: 'YKM', tileSize: '80x80', tileCount: 9, production: 5.76 },
  ],
};
const live = { tileSize: '80x80', shiftCount: 102, productionSqm: 65.28 };
const noCalculation = () => { throw Error('Must not recalculate an authoritative summary'); };
for (const current of [true, false]) {
  const details = select(stats, current, live, noCalculation);
  assert.equal(details, stats);
  const rows = getSizeProduction(details);
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((sum, r) => sum + r.tileCount, 0), 102);
  assert.equal(Number(rows.reduce((sum, r) => sum + r.production, 0).toFixed(2)), 39.24);
}
assert.equal(select({ ...stats, production: 0 }, true, live, noCalculation).production, 0);
assert.ok(!source.includes('productionSqm: calculateTileSqm(latestTileSize, latestCount)'));
assert.ok(source.includes('window.setInterval(loadSelectedSummary, 5000)'));
console.log('PASS: current/completed mixed-size totals, zero production, incremental area protection and refresh.');
