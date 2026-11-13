import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const events = {};
const notifications = [];
const opened = [];
const context = { URL, self: {
  location: { origin: 'https://ruhanex.com' },
  addEventListener: (name, fn) => { events[name] = fn; },
  registration: { showNotification: async (title, options) => notifications.push({ title, options }) },
  clients: { matchAll: async () => [], openWindow: async url => opened.push(url) },
} };
vm.runInNewContext(fs.readFileSync(new URL('../public/push-sw.js', import.meta.url), 'utf8'), context);
async function push(data) {
  let pending;
  events.push({ data, waitUntil: promise => { pending = promise; } });
  await pending;
}
await push({ json: () => ({ title: 'Alarm', body: 'Line stopped', data: { url: 'https://evil.example' } }) });
assert.equal(notifications[0].options.data.url, 'https://ruhanex.com/');
await push({ json: () => { throw new Error('Invalid JSON'); } });
assert.equal(notifications[1].title, 'Ruhanex');
await push({ json: () => ({ title: 'Alarm', body: 'Line stopped', data: { url: '/production' } }) });
let click;
events.notificationclick({ notification: { data: notifications[2].options.data, close() {} }, waitUntil: promise => { click = promise; } });
await click;
assert.equal(opened[0], 'https://ruhanex.com/production');

// Execute the frontend service against browser/API stubs, without network access.
const storage = new Map();
let backendFails = false;
let removed = 0;
let saved = 0;
let unsubscribed = 0;
const key = Buffer.alloc(65, 4).toString('base64url');
let sub = { endpoint: 'https://fcm.googleapis.com/test', options: { applicationServerKey: Buffer.alloc(65, 4) },
  toJSON() { return { endpoint: this.endpoint, keys: {} }; },
  async unsubscribe() { unsubscribed++; sub = null; return true; } };
const reg = { pushManager: { getSubscription: async () => sub } };
const browser = vm.createContext({
  Uint8Array, atob, window: { isSecureContext: true, PushManager: {}, Notification: {} },
  Notification: { permission: 'granted', requestPermission: async () => 'granted' },
  navigator: { serviceWorker: { register: async () => reg, ready: Promise.resolve(reg), getRegistration: async () => reg } },
  localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  getPushPublicKey: async () => ({ publicKey: key }),
  subscribePush: async () => { if (backendFails) throw new Error('Offline'); saved++; },
  unsubscribePush: async () => { if (backendFails) throw new Error('Offline'); removed++; },
});
const service = fs.readFileSync(new URL('../src/services/pushNotifications.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/, '').replaceAll('export ', '');
vm.runInContext(service, browser);
const call = code => vm.runInContext(code, browser);
assert.equal(await call("getPushState('alice')"), 'unconfirmed');
backendFails = true;
await assert.rejects(call("enablePush('alice')"), /Offline/);
assert.equal(storage.size, 0); // Failed enable must not claim ownership.
backendFails = false;
await call("enablePush('alice')");
assert.equal(saved, 1);
assert.equal(await call("getPushState('alice')"), 'enabled');
assert.equal(await call("getPushState('bobby')"), 'other-account');
await assert.rejects(call("disablePush('bobby')"), /another account/);
assert.equal(unsubscribed, 0);
backendFails = true;
await assert.rejects(call("disablePush('alice')"), /Offline/);
assert.equal(unsubscribed, 0); // Keep subscription so failed disable can be retried.
backendFails = false;
await call("disablePush('alice')");
assert.equal(removed, 1); assert.equal(unsubscribed, 1);
assert.equal(await call("getPushState('alice')"), 'disabled');
console.log('PASS: safe background payloads/click URLs, frontend ownership, account isolation, failed enable/disable retries and explicit unsubscribe.');
