import assert from 'node:assert/strict';
import { telegramAlarmStep } from './telegram-alarm-runtime.mjs';
const env = { get: key => key === 'TELEGRAM_BOT_TOKEN' ? '123:fake_token' : undefined };
let account = { _id: 'alice', enabled: true, role: 'Manager', accountGeneration: 'generation1' };
let records = [
  { _id: '123', approved: true, ruhanexUsername: 'alice', ruhanexAccountGeneration: 'generation1', approvalRevision: 'rev1' },
  { _id: '456', approved: false, ruhanexUsername: 'alice', ruhanexAccountGeneration: 'generation1', approvalRevision: 'rev2' },
];
let sent = [];
function run({ revokeBeforeSend = false } = {}) {
  let msg = { username: 'alice', payload: { title: 'Alarm', body: 'Line stopped' } };
  for (let i = 0; i < 30; i++) {
    const [db, http, done] = telegramAlarmStep(msg, env);
    if (done) { assert.ok(!JSON.stringify(done).includes('fake_token')); return done.payload; }
    msg = db || http;
    if (http) { sent.push(JSON.parse(msg.payload)); msg.statusCode = 200; msg.payload = { ok: true }; }
    else {
      const [query] = msg.payload;
      if (msg.tgAlarmDb === 'users.findOne') msg.payload = structuredClone(account);
      else {
        if (revokeBeforeSend && msg.tgAlarmDb === 'telegram.findOne') records[0].approved = false;
        const matches = records.filter(row => Object.entries(query).every(([k, v]) => row[k] === v));
        msg.payload = structuredClone(msg.tgAlarmDb === 'telegram.find' ? matches : matches[0] || null);
      }
    }
  }
  throw new Error('State loop');
}
assert.equal(run().accepted, 1); assert.equal(sent.length, 1); assert.equal(sent[0].chat_id, '123');
records[0].approved = false; sent = []; assert.equal(run().accepted, 0); assert.equal(sent.length, 0);
records[0].approved = true; account.enabled = false; assert.equal(run().accepted, 0);
account.enabled = true; account.accountGeneration = 'recreated'; assert.equal(run().accepted, 0);
account.accountGeneration = 'generation1'; assert.equal(run({ revokeBeforeSend: true }).accepted, 0);
assert.equal(sent.length, 0);
console.log('PASS: only approved alarms, revoked/pending/disabled/recreated accounts blocked and approval rechecked before send. No Telegram messages sent.');
