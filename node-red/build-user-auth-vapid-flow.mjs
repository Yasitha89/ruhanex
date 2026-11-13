import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Self-contained: embedded inside every authentication state-machine Function.
export async function pushStep(msg, env, crypto, Buffer, flow, webPush, helpers, start) {
  const { db, finish, fail } = helpers;
  const state = msg.auth;
  const body = state.body;
  const owner = { username: state.user._id, accountGeneration: state.user.accountGeneration ?? null };
  const hosts = String(env.get('PUSH_ALLOWED_HOSTS') || 'fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com').split(',').map(s => s.trim());
  const validEndpoint = endpoint => {
    if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
    // Exact hosts only. Reject credentials, ports, fragments and malformed URLs.
    const match = /^https:\/\/([a-z0-9.-]+)(\/[^\s#]*)$/i.exec(endpoint);
    return Boolean(match && hosts.includes(match[1].toLowerCase()));
  };
  const keyBytes = (value, length) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const bytes = Buffer.from(value, 'base64url');
    return bytes.length === length && bytes.toString('base64url') === value ? bytes : null;
  };
  const config = () => {
    const publicKey = env.get('VAPID_PUBLIC_KEY');
    const privateKey = env.get('VAPID_PRIVATE_KEY');
    const subject = env.get('VAPID_SUBJECT');
    if (!webPush?.sendNotification || !keyBytes(publicKey, 65) || !keyBytes(privateKey, 32) ||
      typeof subject !== 'string' || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject)) return null;
    try {
      const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
      if (ecdh.getPublicKey().toString('base64url') !== publicKey) return null;
    } catch { return null; }
    return { publicKey, privateKey, subject };
  };
  if (start) {
    if (state.action === 'pushUnsubscribe') {
      if (!validEndpoint(body.endpoint)) return fail(400, 'A valid push endpoint is required.');
      return db('push.deleteMany', [{ _id: crypto.createHash('sha256').update(body.endpoint).digest('hex'), ...owner }], 'pushRemoved');
    }
    const vapid = config();
    if (!vapid) return fail(503, 'Configure webPush and matching VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT on the server.');
    if (state.action === 'pushKey') return finish(200, { success: true, publicKey: vapid.publicKey });
    if (state.action === 'pushSubscribe') {
      const sub = body.subscription;
      if (!sub || !validEndpoint(sub.endpoint) || !keyBytes(sub.keys?.p256dh, 65) || !keyBytes(sub.keys?.auth, 16)) return fail(400, 'Invalid Web Push subscription.');
      try { crypto.ECDH.convertKey(Buffer.from(sub.keys.p256dh, 'base64url'), 'prime256v1'); }
      catch { return fail(400, 'Invalid subscription public key.'); }
      // Confirm this subscription was made with the current VAPID key.
      if (body.applicationServerKey !== vapid.publicKey) return fail(400, 'Subscribe using the current VAPID public key.');
      state.pushRecord = { _id: crypto.createHash('sha256').update(sub.endpoint).digest('hex'), ...owner,
        subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        vapidPublicKey: vapid.publicKey, updatedAt: new Date() };
      return db('push.find', [owner, { limit: 21 }], 'pushCapacity');
    }
    if (state.action === 'pushTest' || state.action === 'pushSend') {
      if (state.action === 'pushSend') return db('push.find', [{ ...owner, vapidPublicKey: vapid.publicKey }, { limit: 20 }], 'pushTargets');
      const attempts = flow.get('ruhanexPushTests') || {};
      const now = Date.now();
      for (const [key, until] of Object.entries(attempts)) if (until <= now) delete attempts[key];
      if (attempts[owner.username] || Object.keys(attempts).length >= 10000) return fail(429, 'Wait one minute before sending another test.');
      attempts[owner.username] = now + 60000; flow.set('ruhanexPushTests', attempts);
      return db('push.find', [{ ...owner, vapidPublicKey: vapid.publicKey }, { limit: 20 }], 'pushTargets');
    }
    return fail(404, 'Unknown push operation.');
  }
  if (state.stage === 'pushCapacity') {
    if (!Array.isArray(msg.payload)) return fail(500, 'Unable to read subscriptions.');
    if (msg.payload.length >= 20 && !msg.payload.some(row => row._id === state.pushRecord._id)) return fail(409, 'Maximum subscriptions for this account reached.');
    const { _id, ...record } = state.pushRecord;
    return db('push.updateOne', [{ _id }, { $set: record, $unset: { sessionHash: '', authVersion: '' } }, { upsert: true }], 'pushSaved');
  }
  if (state.stage === 'pushSaved') return msg.payload?.acknowledged === true ? finish(200, { success: true }) : fail(500, 'Unable to save subscription.');
  if (state.stage === 'pushRemoved') return msg.payload?.acknowledged === true ? finish(200, { success: true }) : fail(500, 'Unable to remove subscription.');
  if (state.stage === 'pushTargets') {
    if (!Array.isArray(msg.payload)) return fail(500, 'Unable to read subscriptions.');
    const vapidDetails = config();
    if (!vapidDetails) return fail(503, 'Push is not configured.');
    const results = await Promise.all(msg.payload.map(async row => {
      if (!validEndpoint(row.subscription?.endpoint)) return { failed: true };
      try {
        const notification = state.action === 'pushSend' ? body.notification : { title: 'Ruhanex', body: 'Push notifications are enabled for your account.',
          tag: 'ruhanex-push-test', data: { url: '/' } };
        await webPush.sendNotification(row.subscription, JSON.stringify(notification), { vapidDetails, TTL: 60, timeout: 10000, urgency: 'normal' });
        return { accepted: true };
      } catch (error) {
        // Never expose endpoints, subscription keys or upstream errors to the client/debug.
        return [404, 410].includes(error.statusCode) ? { expired: row._id, updatedAt: row.updatedAt } : { failed: true };
      }
    }));
    state.pushResult = { success: true, accepted: results.filter(r => r.accepted).length,
      failed: results.filter(r => r.failed).length, expired: results.filter(r => r.expired).length };
    const expired = results.filter(r => r.expired).map(r => ({ _id: r.expired, updatedAt: r.updatedAt }));
    if (expired.length) return db('push.deleteMany', [{ ...owner, $or: expired }], 'pushPruned');
    return finish(200, state.pushResult);
  }
  if (state.stage === 'pushPruned') return msg.payload?.acknowledged === true ? finish(200, state.pushResult) : fail(500, 'Subscription cleanup failed.');
  return fail(500, 'Invalid push state.');
}

// Only reached via a trusted in-editor Link In. No HTTP route accepts a recipient.
export async function internalPushStep(msg, env, crypto, Buffer, flow, webPush) {
  const finish = (status, payload) => {
    msg.statusCode = status; msg.payload = payload;
    delete msg.auth; delete msg.authDb; delete msg.pushInternal; delete msg.username;
    return [null, msg];
  };
  const fail = (status, error) => finish(status, { success: false, error });
  const db = (kind, payload, next) => { msg.authDb = kind; msg.payload = payload; msg.auth.stage = next; return [msg, null]; };
  const state = msg.auth;
  if (state.stage === 'internalStart') {
    const n = state.body.notification;
    if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(state.body.username || '') || !n ||
      typeof n.title !== 'string' || !n.title.trim() || n.title.length > 100 || typeof n.body !== 'string' || n.body.length > 1000)
      return fail(400, 'Supply msg.username and payload with title and body.');
    const url = n.data?.url || '/';
    if (typeof url !== 'string' || !/^\/(?!\/)/.test(url) || /[\\\s]/.test(url) || url.length > 500) return fail(400, 'Notification URL must be an app-relative path.');
    state.body.notification = { title: n.title, body: n.body, tag: 'ruhanex-alarm', data: { url } };
    return db('users.findOne', [{ _id: state.body.username }], 'internalUser');
  }
  if (state.stage === 'internalUser') {
    const user = msg.payload;
    if (!user || user.enabled !== true || !['Admin', 'Manager', 'Line Supervisor', 'JE'].includes(user.role)) return fail(403, 'Recipient account is unavailable.');
    state.user = user;
  }
  return pushStep(msg, env, crypto, Buffer, flow, webPush, { db, finish, fail }, state.stage === 'internalUser');
}

export function buildVapidFlow(source) {
  // Retain references to existing config nodes; never export connection credentials.
  const nodes = structuredClone(source.filter(n => !['mongodb4-client', 'global-config'].includes(n.type)));
  const advance = nodes.find(n => n.name === 'Advance auth state');
  const router = nodes.find(n => n.type === 'switch' && n.property === 'authDb');
  const result = nodes.find(n => n.name === 'HTTP or bootstrap result');
  const sampleDb = nodes.find(n => n.type === 'mongodb4');
  if (!advance || !router || !result || !sampleDb) throw new Error('Expected existing Ruhanex users/session flow.');
  const tab = advance.z;
  const insert = (text, marker, replacement) => {
    if (!text.includes(marker)) throw new Error(`Unsupported auth flow: missing ${marker}`);
    return text.replace(marker, replacement);
  };
  const dispatch = `return (${pushStep.toString()})(msg, env, crypto, Buffer, flow, global.get('webPush'), { db, finish, fail }, state.stage === 'authenticated');`;
  for (const n of nodes.filter(n => n.type === 'function' && n.func.includes('async function authStep'))) {
    n.func = insert(n.func, "['login', 'logout', 'password', 'create', 'delete'].includes(state.action)", "['login', 'logout', 'password', 'create', 'delete', 'pushSubscribe', 'pushUnsubscribe', 'pushTest'].includes(state.action)");
    n.func = insert(n.func, "if (state.action === 'authorize') {", `if (state.action.startsWith('push')) ${dispatch}\n    if (state.action === 'authorize') {`);
    n.func = insert(n.func, "return fail(500, 'Invalid authentication state.');", `if (state.action.startsWith('push')) ${dispatch}\n  if (state.stage === 'pushDeletedCleaned') return msg.payload?.acknowledged === true ? finish(200, { success: true }) : fail(500, 'User removed; push cleanup failed.');\n  return fail(500, 'Invalid authentication state.');`);
    n.func = insert(n.func, "if (state.stage === 'deletedSessions') return msg.payload?.acknowledged === true ? finish(200, { success: true }) : fail(500, 'User removed, but session cleanup failed.');",
      "if (state.stage === 'deletedSessions') return msg.payload?.acknowledged === true ? db('push.deleteMany', [{ username: state.deletedUsername }], 'pushDeletedCleaned') : fail(500, 'User removed, but session cleanup failed.');");
    // Do not pass database/library exceptions containing secrets to Node-RED debug.
    n.func = insert(n.func, "node.error(error, msg); node.done();", "node.error(/E11000|duplicate key/i.test(String(error.message)) ? 'Duplicate record.' : 'Authentication/push service failed.', msg); node.done();");
  }
  const internalCode = `const pushStep = ${pushStep.toString()};\n(${internalPushStep.toString()})(msg, env, global.get('crypto'), Buffer, flow, global.get('webPush')).then(result => { node.send(result); node.done(); }).catch(() => { node.error('Internal push service failed.', msg); node.done(); });\nreturn;`;
  advance.func = `if (msg.pushInternal === true) { ${internalCode} }\n${advance.func}`;
  for (const [i, [action, method, path]] of [
    ['pushKey', 'get', 'public-key'], ['pushSubscribe', 'post', 'subscribe'],
    ['pushUnsubscribe', 'post', 'unsubscribe'], ['pushTest', 'post', 'test'],
  ].entries()) {
    const id = `rx_vapid_${action}`;
    nodes.push({ id: `${id}_http`, z: tab, type: 'http in', name: `${method.toUpperCase()} /api/auth/push/${path}`, url: `/api/auth/push/${path}`, method, upload: false, swaggerDoc: '', x: 210, y: 900 + i * 80, wires: [[id]] });
    nodes.push({ ...structuredClone(advance), id, name: action, x: 520, y: 900 + i * 80,
      func: `msg.authAction = '${action}';\n${advance.func}` });
  }
  nodes.push({ ...structuredClone(advance), id: 'rx_vapid_internal_send', name: 'Send alarm to user (trusted flow only)', x: 560, y: 1270,
    func: `delete msg.req; delete msg.res; msg.pushInternal = true; msg.auth = {action:'pushSend',stage:'internalStart',body:{username:msg.username,notification:msg.payload}};\n${internalCode}` });
  nodes.push({ id: 'rx_vapid_internal_link', z: tab, type: 'link in', name: 'Push alarm to user', links: [], x: 255, y: 1270, wires: [['rx_vapid_internal_send']] });
  for (const [i, operation] of ['find', 'updateOne', 'deleteMany'].entries()) {
    const id = `rx_vapid_db_${operation}`;
    router.rules.push({ t: 'eq', v: `push.${operation}`, vt: 'str' }); router.wires.push([id]); router.outputs++;
    nodes.push({ ...structuredClone(sampleDb), id, name: `push.${operation}`, collection: 'ruhanex_push_subscriptions', operation,
      x: 980, y: 900 + i * 70, wires: [[advance.id]] });
  }
  const catcher = nodes.find(n => n.type === 'catch' && n.name === 'Auth errors');
  if (!catcher) throw new Error('Missing auth error handler.');
  catcher.scope = nodes.filter(n => n.z === tab && ['function', 'mongodb4'].includes(n.type) && n.name !== 'Safe auth error').map(n => n.id);
  nodes.push({ id: 'rx_vapid_readme', type: 'comment', z: tab, name: 'Persistent VAPID: see user-auth-vapid.README.md', info: 'Subscriptions survive logout, session expiry and password changes. Disable via profile unsubscribe. Internal Link In accepts msg.username + payload {title,body,data:{url}} and checks enabled account before delivery. Requires global crypto + webPush and existing VAPID env vars. Reuses existing Mongo client.', x: 320, y: 840, wires: [] });
  return nodes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2] || new URL('./user-auth.flow.json', import.meta.url);
  const nodes = buildVapidFlow(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(new URL('./user-auth-vapid.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
  console.log(`Generated ${nodes.length} auth/VAPID nodes without MongoDB credentials.`);
}
