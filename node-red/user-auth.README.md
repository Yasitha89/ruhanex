# Ruhanex users and login

The former JE category is now **Line Supervisor**, with the same access. Existing MongoDB users whose role is `JE` remain supported and are returned as `Line Supervisor` on login/session/user-list responses; no database migration is required. New users are created with `Line Supervisor`.

Import `user-auth.flow.json` using Node-RED → Import → select file. The frontend now requires this backend; the previous demo login is removed.

| Level | Pages | Create users |
| --- | --- | --- |
| Admin | All pages, including Settings → Admin | Yes |
| Manager | All except Settings → Admin | No |
| Line Supervisor | Overview and Production, plus own profile | No |

Profile icon → My Profile / Change Password lets each user change their own password. Initial passwords must be changed before other pages or protected APIs become accessible. Changing a password invalidates all existing sessions, then requires signing in again. Passwords are 4–128 characters and stored as salted scrypt hashes. Sessions last eight hours, use HttpOnly secure cookies, and store only token hashes in MongoDB.

## Configure Node-RED

1. Merge this into the existing `functionGlobalContext` in Node-RED's `settings.js`, then restart Node-RED:

   ```js
   functionGlobalContext: {
     crypto: require('node:crypto')
   },
   ```

2. Set these **server-side** environment variables (service environment, Docker environment, or the imported flow's environment settings):

   ```text
   AUTH_APP_ORIGIN=https://ruhanex.com
   AUTH_COOKIE_SECURE=true
   AUTH_BOOTSTRAP_ENABLED=true
   BOOTSTRAP_ADMIN_USERNAME=administrator
   BOOTSTRAP_ADMIN_PASSWORD=<a strong initial password of your choice>
   ```

   Use the exact origin users open, without a trailing slash. The app currently uses `https://ruhanex.com/api` in `src/api/constants.js`. Keep the frontend and API on the same HTTPS origin. For HTTP localhost development only, use `AUTH_COOKIE_SECURE=false` and the local origin. Do not put these credentials in Vite variables or frontend files.

3. Select your existing MongoDB configuration in all seven MongoDB nodes if its configuration ID differs. The flow reuses `8120871193b8f276` and needs `node-red-contrib-mongodb4`, already used by the production flows. Collections are `ruhanex_users` and `ruhanex_sessions`; usernames use the unique `_id` field.

4. Deploy. Click **MANUAL: bootstrap initial Admin** once. Confirm `created: true` in the debug sidebar. Existing usernames are never overwritten. Remove the bootstrap password and disable `AUTH_BOOTSTRAP_ENABLED` after creation; restart/redeploy as appropriate.

5. Configure Nginx as below, log in with that initial account, change its password, sign in again, then open **Settings → Admin → User Administration** to create users with initial passwords. Share those privately.

Optional MongoDB cleanup index (expiration is checked on every request even without this):

```js
db.ruhanex_sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

## Protect the existing APIs with Nginx

For multiple frontend origins, set `AUTH_APP_ORIGINS` to a comma-separated list such as `https://ruhanex.com,https://localhost:5173`. This takes precedence over the older single `AUTH_APP_ORIGIN` variable. Origins must match exactly, including protocol and port, without trailing slashes. The regenerated flow supports this in both login requests and the Nginx authorization check. For simultaneous production and local development, use local HTTPS and keep `AUTH_COOKIE_SECURE=true`; disabling secure cookies is only for isolated HTTP development.

Merge the locations in `user-auth.nginx.conf` into your existing **HTTPS** server block, replacing the previous unrestricted `/api/` proxy. Keep your SPA root and `try_files` configuration. Nginx needs its `auth_request` module. Replace the chat key placeholder with the private credential already configured for the production AI flow; keep this server configuration private. Run `sudo nginx -t` before reloading.

The public path is `/api/api/...`, because the current shared frontend base URL already ends in `/api` and API request paths start with `/api`. The supplied locations map this to Node-RED `/api/...`. They explicitly close the old single-prefix proxy. If your deployed routing uses a different prefix, change the frontend base and all locations consistently; never leave an unrestricted alternate proxy route.

Keep Node-RED port 1880 private (loopback/private network and firewall) and protect its editor separately. The settings guard and AI tools trust role headers overwritten by Nginx; direct public access to Node-RED would bypass that protection. Nginx verifies sessions using the internal authorize endpoint and overwrites client-supplied role/user headers. Authentication endpoints independently enforce user permissions. Mutating requests also validate origin; browser authentication requests include `X-Ruhanex-Request: 1`.

### Protect downtime detection settings

The import also adds a **Protect line detection settings** subflow to the palette. Insert an instance immediately after the existing **POST /api/line-setting** HTTP In node, before its validation/save function. Connect output 1 to the existing save path and output 2 to an HTTP Response node. It uses the existing `global.lineSettings` values and rejects Manager changes to `stopDelayMs`, `maxPulseGapMs`, or `requiredRunTimeMs`. Admin can change them. If settings have not loaded, Manager writes fail safely until available.

Reimport the updated `production-ai-chat.flow.json` as well: Line Supervisor chat access excludes energy and administration tools. Retain the existing private chat credential; the Nginx chat location now forwards the verified role.

## Node-RED endpoints

Paths below are Node-RED paths (public requests use the extra `/api` prefix described above).

| Method | Path | Body / result |
| --- | --- | --- |
| POST | `/api/auth/login` | `{username,password}` → user and session cookie |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Revoke session |
| POST | `/api/auth/password` | `{currentPassword,newPassword}` |
| GET | `/api/auth/users` | Admin-only user list |
| POST | `/api/auth/users` | Admin-only `{username,displayName,role,password}` |
| DELETE | `/api/auth/users/:username` | Admin-only delete account and remove its sessions; self-deletion is blocked |
| GET | `/api/auth/authorize` | Internal Nginx session/role check |

Roles are exactly `Admin`, `Manager`, or `Line Supervisor`. Usernames are 3–50 lowercase letters, digits, `.`, `_`, or `-`, starting with a letter/digit. API responses never include password hashes or raw session tokens. Login/password attempts are limited to 20 per five minutes per IP in flow context. The old separate section password gates are replaced by the signed-in role.

## Verify before rollout

Run `node node-red/test-user-auth-flow.mjs` locally. On your deployed server, verify all three accounts, direct restricted URL access, first-login password change, logout, and rejection of unauthenticated protected APIs. Importing alone does not protect old API routes: the Nginx locations and settings guard wiring are required.

Edit `build-user-auth-flow.mjs` to maintain the backend, then run `node node-red/build-user-auth-flow.mjs` and reimport the generated JSON.
