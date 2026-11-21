# Add quality sensor communication status to live-summary API

For the supplied live-summary export, change only **Merge Live Influx + Mongo / Calculate KPI**, node **fdf765c33b6dcbfa**. Its final successful response is enriched just before `return msg;`. Existing calculations, production `sensorStatus`, queries, wiring and later quality Functions are preserved.

Import **production-live-quality-status.patch.flow.json** and replace/update that existing Function by ID; no wire changes are required. Alternatively replace the endpoint nodes with **production-live-quality-status.complete.flow.json**, retaining the existing Mongo/Influx configuration nodes and avoiding duplicate HTTP routes. Other custom Function code is copied from your supplied export, not regenerated from an older template.

Keep **quality-sensor-status.flow.json** on the same tab as this API, since it reads `flow.qualitySensorStatus`. Its MQTT input must use the existing broker, topic `RX-QLT/+/status`, and the firmware must publish status / configure a Last Will. `global.devicesReady` and enabled line assignments in `global.devices` determine which quality device belongs to the line.

Example additional response fields:

```javascript
qualitySensorConfigured: true,
qualitySensorConfigStatus: 'configured',
qualitySensorDevice: 'RX-QLT-4000',
qualitySensorStatus: 'Online',
qualitySensorLastSeen: 1795252200000,
qualitySensorStatusObservedAt: 1795252200000,
qualitySensorStatusRetained: false
```

The API also returns the quality sensor in counter-style format:

```javascript
qualitySensor: {
    device: 'RX-QLT-4000',
    sensorStatus: 'Online',
    lastSeen: 1795252200000,
    statusObservedAt: 1795252200000,
    retained: false,
    configured: true,
    configStatus: 'configured'
}
```

Read `response.qualitySensor.sensorStatus` for quality availability using the same Online/Offline/Unknown vocabulary as the counter. The top-level `response.sensorStatus` still belongs to the production counter. Flat `qualitySensorStatus` fields remain available for compatibility.

`qualitySensorStatus` is Online/Offline/Unknown from MQTT status, independent of box counts and measured quality percentages. LastSeen is the latest non-retained Online announcement; it can be null after only retained messages. StatusObservedAt is when the latest status announcement was received. This is not RSSI or a telemetry heartbeat timer.

No sensor gives ConfigStatus `not-configured`, configured false and status Unknown. Multiple enabled matching sensors give `multiple-sensors`; configuration not loaded gives `configuration-not-ready` and configured null. No status announcement for an otherwise configured sensor gives Unknown. No enabled/disabled registration is changed.

The existing frontend icon still reads `sensorStatus` for the production counter. Use the new `qualitySensorStatus` field for a separate quality indicator in a subsequent frontend update; do not replace the production field.

```powershell
node node-red/build-live-quality-sensor-status-flow.mjs "path/to/original-live-summary-export.json"
node node-red/test-live-quality-sensor-status.mjs
```
