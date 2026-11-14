import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const nodes = JSON.parse(fs.readFileSync(new URL('./user-auth-vapid.flow.json', import.meta.url)));
for (const n of nodes.filter(n => n.type === 'function')) new Function('msg', 'env', 'global', 'Buffer', 'flow', 'node', n.func);
const ids = new Set(nodes.map(n => n.id));
assert.equal(ids.size, nodes.length);
for (const n of nodes) for (const wire of n.wires || []) for (const target of wire) assert.ok(ids.has(target), `Missing wire ${target}`);
assert.ok(!nodes.some(n => n.type === 'mongodb4-client'));
assert.ok(!JSON.stringify(nodes).includes('mongodb://'));
const router = nodes.find(n => n.property === 'authDb');
assert.equal(router.rules.length, router.outputs);
assert.equal(router.wires.length, router.outputs);
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const config = { AUTH_APP_ORIGIN: 'https://ruhanex.com', VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: Buffer.from(ecdh.getPrivateKey().toString('hex').padStart(64, '0'), 'hex').toString('base64url'), VAPID_SUBJECT: 'mailto:admin@example.com' };
const env = { get: key => config[key] };
const sent = [];
let upstreamStatus;
const webPush = { sendNotification: async (sub, payload, options) => {
  sent.push({ sub, payload: JSON.parse(payload), options });
  if (upstreamStatus) throw Object.assign(new Error('secret upstream details'), { statusCode: upstreamStatus });
} };
const advanceSource = nodes.find(n => n.name === 'Advance auth state').func;
const source = advanceSource.slice(advanceSource.lastIndexOf('(async function authStep'));
const step = new Function('global', `return ${source.slice(0, source.lastIndexOf(")(msg, env, global.get('crypto')") + 1)}`)({ get: key => key === 'webPush' ? webPush : crypto });
const contexts = new Map();
const flow = { get: key => contexts.get(key), set: (key, value) => contexts.set(key, value) };
const tables = { users: [], sessions: [], push: [], telegram: [{ _id: '123', approved: false }] };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const equal = (a, b) => a instanceof Date && b instanceof Date ? +a === +b : a === b;
const matches = (row, query) => Object.entries(query).every(([key, value]) => key === '$or' ? value.some(q => matches(row, q)) :
  value?.$gt ? row[key] > value.$gt : equal(row[key], value));
function database(kind, args) {
  const [table, op] = kind.split('.'); const [query, update, options] = args;
  const rows = tables[table]; const found = rows.find(row => matches(row, query));
  if (op === 'findOne') return structuredClone(found || null);
  if (op === 'find') return structuredClone(rows.filter(row => matches(row, query)).slice(0, update?.limit || 1000));
  if (op === 'updateMany') {
    for (const row of rows.filter(row => matches(row, query))) Object.assign(row, update.$set);
    return { acknowledged: true };
  }
  if (op === 'updateOne') {
    if (found) Object.assign(found, update.$set);
    else if (options?.upsert) rows.push({ ...query, ...structuredClone(update.$set) });
    if (found) for (const [key, value] of Object.entries(update.$inc || {})) found[key] += value;
    if (found) for (const key of Object.keys(update.$unset || {})) delete found[key];
    return { acknowledged: true, matchedCount: found ? 1 : 0 };
  }
  if (op === 'deleteMany' || op === 'deleteOne') {
    let deletedCount = 0;
    tables[table] = rows.filter(row => {
      if (matches(row, query) && (op === 'deleteMany' || !deletedCount)) { deletedCount++; return false; } return true;
    });
    return { acknowledged: true, deletedCount };
  }
  throw new Error(kind);
}
function account(username, role) {
  const token = crypto.randomBytes(32).toString('hex');
  tables.users.push({ _id: username, enabled: true, role, authVersion: 1, accountGeneration: username, mustChangePassword: false });
  tables.sessions.push({ _id: hash(token), username, accountGeneration: username, authVersion: 1, expiresAt: new Date(Date.now() + 3600000) });
  return token;
}
const alice = account('alice', 'Line Supervisor'); const bob = account('bobby', 'Manager'); const admin = account('admin', 'Admin');
async function request(action, token = alice, body = {}, headers = {}, params = {}) {
  let msg = { authAction: action, payload: body, req: { body, params, headers: { cookie: `ruhanex_session=${token}`,
    origin: config.AUTH_APP_ORIGIN, 'x-ruhanex-request': '1', ...headers } } };
  for (let i = 0; i < 20; i++) {
    const [pending, complete] = await step(msg, env, crypto, Buffer, flow);
    if (complete) return complete;
    msg = pending; msg.payload = database(msg.authDb, msg.payload);
  }
  throw new Error('State loop');
}
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys: {
  p256dh: config.VAPID_PUBLIC_KEY, auth: crypto.randomBytes(16).toString('base64url') } };
const body = { subscription, applicationServerKey: config.VAPID_PUBLIC_KEY, username: 'bobby' };
assert.equal((await request('telegramList', alice)).statusCode, 403);
assert.equal((await request('telegramList', admin)).payload.users.length, 1);
assert.equal((await request('telegramAssign', admin, { ruhanexUsername: 'alice' }, { origin: 'https://evil.example' }, { chatId: '123' })).statusCode, 403);
assert.equal((await request('telegramAssign', admin, { ruhanexUsername: 'missing' }, {}, { chatId: '123' })).statusCode, 400);
assert.equal((await request('telegramAssign', admin, { ruhanexUsername: 'alice' }, {}, { chatId: '999' })).statusCode, 404);
assert.equal((await request('telegramAssign', admin, { ruhanexUsername: 'alice' }, {}, { chatId: '123' })).statusCode, 200);
assert.equal(tables.telegram[0].approved, true); assert.equal(tables.telegram[0].ruhanexUsername, 'alice');
const revision = tables.telegram[0].approvalRevision;
assert.equal((await request('telegramRevoke', admin, {}, {}, { chatId: '123' })).statusCode, 200);
assert.equal(tables.telegram[0].approved, false); assert.notEqual(tables.telegram[0].approvalRevision, revision);
await request('telegramAssign', admin, { ruhanexUsername: 'alice' }, {}, { chatId: '123' });
assert.equal((await request('pushKey', '')).statusCode, 401);
assert.equal((await request('pushKey')).payload.publicKey, config.VAPID_PUBLIC_KEY);
assert.equal((await request('pushSubscribe', alice, body, { origin: 'https://evil.example' })).statusCode, 403);
assert.equal((await request('pushSubscribe', alice, body, { 'x-ruhanex-request': '' })).statusCode, 403);
for (const endpoint of ['https://127.0.0.1/private', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.example/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:443/x']) {
  assert.equal((await request('pushSubscribe', alice, { ...body, subscription: { ...subscription, endpoint } })).statusCode, 400);
}
assert.equal((await request('pushSubscribe', alice, { ...body, applicationServerKey: 'wrong' })).statusCode, 400);
const user = tables.users.find(u => u._id === 'alice');
user.mustChangePassword = true;
assert.equal((await request('pushSubscribe', alice, body)).statusCode, 403); user.mustChangePassword = false;
assert.equal((await request('pushSubscribe', alice, body)).statusCode, 200);
assert.equal(tables.push[0].username, 'alice');
assert.equal((await request('pushUnsubscribe', bob, { endpoint: subscription.endpoint })).statusCode, 200);
assert.equal(tables.push.length, 1);
assert.equal((await request('pushTest')).payload.accepted, 1);
assert.equal(sent[0].options.vapidDetails.privateKey, config.VAPID_PRIVATE_KEY);
assert.equal(sent[0].options.timeout, 10000);
assert.ok(!JSON.stringify((await request('pushTest')).payload).includes(config.VAPID_PRIVATE_KEY));
assert.equal((await request('pushTest')).statusCode, 429);
assert.equal((await request('pushTest', bob)).payload.accepted, 0);
// Same browser endpoint is reassigned atomically on account switching.
assert.equal((await request('pushSubscribe', bob, body)).statusCode, 200);
assert.equal(tables.push.length, 1); assert.equal(tables.push[0].username, 'bobby');
await request('pushUnsubscribe', alice, { endpoint: subscription.endpoint }); assert.equal(tables.push.length, 1);
contexts.clear(); upstreamStatus = 503;
assert.equal((await request('pushTest', bob)).payload.failed, 1); assert.equal(tables.push.length, 1);
contexts.clear(); upstreamStatus = 410;
assert.equal((await request('pushTest', bob)).payload.expired, 1); assert.equal(tables.push.length, 0);
upstreamStatus = undefined;
await request('pushSubscribe', bob, body);
tables.users.find(u => u._id === 'bobby').authVersion++;
assert.equal((await request('pushTest', bob)).statusCode, 401);
tables.users.find(u => u._id === 'bobby').authVersion--;
await request('logout', bob); assert.equal(tables.push.length, 1);
const runtimeGlobal = { get: key => key === 'webPush' ? webPush : crypto };
async function alarm(username, notification = { title: 'Machine alarm', body: 'Line 02 stopped.', data: { url: '/production' } }) {
  let msg = { username, payload: notification };
  let code = nodes.find(n => n.id === 'rx_vapid_internal_send').func;
  for (let i = 0; i < 15; i++) {
    const [pending, complete] = await new Promise((resolve, reject) => {
      new Function('msg', 'env', 'global', 'Buffer', 'flow', 'node', code)(msg, env, runtimeGlobal, Buffer, flow,
        { send: resolve, done: () => {}, error: reject });
    });
    if (complete) return complete;
    msg = pending; msg.payload = database(msg.authDb, msg.payload); code = advanceSource;
  }
  throw new Error('Internal state loop');
}
assert.equal((await alarm('bobby')).payload.accepted, 1); // No session remains after logout.
const bobUser = tables.users.find(u => u._id === 'bobby');
bobUser.enabled = false;
assert.equal((await alarm('bobby')).statusCode, 403); bobUser.enabled = true;
bobUser.accountGeneration = 'recreated';
assert.equal((await alarm('bobby')).payload.accepted, 0); bobUser.accountGeneration = 'bobby';
assert.equal((await alarm('bobby', { title: 'Alarm', body: 'Test', data: { url: '//evil.example' } })).statusCode, 400);
await request('pushSubscribe', alice, body);
await request('delete', admin, {}, {}, { username: 'alice' }); assert.equal(tables.push.length, 0);
assert.equal(tables.telegram[0].approved, false);
// Password changes invalidate login sessions but preserve notification consent.
const charlie = account('charlie', 'Manager');
const charlieUser = tables.users.find(u => u._id === 'charlie');
charlieUser.passwordSalt = 'test-salt';
charlieUser.passwordHash = crypto.scryptSync('Old-password', 'test-salt', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
await request('pushSubscribe', charlie, body);
assert.equal((await request('password', charlie, { currentPassword: 'Old-password', newPassword: 'New-password' })).statusCode, 200);
assert.equal(tables.push.length, 1);
assert.equal((await alarm('charlie')).payload.accepted, 1);
const dave = account('davidd', 'Manager');
await request('pushSubscribe', dave, body);
tables.sessions.find(s => s._id === hash(dave)).expiresAt = new Date(0);
assert.equal((await request('pushTest', dave)).statusCode, 401);
assert.equal((await alarm('davidd')).payload.accepted, 1);
// Disable with a fresh session for the same account, without registering again.
const newToken = crypto.randomBytes(32).toString('hex');
tables.sessions.push({ _id: hash(newToken), username: 'davidd', accountGeneration: 'davidd', authVersion: 1, expiresAt: new Date(Date.now() + 100000) });
assert.equal((await request('pushUnsubscribe', newToken, { endpoint: subscription.endpoint })).statusCode, 200);
assert.equal((await alarm('davidd')).payload.accepted, 0);
config.VAPID_PRIVATE_KEY = crypto.randomBytes(32).toString('base64url');
assert.equal((await request('pushKey', admin)).statusCode, 503);
console.log('PASS: generated syntax/wires, auth/origin enforcement, VAPID pairing, ownership, persistent delivery after logout/expiry/password change, explicit disable from a new session, disabled/deleted/recreated accounts, safe alarm URL, expired endpoint cleanup.');
