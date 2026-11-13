# Communication-affected stoppages

Import `communication-stoppages.patch.flow.json` and **update the existing timer function** `d02981e2959d1438` (ALL Lines: Downtime + Shift Change). Preserve its node ID and existing three outputs. Do not add a second timer. Only this function node is exported; no database credentials are included. Its existing Mongo output must support `msg.operation = updateMany` as well as its current insertOne/updateOne commands.

The patch wraps your supplied timer and retains all shift-boundary, recovery, downtime and summary calculations. After each tick it checks enabled counters' `lastSeen` and `sensorStatus`:

* Explicit MQTT status `Offline`, or telemetry older than `communicationTimeoutMs`, creates a communication-gap observation.
* Default timeout is 60,000 ms. Override per line in `global.lineSettings[line].communicationTimeoutMs` or per device in `global.counterConfig[device].communicationTimeoutMs`. Set it comfortably above the actual ESP32 heartbeat interval, with allowance for normal jitter. This is a communication timeout, independent of production `stopDelayMs`.
* A stopped but connected line must continue publishing unchanged cumulative counts/heartbeats. If it publishes only when a tile passes, missing telemetry cannot distinguish connectivity from a genuine idle line; this feature would then misclassify idle periods.
* New stoppage inserts overlapping the gap are flagged directly. Existing overlapping stoppages are marked by updateMany, at loss detection, at most once every 30 seconds while missing, and when fresh telemetry returns.

Saved fields on the existing Mongo `stoppages` documents:

```text
communicationAffected: true
communicationEvidence: "mqtt_offline" | "telemetry_timeout"
communicationGapStart_ts: earliest observed gap's lastSeen
communicationGapObservedUntil_ts: latest observed gap endpoint
```

For repeated gaps in one stoppage, these fields are outer bounds, not a sum or detailed interval history. The flag means the stoppage **overlapped uncertain communication**. It does not mean every minute of the stop was caused by network loss. An already stopped machine can also lose communication. The frontend colors the entire affected bar purple and labels it "Communication affected (machine state uncertain)". Open and completed ordinary bars retain orange and red. The stoppage table also shows a purple tag.

The existing supplied `Format Shift Stoppages` API spreads each database row into the response and therefore carries these fields to the browser. If your deployed API instead allowlists fields, add the four metadata fields above. This is needed for both live and historical views.

No RSSI or physical Wi-Fi diagnosis is available in this export. Wi-Fi loss, ESP32 power loss, MQTT failure and other network issues can produce the same symptoms. The patch uses the broader communication label deliberately. lastSeen is Node-RED receive time; the status handler may also update it. Gap endpoints are observations rather than exact radio-disconnection times.

This change does **not** remove time from availability/OEE, stop creating downtime records, or replace the existing Stopped status with Unknown. It adds identification/coloring only. Excluding communication periods from KPIs or reconstructing actual machine state requires a separately agreed policy and evidence; cumulative recovery counts alone do not reveal when individual tiles passed. Existing stops are not retroactively reclassified without overlap evidence from this running monitor.

`flow.communicationGapTracking` tracks an active gap. It uses the configured default context store; enable persistent context if continuity across Node-RED restarts is required. The metadata already written to Mongo survives restarts. The monitor has no independent communication journal or database-success acknowledgement; offline writes are retried periodically, but a failed final reconnect write can leave the last observed endpoint stale. Startup downtime restore and heartbeat availability remain prerequisites.

Build: `node node-red/build-communication-stoppages-patch.mjs PATH_TO_SUPPLIED_EXPORT`. Test: `node node-red/test-communication-stoppages.mjs`. No live MQTT/database deployment was performed.
