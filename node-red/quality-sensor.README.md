# Quality sensor: 16 cumulative grade counters

Import `quality-sensor.flow.json` into Node-RED. This adds an isolated tab and does not modify the tile counter, frontend, or deployed backend. No MQTT output, ESP32 commands, shift resets, or firmware acknowledgements are used.

## Setup

1. Install the same palette dependencies as your existing export: `node-red-contrib-influxdb` (0.7.0) and `node-red-contrib-mongodb4` (3.4.0). The flow targets InfluxDB 2.x/Flux.
2. Select your existing MQTT broker, InfluxDB configuration and Mongo client in the respective nodes. Placeholder connections deliberately contain no production credentials. Set the restore Influx node's organization to your actual organization.
3. Set Node-RED environment variables (process or flow environment):

   ```text
   QUALITY_INFLUX_URL=http://your-influx-host:8086
   QUALITY_INFLUX_TOKEN=your-token
   QUALITY_INFLUX_ORG=Ruhanex
   QUALITY_INFLUX_BUCKET=RCLH
   QUALITY_SUMMARY_MODE=integrated
   ```

   The restore Influx node must use the SAME server, bucket, organization and a token with read access. HTTP writes use the environment token with write access. No credentials belong in exported JSON. Use HTTPS when appropriate for your installation.
4. Configure **EDIT grade settings (all 16 grades)**. Replace the sample quality device, line and production-counter `summaryDevice`, size, design, tiles per box and good-grade flags. The sample device is disabled; enable it only after reviewing these values. Grade codes are `01` through `16`. `tilesPerBox` is a device default; a grade can override it. The size string is metadata, not converted to area.
5. Deploy the entire quality tab. Wait for restore to complete, then click **Apply grade settings** once. Settings changes, accepted baselines, totals, completed summaries and pending saves are all checkpointed. Subsequent restarts restore those settings; the example function is NOT automatically reapplied. Reapply manually only when changing configuration.
6. Wire the production summary integration below. For standalone operation instead, set `QUALITY_SUMMARY_MODE=standalone` (or omit it) and configure the Mongo node. Do not enable both summary paths if you want exactly one summary document.

## Telemetry contract

Topic: `RX-QLT/1000/telemetry`. MQTT QoS 1 subscription; one ordered publisher per device. Each snapshot contains **all 16 counters**, strictly numeric uint32 integers:

```json
{
  "boot_id": "unique-per-power-reset",
  "counts": {
    "01": 125, "02": 24, "03": 8, "04": 0,
    "05": 0, "06": 0, "07": 0, "08": 0,
    "09": 0, "10": 0, "11": 0, "12": 0,
    "13": 0, "14": 0, "15": 0, "16": 0
  }
}
```

The ESP32 maintains 16 independent cumulative counters, increments the applicable grade and publishes the snapshot. It resets only on power reset. Counts do not reset at shift boundaries. If firmware currently publishes a different shape, adapt the payload parser to that shape; no backend commands are required.

* First-ever snapshot: establish all baselines, add zero, matching your tile-counter initial-sync policy.
* Same boot: add `raw - previousRaw` separately per grade. Duplicates add zero.
* New boot: add current raw values and retire the previous boot ID.
* Rollback, malformed/missing grade or delta over configured `maxDelta`: reject the entire snapshot without changing accepted baselines. This avoids recounting after an out-of-order message. A legitimate outage batch over this limit needs review and a higher configured limit before a later snapshot can be accepted.
* Previously retired boot IDs are rejected. The retained history is limited to 128 reboots, after which commissioning a new device ID is required.

No `sequence`, device shift ID or device configuration version is required. Unique boot IDs and ordered publication remain necessary. Counts not transmitted before a power reset cannot be reconstructed.

## Flow variables and restart recovery

`flow.get('qualityState')` contains:

* `config`: editable 16-grade configuration per device;
* `devices`: current shift, last raw counters/boot ID, product/grade rows, lastSeen and anomaly metadata;
* `pending`: completed quality summaries not yet confirmed saved;
* `completed`: latest 8 confirmed summaries, for integration/retry access.

`qualityReady`, `qualityBusy`, `qualityCandidate` and `qualityQueue` coordinate processing. These are local tab context, not global variables. Cross-tab access uses the supplied Link Call endpoint.

Every accepted telemetry snapshot writes 16 `quality_signals` points and one `quality_checkpoint` point through InfluxDB's HTTP write API. The checkpoint's `state_json` is the complete authoritative snapshot, including raw baselines, configuration and unsaved completed shifts. Timestamps are monotonically increasing milliseconds; replaying a failed HTTP write uses the identical timestamp and data. HTTP 204 is required before the candidate becomes committed flow state. The next telemetry message then runs against that committed baseline.

A failed write retries every five seconds and pauses processing; inputs queue up to 5,000 snapshots. Failed restore leaves the input gate closed. After fixing the restore connection, click **Restore on deploy**. Startup restoration searches the latest checkpoint over the bucket's retained history, not just the current shift. Keep checkpoint retention long enough for the maximum shutdown duration. An empty successful restore creates a fresh disabled configuration; it cannot distinguish a new installation from an incorrectly selected empty bucket.

Use one instance of this flow per bucket: `quality-v1` is its checkpoint namespace. Multiple concurrent writers to the same namespace are unsupported. The complete JSON checkpoint favors simple consistent restoration over compact storage. The checkpoint is capped at 60 KB to keep the string field bounded; an oversized candidate raises an error before committing. Keep pending summaries cleared. For many devices or frequent product changes, split this design into separately namespaced tabs/buckets before commissioning. Assess Influx write volume as well.

Optional file context is useful as another copy, but is not required. Node-RED normally stores context in memory; its filesystem store buffers writes. This flow intentionally restores from the last confirmed Influx checkpoint rather than trusting stale local context.

## One existing production summary document (recommended)

Set `QUALITY_SUMMARY_MODE=integrated`. This suppresses the standalone Mongo upsert.

In your existing counter flow:

```text
Calculate Line Shift Statistics
  → Link Call: OPTIONAL: enrich existing production shift before save
  → Save shift summary
  → existing code-wise / stock processing
```

Configure a Node-RED **Link Call** to target the supplied link-in named **OPTIONAL: enrich existing production shift before save**. Use a timeout and retry path: rollover and the counter summary timer can run in either order. The link call deliberately fails instead of saving assumed 100% if quality is not ready. Retry the original calculated summary after at least five seconds; retain the same summary object. A production device without a quality sensor should bypass this call.

The enrichment adds `lineStats.qualitySummary`, replaces `lineStats.quality`, recalculates `lineStats.ole` and preserves the rest of the document. Each quality summary includes grade code/name, tile size, design code, tiles per box, box count and tile count. Different settings create separate grade/product rows inside the same shift. Classification is copied into each row, so earlier counts do not change retrospectively.

After **Save shift summary** confirms `payload.acknowledged === true`, branch a Link Out to **INTEGRATED: production Mongo save confirmed**. Preserve `msg.qualitySummaryKey` through the Mongo node. This clears the pending entry only after the production write succeeded; the completed copy remains available. Leave the existing code-wise path wired as well.

The existing supplied production flow uses `insertOne`. This addition does not fix duplicate production documents caused by replaying that entire old pipeline. To make retries idempotent, change the final production save to `updateOne` with filter `{ 'lineStats.device': ..., 'lineStats.shiftDate': ..., 'lineStats.shift': ... }`, update `{ $set: calculatedDocument }`, options `{ upsert:true }`, and a matching unique compound index after checking existing duplicates. In mongodb4, supply these three arguments in `msg.payload`. Keep its `acknowledged` result and the original metadata for downstream consumers. Review downstream consumers before changing that operation. Do not simply re-run an acknowledged insert.

## Standalone summary alternative

Default mode upserts one document in `quality_shift_summaries` with deterministic `_id = device|shiftDate|shift`. Mongo's `_id` uniqueness makes retry safe. No grade documents are inserted individually. Pending records survive restart and are retried on the five-second timer until acknowledged. Confirmed saves are removed from pending in the next persisted checkpoint. This mode produces a separate quality document; use integrated mode when the requirement is a single production document containing quality.

## Shift attribution and quality meaning

Shifts are 06–14, 14–22 and 22–06 in Asia/Colombo; the night shift date is its start date. The five-second timer closes the old shift even without incoming telemetry. A delayed timer/startup closes the actual old shift at its own end time, not at the latest boundary. It does not invent zero summaries for unobserved shifts.

Baselines continue across shifts. All accumulated deltas are attributed to the shift when processing occurs, as in your counter architecture. If telemetry is delayed, queued during a DB outage, or crosses a shift boundary while offline, exact physical shift allocation is unknown. A boot-only cumulative snapshot cannot resolve that. Product changes also require a final old-product snapshot to be received/committed before applying new settings; an offline batch cannot be split reliably by product.

`tiles = boxes × tilesPerBox`. `quality = goodTiles / totalClassifiedTiles × 100`, or null for no classified tiles. The sample good-grade flag is only an example. Rejected tiles that never enter boxes are outside this metric. `baselineOnly` indicates initial synchronization occurred during that shift; anomaly metadata flags reboots. These records are received-time classified-output statistics, not a guarantee of complete physical production accounting.

Offline validation: `node node-red/test-quality-sensor-flow.mjs`. Rebuild the export after source edits with `node node-red/build-quality-sensor-flow.mjs`. Live broker/database deployment has not been performed.

References: [Node-RED context](https://nodered.org/docs/user-guide/context), [InfluxDB palette node](https://flows.nodered.org/node/node-red-contrib-influxdb).

