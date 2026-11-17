# Sensor boot IDs on downtime records

This patch updates only the supplied **ALL Lines: Downtime + Shift Change** Function, ID `a46402eec7818bf5`. Import **downtime-boot-id.patch.flow.json** and replace the matching node, or paste **downtime-boot-id.function.txt** into the existing Function. Keep all three outputs and their current wiring. No new MongoDB nodes, collection, sensor firmware or environment variables are required.

## Changed areas

1. Added `sensorBootId(id)` immediately before `mongoStart()`. It reads **`counters[id].previousBootId`**, the field used by your actual Process ALL Counters function, then falls back to `bootId` and `boot_id`. String IDs are preserved (trimmed); finite numbers are stored as strings, including zero. Unknown/invalid values become null.
2. **mongoStart() / STOP_START insert:** adds `bootIdAtStopStart` and `bootIdStartObservedAt`, and initializes `bootIdAtStopEnd`/`bootIdEndObservedAt` to null.
3. **mongoEnd() / STOP_END update:** adds `bootIdAtStopEnd` and `bootIdEndObservedAt`. The original start boot ID is never overwritten during closure.

All helper callers benefit, including normal stop/recovery, shift-boundary close/reopen and deferred cross-shift recovery. Stop-start/end timestamps, identity filters, sustained-running confirmation, count resets, summary generation and communication annotation logic are unchanged. Existing documents are not backfilled with invented start IDs. An older open record can acquire an end ID when it closes, but its missing start ID remains unknown.

Fields are saved in the same existing **stoppages** documents, for example:

```json
{
  "device": "RX-CNT-1000",
  "downStatus": "STOP_END",
  "bootIdAtStopStart": "boot-A",
  "bootIdAtStopEnd": "boot-B",
  "bootIdStartObservedAt": "2026-11-17T04:30:00.000Z",
  "bootIdEndObservedAt": "2026-11-17T04:50:00.000Z"
}
```

Different known start/end IDs indicate a boot identity change **between the two observations**, assuming the sensor changes its boot ID on each restart. To find those records:

```js
db.stoppages.find({
  bootIdAtStopStart: { $type: 'string' },
  bootIdAtStopEnd: { $type: 'string' },
  $expr: { $ne: ['$bootIdAtStopStart', '$bootIdAtStopEnd'] }
})
```

The original sensor telemetry flow must already populate the counter's boot ID. If these fields are null, inspect that ingestion state instead of treating null as no reboot.

### Counter-field compatibility fix

The supplied Process ALL Counters function stores the live boot identity in `state.previousBootId`, not `state.bootId`. It also already sends the value to InfluxDB as `boot_id`. This field-name mismatch caused the first downtime patch to write null IDs even when telemetry contained them. The updated downtime patch recognizes the correct field directly.

An optional companion **counter-boot-id-alias.patch.flow.json** updates only Process ALL Counters (ID `5b2940b2f4f1eace`) by adding `state.bootId = boot` immediately after `state.previousBootId = boot`. Its counting, baseline/reboot/rollback logic and Influx output are unchanged. Replace that node or paste counter-boot-id-alias.function.txt into it. The alias fills on the next valid telemetry packet, not at deploy time. Existing null MongoDB history cannot be accurately backfilled from the current boot ID.

Additional verification: `node node-red/test-counter-boot-id-alias.mjs`.

## Observation limits

These are boot IDs known when the timer processes each event. Your stop timestamps can be backdated to the last production pulse or the first confirmed-running pulse; delayed shift closures can also be processed after their boundary. Therefore the observation timestamps are intentionally separate from `stopStart_ts` and `stopStop_ts`. This patch cannot reconstruct the exact boot identity at a historical backdated event time.

A shift-boundary closure is not a physical recovery. For a continuous stoppage spanning shifts, compare/join the segments as your downtime alert flow does. Equal IDs do not prove no restart (for example IDs could be reused or change away and back). To audit every reboot or identify changes while a stop remains open, the telemetry ingestion path should separately log boot-ID change events when received. This patch records endpoint observations without changing downtime behavior or adding such a reboot history.

## Verify

```sh
node node-red/test-downtime-boot-id.mjs
```

The harness executes the patched Function with simulated context and clock. It covers initial stop, confirmed restart, unchanged stop backdating and Mongo filters, shift-boundary closure/reopening, unknown/numeric IDs and restoration gating. It does not access a live database or deploy Node-RED.

Rebuild from an original function export:

```sh
node node-red/build-downtime-boot-id-flow.mjs path/to/original-export.json
```
