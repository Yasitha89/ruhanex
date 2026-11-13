/* Background notifications only; deliberately no fetch handler or offline cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function appUrl(value) {
  try {
    const url = new URL(value || "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch { return self.location.origin + "/"; }
}
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Show a safe fallback notification. */ }
  event.waitUntil(self.registration.showNotification(typeof payload.title === "string" ? payload.title : "Ruhanex", {
    body: typeof payload.body === "string" ? payload.body : "You have a new notification.",
    icon: "/logo.png",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    data: { url: appUrl(payload.data?.url) },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = appUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});
