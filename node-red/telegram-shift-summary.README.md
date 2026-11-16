# Automatic completed-shift Telegram summary

This add-on reads **saved MongoDB documents**, formats them directly (no AI/model call), and sends the completed shift to approved Telegram chats assigned to enabled **Manager, Admin or Line Supervisor** accounts (including legacy JE). Existing Telegram approval remains authoritative; no chat-ID list is required.

Included lines, in report order:

1. Glaze Line 1
2. Glaze Line 3
3. Kiln 1
4. Kiln 2
5. Keda 1
6. Keda 2
7. Keda 3

Glaze Line 2 and Kiln 3 are excluded. The add-on does not sum production across successive manufacturing stages.

## Import and connect

1. Import **telegram-shift-summary.flow.json** as a new tab, **Telegram completed shift summary**.
2. Select the existing MongoDB client in all six MongoDB nodes. They reference client ID `8120871193b8f276`. Collections: `shifts`, `ruhanex_users`, `ruhanex_telegram_users`, and the new `ruhanex_telegram_shift_reports` delivery ledger. No credentials are exported.
3. Import **telegram-shift-summary.connector.flow.json** on your existing shift-save tab. It contains only a Link Out. Open it and verify its destination is **After completed shift code-wise save**.
4. Add a wire from your existing **Update Shift Code-wise Production** MongoDB node to that Link Out. In the supplied export, the active node is **ceb7f2b046b165ff**. Keep its existing debug, floor-stock and car-stock connections. This is an additional branch, not a replacement.
5. The supplied export also has an unconnected duplicate code-wise chain ending at **dd39b92b4614c3ed**. If that chain is actually used in your live flow, branch from its final MongoDB output to the same connector too. Duplicate triggers are safe. Do not enable unused duplicate upstream chains just for this add-on.
6. Configure the environment variables below on the new report tab, then deploy.

```text
Existing Update Shift Code-wise Production (MongoDB output)
  ├─ existing debug / floor-stock / car-stock connections
  └─ To Telegram shift summary (AFTER code-wise save) [Link Out]
       → After completed shift code-wise save [Link In, report tab]
```

Do not connect before the first **Save shift summary** node or directly to the one-second timer. Your flow enriches the base summary with code-wise and size-wise data later; this add-on must observe the final code-wise MongoDB write result. That result must preserve `msg.codeWiseTarget`, which your supplied chain does, and contain `payload.acknowledged: true` plus `matchedCount >= 1`.

## Environment variables

Set as **String** values in the **Telegram completed shift summary** tab properties, without surrounding quotes:

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Your existing BotFather token |
| `SHIFT_REPORT_ENABLED` | `true` |
| `SHIFT_REPORT_CONTEXT_STORE` | Optional existing persistent Node-RED context-store name, e.g. `file` |

Tab variables on the separate Telegram/Ruhana tab are not automatically inherited. Put the bot token on this report tab too, or supply it through the Node-RED process environment. No new npm modules, OpenAI key or AI private token are needed.

Do not name a persistent store unless it already exists in your Node-RED settings. The default context store holds pending-work state. The MongoDB ledger independently remembers sent reports, so redeploying/restarting cannot ordinarily resend a finished report. If a restart loses pending state in a memory-only context store, use the manual trigger after the completed summaries are ready.

## Completion and report calculations

Each successful final line-save event queues its **actual shiftDate + shift** from `codeWiseTarget`, rather than guessing the previous shift from the current clock. This handles delayed summary generation, including the cross-shift running-confirmation behavior in your supplied timer.

Every 15 seconds, pending reports read **all documents for that exact saved shift**. The newest document per included line is selected using the greatest saved `updatedAt`/`codeWiseUpdatedAt` timestamp, with a deterministic document-ID tie break. Duplicate summary documents are not summed. The report waits until all seven selected line documents have `codeWiseUpdatedAt` and a `codeWiseProduction` array. A completed empty array is valid; a missing array means enrichment is not finished.

If a required line is disabled, missing or failed to save/enrich, no incomplete report is broadcast. Safe Debug lists the lines still awaited. Pending jobs retry for 30 minutes, then stop with a timeout notice; fix the missing source and use manual retry. This avoids sending partial totals as a finished shift.

- **Production:** saved `lineStats.production`, in m², after the final code-wise save.
- **% of target:** saved production divided by saved `targetProduction`, multiplied by 100. The saved target is used as-is; no new shift target is inferred. Missing/zero targets display `target N/A`.
- **OLE:** saved `lineStats.ole` percentage, without recomputing the upstream KPI.
- **Code-wise production:** aggregate `lineStats.codeWiseProduction` by designCode across tile sizes/runs. Do not add `codeWiseProductionTimeline` again. Prefer each row's saved m²; if absent, a valid tile count and centimetre tile dimensions can compute its m².
- **Downtime:** saved `lineStats.totalDowntimeMinutes`.

Unknown metrics appear as N/A, not invented zeros. A zero-production completed shift has no-production text. If saved production is positive but its completed breakdown is empty, the report explicitly says the code breakdown is unavailable.

Example Telegram layout (illustrative values):

```text
📊 SHIFT SUMMARY
📅 2026-11-14
🕒 06:00–14:00 · Sri Lanka

Glaze Line 1
2,000 m² (90% of target) · OLE 75%
  • Yk,pl — 1,000 m²
  • ykm.sm — 1,000 m²
⏱ Downtime: 200 min

Glaze Line 3
...
```

Telegram HTML bold formatting highlights headings and main values. Special characters in design labels are escaped. Long reports split on complete lines, with a repeated shift header and messages below Telegram's size limit. Overnight headings show both start and end dates.

## Manager recipients and delivery records

The report snapshots approved Telegram registrations once when all seven summaries are ready. Before **each message part**, it paces delivery, rechecks the registration approval/revision, and looks up the current linked Ruhanex account. It sends only when:

- The Telegram registration is still approved and assigned to the same account/revision.
- The Ruhanex account is enabled, has completed its initial password change, and has role `Manager`, `Admin`, `Line Supervisor` or legacy `JE`.
- The account generation matches the registration (deleted/recreated usernames cannot inherit approval).

Multiple approved Telegram chats belonging to a Manager can receive the report. No login session is required. Approval added after a report's recipients have been snapshotted applies to subsequent shifts, not that existing report. A report with no eligible Managers sends no messages and is still marked complete. The approved-registration read is capped at 500; exceeding that fails explicitly rather than silently dropping recipients.

Delivery ledger documents in **ruhanex_telegram_shift_reports** use `_id = shiftDate|shift`, for example `2026-11-14|06-14`. MongoDB's unique `_id` plus an atomic five-minute lease prevents repeated line-save events/concurrent retries from starting duplicate broadcasts. Report content and recipient snapshot are frozen on first preparation. Progress is checkpointed per chat after every successful part; failed/revoked/ineligible recipients are skipped so they do not block other Managers.

Transient network/provider errors retain saved progress for retry after lease expiry. The 30-minute processing window still applies. Provider 400/403 failures are skipped, while other failures retry after the five-minute lease (which also exceeds typical Telegram retry-after delays). Provider acceptance is not proof the recipient read a message. There is no exactly-once guarantee across a process crash or MongoDB failure **after Telegram accepts a part but before its checkpoint**; that part can be duplicated on retry. An already in-flight message may arrive after approval is revoked.

The existing `shifts` collection and stock-processing flows are only read/observed; no summary/statistics or stock calculations are changed.

## Manual test / retry

Click **MANUAL: latest completed shift (real send)** only when ready to send actual messages. It calculates the last completed shift in Asia/Colombo and uses the same completeness, recipient and deduplication checks. It will not resend a report already marked sent.

For a specific older shift, use a temporary trusted Inject/Function message into **Wait for all lines + deliver report**:

```js
return {
  shiftReportEvent: 'manual',
  shiftDate: '2026-11-14',
  shift: '06-14'
};
```

This resets the local timeout for an unsent job; saved MongoDB progress is retained. Do not delete the ledger just to test: removing a sent record allows real duplicate delivery. Safe Debug shows waiting, duplicate, failure or completion status without bot credentials or upstream response bodies.

## Local verification

```sh
node node-red/test-telegram-shift-summary.mjs
```

Simulated tests cover shift-boundary dates, failed-write rejection, enrichment readiness, duplicate document selection, line exclusions, code aggregation, Manager-only approved delivery, replay prevention, retry/lease recovery, revocation, HTML escaping and message length. No live database calls, Telegram messages or deployment are performed.

Rebuild the import files with `node node-red/build-telegram-shift-summary-flow.mjs`.
