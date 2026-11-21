# Quality sensor online/offline status

Import **quality-sensor-status.flow.json** into the **same tab as the quality restore/count engine**. It mirrors the counter-status flow for quality sensors, without modifying production counters or count baselines.

1. Open **ALL Quality Sensor Status** and select your existing MQTT broker (the attached counter flow uses `mqtt_broker_aws`). The imported placeholder contains no credentials.
2. Subscription is **RX-QLT/+/status**, QoS 1. Example: **RX-QLT/4000/status → RX-QLT-4000**.
3. The device must be registered/enabled in `global.devices`; the flow waits for `global.devicesReady` and obtains its line from the registry.
4. Deploy. **Quality sensor status** Debug displays normalized status and timestamps.
5. Optional status history writes use your existing Influx configuration **eef122fda5340dac**, org **Ruhanex**, bucket **RCLH**, measurement **device_status_debug**, matching the supplied counter-history format. Select your connection if missing, or disconnect the second Function output if history is not needed. A history-write failure does not undo runtime status.

To retain status inside `flow.qualityCounters` after restore/shift resets, also replace **Quality ONLY: restore gate + reboot-safe counts** from the updated **quality-restore.complete.flow.json**. No new restore wiring is needed. The updated view overlays the separate status map whenever it republishes counters.

## Firmware requirement

The quality ESP32 must publish `online` to its status topic on MQTT connection and configure a retained MQTT Last Will `offline` on that same topic. On a graceful shutdown it should explicitly publish offline. This backend does not change firmware, configure the Will or send MQTT commands. Offline is received after the broker detects the lost connection, so its timing depends on keepalive/network detection.

Accepted payloads include `online`, `offline`, quoted JSON strings, `{status:'online'}`, `{state:'offline'}`, `{sensorStatus:'Online'}`, and true/false or 1/0 equivalents. Buffers are decoded. Invalid values are ignored with a warning; they do not overwrite the last known status.

There is no inactivity timeout: a stationary production sensor may legitimately send no count events while still online. This flow tracks communication availability, not whether the machine is Running/Stopped or whether grade detection is healthy.

## Context structure

Canonical status is separate from counting state:

```javascript
flow.get('qualitySensorStatus')
// {
//   'RX-QLT-4000': {
//     device: 'RX-QLT-4000',
//     line: 'Keda 2',
//     sensorStatus: 'Online', // Online or Offline
//     lastStatusSeen: 1795252200000,
//     retained: false,
//     lastSeen: 1795252200000
//   }
// }
```

`lastStatusSeen` is when Node-RED received the status announcement. `lastSeen` here is the latest **non-retained online** announcement; offline does not refresh it. A retained online message can be an old announcement, so it establishes the reported state without pretending to be fresh telemetry. `lastSeen` can be null until a non-retained online announcement arrives. This flow does not derive telemetry freshness from count events.

For devices with committed counting state, the published `flow.qualityCounters[device]` gains:

```javascript
sensorStatus: 'Online',
statusObservedAt: 1795252200000,
lastCommunicationSeen: 1795252200000
```

The counter entry's original `lastSeen` remains the last committed counting timestamp. `qualityCommittedStates`, raw baselines, shifts and totals are not changed by status messages. Before the first count baseline exists, read `qualitySensorStatus` directly rather than expecting a fabricated counting entry.

Status messages that arrive before configuration are buffered in `flow.qualityPendingStatus` (latest per device, up to 1000 devices), then released by the five-second timer. This supports retained status arriving during Node-RED startup. Runtime status itself is not restored from historical Influx records; on restart it relies on the firmware/broker's retained status announcement. It is not reset by the quality engine's redeploy.

Read it with an Inject → Function → Debug on the same tab:

```javascript
msg.payload = (flow.get('qualitySensorStatus') || {})['RX-QLT-4000'] || null;
return msg;
```

This does not add a frontend status widget or HTTP endpoint; it provides runtime state and optional Influx history for a later API/UI integration.

```powershell
node node-red/build-quality-sensor-status-flow.mjs
node node-red/test-quality-sensor-status.mjs
```
