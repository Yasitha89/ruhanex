# Diagnose current AI downtime sender

Built from your supplied sender export on 2026-11-22. This is a temporary diagnostic patch, not a recipient/policy change. It preserves the four-output routing, Mongo collections, AI decisions, delivery records and **Admin-only** account check.

## Findings in the supplied code

- Only users whose role is exactly **Admin** pass the final recipient check. Manager/Supervisor accounts are checkpointed/skipped. Telegram registration must also be approved, linked to the same account generation, with enabled account and completed initial password change.
- The assessment stage can use a factual fallback when OpenAI configuration/calls fail, **but the drafting stage cannot**. If `OPENAI_API_KEY` or `OPENAI_MODEL` is unavailable on this tab, it schedules another draft attempt and sends nothing. A key/model on a different flow tab is not automatically inherited. Invalid API responses, incomplete output or text longer than 1200 characters also cause draft retries.
- An open Mongo segment beginning before the current shift start is skipped. The sender requires the current-shift boundary split. This matters if the earlier inconsistent stop-start problem still exists.
- A poll lock and delivery leases last five minutes. Existing database delivery records can also suppress repeats. Do not delete these records or clear a lock blindly.
- Configured suppressed reasons, AI defer/suppress decisions and future review times can intentionally prevent an alert, even past 30 minutes. This is the AI-driven sender, not the earlier unconditional 30-minute reminder flow.

These are code paths, not proof of which condition is active on your server. The diagnostic output identifies the actual one.

## Confirmed expired-lock bug and correction

The reported sequence `startup-checks-passed` → `different-poll-owns-lock`, with the configuration checker reporting zero remaining lock time, exposes an expired owner left in context. The original startup check allowed expired locks through, but its later ownership check rejected any different ID without checking expiration. That could block every future poll indefinitely.

The updated diagnostic sender lets a **new snapshot poll** replace an expired lock. It still blocks an active lock and rejects old asynchronous callbacks whose poll no longer owns the lock (even if that other lock is expired). Replace the main sender Function from the updated patch and deploy. No manual lock clear or Mongo delivery-ledger deletion is needed. Tests cover expired-lock recovery, active-lock exclusion and stale callbacks. Recipient roles, AI assessment/drafting policy and delivery deduplication remain unchanged.

## Install and inspect

1. Import **telegram-downtime-diagnostics.patch.flow.json**, replacing **Assess downtime and deliver Telegram alerts** (`d8687f0fb9d3963a`) by ID. Its original four output connections remain unchanged. The file also adds a manual safe configuration-check Inject and Function connected to the existing **Downtime alert safe result** Debug.
2. On this **receiving Telegram alert tab**, set **DOWNTIME_ALERT_DEBUG=true** as a String without extra quotes, then deploy.
3. Click **CHECK downtime alert configuration (safe)**. It reports booleans for enabled/token/key/model configuration, context-store validity, lock duration and snapshot age. It never prints tokens or chat IDs.
4. Wait for snapshots and inspect **Downtime alert safe result**. Paste the diagnostic `reason` and fields to locate the failure.

The complete sender file **telegram-downtime-diagnostics.complete.flow.json** is an alternative to the patch; do not import duplicate sender copies. Existing Mongo configuration is referenced without exporting credentials.

## Diagnostic reasons

The Function must have **four outputs**: 1 MongoDB operation switch, 2 Telegram HTTP, 3 **Downtime alert safe result** Debug (payload), 4 OpenAI HTTP. The patched node labels these outputs. If code was copied into a new Function with one output, the diagnostic/AI outputs will be discarded. Keep the original wiring or import the complete diagnostic flow by replacing existing IDs.

With debugging enabled, every invocation now reports `message-entered`. Each Mongo request reports `database-request` with its operation/stage. If the last entry is `database-request` / `stops.find` and there is no subsequent `message-entered` / stage `stops`, inspect the operation switch, stops.find Mongo connection and return wire to the main Function. If even message-entered is absent, verify third-output wiring, Debug enabled/sidebar filters and DOWNTIME_ALERT_DEBUG on this exact tab before investigating delivery policy.

| Reason | Meaning |
| --- | --- |
| `alerts-disabled` | DOWNTIME_ALERT_ENABLED is not true on this tab |
| `poll-lock-active` | Another poll still holds the lock; remaining seconds reported |
| `no-complete-valid-stoppage-chain` | Mongo records do not establish a valid continuous episode |
| `runtime-stopped-but-latest-db-stop-closed` | Runtime and latest saved stoppage disagree |
| `open-stoppage-not-split-at-current-shift` | Latest open segment starts before this shift boundary |
| `no-alert-trigger-due` | No new evidence/checkpoint/follow-up is due |
| `suppressed-by-configured-reason` | Reason is in the configured suppression list |
| `assessment-using-fallback` | Assessment key/model missing; configured booleans reported |
| `assessment-decision` | Actual send/suppress/defer decision and review interval |
| `message-draft-unavailable` | Missing OpenAI config, failed request or invalid/incomplete draft; HTTP status and safe error code included |
| `approved-registration-count` | How many approved Telegram registrations were loaded |
| `recipient-not-eligible` | Role/enabled/password/account-generation gate rejected a recipient |
| `telegram-response` | Actual Telegram HTTP/ok/error-code result |

Turn **DOWNTIME_ALERT_DEBUG=false** after resolving the issue to suppress temporary traces. Keep Debug on payload only; full HTTP messages can contain bot URLs or Authorization headers. The patch does not send any messages during local generation/testing. It will follow your existing delivery policy when deployed in the live flow.

```powershell
node node-red/build-telegram-downtime-diagnostics.mjs "path/to/current-sender-export.json"
node node-red/test-telegram-downtime-diagnostics.mjs
```
