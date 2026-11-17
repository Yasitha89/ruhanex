# Quality counting — step 1: raw telemetry to InfluxDB

Import **quality-telemetry.flow.json**. This is a new flow for the supplied ESP32 array payload. Do not run the older quality-sensor.flow.json against the same sensor: that flow expects a different payload and configuration.

## Setup

1. Select your existing MQTT broker in **Quality box telemetry**. It subscribes to `RX-QLT/+/telemetry` at QoS 1; the example topic is `RX-QLT/4000/telemetry`.
2. In Device Administration, add a **Quality Sensor** with short ID `4000`, line `Keda 2` and Enabled selected. It uses device ID `RX-QLT-4000` and type `quality_sensor`, with no machine or display topic fields. The existing device API must accept this type and its registered-device loader must populate `global.devices`. The entry `global.devices['RX-QLT-4000']` must have `enabled: true` and `line: 'Keda 2'`. The device is resolved from this registry on every reading; no device-to-line assignment is hardcoded in this flow. Do not register it as a production counter.
3. Your existing settings loader must populate `global.lineSettings['Keda 2']` with `designCode`, `tileSize`, active `TilesPerBox` and `designGrades`. Missing required settings reject the reading and appear as a Node-RED error. This flow does not query Mongo on every packet or edit saved settings.
4. The **Save quality box snapshots** InfluxDB Out node uses your existing Influx configuration `eef122fda5340dac`, organization `Ruhanex`, bucket `RCLH`, measurement `quality_events`, and millisecond precision. Select your existing server in this node if importing into another Node-RED instance. Its existing configuration holds the URL and token; no `QUALITY_INFLUX_*` variables are needed. Requires `node-red-contrib-influxdb` (your existing 0.7.0 installation).
5. Replace the previous quality tab with this version and deploy. Remove the old HTTP request, retry timer, pump and result nodes if updating nodes individually. Keep only MQTT → Validate + capture registered line settings → Save quality box snapshots, plus the supplied write-error branch. Publish a real sensor reading and query measurement `quality_events` to verify storage. **Quality write errors** displays errors caught from the output node; absence of an error is not a storage receipt.

## Confirmed grade contract

Firmware grades are **1–15**. Grade **0** means an error / undetected box. The settings modal still has slots **1–16**; slot 16 is unused by this sensor:

| Firmware grade / array index | Line setting assignment |
| --- | --- |
| 0 | No assignment; undetected box |
| 1 | `designGrades['1']` |
| 3 (241 boxes in the sample) | `designGrades['3']` |
| 15 | `designGrades['15']` |

Array positions match firmware grade numbers directly. `grade_counts[0]` is retained as `grade_0_boxes` and `undetected_boxes`, with an empty `grade_0_assignment`. It remains included in the total box count. Grade 0 is not silently discarded or assigned a design grade.

Corrected readings use `schema=3`. Previously written `schema=2` points used the old offset assignment; they are not rewritten by this update. Future aggregation must use schema 3 assignment semantics (or explicitly correct old readings using their stored assignment map).

One counter increment is **one box**. `grade_count` must match `grade_counts[grade]`. The total may be named `count` (current firmware) or `total_count`; it must equal the sum of all 16 counters. If both fields are present, they must agree. Influx always stores the normalized field `total_count`. Boot ID, sequence, dropped events and counts are validated as numeric uint32 values. Payload `device` must match the topic.

## Stored data

Each MQTT reading creates one Influx point with all 16 cumulative box counters (`grade_0_boxes` through `grade_15_boxes`), total count, last grade/count, boot ID (string), sequence and dropped events. The point also captures current design code, tile size, active tiles per box, production run ID and all 16 grade assignments. Both original counter array and assignment map are stored as JSON string fields. Unassigned grades remain empty/null; their counts are retained.

Device, registered line, tenant and site are tags. Firmware counters, product metadata and sequence are fields to avoid turning each sequence or reboot into a new series. Timestamps use backend receive time in milliseconds, increasing within this flow instance. Colombo shift/date fields are receive-time metadata: A 06–14, B 14–22, C 22–06; the night shift date is its start date.

This stage intentionally stores **raw snapshots**, not box deltas or yield. MQTT duplicates and stale/out-of-order snapshots can be stored; later aggregation must deduplicate and order by device, boot ID and sequence before calculating differences. It must also distinguish counter reboot from normal progression. Do not sum these cumulative fields to calculate production.

The Function returns `[fields, tags]` to the InfluxDB Out node. Integer fields use the palette's `123i` representation, preserving the field types already written by the earlier HTTP flow; `time` specifies the millisecond timestamp. The output node has no success output. This version has no application-level acknowledgement queue or automatic retry timer; caught write errors are shown in Debug. Failed or in-flight writes can be lost. MQTT QoS does not guarantee database persistence. Durable recovery and shift aggregation are later stages. No firmware commands or reset messages are sent.

Settings are captured when the backend receives each packet. A buffered/offline counter batch cannot be divided accurately across design/size/shift changes using this payload alone. Grade category definitions are not in `lineSettings.designGrades` (only assigned names); category snapshots and category-based yield belong to the next stage, together with a defined good-quality rule and separate Mongo shift documents. Production summaries are unchanged by this flow.

## Development

```powershell
node node-red/build-quality-telemetry-flow.mjs
node node-red/test-quality-telemetry.mjs
```
