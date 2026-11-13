import { getPushPublicKey, subscribePush, unsubscribePush } from "../api/authApi";

const ownerKey = "ruhanex.push.owner";
export const supportsPush = () => window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const registerPushWorker = () => navigator.serviceWorker.register("/push-sw.js", { scope: "/", updateViaCache: "none" });

function readOwner() {
  try { return JSON.parse(localStorage.getItem(ownerKey)); } catch { return null; }
}
function saveOwner(value) {
  try { if (value) localStorage.setItem(ownerKey, JSON.stringify(value)); else localStorage.removeItem(ownerKey); } catch { /* Browser storage may be unavailable. */ }
}
function bytes(value) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function registration() {
  await registerPushWorker();
  return navigator.serviceWorker.ready;
}
export async function getPushState(username) {
  if (!supportsPush()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return "disabled";
  const owner = readOwner();
  if (owner?.endpoint === sub.endpoint) return owner.username === username ? "enabled" : "other-account";
  return "unconfirmed";
}
export async function enablePush(username) {
  if (!supportsPush()) throw new Error("Push notifications require HTTPS and a supported browser.");
  // Ask immediately inside the button interaction, before awaiting network requests.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Allow notifications in your browser's site settings, then try again.");
  const { publicKey } = await getPushPublicKey();
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  const key = bytes(publicKey);
  const oldKey = sub?.options.applicationServerKey;
  if (sub && oldKey && (oldKey.byteLength !== key.length || new Uint8Array(oldKey).some((b, i) => b !== key[i]))) {
    if (!await sub.unsubscribe()) throw new Error("Unable to replace the previous subscription. Please try again.");
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  // Store ownership only after the server accepts it. Never auto-transfer on login.
  await subscribePush(sub.toJSON(), publicKey);
  saveOwner({ username, endpoint: sub.endpoint });
}
export async function disablePush(username) {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) { saveOwner(null); return; }
  const owner = readOwner();
  if (owner?.endpoint === sub.endpoint && owner.username !== username) throw new Error("This browser receives notifications for another account. Sign in to that account to disable them.");
  // Server removal first: on failure leave the local subscription available to retry.
  await unsubscribePush(sub.endpoint);
  // Unknown ownership: do not revoke a different account's browser subscription.
  if (owner?.endpoint === sub.endpoint && owner.username === username) {
    if (!await sub.unsubscribe()) throw new Error("Server notifications are disabled. Browser cleanup failed; try again.");
    saveOwner(null);
  }
}
