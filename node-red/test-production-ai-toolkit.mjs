import assert from 'node:assert/strict';
import vm from 'node:vm';
import { productionToolkit } from './production-ai-toolkit.mjs';
import { nodes, initialise, prepareTool, collectTool } from './build-production-ai-flow.mjs';

const kit = productionToolkit();
const lines = ['Keda 1', 'Keda 2', 'Keda 3', 'Glaze Line 1', 'Glaze Line 2', 'Glaze Line 3', 'Kiln 1', 'Kiln 2', 'Kiln 3'];
const time = { fromTime: '2026-10-01T00:00:00+05:30', toTime: '2026-11-01T00:00:00+05:30' };
const cases = {
  get_production_breakdown_report: { category: 'green', lines: '', ...time, breakdown: 'design' },
  get_monthly_production: { line: 'Keda 1', month: '2026-10' },
  get_daily_production: { line: 'Keda 1', date: new Date(Date.now() + 330 * 60000 - 6 * 3600000).toISOString().slice(0, 10) },
  get_shift_summary: { line: 'Keda 1', date: '2026-10-25', shift: '06-14' },
  get_shift_downtime: { line: 'Keda 1', date: '2026-10-25', shift: '06-14' },
  get_floor_stocks: {}, get_car_stocks: {}, get_live_production: { line: 'Kiln 1' },
  get_historical_shifts: { line: 'Keda 1', fromDate: '2026-10-01', toDate: '2026-10-31' },
  get_shift_count_series: { line: 'Keda 1', date: '2026-10-25', shift: '06-14' },
  get_line_settings: { line: 'Keda 1' }, get_design_codes: { tileSize: '', search: '' },
  get_machines: { line: 'Keda 1', search: '' }, get_device_inventory: {},
  get_current_energy: { deviceId: '1' },
  get_energy_time_window: { panel: 'ATS1', deviceIds: '1,3,5', ...time, dailyStart: '18:30', dailyEnd: '22:30', interval: '1d' },
  get_energy_usage: { source: 'ceb', ...time, interval: '1d' },
  get_electricity_history: { deviceId: '3', ...time, interval: '1h' },
  get_live_energy_series: { source: 'generator', metric: 'active_power_kw', range: '24h' },
};
for (const tool of kit.tools(lines)) {
  assert.equal(tool.strict, true);
  assert.deepEqual(tool.parameters.required, Object.keys(tool.parameters.properties));
  assert(kit.plan(tool.name, cases[tool.name], lines).path.startsWith('/api/'));
}
const reportPlan = kit.plan('get_production_breakdown_report', cases.get_production_breakdown_report, lines);
assert.equal(reportPlan.path, '/api/production/breakdown-report');
assert.equal(reportPlan.query.lines, 'Glaze Line 1,Glaze Line 2,Glaze Line 3');
assert.equal(reportPlan.query.breakdown, undefined);
assert.equal(reportPlan.query.fromTime, time.fromTime);
assert.throws(() => kit.plan('get_production_breakdown_report', { ...cases.get_production_breakdown_report, lines: 'Keda 1' }, lines));
const report = kit.normalise('get_production_breakdown_report', { success: true, rowsBySize: [{ production: 999 }], rowsByDesign: [
  { line: 'Glaze Line 1', month: '2026-10', production: 12, tileCount: 100, designCode: 'A', tileSize: '60x30' },
  { line: 'Glaze Line 3', month: '2026-10', production: 8, tileCount: null, designCode: 'B', tileSize: '60x60' },
], warnings: ['Partial telemetry'], unavailableLines: ['Glaze Line 2'] }, cases.get_production_breakdown_report);
assert.equal(report.totalProduction, 20);
assert.equal(report.totalTiles, null);
assert.equal(report.rows.length, 2);
assert.equal(report.rowsBySize, undefined);
assert.ok(report.warnings.includes('Partial telemetry'));
assert.deepEqual(kit.plan('get_energy_usage', cases.get_energy_usage, lines).query,
  { interval: '1d', panel: 'ATS1', device_ids: '1,3,5', from_time: time.fromTime, to_time: time.toTime });
assert.equal(kit.plan('get_live_energy_series', cases.get_live_energy_series, lines).query.meters, 'ATS1:2,ATS1:4');
assert.throws(() => kit.plan('get_current_energy', { deviceId: '1', url: 'https://evil.test' }, lines));
assert.throws(() => kit.plan('get_shift_summary', { ...cases.get_shift_summary, date: '2026-02-30' }, lines));
assert.throws(() => kit.plan('get_electricity_history', { ...cases.get_electricity_history, interval: '1m' }, lines));
assert.throws(() => kit.plan('get_daily_production', { line: 'Keda 1', date: '2020-01-01' }, lines));
const row = { lineName: 'Keda 1', device: 'RX-CNT-1000', shiftDate: '2026-10-25', shift: '06-14', updatedAt: '2026-10-25T09:00:00Z', production: 100, tileCount: 500, targetTiles: 1000, plannedProductionMinutes: 400, actualOperatingMinutes: 300, codeWiseProduction: [{ tileSize: '60x30', designCode: 'A', production: 100, tileCount: 500 }] };
const second = { ...row, shift: '14-22', production: 50, tileCount: 250, targetTiles: 500, plannedProductionMinutes: 200, actualOperatingMinutes: 200 };
const history = kit.normalise('get_historical_shifts', [{ lineStats: { ...row, production: 1, updatedAt: '2026-10-25T08:00:00Z' } }, { lineStats: row }, { lineStats: second }], cases.get_historical_shifts);
assert.equal(history.uniqueRecordedShifts, 2);
assert.equal(history.totals.production.value, 150);
assert.equal(history.weightedAvailabilityPercent, 83.33);
assert.equal(history.weightedPerformancePercent, 50);
assert.equal(history.totals.totalDowntimeMinutes.value, null);
assert(history.warnings.some((s) => s.includes('deduplicated')));
const missing = kit.normalise('get_historical_shifts', [], cases.get_historical_shifts);
assert.equal(missing.totals.production.value, null);
assert.equal(missing.weightedAvailabilityPercent, null);
const devices = kit.normalise('get_device_inventory', { devices: { gateway: { deviceType: 'energy_gateway', password: 'DO_NOT_EXPOSE', ip: '10.1.1.1', slaves: [{ slaveId: 1, panelId: 'ATS1', password: 'DO_NOT_EXPOSE' }] } } }, {});
assert(!JSON.stringify(devices).includes('DO_NOT_EXPOSE'));
assert(!JSON.stringify(devices).includes('10.1.1.1'));
const energy = kit.normalise('get_energy_usage', { success: true, data: [
  { panel: 'ATS1', device_id: 1, intervalStart: '2026-10-01T00:00:00Z', energyUsageKwh: 10 },
  { panel: 'ATS1', device_id: 3, intervalStart: '2026-10-01T00:00:00Z', energyUsageKwh: 20 },
] }, cases.get_energy_usage);
assert.equal(energy.byInterval[0].energyUsageKwh, 30);
assert.equal(energy.byMeter.length, 2);
const downtime = kit.normalise('get_shift_downtime', { stoppages: [{ reason: 'Belt', machine: 'M1', downtimeType: 'unplanned', durationMinutes: 3 }, { reason: 'Belt', machine: 'M1', downtimeType: 'unplanned', durationMinutes: 7 }] }, {});
assert.equal(downtime.reasonMachineTotals[0].durationMinutes, 10);
const stock = kit.normalise('get_car_stocks', { stocks: [{ clampedToZero: true, rawCarStock: -300 }] }, {});
assert(stock.warnings.some((s) => s.includes('negative')));
const config = { AI_CHAT_BEARER_TOKEN: 't', OPENAI_API_KEY: 'secret', OPENAI_MODEL: 'test', PRODUCTION_API_BASE_URL: 'http://localhost:1880' };
const env = { get: (key) => config[key] };
const msg = initialise({ req: { headers: { authorization: 'Bearer t' } }, payload: { message: 'Analyse October', line: 'Keda 1' } }, env)[0];
const call = (id) => ({ type: 'function_call', call_id: id, name: 'get_monthly_production', arguments: JSON.stringify(cases.get_monthly_production) });
msg.aiChat.queue = [call('first'), call('repeat')];
prepareTool(msg, env); msg.statusCode = 200; msg.payload = { success: true, totalProduction: 10 }; collectTool(msg);
assert.equal(prepareTool(msg, env)[1], msg);
assert.equal(msg.aiChat.sources.length, 1, 'Repeated tool must not issue another HTTP request');
assert.equal(msg.aiChat.input.filter((item) => item.type === 'function_call_output').length, 2);
// Verify actual exported code runs in an isolated Function-node-like sandbox,
// without imports, URL globals or access to the generator's lexical variables.
const sandbox = { msg: { req: { headers: { authorization: 'Bearer t' } }, payload: { message: 'Test' } }, env };
const initial = vm.runInNewContext(nodes.find((n) => n.id === 'ai_chat_init').func.replace(/^/, '(function(){\n') + '\n})()', sandbox);
assert.equal(initial[0].aiChat.tools.length, 19);
console.log('PASS: all 19 schemas/routes, energy parameter mapping, invalid inputs, historical deduplication/weighted totals/missing values, device redaction, energy and downtime rollups, stock warnings, request cache, exported sandbox execution.');
