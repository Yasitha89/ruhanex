import assert from 'node:assert/strict';
import { shiftReportTools, shiftReportStep, nodes } from './build-telegram-shift-summary-flow.mjs';
const tools = shiftReportTools();
const ids = new Set(nodes.map(n => n.id));
for (const n of nodes) {
  if (n.type === 'function') new Function('msg', 'env', 'flow', 'node', n.func);
  for (const wire of n.wires || []) for (const id of wire) assert.ok(ids.has(id));
}
for (const [time, expected] of [
  ['2026-11-14T06:00:00+05:30', { shiftDate: '2026-11-13', shift: '22-06' }],
  ['2026-11-14T14:00:00+05:30', { shiftDate: '2026-11-14', shift: '06-14' }],
  ['2026-11-14T22:00:00+05:30', { shiftDate: '2026-11-14', shift: '14-22' }],
  ['2026-01-01T00:01:00+05:30', { shiftDate: '2025-12-31', shift: '14-22' }],
]) assert.deepEqual(tools.previous(Date.parse(time)), expected);
assert.equal(tools.valid('2026-02-30', '06-14'), false);
let now = Date.parse('2026-11-14T14:05:00+05:30');
const env = { get: k => ({ TELEGRAM_BOT_TOKEN: '123:fake_secret', SHIFT_REPORT_ENABLED: 'true' })[k] };
let context = new Map(); const flow = { get: k => context.get(k), set: (k, v) => context.set(k, v) };
let docs = tools.lines.map((line, i) => ({ _id: String(i), lineStats: { lineName: line, shiftDate: '2026-11-14', shift: '06-14',
  production: 2000, targetProduction: 2000 / 0.9, ole: 75, totalDowntimeMinutes: 200, updatedAt: '2026-11-14T08:30:00Z', codeWiseUpdatedAt: '2026-11-14T08:31:00Z',
  codeWiseProduction: [{ designCode: 'Yk,pl', production: 500 }, { designCode: 'Yk,pl', production: 500 }, { designCode: 'ykm.sm', production: 1000 }],
  codeWiseProductionTimeline: [{ designCode: 'Never sum timeline', production: 999999 }],
} }));
docs.push({ _id: 'old', lineStats: { ...structuredClone(docs[0].lineStats), updatedAt: '2026-11-14T08:00:00Z', codeWiseUpdatedAt: '2026-11-14T08:00:01Z', production: 99 } });
docs.push({ lineStats: { ...docs[0].lineStats, lineName: 'Glaze Line 2' } }, { lineStats: { ...docs[0].lineStats, lineName: 'Kiln 3' } });
const accounts = {
  manager: { _id: 'manager', role: 'Manager', enabled: true, accountGeneration: 'm' },
  admin: { _id: 'admin', role: 'Admin', enabled: true, accountGeneration: 'a' },
  supervisor: { _id: 'supervisor', role: 'Line Supervisor', enabled: true, accountGeneration: 's' },
  disabled: { _id: 'disabled', role: 'Manager', enabled: false, accountGeneration: 'd' },
};
let registrations = Object.values(accounts).map((u, i) => ({ _id: String(100 + i), approved: true, ruhanexUsername: u._id, ruhanexAccountGeneration: u.accountGeneration, approvalRevision: 'r' + i }));
registrations.push({ _id: '200', approved: false, ruhanexUsername: 'manager', ruhanexAccountGeneration: 'm', approvalRevision: 'pending' });
const reports = new Map(); const sends = [];
let failSend = false, revoke = false;
const path = (o, key) => key.split('.').reduce((value, k) => value?.[k], o);
const match = (row, query) => Object.entries(query).every(([key, value]) => value && typeof value === 'object' && !(value instanceof Date) ?
  Object.hasOwn(value, '$ne') ? path(row, key) !== value.$ne : Object.hasOwn(value, '$lte') ? path(row, key) <= value.$lte : false : path(row, key) === value);
const assign = (row, fields) => {
  for (const [key, value] of Object.entries(fields || {})) {
    const keys = key.split('.'); let dest = row;
    for (const name of keys.slice(0, -1)) dest = dest[name] ||= {};
    dest[keys.at(-1)] = structuredClone(value);
  }
};
function db(msg) {
  const [q, update, options] = msg.payload;
  switch (msg.shiftReportDb) {
    case 'shifts.find': return structuredClone(docs.filter(d => match(d, q)));
    case 'telegram.find': return structuredClone(registrations.filter(r => match(r, q)));
    case 'telegram.findOne':
      if (revoke) registrations.find(r => r._id === '100').approved = false;
      return structuredClone(registrations.find(r => match(r, q)) || null);
    case 'users.findOne': return structuredClone(accounts[q._id] || null);
    case 'reports.findOne': return structuredClone(reports.get(q._id) || null);
    case 'reports.updateOne': {
      let row = reports.get(q._id);
      if (!row && options?.upsert) { row = {}; assign(row, update.$setOnInsert); reports.set(q._id, row); return { acknowledged: true, upsertedCount: 1, matchedCount: 0 }; }
      const matched = row && match(row, q); if (matched) assign(row, update.$set);
      return { acknowledged: true, matchedCount: matched ? 1 : 0 };
    }
    default: throw new Error(msg.shiftReportDb);
  }
}
async function run(input) {
  let result = shiftReportStep(input, env, flow, tools, now);
  if (!result) return null;
  for (let i = 0; i < 500; i++) {
    const [pendingDb, http, output] = result;
    if (output) { assert.ok(!JSON.stringify(output).includes('fake_secret')); return output; }
    const msg = Array.isArray(pendingDb) ? pendingDb[0] : pendingDb || http;
    if (!msg) return null;
    if (http) { sends.push(JSON.parse(msg.payload)); msg.statusCode = failSend ? 503 : 200; msg.payload = failSend ? { ok: false } : { ok: true }; }
    else msg.payload = db(msg);
    result = shiftReportStep(msg, env, flow, tools, now);
  }
  throw new Error('Unexpected report state loop');
}
const event = () => ({ _msgid: 'trigger', shiftReportEvent: 'saved', codeWiseTarget: { shift: '06-14', shiftDate: '2026-11-14' }, payload: { acknowledged: true, matchedCount: 1 } });
const failedAck = event(); failedAck.payload.matchedCount = 0;
assert.equal(await run(failedAck), null);
const missingCode = docs[1].lineStats.codeWiseUpdatedAt; delete docs[1].lineStats.codeWiseUpdatedAt;
assert.match((await run(event())).payload.description, /Waiting for completed/);
assert.equal(sends.length, 0);
docs[1].lineStats.codeWiseUpdatedAt = missingCode; now += 31000;
await run({ shiftReportEvent: 'tick' });
assert.equal(sends.length, 3); assert.deepEqual(sends.map(s => s.chat_id), ['100', '101', '102']); assert.equal(sends[0].parse_mode, 'HTML');
assert.match(sends[0].text, /2,000 m²/); assert.match(sends[0].text, /90% of target/); assert.match(sends[0].text, /75%/); assert.match(sends[0].text, /200 min/);
assert.ok(!sends[0].text.includes('Glaze Line 2') && !sends[0].text.includes('Kiln 3') && !sends[0].text.includes('Never sum timeline'));
assert.equal((sends[0].text.match(/Yk,pl — 1,000 m²/g) || []).length, 7);
await run(event()); assert.equal(sends.length, 3);
context = new Map(); await run(event()); assert.equal(sends.length, 3); // Mongo dedup survives local context reset.
reports.clear(); context = new Map(); failSend = true;
await run(event()); assert.equal(reports.values().next().value.status, 'sending');
now += 301000; failSend = false; await run({}); assert.equal(reports.values().next().value.status, 'sent');
reports.clear(); context = new Map(); revoke = true; const before = sends.length;
await run(event()); assert.equal(sends.length, before + 2); revoke = false;
// Long reports remain valid HTML messages; escape untrusted design labels.
const many = tools.select(docs);
many.get('Glaze Line 1').stats.codeWiseProduction = Array.from({ length: 200 }, (_, i) => ({ designCode: 'Code <&> ' + i, production: i }));
many.get('Kiln 1').stats.targetProduction = 0;
const parts = tools.format('2026-11-14', '06-14', many);
assert.ok(parts.length > 1 && parts.every(p => p.length < 4096));
assert.ok(parts.join('').includes('Code &lt;&amp;&gt;') && !parts.join('').includes('Infinity'));
console.log('PASS: Colombo shift boundaries, enrichment gate, seven-line/code formatting, approved Manager/Admin/Supervisor delivery, Mongo dedup/retry, revocation and safe message lengths. No live messages sent.');
