# Independent quality sensor restoration

Built against your attached quality flow dated 2026-11-21. The existing **Validate + capture registered line settings** Function body and **Save quality box snapshots** InfluxDB Out configuration are unchanged. New quality-only nodes sit between them. They do not read or modify `flow.counters`, downtime state, counter restore flags, counter Influx queries or counter telemetry processing.

## Installation — choose one file

### Complete quality flow (easiest)

Back up the existing quality flow, then replace its MQTT, validator, Influx Out and Debug nodes with **quality-restore.complete.flow.json** on the same tab. Preserve/replace the original node IDs when importing; do not create a second MQTT-to-Influx path. This includes all the quality restore nodes already connected. Existing broker and Influx configuration nodes are referenced by ID, not re-exported with credentials. Select the existing connections if shown as missing.

### Add-on only

Import **quality-restore.add-on.flow.json** on the same tab as your existing quality validator and Influx Out node.

1. Remove the wire from **Validate + capture registered line settings** (`47f5060cde6f1579`) to **Save quality box snapshots** (`5192007de14ed9bf`).
2. Connect the validator's output to **Quality ONLY: restore gate + reboot-safe counts**.
3. Connect that new Function's **first output** to the existing **Save quality box snapshots**. This connection is included by ID in the file, but verify it after import.
4. Keep its second output connected to **Quality ONLY: restore latest quality_events**, and its third output to **Quality committed counts**.
5. Verify the new Complete node and write Catch node both target the existing **Save quality box snapshots** node. If your write node has a different ID, select it in both nodes and change the first-output connection.

Your existing validator → Debug branch may remain; it shows incoming raw payloads, not confirmed accumulated totals.

```text
Quality MQTT → existing validator → quality restore/count engine → existing Influx Out
                                       ↑                            │
                                       ├── Complete → commit saved ─┘
                                       ├── Catch write → retry on timer
                                       └── Influx query → restore result

Quality startup / five-second timer → engine
```

Use Node-RED with Complete-node support and the installed `node-red-contrib-influxdb` **0.7.0**. The 0.7.0 output implementation calls its completion callback after the Influx flush succeeds; failures go to Catch. Do not replace the Complete trigger with a branch before the database writer, since that would confirm unsaved data.

## Connections and startup

The Influx read node uses existing config **eef122fda5340dac**, organization **Ruhanex**. The query and existing Out node both use bucket **RCLH**, measurement **quality_events**. No URL/token environment variables are required. Optional `QUALITY_RESTORE_BUCKET` changes only the query; change the existing Out node's bucket too if using it. Both must target the same database.

Startup waits for `global.devicesReady === true` and `global.settingsReady === true`, set by your existing Mongo configuration loader. It then queries Influx independently of the counter restore pipeline. No link to counter initialization is required. The timer retries until configuration is ready. Failed queries keep the quality gate closed and retry; an empty successful query means no retained baseline exists.

The query searches retained history from 1970, selecting the latest required fields per device before pivoting. This avoids a fixed one-hour recovery limit, but requires read access and can still be expensive for a large retained dataset. Retention must cover the maximum downtime. A wrongly selected empty bucket looks like a new installation; verify the connections before commissioning.

The query converts `_value` to strings with `toString()` before grouping and pivoting. This is required because `sequence` is numeric while boot/JSON fields are strings. Otherwise Flux reports a pivot/group schema collision. This conversion affects the query results only, not the stored field types; the restore parser converts sequence back to a number.

## Count behaviour

- Counts represent **boxes**, including Grade 0 undetected boxes. Raw firmware values and all existing design, size, tiles-per-box and grade-assignment metadata remain in each point.
- **First-ever snapshot with no retained baseline:** establish a baseline and add zero boxes, matching your counter's initial-sync policy. Counts already present before commissioning are not silently claimed as new production.
- **Same boot, increasing sequence:** add each `raw grade counter − previous raw grade counter`.
- **Duplicate sequence with identical counters:** ignore; no extra count/write. Same sequence with changed counters is rejected with a warning.
- **Older sequence or a previously retired boot:** ignore as stale.
- **New boot ID:** retain accumulated totals, add the new boot's current grade counters and retire the previous boot ID. ESP32 counters are not rewritten/reset by the backend.
- **Counter rollback without a new boot ID:** reject without moving the baseline. New boot IDs must be unique per restart. Sequence wrap without a new boot is unsupported.
- **Excessive delta:** reject if the sum exceeds `QUALITY_MAX_BOX_DELTA`, default **10000 boxes per accepted snapshot**. Configure a positive integer for legitimate larger outage batches. A later reading can recover a rejected batch if it stays under the configured limit; baseline remains unchanged.
- **Shift transition:** the existing five-second quality timer publishes the new Colombo shift in `flow.qualityCounters`, setting `shiftCount:0` and all 16 `shiftGrades` to zero even without telemetry. This happens within the timer interval, not necessarily exactly on the boundary millisecond. `shiftViewReset:true` identifies a zero current-shift view before the first new-shift reading is committed. Lifetime totals/raw baselines remain unchanged. New-shift accepted readings then populate these counts normally.

For an offline batch spanning shifts or size/design changes, exact physical allocation is unavailable from cumulative counters alone. Deltas are assigned to the received reading's shift and product metadata. Before applying changes, arrange final old-product readings if exact attribution is required. Reboots can lose boxes never transmitted before power loss. `dropped_events` remains stored as firmware evidence; no missing counts are invented.

## Influx fields and runtime state

The same **quality_events** point now includes:

- `device_count`, `shift_count`, `box_delta`, `event_type`.
- `grade_0_device_count` through `grade_15_device_count`.
- `grade_0_shift_count` through `grade_15_shift_count`.
- `grade_0_delta` through `grade_15_delta`.
- `quality_shift`: `06-14`, `14-22` or `22-06`; `quality_shift_date`: shift start date. Existing raw metadata fields `shift` (A/B/C) and `shift_date` remain unchanged.
- `quality_state_json`: checkpoint for this device: previous raw array, boot ID, sequence, cumulative totals, current-shift totals, last timestamp and retired boot IDs.

The point's existing `total_count` remains the **raw firmware total for the current boot**. Use `device_count` for the restored backend lifetime count. Integer values use the palette's `123i` format.

Current-shift published state is local to this tab:

```javascript
const states = flow.get('qualityCounters') || {};
msg.payload = states['RX-QLT-4000'] || null;
return msg;
```

Each device entry contains `deviceCount`, `deviceGrades` (array indices 0–15), `shiftCount`, `shiftGrades`, `shift`, `shiftDate`, `previousRaw`, `bootId`, `sequence`, `baselineOnly`, and `seed`. `qualityRestoreReady` indicates successful restoration. These names are distinct from the counter runtime. Other tabs need a Link Call/API to read this state; it is not published globally.

The authoritative checkpoint/baseline state is now kept separately in `flow.qualityCommittedStates`. `flow.qualityCounters` is a deep-cloned current-shift view. At a boundary, only that view's shift counts/date change; the committed baseline is retained until subsequent telemetry is successfully saved. This prevents an in-flight previous-shift write from restoring old counts to the current display or corrupting buffered-event delta calculation. Restart restores the saved checkpoint and immediately publishes a zero view if it belongs to an older shift; no synthetic telemetry/zero point is inserted into Influx merely to reset the display.

To enable boundary resets in an existing installation, replace **Quality ONLY: restore gate + reboot-safe counts** from the updated complete flow and deploy; keep **Quality startup / retry every 5 seconds** connected. Do not manually clear `flow.qualityCounters` or the committed state inside the production counter's shift-change function. No production-timer wiring changes are required.

## Restart, deployment and write failures

The engine's On Start closes the gate and clears its transient queue/candidate whenever that Function is restarted/redeployed. The timer then restores the most recent checkpoint. Incoming already-validated snapshots queue until restore succeeds (maximum 5000). Processing is serialized; state is committed only after the Influx Out Complete event. During a write error, the candidate and identical timestamp/body remain pending and retry on the five-second timer. New readings wait behind them. Late callbacks from a previous engine generation are ignored.

Do not deploy/restart individual supporting nodes while leaving an outstanding write in progress: use a deploy that restarts the quality engine and writer together. Do not attach unrelated writers to its checkpoint series; use one instance of this flow per sensor.

The queue is in memory, not a durable inbox. Restart/deploy can lose uncommitted buffered readings; a later cumulative reading can recover same-boot differences from the persisted baseline. It cannot recover intermediate boot counters or exact product/shift attribution of lost buffered readings. Complete is a client write confirmation, not a separate durable message journal. Influx point/checkpoint persistence relies on the database and its retention/backup settings.

## First upgrade from the old raw-only quality flow

Older `quality_events` points have no `quality_state_json`. The latest stored raw array/boot/sequence is restored as a **legacy baseline**, with tracked backend lifetime/shift totals initially zero (`seed: legacy_baseline`). Subsequent differences are counted; a new boot adds its raw counters. This prevents recounting old snapshots but does not reconstruct all historical shift/lifetime production across old reboots. Those historical totals require a separate history migration/aggregation. Once a new point is confirmed, future restarts restore the saved accumulated totals exactly.

The restart debug **Quality committed counts** reports `{saved:true,device,deviceCount,shiftCount,eventType}` after confirmed writes. It does not claim that the ESP32's own raw counters were restored. No MQTT commands are sent.

## Validation

Test one device through: initial baseline → increments → duplicate snapshot → Node-RED restart → same-boot increment → sensor reboot with a fresh boot ID → further increments. Compare committed Debug totals and the saved `quality_state_json`. Test a temporary Influx write failure; counts should not commit until the retry succeeds. Test a shift change using a test environment rather than altering the live server clock.

```powershell
node node-red/build-quality-restore-flow.mjs "path/to/original-quality-export.json"
node node-red/test-quality-restore.mjs
```

This stage adds quality counting/recovery only. It does not modify counter restore, write Mongo shift quality summaries, change OLE, or create production-dashboard quality APIs.
