# Counter communication status history

Import `device-status-history.patch.flow.json` and update the existing **Update Sensor Status** function node, preserving ID `e7854d62c23ddcbf` and its existing debug output. The patch adds a branch after that function; it does not replace the MQTT subscription, change runtime counter processing or send commands to devices. Keep the imported logger nodes on the same tab as the status function (flow context is shared within that tab).

## Influx setup

Create an InfluxDB 2.x bucket named **communication_monitoring**, with retention suited to your troubleshooting needs (for example, 90 days). Both the read and write nodes reuse existing Influx connection `eef122fda5340dac`, organization **Ruhanex**. Grant its token read/write access to the new bucket. For an entirely separate Influx server, select that server's connection in both nodes and update their organizations. No token or server configuration is exported.

The writer is a native **influxdb batch** node, with millisecond precision. Measurement: **device_status_events**. Tags: `device`, configured `line`, and `source=mqtt_status`. Fields:

| Field | Meaning |
|---|---|
| status | Online, Offline or Unknown |
| previous_status | Previously logged status |
| event_type | initial_observation, status_change or retained_observation |
| retained | Whether MQTT marked the received status as retained |
| previous_observation_duration_ms | Time between this record and the previous state observation, not guaranteed physical outage duration |
| previous_observation_available | Whether a prior status was available |
| live_transition_observation | True for a non-retained change from a known prior status |
| state_json | Baseline used to restore the logger after restart |

`_time` is Node-RED's status-receive time in UTC, not the device's original transition time. Configure Influx display timezone to Asia/Colombo for local viewing.

Repeated unchanged status messages do not create new points. On startup, the logger restores each device's latest saved baseline, buffering up to 1,000 normalized incoming messages until restoration succeeds. If no saved state exists, the first message is an initial observation. A retained message with a different value is a retained observation: its original change time is unknown, so it must not be counted as a new live outage. A repeated retained state matching the saved state is ignored.

The original status function ignores unknown/unconfigured devices, including messages received before counterConfig is ready. This patch retains that behavior; ensure configuration is loaded before status delivery, or arrange a status replay after configuration loads if initial observations are needed. The logger does not reclassify MQTT status as physical Wi-Fi diagnosis.

Failed startup reads leave the logger gated. Fix bucket/token settings, then click **Restore status log baseline on deploy**. Failed writes retry the same timestamp up to five times, ten seconds apart, then report an error. The native output node has no success output; the runtime dedup baseline advances before write confirmation. Consequently this is a troubleshooting log, not an exactly-once durable audit: a failed event after all retries can be missing. The latest successfully stored baseline is restored on restart. Retention expiration also removes old baselines.

## Inspect recent history

In Influx Data Explorer, use:

```flux
from(bucket: "communication_monitoring")
  |> range(start: -7d)
  |> filter(fn: (r) => r._measurement == "device_status_events")
  |> filter(fn: (r) => r._field == "status")
  |> group(columns: ["device", "line"])
  |> sort(columns: ["_time"])
```

Add `r.device == "RX-CNT-1006"` to filter a device. Every Online/Offline/Unknown observation then appears with its receive timestamp.

Count live-observed Offline transitions by device:

```flux
from(bucket: "communication_monitoring")
  |> range(start: -30d)
  |> filter(fn: (r) => r._measurement == "device_status_events")
  |> filter(fn: (r) => r._field == "status" or r._field == "event_type")
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> filter(fn: (r) => r.status == "Offline" and r.event_type == "status_change")
  |> group(columns: ["device", "line"])
  |> count(column: "status")
  |> rename(columns: {status: "offline_transitions"})
```

A device absent from that result has no matching recorded transitions in the period, not proof of perfect uptime. For durations, inspect paired Offline/Online records and their observation metadata. Retained records, logger outages, missing writes and still-open Offline intervals require separate handling; the interval field is not a guaranteed outage-duration metric.

## Relationship to communication-colored stoppages

This separate bucket logs the supplied **MQTT status changes only**. It does not add heartbeat-timeout events to history, and a missing MQTT Offline message may leave a device's last logged status Online. The separate communication-stoppages patch can detect telemetry timeouts as well. Neither observation proves radio Wi-Fi was the root cause: device power, broker or network failures can look similar.

Build: `node node-red/build-device-status-history-flow.mjs PATH_TO_STATUS_EXPORT`. Test: `node node-red/test-device-status-history.mjs`. No live deployment or database creation was performed.
