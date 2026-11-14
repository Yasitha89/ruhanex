# Telegram conversations with Ruhana

Import `telegram-ruhana.flow.json` alongside your existing Production AI chat and user flows. When upgrading, **replace the existing Telegram bridge**, keeping its tab environment variables. Also replace the user/VAPID section using the updated `user-auth-vapid.flow.json`; it adds authenticated Admin approval APIs. Deploy the updated frontend to expose **Admin → My Profile → Telegram users**. No new npm or palette packages are needed beyond the existing MongoDB node.

New senders are automatically stored in **ruhanex_telegram_users** as pending registrations. They receive a waiting-for-approval reply. Only an Admin can assign a Ruhanex user and approve a registration. That same approval gates AI conversations and Telegram alarms. Your existing Production AI chat tab and browser push subscriptions remain in use.

The bridge accepts private text messages only. Groups, edits, bot senders, voice, photos and attachments are ignored. Any eligible private text registers the sender; registration does not grant AI or alarm access. Registration refreshes Telegram profile fields and lastSeenAt without overwriting approval or assignment.

## Configure the imported tab

Open the **Telegram - Ruhana AI** tab properties → Environment variables. Add these as **String** values, without surrounding quotes:

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | The same BotFather token used for your Telegram alerts |
| `AI_CHAT_BEARER_TOKEN` | Exactly the private token configured on your Production AI chat tab |
| `RUHANA_AI_URL` | `http://127.0.0.1:1880/api/ai/chat` |
| `TELEGRAM_RUHANA_ENABLED` | `true` |

Each person must open your bot and send /start or a text message. No manual chat-ID discovery is needed. Do not post bot tokens in chat or commit exports containing their values.

`TELEGRAM_RUHANA_USERS` and `TELEGRAM_CHAT_IDS` are no longer used for authorization. Assign each person to their own Ruhanex account in the Admin profile. Approval grants that account's AI data access and enables alarm delivery to that chat.

Select your existing MongoDB client in **all** MongoDB nodes on the Telegram and user/VAPID flows. They reference client ID `8120871193b8f276`. Collections are `ruhanex_users`, `ruhanex_sessions`, `ruhanex_push_subscriptions` and the new `ruhanex_telegram_users`. MongoDB creates the Telegram collection on first registration; `_id` is the unique private chat ID string. No connection credentials are exported.

## Admin approval

1. Ask the person to send `/start` to your bot.
2. Sign in to Ruhanex as Admin, open **My Profile → Telegram users**, and click Refresh (the panel also refreshes every 30 seconds).
3. Verify the person's identity and chat ID. Telegram display names/usernames are descriptive, not proof of identity.
4. Click **Assign / approve**, select an existing Ruhanex user, and confirm. The target account must be enabled and have changed its initial password.
5. Ask a new question in Telegram. Pending messages are not replayed automatically after approval.

The document stores `approved: true`, `ruhanexUsername`, `ruhanexAccountGeneration`, a random `approvalRevision`, `approvedBy`, and `approvedAt`. The Admin can reassign or revoke later. Revocation sets `approved: false` and changes the revision. Receiving another /start never reapproves a revoked chat. Multiple Telegram chats can be assigned to one Ruhanex account.

Deleting a Ruhanex user through the updated user flow revokes its Telegram registrations. Independently, each AI question and alarm verifies the linked account still exists, is enabled, and matches its original account generation. Recreating a username cannot inherit its old approval. Approval/mapping is rechecked after AI generation, preventing a revoked or reassigned chat from receiving a pending AI answer. Already sent/in-flight messages cannot be recalled.

Admin API paths in Node-RED (public URLs have the existing extra `/api` prefix):

| Method | Path | Access/body |
| --- | --- | --- |
| GET | `/api/auth/telegram-users` | Admin only; up to 500 newest registrations |
| POST | `/api/auth/telegram-users/:chatId/approve` | Admin only; `{ "ruhanexUsername": "existing-user" }` |
| POST | `/api/auth/telegram-users/:chatId/revoke` | Admin only |

The existing secure-cookie, account validity, initial-password and origin checks apply. No new Nginx location is required with the supplied `/api/api/auth/` proxy. Roles and approval cannot be supplied by a Telegram sender or unprivileged frontend caller.

## Approved Telegram alarms

Use the new internal **Telegram alarm to approved user** Link In on the Telegram bridge tab. A trusted Function before a Link Out can set:

```js
msg.username = 'existing-ruhanex-username';
msg.payload = { title: 'Machine alarm', body: 'Line 02 has stopped.' };
return msg;
```

Link Out targets **Telegram alarm to approved user**. The sender reads approved registrations for that username, verifies the current Ruhanex account and rechecks the approval revision after pacing, immediately before sending. It uses no login session, so logout/session expiry does not disable approved alarms. Up to 100 chats per alarm are processed, paced at one send per second; provider errors are counted, not automatically retried. Alarm results use the safe Debug node (enable it to inspect counts).

`telegram-alarm-test.flow.json` now uses this approved sender. **Remove the previous direct HTTP test/broadcast nodes** that sent to environment chat IDs; those old nodes do not consult approval. Replace that test tab, set a real `msg.username` and verify its Link Out destination. Browser push alarms remain independent of Telegram approval. No Telegram alarms are automatically wired to machine events; your existing event logic selects recipient usernames.

For IOTstack, the default AI URL reaches the same Node-RED container. It deliberately calls the private Node-RED route rather than the website's session-cookie gateway. Keep `AI_CHAT_BEARER_TOKEN` server-side. You do not need to copy `OPENAI_API_KEY` into this bridge: the existing AI flow handles the OpenAI request and its read-only tools.

Deploy, then send a **new** message to your bot, for example:

```text
What is the current production of Keda 1?
```

The bridge polls every five seconds, then waits for Ruhana to answer. It serializes questions across all mapped chats, so a long AI question delays the next one. Text longer than 4,000 characters is rejected. Markdown bold (`**text**` or `__text__`), inline code and fenced code blocks are converted to Telegram HTML; all model-provided HTML and special characters are escaped. Replies are split conservatively at 3,500 UTF-16 units of displayed text, with balanced tags and intact Unicode characters/entities in each message. Other Markdown is left as text. Interactive charts are not sent to Telegram.

Commands:

- `/start` or `/help`: show a short introduction.
- `/reset`: clear that private chat's conversation history.
- Any other text: ask Ruhana.

### Typing indicator

Typing is enabled automatically in this version; no environment variable or palette module is required. The state machine's second output connects to **Start typing + request AI**, which starts an independent Telegram `sendChatAction` request and forwards the original AI request unchanged. **Refresh typing every 4 seconds** renews the indicator while that question is pending. The AI HTTP response passes through **Stop typing on AI completion** before returning to the state machine. Error handling clears typing state, and an expiry bounds it if a request chain is interrupted. Typing-network failures do not interrupt the AI answer. Telegram may display the last indicator for up to five seconds; in-flight requests can also finish after cleanup.

When upgrading from an older version, import the complete bridge flow, replacing matching nodes and keeping tab environment variables/MongoDB selection. Replacing only the state-machine Function code will not add the new typing nodes or required connections. Do not leave a second copy of the polling flow active.

## Existing AI flow permissions

The bridge forwards the assigned account's current MongoDB role using `X-Ruhanex-Role` and username using `X-Ruhanex-User`. The current repository's `production-ai-chat.flow.json` filters restricted tools for Line Supervisor/legacy JE roles and rejects attempts to execute unavailable tools. Use that current AI flow if your deployed copy predates those checks; replace the old AI tab rather than deploying duplicate HTTP routes. Preserve its existing environment values.

Role forwarding alone cannot enforce restrictions on an older AI flow that ignores those headers. The local test verifies the repository's AI flow enforces both tool exposure and execution. No new per-line assignments are inferred: the existing role-based AI permissions apply.

The bridge checks the approved MongoDB registration and assigned account. No Ruhanex login cookie is needed for Telegram. Revoking approval or disabling an account stops subsequent questions. Role/auth-version or approval-revision changes clear conversation continuity. An already sent message cannot be withdrawn by this flow.

## Polling and conversation state

Only **one incoming-update consumer** may use this bot token. Stop any other Telegram receiver/poller before enabling this bridge. Outbound-only alarm flows can keep running. Telegram does not allow `getUpdates` while a webhook is configured. If you previously configured a webhook, inspect it using the Bot API and remove it only if you are intentionally switching that bot to polling. This flow does not delete webhooks automatically.

The bridge keeps an update offset, a polling lock, cooldown timestamps and isolated chat histories in Node-RED flow context. Histories retain the last 12 messages for up to 24 hours; stale history is not reused. A role, password-version, account generation or mapped username change starts a new history. Set `TELEGRAM_CONTEXT_STORE` to an **existing configured context-store name**, such as `file`, if you want that state to survive restarts. Leave it unset to use Node-RED's default store. Do not name a file store unless it is already configured in settings.js.

Questions more than ten minutes old when processed are skipped so a restart does not trigger AI work on an old backlog. This also means long queues can age out. The lock prevents overlapping timer polls and expires five minutes after the last processing step if a request chain is interrupted. `/reset` requires an authorized, enabled account.

This is a simple single-instance bridge, not a durable message queue. The offset advances after replies complete. Network errors, a process crash or context-store flush delays can cause a question/reply to be repeated; retries may also repeat AI usage. Telegram 429 retry delays are honored; permanent send errors (400/403, including blocked chats) are skipped so they do not block all recipients. AI failures return a generic retry-later message. No automatic retry loop is added to individual AI requests.

## Troubleshooting

Enable **Telegram bridge safe status** in Debug temporarily. It is disabled initially to avoid a status entry every five seconds. The built-in result/error outputs contain no token, prompt, answer or upstream error body. Do not attach a whole-message Debug node before the HTTP nodes: request URLs/headers contain credentials.

- No response: check `TELEGRAM_RUHANA_ENABLED`, Mongo client and fresh message timestamp. Pending users should receive a registration reply; approve them in the Admin profile.
- Polling failure: check bot token, outbound connectivity, other pollers and webhook configuration.
- Ruhana unavailable: verify the existing AI flow works, its private bearer token matches and the internal URL is reachable. The AI tab still needs its configured model and API key.
- A Supervisor can access restricted data: update the AI flow to the current role-aware version before enabling Telegram for that role.
- Replies pause after redeploy/restart: a retained polling lock can take up to five minutes to expire.

## Local checks

```sh
node node-red/test-telegram-ruhana.mjs
node node-red/test-telegram-alarms.mjs
node node-red/test-user-auth-vapid-flow.mjs
```

The test exercises the state machine with simulated Telegram, MongoDB and AI responses. It checks private-chat authorization, role forwarding and the existing AI role guard, isolated history, reset, access changes during generation, long answers, failures and polling/retry behavior. It sends no real messages and makes no model calls. Live verification is required after import and configuration.

Rebuild the import file with:

```sh
node node-red/build-telegram-ruhana-flow.mjs
```

Telegram references: [getUpdates](https://core.telegram.org/bots/api#getupdates), [sendMessage](https://core.telegram.org/bots/api#sendmessage).
