import assert from 'node:assert/strict';
import { downtimeAlertTools, runtimeSnapshot, downtimeAlertStep, nodes, connector } from './build-telegram-downtime-alerts-flow.mjs';
const tools = downtimeAlertTools();
const ts = value => Date.parse('2026-11-16T' + value + '+05:30');
let now = ts('13:40:00');
const start = now;
const context = new Map(); const flow = { get: k => context.get(k), set: (k, v) => context.set(k, v) };
const source = new Map([['counterRestoreReady', true], ['downtimeRestoreReady', true], ['downtimeStates', { machine1: { status: 'Stopped', lastEventTs: start } }]]);
const sourceFlow = { get: k => source.get(k), set: (k, v) => source.set(k, v) };
const global = { get: k => k === 'counterConfig' ? { machine1: { enabled: true, line: 'Kiln 1' } } : undefined };
const env = { get: k => ({ TELEGRAM_BOT_TOKEN: '123:fake_token', DOWNTIME_ALERT_ENABLED: 'true' })[k] };
let stops = [{ device: 'machine1', stopStart_ts: start, stopStop_ts: null, reason: '' }];
const accounts = [
  { _id: 'manager', enabled: true, role: 'Manager', accountGeneration: 'm' },
  { _id: 'admin', enabled: true, role: 'Admin', accountGeneration: 'a' },
  { _id: 'supervisor', enabled: true, role: 'Line Supervisor', accountGeneration: 's' },
];
const registrations = accounts.map((u, i) => ({ _id: String(100 + i), approved: true, ruhanexUsername: u._id, ruhanexAccountGeneration: u.accountGeneration, approvalRevision: 'r' + i }));
registrations.push({ _id: '200', approved: false, ruhanexUsername: 'manager', ruhanexAccountGeneration: 'm', approvalRevision: 'pending' });
const episodes = [], events = [];
const sent = []; let failSend = false;
const get = (o, key) => key.split('.').reduce((value, k) => value?.[k], o);
const matches = (row, query) => Object.entries(query).every(([key, value]) => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('$ne' in value) return get(row, key) !== value.$ne;
    if ('$lte' in value) return get(row, key) <= value.$lte;
  }
  return get(row, key) === value;
});
function assign(row, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    const names = key.split('.'); let target = row;
    for (const name of names.slice(0, -1)) target = target[name] ||= {};
    target[names.at(-1)] = structuredClone(value);
  }
}
function database(msg) {
  const [table, op] = msg.dtDb.split('.');
  const rows = { stops, episodes, events, telegram: registrations, users: accounts }[table];
  const [query, update, options] = msg.payload;
  let row = rows.find(r => matches(r, query));
  if (op === 'find') {
    const result = rows.filter(r => matches(r, query));
    if (table === 'stops') result.sort((a, b) => b.stopStart_ts - a.stopStart_ts);
    return structuredClone(result.slice(0, update?.limit || 1000));
  }
  if (op === 'findOne') return structuredClone(row || null);
  if (op === 'updateOne') {
    let inserted = false;
    if (!row && options?.upsert) { row = { _id: query._id }; rows.push(row); assign(row, update.$setOnInsert); inserted = true; }
    if (row) assign(row, update.$set);
    return { acknowledged: true, matchedCount: row && !inserted ? 1 : 0, upsertedCount: inserted ? 1 : 0 };
  }
  throw Error(msg.dtDb);
}
async function poll() {
  const snapshot = runtimeSnapshot({}, sourceFlow, global, now);
  if (!snapshot) return;
  let result = downtimeAlertStep(snapshot, env, flow, tools, now);
  for (let i = 0; i < 200; i++) {
    if (!result) return;
    const [db, http, debug] = result;
    if (debug) { assert.ok(!JSON.stringify(debug).includes('fake_token')); return debug.payload; }
    const msg = db || http;
    if (http) { if (!failSend) sent.push(JSON.parse(msg.payload)); msg.statusCode = failSend ? 503 : 200; msg.payload = { ok: !failSend }; }
    else msg.payload = database(msg);
    result = downtimeAlertStep(msg, env, flow, tools, now);
  }
  throw Error('State loop');
}
now = ts('13:59:00'); await poll(); assert.equal(sent.length, 0);
// Boundary closure is not a physical recovery, even if the reopen write is delayed.
stops[0].stopStop_ts = ts('14:00:00'); now = ts('14:00:30'); await poll(); assert.equal(sent.length, 0);
stops.push({ device: 'machine1', stopStart_ts: ts('14:00:00'), stopStop_ts: null, reason: '' });
now = ts('14:10:00'); await poll(); assert.equal(sent.length, 1); assert.equal(sent[0].chat_id, '100');
assert.match(sent[0].text, /30 minutes/); assert.match(sent[0].text, /Reason not assigned yet/);
await poll(); assert.equal(sent.length, 1);
now += 15000; await poll(); assert.equal(sent.length, 1);
stops[1].reason = 'Motor overload'; now = ts('14:40:00'); await poll(); assert.equal(sent.length, 2);
assert.match(sent[1].text, /60 minutes/); assert.match(sent[1].text, /Motor overload/);
now = ts('15:10:00'); await poll(); assert.equal(sent.length, 3); assert.match(sent[2].text, /90 minutes/);
now = ts('15:40:00'); await poll(); assert.equal(sent.length, 4); assert.match(sent[3].text, /120 minutes/);
// A closed record alone still must not announce Running.
stops[1].stopStop_ts = ts('15:45:00'); now = ts('15:45:00'); await poll(); assert.equal(sent.length, 4);
source.get('downtimeStates').machine1 = { status: 'Running', lastEventTs: ts('15:45:00') };
await poll(); assert.equal(sent.length, 5); assert.match(sent.at(-1).text, /LINE RUNNING AGAIN/);
assert.match(sent.at(-1).text, /125 minutes/); await poll(); assert.equal(sent.length, 5);
// A later short stop is not the old alert episode and gets no recovery message.
now = ts('16:00:00'); source.get('downtimeStates').machine1 = { status: 'Stopped', lastEventTs: now };
stops.push({ device: 'machine1', stopStart_ts: now, stopStop_ts: null }); await poll();
now = ts('16:05:00'); stops.at(-1).stopStop_ts = now; source.get('downtimeStates').machine1 = { status: 'Running', lastEventTs: now };
await poll(); now += 60000; await poll(); assert.equal(sent.length, 5);
// A fresh episode survives a failed Telegram request and lease expiry.
now = ts('17:00:00'); source.get('downtimeStates').machine1 = { status: 'Stopped', lastEventTs: now };
stops.push({ device: 'machine1', stopStart_ts: now, stopStop_ts: null, reason: 'Maintenance' });
now = ts('17:31:00'); failSend = true; await poll(); assert.equal(sent.length, 5);
now += 15000; failSend = false; await poll(); assert.equal(sent.length, 5);
now += 301000; await poll(); assert.equal(sent.length, 6);
// Pending boundary recovery never produces an alert/recovery decision.
source.get('downtimeStates').machine1.pendingShiftRecovery = { oldShift: '14-22' };
now = ts('18:10:00'); await poll(); assert.equal(sent.length, 6);
const midnight = Date.parse('2026-11-17T06:00:00+05:30');
assert.equal(tools.chain([
  { stopStart_ts: midnight, stopStop_ts: null }, { stopStart_ts: midnight - 8 * 3600000, stopStop_ts: midnight },
]).start, midnight - 8 * 3600000);
assert.equal(tools.chain([{ stopStart_ts: ts('16:10:00'), stopStop_ts: null }, { stopStart_ts: ts('16:00:00'), stopStop_ts: ts('16:10:00') }]).start, ts('16:10:00'));
const ids = new Set(nodes.map(n => n.id));
for (const n of [...nodes, ...connector]) {
  if (n.type === 'function') new Function('msg', 'env', 'flow', 'global', 'node', n.func);
  if (nodes.includes(n)) for (const wire of n.wires || []) for (const id of wire) assert.ok(ids.has(id));
}
console.log('PASS: recurring alerts, shift-boundary stitching, Manager approval, deduplication, recovery on first confirmed Running snapshot without extra delay, short-stop suppression and retries. No live messages sent.');
