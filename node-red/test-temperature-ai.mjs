import assert from 'node:assert/strict';
import fs from 'node:fs';
import { productionToolkit } from './production-ai-toolkit.mjs';
const kit = productionToolkit(); const lines = ['Keda 1'];
const args = { slaveId: '3', fromTime: '2026-11-15T06:00:00+05:30', toTime: '2026-11-15T14:00:00+05:30', interval: '1m', metric: 'all' };
const plan = kit.plan('get_temperature_history', args, lines);
assert.equal(plan.path, '/api/getHistoricalTemperatureData'); assert.equal(plan.query.slave_id, '3'); assert.equal(plan.query.from_time, args.fromTime);
assert.equal(kit.plan('get_live_temperature_series', { slaveIds: '3,4', metric: 'pv', range: '1h' }, lines).query.slave_ids, '3,4');
assert.throws(() => kit.plan('get_latest_temperature', { slaveId: '1' }, lines));
assert.throws(() => kit.plan('get_live_temperature_series', { slaveIds: '3,247', metric: 'pv', range: '1h' }, lines));
assert.throws(() => kit.plan('get_temperature_history', { ...args, interval: '5s', toTime: '2026-12-15T14:00:00+05:30' }, lines));
assert.throws(() => kit.plan('get_temperature_history', { ...args, interval: '1d', toTime: '2028-12-15T14:00:00+05:30' }, lines));
const normal = kit.normalise('get_temperature_history', { success: true, data: [
  { timestamp: '2026-11-15T00:30:00Z', pv: 100, sv: 110, delta: -10 },
  { timestamp: '2026-11-15T00:31:00Z', pv: null, sv: 110, delta: null },
  { timestamp: '2026-11-15T00:32:00Z', pv: 120, sv: 110, delta: 10 },
] }, args);
assert.equal(normal.data[1].pv, null); assert.equal(normal.statistics[0].meanOfAvailableWindows, 110);
assert.equal(normal.statistics[0].availableWindows, 2); assert.equal(normal.statistics[2].minWindowMean, -10);
const patch = JSON.parse(fs.readFileSync(new URL('./production-ai-chat.temperature.patch.flow.json', import.meta.url)));
const init = new Function('msg', 'env', patch.find(n => n.name === 'Authenticate + tools').func);
const env = { get: k => ({ AI_CHAT_BEARER_TOKEN: 'token', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model', PRODUCTION_API_BASE_URL: 'http://127.0.0.1:1880' })[k] };
for (const role of ['Admin', 'Manager', 'Line Supervisor']) {
  const [msg] = init({ req: { headers: { authorization: 'Bearer token', 'x-ruhanex-role': role } }, payload: { message: 'Spray dryer temperature?' } }, env);
  assert.equal(msg.aiChat.tools.some(t => t.name === 'get_latest_temperature'), role !== 'Line Supervisor');
}
const ids = new Set(patch.map(n => n.id));
for (const n of patch) { if (n.type === 'function') new Function('msg', 'env', n.func); for (const wire of n.wires || []) for (const id of wire) assert.ok(ids.has(id)); }
console.log('PASS: temperature tool arguments/API mapping, controller allowlist, historical limits, null/negative readings, statistics, supplied-flow syntax/wiring and role guards.');
