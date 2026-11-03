import fs from 'node:fs';

// Self-contained runtime embedded in the exported Function nodes.
export async function authStep(msg, env, crypto, Buffer, flow) {
  const roles = ['Admin', 'Manager', 'JE'];
  const secure = env.get('AUTH_COOKIE_SECURE') !== 'false';
  const cookie = (token, age = 28800) => `ruhanex_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const finish = (status, data, headers = {}) => {
    msg.statusCode = status;
    msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers };
    msg.payload = data;
    delete msg.auth; delete msg.authDb;
    return [null, msg];
  };
  const fail = (status, error) => finish(status, { success: false, error }, status === 401 ? { 'Set-Cookie': cookie('', 0) } : {});
  if (!crypto) return fail(503, 'Authentication crypto is not configured.');
  const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const derive = (password, salt) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
  const passwordHash = async (password) => {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, hash: (await derive(password, salt)).toString('hex') };
  };
  const verify = async (password, account) => {
    const key = await derive(password, account?.passwordSalt || 'ruhanex-invalid-account-dummy-salt');
    const expected = Buffer.from(account?.passwordHash || '00'.repeat(64), 'hex');
    return expected.length === key.length && crypto.timingSafeEqual(expected, key) && Boolean(account);
  };
  const publicUser = (u) => ({ username: u._id, displayName: u.displayName, role: u.role, mustChangePassword: u.mustChangePassword === true, enabled: u.enabled === true, createdAt: u.createdAt });
  const validPassword = (p) => typeof p === 'string' && p.length >= 4 && p.length <= 128;
  const db = (kind, payload, next) => { msg.authDb = kind; msg.payload = payload; msg.auth.stage = next; return [msg, null]; };
  if (!msg.auth) {
    msg.auth = { action: msg.authAction, stage: 'start', body: { ...(msg.req?.body || msg.payload || {}) } };
  }
  const state = msg.auth;
  const body = state.body;
  if (state.stage === 'start') {
    if (state.action === 'bootstrap') {
      if (env.get('AUTH_BOOTSTRAP_ENABLED') !== 'true') return fail(403, 'Enable AUTH_BOOTSTRAP_ENABLED for a one-time manual bootstrap.');
      body.username = String(env.get('BOOTSTRAP_ADMIN_USERNAME') || '').toLowerCase();
      body.password = env.get('BOOTSTRAP_ADMIN_PASSWORD'); body.displayName = 'Administrator'; body.role = 'Admin';
      if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(body.username) || !validPassword(body.password)) return fail(400, 'Configure a valid bootstrap username and a 4–128 character password.');
      const p = await passwordHash(body.password);
      const account = { _id: body.username, username: body.username, displayName: body.displayName, role: 'Admin', enabled: true, authVersion: 1, mustChangePassword: true, passwordHash: p.hash, passwordSalt: p.salt, createdAt: new Date().toISOString() };
      state.account = publicUser(account); delete body.password;
      return db('users.updateOne', [{ _id: account._id }, { $setOnInsert: account }, { upsert: true }], 'bootstrapped');
    }
    if (['login', 'logout', 'password', 'create'].includes(state.action)) {
      const allowedOrigin = String(env.get('AUTH_APP_ORIGIN') || '');
      if (!allowedOrigin) return fail(503, 'Configure AUTH_APP_ORIGIN.');
      if (msg.req?.headers?.['x-ruhanex-request'] !== '1' || (msg.req?.headers?.origin && msg.req.headers.origin !== allowedOrigin)) return fail(403, 'Invalid request origin.');
    }
    if (['login', 'password'].includes(state.action)) {
      const key = String(msg.req?.headers?.['x-real-ip'] || msg.req?.ip || 'unknown').slice(0, 100);
      const attempts = flow.get('ruhanexAuthAttempts') || {};
      for (const [ip, value] of Object.entries(attempts)) if (value.until < Date.now()) delete attempts[ip];
      if (!attempts[key] && Object.keys(attempts).length >= 10000) return fail(429, 'Too many login requests. Try later.');
      const entry = attempts[key] || { count: 0, until: Date.now() + 300000 };
      if (++entry.count > 20) return fail(429, 'Too many login attempts. Try again in five minutes.');
      attempts[key] = entry; flow.set('ruhanexAuthAttempts', attempts);
    }
    if (state.action === 'login') {
      if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 128 || !body.password.length) return fail(400, 'Username and password are required.');
      body.username = body.username.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(body.username)) return fail(401, 'Invalid username or password.');
      return db('users.findOne', [{ _id: body.username }], 'loginUser');
    }
    const token = String(msg.req?.headers?.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('ruhanex_session='))?.slice('ruhanex_session='.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return state.action === 'logout' ? finish(200, { success: true }, { 'Set-Cookie': cookie('', 0) }) : fail(401, 'Please sign in.');
    state.sessionHash = hash(token);
    return db('sessions.findOne', [{ _id: state.sessionHash, expiresAt: { $gt: new Date() } }], 'session');
  }
  if (state.stage === 'bootstrapped') {
    if (msg.payload?.acknowledged !== true) return fail(500, 'Bootstrap failed.');
    return finish(200, { success: true, created: msg.payload.upsertedCount === 1, message: msg.payload.upsertedCount === 1 ? 'Initial Admin created. Change the initial password after login.' : 'Username already exists; no account was overwritten.' });
  }
  if (state.stage === 'loginUser') {
    const account = msg.payload;
    const correct = await verify(body.password, account);
    delete body.password;
    if (!correct || account.enabled !== true || !roles.includes(account.role)) return fail(401, 'Invalid username or password.');
    state.account = publicUser(account);
    state.token = crypto.randomBytes(32).toString('hex');
    return db('sessions.insertOne', [{ _id: hash(state.token), username: account._id, authVersion: account.authVersion, createdAt: new Date(), expiresAt: new Date(Date.now() + 28800000) }], 'loggedIn');
  }
  if (state.stage === 'loggedIn') {
    if (msg.payload?.acknowledged !== true) return fail(500, 'Unable to create session.');
    return finish(200, { success: true, user: state.account }, { 'Set-Cookie': cookie(state.token) });
  }
  if (state.stage === 'session') {
    if (!msg.payload) return state.action === 'logout' ? finish(200, { success: true }, { 'Set-Cookie': cookie('', 0) }) : fail(401, 'Session expired. Please sign in.');
    state.session = msg.payload;
    return db('users.findOne', [{ _id: state.session.username }], 'authenticated');
  }
  if (state.stage === 'authenticated') {
    const account = msg.payload;
    if (!account || account.enabled !== true || !roles.includes(account.role) || account.authVersion !== state.session.authVersion) return fail(401, 'Session is no longer valid. Please sign in.');
    state.user = account;
    if (state.action === 'me') return finish(200, { success: true, user: publicUser(account) });
    if (state.action === 'logout') return db('sessions.deleteOne', [{ _id: state.sessionHash }], 'loggedOut');
    if (state.action === 'password') {
      if (typeof body.currentPassword !== 'string' || body.currentPassword.length > 128 || !validPassword(body.newPassword) || body.currentPassword === body.newPassword) return fail(400, 'Use a different new password of 4–128 characters.');
      if (!await verify(body.currentPassword, account)) return fail(400, 'Current password is incorrect.');
      const p = await passwordHash(body.newPassword);
      delete body.currentPassword; delete body.newPassword;
      return db('users.updateOne', [{ _id: account._id, authVersion: account.authVersion }, { $set: { passwordHash: p.hash, passwordSalt: p.salt, mustChangePassword: false, updatedAt: new Date().toISOString() }, $inc: { authVersion: 1 } }], 'passwordChanged');
    }
    if (account.mustChangePassword) return fail(403, 'Change your initial password before accessing this feature.');
    if (state.action === 'authorize') {
      const raw = String(msg.req.headers['x-original-uri'] || '').split('?')[0];
      const path = raw.replace(/^\/api\/api\//, '/api/');
      const method = String(msg.req.headers['x-original-method'] || '').toUpperCase();
      const origin = msg.req.headers['x-original-origin'];
      if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !path.startsWith('/api/')) return fail(403, 'Invalid protected route.');
      if (!['GET', 'HEAD'].includes(method) && origin !== env.get('AUTH_APP_ORIGIN')) return fail(403, 'Invalid request origin.');
      const read = ['GET', 'HEAD'].includes(method);
      const production = path.startsWith('/api/production/') || ['/api/getShiftsStats', '/api/getDashboardStats', '/api/shift-count', '/api/shift-downtime', '/api/shift-downtime-new', '/api/shift-last', '/api/line_speed', '/api/line-live-summary', '/api/design-codes', '/api/downtime-codes', '/api/line-setting'].includes(path);
      const adminWrite = ['/api/devices', '/api/design-codes', '/api/machines', '/api/production/machines', '/api/downtime-codes', '/api/authority/verify', '/api/authority/password'].some((value) => path === value || path.startsWith(value + '/'));
      const operatingWrite = method === 'POST' && ['/api/update-downtime-reason', '/api/line-design-code', '/api/line-tile-size'].includes(path);
      let allowed = account.role === 'Admin';
      if (account.role === 'Manager') allowed = read || (!adminWrite && (operatingWrite || path === '/api/line-setting' || path === '/api/ai/chat'));
      if (account.role === 'JE') allowed = (read && (production || path === '/api/getHistoricalEnergyUsage')) || operatingWrite || (method === 'POST' && path === '/api/ai/chat');
      if (!allowed) return fail(403, 'Your account level does not permit this operation.');
      return finish(204, '', { 'X-Ruhanex-Role': account.role, 'X-Ruhanex-User': account._id });
    }
    if (account.role !== 'Admin') return fail(403, 'Administrator access required.');
    if (state.action === 'list') return db('users.find', [{}, { sort: { displayName: 1 }, projection: { _id: 1, displayName: 1, role: 1, enabled: 1, mustChangePassword: 1, createdAt: 1 } }], 'listed');
    if (state.action === 'create') {
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username) || typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.length > 100 || !roles.includes(body.role) || !validPassword(body.password)) return fail(400, 'Supply a valid username, name, level and 4–128 character initial password.');
      const p = await passwordHash(body.password); delete body.password;
      const user = { _id: username, username, displayName: body.displayName.trim(), role: body.role, enabled: true, mustChangePassword: true, authVersion: 1, passwordSalt: p.salt, passwordHash: p.hash, createdAt: new Date().toISOString() };
      state.createdUser = publicUser(user);
      return db('users.insertOne', [user], 'created');
    }
    return fail(404, 'Unknown authentication operation.');
  }
  if (state.stage === 'listed') return finish(200, { success: true, users: (Array.isArray(msg.payload) ? msg.payload : []).map(publicUser) });
  if (state.stage === 'created') return msg.payload?.acknowledged === true ? finish(201, { success: true, user: state.createdUser }) : fail(500, 'Unable to create user.');
  if (state.stage === 'loggedOut') return msg.payload?.acknowledged === true ? finish(200, { success: true }, { 'Set-Cookie': cookie('', 0) }) : fail(500, 'Unable to end session.');
  if (state.stage === 'passwordChanged') {
    if (msg.payload?.acknowledged !== true || msg.payload.matchedCount !== 1) return fail(409, 'Account changed while saving. Sign in again.');
    return finish(200, { success: true, message: 'Password changed; all previous sessions are invalid.' }, { 'Set-Cookie': cookie('', 0) });
  }
  return fail(500, 'Invalid authentication state.');
}

const tab = 'rx_user_auth_tab';
const nodes = [{ id: tab, type: 'tab', label: 'Ruhanex Users and Sessions', disabled: false, info: 'See user-auth.README.md. Configure crypto in functionGlobalContext, AUTH_APP_ORIGIN and secure cookies. Mongo client reused. Manual bootstrap only.' }];
const functionNode = (id, name, action, x, y) => nodes.push({ id, z: tab, type: 'function', name,
  func: `${action ? `msg.authAction = ${JSON.stringify(action)};\n` : ''}(${authStep.toString()})(msg, env, global.get('crypto'), Buffer, flow).then(result => { node.send(result); node.done(); }).catch(error => { node.error(error, msg); node.done(); });\nreturn;`, outputs: 2, noerr: 0, initialize: '', finalize: '', libs: [], x, y, wires: [['rx_auth_db_switch'], ['rx_auth_result_switch']] });
const routes = [['login', 'post', '/api/auth/login'], ['me', 'get', '/api/auth/me'], ['logout', 'post', '/api/auth/logout'], ['password', 'post', '/api/auth/password'], ['list', 'get', '/api/auth/users'], ['create', 'post', '/api/auth/users'], ['authorize', 'get', '/api/auth/authorize']];
routes.forEach(([action, method, url], index) => {
  nodes.push({ id: `rx_auth_${action}_http`, z: tab, type: 'http in', name: method.toUpperCase() + ' ' + url, method, url, upload: false, swaggerDoc: '', x: 190, y: 100 + index * 70, wires: [[`rx_auth_${action}_start`]] });
  functionNode(`rx_auth_${action}_start`, action, action, 480, 100 + index * 70);
});
functionNode('rx_auth_advance', 'Advance auth state', null, 1140, 420);
const operations = ['users.findOne', 'users.find', 'users.insertOne', 'users.updateOne', 'sessions.findOne', 'sessions.insertOne', 'sessions.deleteOne'];
nodes.push({ id: 'rx_auth_db_switch', z: tab, type: 'switch', name: 'Database operation', property: 'authDb', propertyType: 'msg', rules: operations.map((v) => ({ t: 'eq', v, vt: 'str' })), checkall: 'true', repair: false, outputs: operations.length, x: 740, y: 280, wires: operations.map((op, i) => [`rx_auth_db_${i}`]) });
operations.forEach((op, index) => {
  const [collection, operation] = op.split('.');
  nodes.push({ id: `rx_auth_db_${index}`, z: tab, type: 'mongodb4', name: op, clientNode: '8120871193b8f276', mode: 'collection', collection: collection === 'users' ? 'ruhanex_users' : 'ruhanex_sessions', operation, output: 'toArray', maxTimeMS: ['find', 'findOne'].includes(operation) ? '15000' : '0', handleDocId: false, x: 960, y: 100 + index * 50, wires: [['rx_auth_advance']] });
});
nodes.push({ id: 'rx_auth_result_switch', z: tab, type: 'switch', name: 'HTTP or bootstrap result', property: 'req', propertyType: 'msg', rules: [{ t: 'nnull' }, { t: 'else' }], checkall: 'true', repair: false, outputs: 2, x: 760, y: 600, wires: [['rx_auth_http_response'], ['rx_auth_bootstrap_debug']] });
nodes.push({ id: 'rx_auth_http_response', z: tab, type: 'http response', name: 'Auth JSON response', statusCode: '', headers: {}, x: 1090, y: 580, wires: [] });
nodes.push({ id: 'rx_auth_bootstrap_inject', z: tab, type: 'inject', name: 'MANUAL: bootstrap initial Admin', props: [{ p: 'payload' }], payload: '', payloadType: 'date', once: false, repeat: '', crontab: '', onceDelay: 0.1, x: 230, y: 670, wires: [['rx_auth_bootstrap_start']] });
functionNode('rx_auth_bootstrap_start', 'Bootstrap from environment', 'bootstrap', 500, 670);
nodes.push({ id: 'rx_auth_bootstrap_debug', z: tab, type: 'debug', name: 'Bootstrap result only', active: true, tosidebar: true, console: false, tostatus: false, complete: 'payload', targetType: 'msg', x: 1090, y: 650, wires: [] });
nodes.push({ id: 'rx_auth_catch', z: tab, type: 'catch', name: 'Auth errors', scope: nodes.filter((node) => ['function', 'mongodb4'].includes(node.type)).map((node) => node.id), uncaught: false, x: 200, y: 760, wires: [['rx_auth_error']] });
nodes.push({ id: 'rx_auth_error', z: tab, type: 'function', name: 'Safe auth error', func: `const duplicate = /E11000|duplicate key/i.test(String(msg.error?.message || '')); msg.statusCode = duplicate ? 409 : 500; msg.payload = {success:false,error:duplicate?'Username already exists.':'Authentication service failed. Check server configuration.'}; msg.headers={'Content-Type':'application/json','Cache-Control':'no-store'}; delete msg.auth; delete msg.authDb; delete msg.error; return msg;`, outputs: 1, noerr: 0, initialize: '', finalize: '', libs: [], x: 490, y: 760, wires: [['rx_auth_result_switch']] });
export function checkSettingsPermission(msg, global) {
  const role = msg.req?.headers?.['x-ruhanex-role'];
  if (role === 'Admin') return [msg, null];
  const fail = (status, error) => { msg.statusCode = status; msg.headers = { 'Content-Type': 'application/json' }; msg.payload = { success: false, error }; return [null, msg]; };
  if (role !== 'Manager') return fail(403, 'Manager or Admin access required.');
  const body = msg.payload || {};
  const settings = global.get('lineSettings') || {};
  const current = settings[body.line] || settings[String(body.line || '').toLowerCase()];
  if (!current) return fail(503, 'Current line settings are not loaded.');
  for (const key of ['stopDelayMs', 'maxPulseGapMs', 'requiredRunTimeMs']) {
    if (current[key] == null || body[key] == null || !Number.isFinite(Number(current[key])) || Number(body[key]) !== Number(current[key])) return fail(403, 'Only Admin can change downtime detection settings.');
  }
  return [msg, null];
}
const sub = 'rx_auth_settings_guard';
nodes.push({ id: sub, type: 'subflow', name: 'Protect line detection settings', info: 'Insert after POST /api/line-setting HTTP In, before validation. Trust X-Ruhanex-Role only from the included authenticated Nginx gateway. Output 1 proceeds; output 2 connects to HTTP error response.', in: [{ x: 40, y: 80, wires: [{ id: 'rx_auth_settings_guard_fn' }] }], out: [{ x: 500, y: 60, wires: [{ id: 'rx_auth_settings_guard_fn', port: 0 }] }, { x: 500, y: 120, wires: [{ id: 'rx_auth_settings_guard_fn', port: 1 }] }], env: [], color: '#D8BFD8', meta: {} });
nodes.push({ id: 'rx_auth_settings_guard_fn', z: sub, type: 'function', name: 'Admin-only detection changes', func: `return (${checkSettingsPermission.toString()})(msg, global);`, outputs: 2, noerr: 0, initialize: '', finalize: '', libs: [], x: 270, y: 80, wires: [[], []] });
fs.writeFileSync(new URL('./user-auth.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log(`Generated ${nodes.length} user/session nodes.`);
export { nodes };
