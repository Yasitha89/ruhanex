# Continuous downtime alerts to Telegram Managers

This add-on sends fixed, factual Telegram messages through your Ruhana bot. No AI/model call is needed. Each enabled production line is monitored independently:

- First alert at **30 minutes** of continuous downtime.
- Another alert at **60 minutes**, then **90, 120, 150 minutes, etc.** while it remains stopped.
- One **Line running again** message only after the actual confirmed Running state is observed on the next poll, without any additional confirmation delay, the database agrees with the recovery timestamp, and an earlier downtime alert was accepted for at least one Manager.

The polling interval is 15 seconds, so messages may arrive shortly after thresholds. The timer does not send a message on every poll. Telegram/provider/network delays are additional.

## Import and wire

1. Import **telegram-downtime-alerts.flow.json** as a new tab named **Telegram continuous downtime alerts**.
2. Select your existing MongoDB client in all eight MongoDB nodes. Reference ID is `8120871193b8f276`; connection credentials are not exported.
3. Import **telegram-downtime-alerts.connector.flow.json** onto the **same existing tab** as your active **ALL Lines: Downtime + Shift Change** Function and its one-second timer. It adds its own 15-second Inject, a runtime-snapshot Function and a Link Out. It needs no connection to your existing timer or MongoDB write outputs.
4. Open the connector Link Out, **To Telegram continuous downtime alerts**, and verify its destination is **Confirmed downtime runtime snapshots** on the new alert tab.
5. Set the environment variables below on the new alert tab, then deploy.

The connector must stay on the real downtime runtime tab because `flow.get('downtimeStates')`, `counterRestoreReady` and `downtimeRestoreReady` are scoped to that tab. Importing it on a separate test/alert tab will not read those runtime values. The supplied connector references original tab `e5489573e203f3d0`; select/move it to the actual live tab if yours differs.

```text
Existing downtime tab (no changes to existing wires)
  New Inject every 15 sec
     → Snapshot confirmed Running / Stopped status
     → Link Out
         → Alert tab Link In → MongoDB checks → Telegram
```

Your existing summary/stock/shift-save flows remain unchanged. Do not add a Running alert directly after MongoDB closes a stop.

## Environment variables

On **Telegram continuous downtime alerts** tab, add as String values without extra quotes:

```text
TELEGRAM_BOT_TOKEN=your existing BotFather token
DOWNTIME_ALERT_ENABLED=true
```

Optional `DOWNTIME_ALERT_CONTEXT_STORE` can name an **already configured** Node-RED context store for the alert-poll lock. Do not name a store that does not exist. No new npm modules, OpenAI keys, Nginx routes or website changes are needed. A bot token configured on another flow tab is not automatically inherited; provide it on this tab or through the process environment.

Managers need an existing **approved** `ruhanex_telegram_users` registration linked to an enabled Ruhanex account with role exactly **Manager**, a matching account generation and completed initial password change. Admins and Supervisors are not recipients of this add-on. User session expiry/logout does not disable approved notifications. This does not change the separate shift-summary recipient rules.

## Continuous downtime across shifts

Your saved stops are split at 06:00, 14:00 and 22:00 Asia/Colombo. The add-on reads the newest 1,000 stop records per device, then walks backward across **exactly touching records at those shift boundaries**. It treats the resulting chain as one continuous episode. A real close/reopen at another time starts a new episode.

Example:

```text
13:40–14:00  old shift record
14:00–open   new shift record

14:10  30-minute alert
14:40  60-minute alert
15:10  90-minute reminder
```

Reason is taken from the newest nonempty reason in that chain. Each new interval rereads MongoDB, so a newly assigned reason appears in later reminders. If none is assigned, the message says **Reason not assigned yet**. Saved `reason`, `downtimeReason` and `downtimeCode` fields are supported. The sender does not infer a physical cause from communications loss.

The chain relies on your existing code's exact millisecond shift-boundary timestamps. Non-touching records are not guessed to be continuous. If the entire available 1,000-record history ends at a boundary and continuity could extend further back, that episode is skipped rather than assigning an incorrect start time. Add this index for efficient device history reads:

```js
db.stoppages.createIndex({ device: 1, stopStart_ts: -1 })
```

## Confirmed recovery and false-recovery prevention

MongoDB closure alone is insufficient. The connector checks the original runtime `downtimeStates`:

- `status` must be **Running**, which your existing logic sets only after its sustained-running confirmation.
- `pendingShiftRecovery` must be empty; undecided cross-boundary recovery is ignored.
- `lastEventTs` must contain the confirmed runtime recovery timestamp. No extra stable-running timer is used.
- The most recent closed stop's `stopStop_ts` must exactly match that confirmed runtime recovery timestamp, with no open continuation record.

Consequently a normal shift-boundary closure cannot send a false Running message. Your existing configurable running confirmation is sufficient. Recovery is announced on the next 15-second snapshot/poll once MongoDB agrees, without another 60-second wait. Telegram pacing, queueing and network delivery can add latency.

The notification's total downtime ends at the actual saved recovery time; it does not add polling or delivery time. Short stoppages that never sent an alert do not send a running-again notification.

## Messages

```text
🚨 DOWNTIME ALERT
Line: Kiln 1
Stopped at: 16 Nov 2026, 13:40
Downtime: 60 minutes
Reason: Motor overload
```

```text
✅ LINE RUNNING AGAIN
Line: Kiln 1
Stopped at: 16 Nov 2026, 13:40
Total downtime: 125 minutes
Running from: 16 Nov 2026, 15:45
Reason: Motor overload
```

Messages are plain text, so user-entered reasons cannot inject Telegram HTML. No telemetry or production setting is changed.

## Delivery tracking and retries

Two new collections are created on first use:

- **ruhanex_telegram_downtime_episodes**: one continuous episode per `_id = device|originalStartTimestamp`; records the last completed 30-minute bucket, whether any Manager was notified, and recovery completion.
- **ruhanex_telegram_downtime_events**: one notification per `_id = device|originalStartTimestamp|bucket`; bucket `1` means 30 minutes, `2` means 60 minutes, etc.; `running` is the recovery notice. Stores frozen text, an approved-recipient snapshot, per-chat processed flags and a five-minute atomic send lease.

The lease, unique document IDs and checkpoints prevent normal duplicate polling/redeploys from resending completed alerts. Every recipient is paced at one request per second and rechecked against current Telegram approval and the current Manager account before sending. Revoked/reassigned/disabled/deleted/recreated accounts are skipped. Blocked/unavailable chats (Telegram 400/403) are skipped so other recipients can proceed. Other send failures retry unprocessed recipients after lease expiry. Very large Telegram `retry_after` values are not separately scheduled by this simple sender; it uses the five-minute retry lease.

If the alert flow starts while a line is already stopped for several hours, it sends **one current overdue alert**, rather than flooding Managers with all missed 30-minute intervals. Subsequent reminders follow the next elapsed half-hour boundary. Events already frozen for retry retain their original text/recipient snapshot; fresh intervals reread the latest reason. Users approved after an interval was prepared receive future intervals.

There is no exactly-once guarantee if Telegram accepts a message but a process/database failure occurs before its checkpoint; a retry can duplicate that message. Snapshot data is sampled, and an already queued/in-flight notice cannot be recalled if the line's state or approval changes afterward. Runtime and MongoDB must agree before recovery is announced.

## Troubleshooting and test

Enable **Downtime alert safe result** temporarily. It is initially disabled to avoid a debug entry every 15 seconds. Missing snapshots usually mean the connector is on the wrong tab, restore gates are not ready, or the Link Out destination is wrong. The connector sends only configured enabled devices with runtime Running/Stopped states. There are no automatic line exclusions such as the shift report's Glaze Line 2/Kiln 3 exclusion.

Do not attach a whole-message Debug node before Telegram HTTP: the request URL contains the bot token. The included Debug/error outputs contain safe status messages only.

Run local simulated verification:

```sh
node node-red/test-telegram-downtime-alerts.mjs
```

Tests cover 30/60/90/120-minute notices, latest reasons, shift stitching, Manager-only delivery, duplicate suppression, physical recovery versus boundary closures, recovery on the first confirmed Running snapshot, short stops and transient-failure retries. They send no real messages and do not contact MongoDB. Rebuild import files with `node node-red/build-telegram-downtime-alerts-flow.mjs`.
