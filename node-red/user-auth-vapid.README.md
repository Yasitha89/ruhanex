# Ruhanex users + VAPID Web Push backend

This version also includes Admin-only Telegram registration APIs for **My Profile → Telegram users**. Replace/update the existing user nodes, preserving their IDs and tab environment variables, and deploy the updated frontend. Read `telegram-ruhana.README.md` for the matching Telegram bridge and approval-gated alarm sender. The new MongoDB collection is `ruhanex_telegram_users`; Telegram token/AI configuration stays on the Telegram bridge tab. Existing VAPID keys need no changes.

Import **user-auth-vapid.flow.json** as a replacement for the user-handling section you supplied. Existing HTTP, Function, database and error-handler node IDs are retained. The flow adds four HTTP routes and three MongoDB operation nodes. It references the existing MongoDB client `8120871193b8f276`; connection credentials are intentionally excluded.

This is the backend phase. The frontend still needs Enable/Disable notifications buttons, a service worker, subscription registration and a notification-click handler. A trusted internal alarm sender is included; machine/line event routing must be wired to it. There is no public endpoint allowing a caller to send arbitrary notifications to another user.

## 1. Install the server dependency

In the **Node-RED user directory on the server** (usually `~/.node-red`, or `/data` for Docker), run:

```sh
npm install web-push --save
```

Merge into the existing `functionGlobalContext` in Node-RED `settings.js` (keep any other entries):

```js
functionGlobalContext: {
  crypto: require('node:crypto'),
  webPush: require('web-push'),
},
```

## 2. Generate VAPID keys once

From that same server directory:

```sh
node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys(), null, 2))"
```

Store the resulting pair securely. Do not regenerate on restart or deploy. Changing the public key requires browsers to unsubscribe and subscribe again.

Configure these environment variables for the **Node-RED process**, then restart Node-RED:

```text
VAPID_PUBLIC_KEY=<publicKey from generated pair>
VAPID_PRIVATE_KEY=<privateKey from generated pair>
VAPID_SUBJECT=mailto:your-real-admin-email@example.com
```

Use a real monitored contact address for `VAPID_SUBJECT`. Keep the private key out of frontend code, Git, imported JSON and debug nodes. Public-key, subscribe and test routes return 503 until a matching key pair and the webPush module are configured.

Retain your existing authentication environment configuration:

```text
AUTH_APP_ORIGINS=https://ruhanex.com,https://localhost:5173
AUTH_COOKIE_SECURE=true
```

Set the origins to the actual origins your users open, without trailing slashes. A single `AUTH_APP_ORIGIN` remains supported if `AUTH_APP_ORIGINS` is unset. Do not enable bootstrap again for an existing installation.

## 3. Import and deploy

1. Export a backup of your existing user-handling section.
2. Import `user-auth-vapid.flow.json` into the existing users flow. Replace/update nodes with matching IDs; do not keep duplicate copies of the existing HTTP endpoints.
3. Verify that all MongoDB nodes select your existing MongoDB configuration. A new collection, `ruhanex_push_subscriptions`, is created on the first successful subscription write. The users and sessions collections remain unchanged.
4. Deploy. Keep Node-RED's port and editor private, as required by your existing authentication gateway.

With the existing `user-auth.nginx.conf`, **no new Nginx location is required**: `/api/api/auth/` already proxies to `/api/auth/` and these routes authenticate their own cookies. If your deployed gateway differs, explicitly map these paths using the same cookie forwarding. Do not expose the internal authorize route.

Optional indexes for subscription queries and cleanup:

```js
db.ruhanex_push_subscriptions.createIndex({ username: 1 })
```

## 4. Backend API contract for the frontend

All four routes require a valid login session, an enabled account and a completed initial password change. All three user roles may manage their own subscriptions. State-changing requests must include `X-Ruhanex-Request: 1`; an Origin header, when present, must match the configured app origins. Use browser credentials/cookies.

| Method | Node-RED path | Public URL with existing gateway | Body |
| --- | --- | --- | --- |
| GET | `/api/auth/push/public-key` | `/api/api/auth/push/public-key` | None |
| POST | `/api/auth/push/subscribe` | `/api/api/auth/push/subscribe` | `{ applicationServerKey, subscription }` |
| POST | `/api/auth/push/unsubscribe` | `/api/api/auth/push/unsubscribe` | `{ endpoint }` |
| POST | `/api/auth/push/test` | `/api/api/auth/push/test` | `{}` |

Public-key response:

```json
{ "success": true, "publicKey": "<VAPID_PUBLIC_KEY>" }
```

Subscribe body:

```json
{
  "applicationServerKey": "<publicKey returned by public-key route>",
  "subscription": {
    "endpoint": "<browser subscription endpoint>",
    "keys": {
      "p256dh": "<browser subscription encryption public key>",
      "auth": "<browser subscription auth secret>"
    }
  }
}
```

Use `PushSubscription.toJSON()` for `subscription`. Its `p256dh` is a browser-generated key, distinct from the server's VAPID public key. Extra fields such as `expirationTime` are ignored. The backend derives ownership from the session; a supplied username or role cannot select another recipient.

Subscriptions are bound to **username + account generation + browser push endpoint**, independently of login sessions. Logout, eight-hour session expiry and password changes preserve notification consent. The same endpoint is reassigned atomically when another account explicitly enables notifications. Unsubscribe removes only an endpoint owned by the authenticated account, including after signing in with a new session. User deletion removes all subscriptions for that username. The internal alarm sender checks that the account exists and is enabled on every alarm. Deleted/recreated accounts cannot inherit an older account generation's subscriptions.

The profile Enable/Disable buttons and HTTP test route still require login. Opening a protected dashboard from a notification requires login. **The frontend must not unsubscribe during logout.** Register/transfer subscriptions when the user enables notifications for that account. A shared browser remains subscribed to its previous account until notifications are disabled or explicitly enabled for another account.

Existing subscriptions from the previous flow remain eligible when account generation and VAPID keys match; no new keys or bulk migration are required. Re-registering removes obsolete sessionHash/authVersion fields. Subscriptions already removed by the previous logout handler must be enabled again.

### Send alarms after logout or session expiry

Connect a trusted Node-RED Link Out to the new **Push alarm to user** Link In. Before that Link Out, set:

```js
msg.username = 'target-username';
msg.payload = {
  title: 'Machine alarm',
  body: 'Line 02 has stopped.',
  data: { url: '/production' }
};
return msg;
```

Use the actual app dashboard path. Select recipients on the server according to machine/line permissions; this flow does not infer recipient assignments. Do not wire unvalidated public requests into this trusted Link In. The sender accepts one username per message and checks the current enabled account, then sends to its registered devices without requiring a session. Click URLs must be app-relative. The existing bootstrap-result debug node receives delivery counts or sanitized errors. The HTTP test sends to the logged-in user's registered devices across sessions.

Disabling prevents later lookups from selecting that endpoint; a message already in flight may still arrive. Browser/OS permission changes and expired endpoints can also stop delivery.

The default allowed push-service hosts are exact matches:

```text
fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com
```

This prevents clients using the sender to request arbitrary network destinations. If a supported browser uses a different provider, explicitly configure `PUSH_ALLOWED_HOSTS` as a comma-separated list of trusted exact hostnames. HTTPS is required; userinfo, explicit ports and fragments are rejected. Do not add arbitrary client-controlled domains.

## 5. Test notification

After the frontend registers its service worker and saves a real subscription, POST `{}` to the test route. It sends a fixed notification:

```json
{
  "title": "Ruhanex",
  "body": "Push notifications are enabled for your account.",
  "tag": "ruhanex-push-test",
  "data": { "url": "/" }
}
```

The service worker should parse the JSON and call `registration.showNotification(payload.title, { body: payload.body, tag: payload.tag, data: payload.data })`. Its notification-click handler can open `data.url` after restricting it to the app's origin.

Example response:

```json
{ "success": true, "accepted": 1, "failed": 0, "expired": 0 }
```

`accepted` means the push service accepted the message, not that the user saw it. No subscriptions gives zero counts. Provider 404/410 responses remove stale records, guarded against a concurrent re-registration; transient errors retain records and increase `failed`. Tests are limited to one request per minute per username (in-memory per Node-RED instance), with at most 20 subscriptions per account. The trusted internal alarm sender is not subject to the HTTP test rate limit. VAPID options are passed per send rather than mutating shared library configuration. Messages use a 60-second TTL and a 10-second network timeout.

## Local verification and maintenance

```sh
node node-red/test-user-auth-vapid-flow.mjs
```

The local harness executes the generated HTTP and internal-sender Function code with simulated MongoDB and push delivery. It checks wiring/syntax, credentials exclusion, session/origin enforcement, endpoint validation, VAPID key pairing, ownership isolation, account switching, persistent delivery after logout/expiry/password changes, explicit disable from a new session, disabled/recreated accounts and deletion cleanup. It does not contact MongoDB or a real push provider. Live browser delivery must be verified after server configuration and frontend implementation.

To rebuild from a later export of this same user-handling section:

```sh
node node-red/build-user-auth-vapid-flow.mjs path/to/existing-user-section.json
```

Without an input path, the builder uses the repository's baseline `user-auth.flow.json` (which has its own IDs). For your supplied live section, the delivered JSON was generated from your pasted export and preserves its IDs. Regenerate from an unmodified baseline, not from the already VAPID-patched output. The builder rejects unrecognized baseline markers rather than silently producing a partially patched flow.

Web Push library API reference: https://github.com/web-push-libs/web-push#api-reference
