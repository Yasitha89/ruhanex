import assert from 'node:assert/strict';
import fs from 'node:fs';
import { productionToolkit } from './production-ai-toolkit.mjs';
const kit = productionToolkit();
for (const [at, shift, date, previous, previousDate] of [
  ['2026-11-16T00:00:00+05:30', '22-06', '2026-11-15', '14-22', '2026-11-15'],
  ['2026-11-16T05:59:59+05:30', '22-06', '2026-11-15', '14-22', '2026-11-15'],
  ['2026-11-16T06:00:00+05:30', '06-14', '2026-11-16', '22-06', '2026-11-15'],
  ['2026-11-16T13:59:59+05:30', '06-14', '2026-11-16', '22-06', '2026-11-15'],
  ['2026-11-16T14:00:00+05:30', '14-22', '2026-11-16', '06-14', '2026-11-16'],
  ['2026-11-16T21:59:59+05:30', '14-22', '2026-11-16', '06-14', '2026-11-16'],
  ['2026-11-16T22:00:00+05:30', '22-06', '2026-11-16', '14-22', '2026-11-16'],
  ['2027-01-01T01:00:00+05:30', '22-06', '2026-12-31', '14-22', '2026-12-31'],
]) {
  const c = kit.shiftContext(Date.parse(at));
  assert.equal(c.currentShift.shift, shift); assert.equal(c.currentShift.shiftDate, date);
  assert.equal(c.previousShift.shift, previous); assert.equal(c.previousShift.shiftDate, previousDate);
  assert.equal(Date.parse(c.currentShift.toTime) - Date.parse(c.currentShift.fromTime), 8 * 3600000);
  assert.equal(c.previousShift.toTime, c.currentShift.fromTime);
  assert.equal(c.productionDate, date);
}
const patch = JSON.parse(fs.readFileSync(new URL('./production-ai-chat.temperature.patch.flow.json', import.meta.url)));
const initial = new Function('msg', 'env', patch.find(n => n.name === 'Authenticate + tools').func);
const env = { get: key => ({ AI_CHAT_BEARER_TOKEN: 'secret', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model', PRODUCTION_API_BASE_URL: 'http://127.0.0.1:1880' })[key] };
const [msg] = initial({ req: { headers: { authorization: 'Bearer secret' } }, payload: { message: 'Which shift is current?' } }, env);
assert.ok(msg.aiChat.instructions.includes('Authoritative factory clock for this request:'));
assert.ok(msg.aiChat.instructions.includes('"currentShift":'));
console.log('PASS: all Colombo shift boundaries, overnight production date, year rollover, previous shift and runtime clock injection in supplied AI patch.');
