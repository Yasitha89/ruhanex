import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { authStep, nodes, checkSettingsPermission } from './build-user-auth-flow.mjs';
import { canAccessPage } from '../src/utils/permissions.js';

const config = { AUTH_APP_ORIGIN: 'https://ruhanex.com', AUTH_BOOTSTRAP_ENABLED: 'true', BOOTSTRAP_ADMIN_USERNAME: 'administrator', BOOTSTRAP_ADMIN_PASSWORD: 'Initial-password-123' };
const env = { get: key => config[key] };
const context = new Map();
const flow = { get: key => context.get(key), set: (key, value) => context.set(key, value) };
const tables = { users: new Map(), sessions: new Map() };
function database(kind, args) {
  const [table, operation] = kind.split('.');
  const map = tables[table];
  const [query, update, options] = args;
  const found = map.get(query._id);
  const matches = found && Object.entries(query).every(([key, value]) => value?.$gt ? found[key] > value.$gt : found[key] === value);
  if (operation === 'find') return [...map.values()].map(value => structuredClone(value));
  if (operation === 'findOne') return matches ? structuredClone(found) : null;
  if (operation === 'insertOne') {
    if (found) throw new Error('E11000 duplicate key');
    map.set(query._id, structuredClone(query));
    return { acknowledged: true };
  }
  if (operation === 'deleteOne') { const deleted = map.delete(query._id); return { acknowledged: true, deletedCount: deleted ? 1 : 0 }; }
  if (operation === 'deleteMany') {
    for (const [key, value] of map) if (value.username === query.username) map.delete(key);
    return { acknowledged: true };
  }
  if (operation === 'updateOne') {
    if (!found && options?.upsert) { map.set(query._id, structuredClone(update.$setOnInsert)); return { acknowledged: true, upsertedCount: 1 }; }
    if (matches) {
      Object.assign(found, update.$set || {});
      for (const [key, value] of Object.entries(update.$inc || {})) found[key] += value;
    }
    return { acknowledged: true, matchedCount: matches ? 1 : 0, upsertedCount: 0 };
  }
  throw new Error(kind);
}
async function request(action, body = {}, cookie = '', extra = {}, params = {}) {
  let msg = { authAction: action, payload: body, ...(action === 'bootstrap' ? {} : { req: { body, params, headers: { 'x-ruhanex-request': '1', origin: config.AUTH_APP_ORIGIN, cookie, ...extra } } }) };
  for (let count = 0; count < 15; count++) {
    const [pending, complete] = await authStep(msg, env, crypto, Buffer, flow);
    if (complete) return complete;
    msg = pending;
    msg.payload = database(msg.authDb, msg.payload);
  }
  throw new Error('State loop');
}
const login = (username, password) => request('login', { username, password });
const cookieOf = result => result.headers['Set-Cookie'].split(';')[0];
const authorize = (cookie, path, method = 'GET') => request('authorize', {}, cookie, { 'x-original-uri': path, 'x-original-method': method, 'x-original-origin': config.AUTH_APP_ORIGIN });
assert.equal((await request('bootstrap')).payload.created, true);
const originalHash = tables.users.get('administrator').passwordHash;
assert.equal((await request('bootstrap')).payload.created, false);
assert.equal(tables.users.get('administrator').passwordHash, originalHash);
assert.equal((await login('administrator', 'incorrect')).statusCode, 401);
let result = await login('administrator', 'Initial-password-123');
let admin = cookieOf(result);
assert.match(result.headers['Set-Cookie'], /HttpOnly; SameSite=Strict.*Secure/);
assert.equal(result.payload.user.mustChangePassword, true);
assert.equal(result.payload.user.passwordHash, undefined);
assert.equal(tables.sessions.has(admin.split('=')[1]), false);
assert.equal((await authorize(admin, '/api/production/monthly-summary')).statusCode, 403);
assert.equal((await request('password', { currentPassword: 'wrong', newPassword: 'Replacement-password-123' }, admin)).statusCode, 400);
assert.equal((await request('password', { currentPassword: 'Initial-password-123', newPassword: 'Replacement-password-123' }, admin)).statusCode, 200);
assert.equal((await request('me', {}, admin)).statusCode, 401);
admin = cookieOf(await login('administrator', 'Replacement-password-123'));
assert.equal((await authorize(admin, '/api/api/devices', 'POST')).statusCode, 204);
for (const role of ['Manager', 'Line Supervisor']) {
  const username = role.toLowerCase().replaceAll(' ', '') + 'user';
  assert.equal((await request('create', { username, displayName: role, role, password: 'Initial-password-123' }, admin)).statusCode, 201);
  let session = cookieOf(await login(username, 'Initial-password-123'));
  await request('password', { currentPassword: 'Initial-password-123', newPassword: 'Replacement-password-123' }, session);
  session = cookieOf(await login(username, 'Replacement-password-123'));
  assert.equal((await request('create', {}, session)).statusCode, 403);
  assert.equal((await request('list', {}, session)).statusCode, 403);
  assert.equal((await authorize(session, '/api/production/monthly-summary')).statusCode, 204);
  assert.equal((await authorize(session, '/api/downtime-codes', 'POST')).statusCode, 403);
  assert.equal((await authorize(session, '/api/getEnergyOverview')).statusCode, role === 'Line Supervisor' ? 403 : 204);
  assert.equal((await authorize(session, '/api/line-setting', 'POST')).statusCode, role === 'Line Supervisor' ? 403 : 204);
  assert.equal((await request('logout', {}, session)).statusCode, 200);
  assert.equal((await request('me', {}, session)).statusCode, 401);
}
assert.equal((await request('list', {}, admin)).payload.users.length, 3);
assert.equal((await request('create', { username: 'shortpass', displayName: 'Short Password', role: 'Line Supervisor', password: 'abc' }, admin)).statusCode, 400);
assert.equal((await request('create', { username: 'shortpass', displayName: 'Short Password', role: 'Line Supervisor', password: 'abcd' }, admin)).statusCode, 201);
const shortSession = cookieOf(await login('shortpass', 'abcd'));
assert.equal((await request('password', { currentPassword: 'abcd', newPassword: 'xyz' }, shortSession)).statusCode, 400);
assert.equal((await request('password', { currentPassword: 'abcd', newPassword: 'wxyz' }, shortSession)).statusCode, 200);
assert.equal((await login('shortpass', 'wxyz')).statusCode, 200);
tables.users.get('shortpass').role = 'JE';
// MongoDB can serialize undefined generation fields as null for legacy users.
delete tables.users.get('shortpass').accountGeneration;
const legacyLogin = await login('shortpass', 'wxyz');
const legacyToken = cookieOf(legacyLogin).split('=')[1];
const legacySession = tables.sessions.get(crypto.createHash('sha256').update(legacyToken).digest('hex'));
assert.equal(legacySession.accountGeneration, null);
assert.equal((await request('me', {}, cookieOf(legacyLogin))).statusCode, 200);
tables.users.get('shortpass').accountGeneration = 'replacement-account-generation';
assert.equal((await request('me', {}, cookieOf(legacyLogin))).statusCode, 401);
delete tables.users.get('shortpass').accountGeneration;
assert.equal(legacyLogin.payload.user.role, 'Line Supervisor');
assert.equal((await authorize(cookieOf(legacyLogin), '/api/getEnergyOverview')).statusCode, 403);
assert.equal((await authorize(cookieOf(legacyLogin), '/api/production/monthly-summary')).headers['X-Ruhanex-Role'], 'Line Supervisor');
assert.equal((await request('login', { username: 'administrator', password: 'Replacement-password-123' }, '', { origin: 'https://evil.example' })).statusCode, 403);
assert.equal((await request('create', {}, admin, { 'x-ruhanex-request': '' })).statusCode, 403);
const token = admin.split('=')[1];
config.AUTH_APP_ORIGINS = 'https://ruhanex.com, http://localhost:5173';
config.AUTH_APP_ORIGINS += ',https://localhost:5173';
assert.equal((await request('delete', {}, admin, { origin: 'https://localhost:5173' }, { username: 'missinglocaluser' })).statusCode, 404);
assert.equal((await request('login', { username: 'shortpass', password: 'wxyz' }, '', { origin: 'http://localhost:5173' })).statusCode, 200);
assert.equal((await request('me', {}, admin)).statusCode, 200);
assert.equal((await request('authorize', {}, admin, { 'x-original-uri': '/api/api/ai/chat', 'x-original-method': 'POST', 'x-original-origin': 'http://localhost:5173' })).statusCode, 204);
assert.equal((await request('authorize', {}, admin, { 'x-original-uri': '/api/api/ai/chat', 'x-original-method': 'POST', 'x-original-origin': 'http://localhost:5174' })).statusCode, 403);
assert.equal((await request('login', { username: 'shortpass', password: 'wxyz' }, '', { origin: 'https://ruhanex.com.evil.example' })).statusCode, 403);
delete config.AUTH_APP_ORIGINS;
assert.equal((await request('delete', {}, admin, {}, { username: 'administrator' })).statusCode, 403);
assert.equal((await request('delete', {}, admin, {}, { username: 'missinguser' })).statusCode, 404);
const deletedCookie = cookieOf(await login('shortpass', 'wxyz'));
assert.equal((await request('delete', {}, deletedCookie, {}, { username: 'manageruser' })).statusCode, 403);
assert.equal((await request('delete', {}, admin, { origin: 'https://evil.example' }, { username: 'shortpass' })).statusCode, 403);
assert.equal((await request('delete', {}, admin, {}, { username: 'shortpass' })).statusCode, 200);
assert.equal((await request('me', {}, deletedCookie)).statusCode, 401);
assert.equal((await login('shortpass', 'wxyz')).statusCode, 401);
assert.ok(![...tables.sessions.values()].some(session => session.username === 'shortpass'));
tables.sessions.get(crypto.createHash('sha256').update(token).digest('hex')).expiresAt = new Date(0);
assert.equal((await request('me', {}, admin)).statusCode, 401);
const settings = { stopDelayMs: 1000, maxPulseGapMs: 100, requiredRunTimeMs: 1000 };
const guard = body => checkSettingsPermission({ req: { headers: { 'x-ruhanex-role': 'Manager' } }, payload: { line: 'Keda 1', ...body } }, { get: () => ({ 'Keda 1': settings }) });
assert.ok(guard(settings)[0]);
assert.equal(guard({ ...settings, stopDelayMs: 1 })[1].statusCode, 403);
for (const role of ['Admin', 'Manager', 'Line Supervisor']) {
  assert.equal(canAccessPage(role, '/dashboard'), true);
  assert.equal(canAccessPage(role, '/users'), role === 'Admin');
  assert.equal(canAccessPage(role, '/settings'), role !== 'Line Supervisor');
}
for (const node of nodes.filter(node => node.type === 'function')) new Function('msg', 'env', 'global', 'flow', 'Buffer', 'node', node.func);
console.log('User auth tests passed: password hashing, first login, session invalidation, roles, CSRF, expiry, logout, settings guard and generated functions.');
