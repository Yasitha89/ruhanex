import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bridgeStep, typingRequest, nodes } from './build-telegram-ruhana-flow.mjs';

const ids = new Set(nodes.map(n => n.id));
for (const n of nodes) {
  if (n.type === 'function') new Function('msg', 'env', 'flow', 'node', n.func);
  for (const wire of n.wires || []) for (const target of wire) assert.ok(ids.has(target));
}
const vars = { TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN', AI_CHAT_BEARER_TOKEN: 'private-ai-secret',
  TELEGRAM_RUHANA_ENABLED: 'true', TELEGRAM_RUHANA_USERS: '{"123":"supervisor","456":"manager"}' };
const env = { get: key => vars[key] };
const values = new Map(); const flow = { get: key => values.get(key), set: (key, value) => values.set(key, value) };
let clock = 1800000000000;
const accounts = {
  supervisor: { _id: 'supervisor', role: 'Line Supervisor', enabled: true, authVersion: 1, accountGeneration: 'a' },
  manager: { _id: 'manager', role: 'Manager', enabled: true, authVersion: 1, accountGeneration: 'b' },
};
const registrations = new Map([
  ['123', { _id: '123', approved: true, ruhanexUsername: 'supervisor', ruhanexAccountGeneration: 'a', approvalRevision: 'r1' }],
  ['456', { _id: '456', approved: true, ruhanexUsername: 'manager', ruhanexAccountGeneration: 'b', approvalRevision: 'r2' }],
]);
const aiRequests = [], replies = [];
let aiFailure = false, telegramFailure = false, changeDuringAnswer = false, revokeDuringAnswer = false;
let aiAnswer = 'Production is available.';
const update = (id, chat, text, type = 'private') => ({ update_id: id, message: { chat: { id: chat, type }, from: { id: chat }, text, date: clock / 1000 } });
async function batch(updates) {
  let result = bridgeStep({ _msgid: 'poll-' + clock }, env, flow, clock);
  for (let i = 0; i < 100; i++) {
    if (!result) return null;
    const [tg, ai, db, safe] = result;
    if (safe) { assert.ok(!JSON.stringify(safe).includes('TEST_TOKEN')); return safe; }
    const msg = tg || ai || db;
    if (tg) {
      const body = JSON.parse(msg.payload);
      if (msg.url.endsWith('/getUpdates')) {
        // A second timer tick cannot start a concurrent poll.
        assert.equal(bridgeStep({ _msgid: 'competing' }, env, flow, clock), null);
        msg.payload = { ok: true, result: updates };
      } else {
        replies.push(body);
        msg.payload = telegramFailure ? { ok: false, error_code: 429, parameters: { retry_after: 30 } } : { ok: true };
      }
      msg.statusCode = 200;
    } else if (ai) {
      aiRequests.push({ headers: structuredClone(msg.headers), body: JSON.parse(msg.payload) });
      msg.payload = { success: !aiFailure, answer: aiAnswer }; msg.statusCode = aiFailure ? 503 : 200;
      if (changeDuringAnswer) accounts.supervisor.enabled = false;
      if (revokeDuringAnswer) registrations.get('123').approved = false;
    } else {
      const [query, update] = msg.payload;
      if (msg.tgDb === 'telegram.updateOne') {
        const row = registrations.get(query._id) || { _id: query._id, ...update.$setOnInsert };
        Object.assign(row, update.$set); registrations.set(query._id, row);
        msg.payload = { acknowledged: true, matchedCount: 1 };
      } else if (msg.tgDb === 'telegram.findOne') msg.payload = structuredClone(registrations.get(query._id) || null);
      else msg.payload = structuredClone(accounts[query._id] || null);
    }
    result = bridgeStep(msg, env, flow, clock);
  }
  throw new Error('Unexpected state loop');
}
await batch([update(1, 999, 'secret'), update(2, 123, 'group text', 'group'), update(3, 123, '/start')]);
assert.equal(aiRequests.length, 0); assert.ok(replies.some(r => /Ruhana/.test(r.text)));
assert.equal(registrations.get('999').approved, false);
assert.equal(registrations.get('123').approved, true); // Registration refresh cannot overwrite approval.
clock += 15000;
await batch([update(4, 123, 'How is production?')]);
assert.equal(aiRequests[0].headers['X-Ruhanex-Role'], 'Line Supervisor');
assert.equal(aiRequests[0].headers.Authorization, 'Bearer private-ai-secret');
assert.equal(aiRequests[0].body.history.length, 0);
assert.equal(replies.at(-1).chat_id, '123');
clock += 15000; await batch([update(5, 123, 'Compare yesterday')]);
assert.equal(aiRequests[1].body.history.length, 2);
clock += 15000; await batch([update(6, 456, 'Compare yesterday')]);
assert.equal(aiRequests[2].body.history.length, 0);
clock += 15000; await batch([update(7, 123, '/reset')]);
assert.equal(values.get('tgRuhana.history.123'), null);
clock += 15000; accounts.supervisor.enabled = false;
const before = aiRequests.length;
await batch([update(8, 123, 'Reveal data')]); assert.equal(aiRequests.length, before);
accounts.supervisor.enabled = true;
clock += 15000; changeDuringAnswer = true;
await batch([update(9, 123, 'Question')]); assert.match(replies.at(-1).text, /access changed/);
changeDuringAnswer = false; accounts.supervisor.enabled = true;
clock += 15000; revokeDuringAnswer = true;
await batch([update(91, 123, 'Question')]); assert.match(replies.at(-1).text, /approval changed/);
revokeDuringAnswer = false; registrations.get('123').approved = true;
clock += 15000; aiFailure = true;
await batch([update(10, 123, 'Question')]); assert.match(replies.at(-1).text, /could not answer/);
aiFailure = false; clock += 15000; aiAnswer = '😀'.repeat(8000);
const replyStart = replies.length;
await batch([update(11, 123, 'Long answer')]);
assert.equal(replies.length - replyStart, 5);
assert.ok(replies.slice(replyStart).every(r => r.text.length <= 3500 && r.parse_mode === 'HTML'));
clock += 15000; aiAnswer = '**1729** & <script> __tiles__ `x < y`';
await batch([update(12, 123, 'Formatted answer')]);
assert.equal(replies.at(-1).text, '<b>1729</b> &amp; &lt;script&gt; <b>tiles</b> <code>x &lt; y</code>');
clock += 15000; aiAnswer = '**' + 'A'.repeat(8000) + '**';
const formattedStart = replies.length;
await batch([update(13, 123, 'Long bold answer')]);
const formatted = replies.slice(formattedStart);
assert.equal(formatted.length, 3);
assert.ok(formatted.every(r => r.text.startsWith('<b>') && r.text.endsWith('</b>')));
assert.equal(formatted.map(r => r.text.slice(3, -4)).join(''), 'A'.repeat(8000));
clock += 15000; aiAnswer = '```js\n' + '<&>'.repeat(2000) + '\n```';
const codeStart = replies.length;
await batch([update(14, 123, 'Long code answer')]);
assert.ok(replies.slice(codeStart).every(r => r.text.startsWith('<pre>') && r.text.endsWith('</pre>') && !r.text.includes('<&>')));
clock += 15000; telegramFailure = true;
const failed = await batch([update(15, 123, '/help')]);
assert.equal(failed.payload.ok, false); assert.equal(values.get('tgRuhana.offset'), 15);
assert.equal(values.get('tgRuhana.backoffUntil'), clock + 30000);
assert.equal(values.get('tgRuhana.lock'), null);
telegramFailure = false; clock += 31000;
await batch([update(16, 123, '/help')]);
registrations.get('123').approved = false; clock += 15000;
const requestsBeforeRevoke = aiRequests.length; await batch([update(17, 123, 'Not authorized')]);
assert.equal(aiRequests.length, requestsBeforeRevoke); assert.match(replies.at(-1).text, /Waiting for administrator approval/);

// Verify the delivered AI flow enforces the role on tool exposure and execution.
const aiNodes = JSON.parse(fs.readFileSync(new URL('./production-ai-chat.flow.json', import.meta.url)));
const init = new Function('msg', 'env', aiNodes.find(n => n.id === 'ai_chat_init').func);
const aiEnv = { get: key => ({ AI_CHAT_BEARER_TOKEN: 'token', OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model', PRODUCTION_API_BASE_URL: 'http://127.0.0.1:1880' })[key] };
const [prepared] = init({ req: { headers: { authorization: 'Bearer token', 'x-ruhanex-role': 'Line Supervisor' } }, payload: { message: 'Question' } }, aiEnv);
assert.ok(!prepared.aiChat.tools.some(t => t.name === 'get_energy_usage'));
assert.ok(prepared.aiChat.tools.some(t => t.name === 'get_live_production'));
prepared.aiChat.queue = [{ name: 'get_energy_usage', arguments: '{}', call_id: 'forbidden' }];
const prepare = new Function('msg', 'env', aiNodes.find(n => n.id === 'ai_chat_tool').func);
prepare(prepared, aiEnv);
assert.match(prepared.aiChat.input.at(-1).output, /not available/);
// Exercise the actual start/stop/error Function code and periodic heartbeat.
const startTyping = new Function('msg', 'env', 'flow', nodes.find(n => n.id === 'rx_tgra_typing_start').func);
const stopTyping = new Function('msg', 'env', 'flow', nodes.find(n => n.id === 'rx_tgra_typing_stop').func);
const release = new Function('msg', 'env', 'flow', nodes.find(n => n.id === 'rx_tgra_error').func);
const actualNow = Date.now();
values.set('tgRuhana.lock', { id: 'typing-test', until: actualNow + 300000 });
const original = { tg: { id: 'typing-test', chatId: '123' }, headers: { Authorization: 'ai-secret' }, payload: 'ai-question' };
const [aiMessage, typing] = startTyping(original, env, flow);
assert.equal(aiMessage, original);
assert.equal(JSON.parse(typing.payload).action, 'typing');
assert.equal(JSON.parse(typing.payload).chat_id, '123');
assert.ok(!JSON.stringify(typing).includes('ai-secret') && !typing.tg);
assert.ok(typingRequest(env, flow, actualNow + 4000));
assert.equal(stopTyping(original, env, flow), original);
assert.equal(typingRequest(env, flow), null);
startTyping(original, env, flow); release(original, env, flow);
assert.equal(typingRequest(env, flow), null);
values.set('tgRuhana.lock', { id: 'typing-test', until: actualNow + 300000 });
startTyping(original, env, flow);
assert.equal(typingRequest(env, flow, actualNow + 260000), null);
assert.equal(values.get('tgRuhana.typing'), null);
assert.equal(nodes.find(n => n.id === 'rx_tgra_typing_tick').repeat, '4');
assert.ok(!nodes.find(n => n.id === 'rx_tgra_catch').scope.includes('rx_tgra_typing_http'));
console.log('PASS: wiring, permissions, history/reset, HTML formatting/chunks, retry/backoff, immediate/periodic typing, completion/error cleanup and typing expiry. No live messages sent.');
