# Shift quality trend on each received count

## Install

Import **quality-shift-trend.add-on.flow.json**, replacing the existing Complete node `60bc202908ebf55d`. Alternatively replace the supplied quality telemetry flow using **quality-telemetry-with-trend.complete.flow.json**. Use one alternative. Reuse the existing MongoDB (`8120871193b8f276`), InfluxDB (`eef122fda5340dac`) and MQTT configuration nodes.

The only existing node changed is **Quality Influx write completed successfully**. Its output retains the original commit function `9c9b60fd8492ef09` and adds **Committed quality point → shift trend**. Original validation, source writes, reboot/reset handling and runtime counts remain intact. New nodes must stay together on one tab; they keep their own node-local context and do not read the existing quality runtime context.

## Storage

Write to a separate measurement **quality_shift_trend**, default organization **Ruhanex**, bucket **RCLH**. This is separate from **quality_events**, not a newly provisioned Influx server/database. If you want a physically separate bucket, create/select it in **Save quality_shift_trend**, and change `from(bucket:"RCLH")` in the trend-read API to that bucket. Baseline reads must continue reading source quality_events from RCLH.

The source quality_events write must succeed before a point enters this independent trend queue. Record one point per accepted telemetry message with a positive sum of `grade_N_delta`. Duplicates and zero-increment heartbeats do not create points. Each increment is a BOX; if firmware batches three boxes into one message, save one trend point for that batch, not three invented timestamps. Grade 0 remains undetected; grades 1–15 use captured assignments.

Point timestamp is the source point's server receive timestamp, with millisecond precision. This is not a firmware acquisition timestamp. Tags: `device`, `line`, `shift`, `shiftDate`, `tenant`, `site`. Fields:

```text
quality / first_quality          cumulative first-quality percentage
normal_damage_quality           cumulative normal-damage percentage
cut_damage_quality              cumulative cut-damage percentage
undetected_percent              cumulative undetected percentage
unclassified_percent            cumulative unclassified percentage
total_tiles / total_boxes       cumulative shift totals
first_tiles / first_boxes
normal_damage_tiles / normal_damage_boxes
cut_damage_tiles / cut_damage_boxes
undetected_tiles / unclassified_tiles
box_delta                       boxes represented by this telemetry message
design_code / tile_size / tiles_per_box / production_run_id
boot_id / sequence / calculated_at_ms
quality_available / classification_complete / schema
```

Counts are Influx integer fields. Percentages are numeric floating-point fields. No measured percentage is written when its denominator is zero.

## Calculation and recovery

Use the same `calculateLiveQuality` calculation as the supplied live summary. Accumulate delta boxes separately for each saved design code, size, tiles-per-box factor and assignment map. Multiply by each segment's original tiles-per-box before category aggregation. First quality = category-1 tiles / total counted tiles × 100, normal damages = category-2 tiles / total, cut damages = category-3 tiles / total. Undetected and unclassified tiles remain in the denominator.

Read ruhanex_config/designGrades for each point so category definitions agree with the live API at calculation time. Existing plotted points preserve the categories used when written; changing catalogue categories later can make newly recalculated historical summaries differ from those earlier observations. No old trend points are silently rewritten.

On the first positive event after startup/deployment, a device/line change, or a new shift, query authoritative quality_events from that event's shift start through its timestamp inclusive. Then accumulate later deltas in memory, without scanning the whole shift on every count. Source sensor reboot handling already provides safe deltas; do not reset accumulated shift tiles when boot_id changes.

Only commit the next trend accumulator after its Influx write completes. Failures retain the calculated candidate and retry the identical timestamp/payload every 15 seconds. Five-second ticks drive startup/retry; late callbacks from older attempts are ignored. One global queue serializes trend calculations, up to 5000 messages; source telemetry saving continues independently. One catalogue read and one trend write are added for each positive telemetry message. Monitor lag if sensors publish at a high rate.

Memory state rebuilds from source data after restart. This preserves cumulative totals at the next recorded point, but does **not automatically backfill trend timestamps missed during downtime, a process crash, or queue overflow**. Raw source events remain available for a historical replay tool. Trend charts start when this add-on is enabled; earlier shifts have no trend points unless separately backfilled. Retention must cover the source shift for baseline rebuilding. Deployment/restart can retain/retry an in-flight event within the same running process; a process restart discards memory queues.

## Read API for a line chart

Import **quality-trend-api.flow.json**. Endpoint:

```text
GET /api/production/quality-trend?line=Keda%202&date=2026-11-24&shift=06-14&interval=15s
```

Accept `interval=5s|15s|30s|1m|5m`; default 15s. Optional `device=RX-QLT-4000` selects one sensor. Read only; use existing authenticated proxy headers. Response includes `points` containing `time`, `device`, `firstQuality`, `normalDamageQuality`, `cutDamageQuality`, `undetectedPercent`, `unclassifiedPercent`, `totalTiles` and `totalBoxes`. Returned times label aggregation windows, while raw stored points retain receive timestamps. Each window keeps the latest observation, not an average of cumulative percentages. Empty windows remain absent and missing fields remain null. If a line has had multiple sensors, chart each device separately or explicitly select a device; do not sum percentages.

Plot time on X and percent (0–100) on Y, with three series: firstQuality, normalDamageQuality and cutDamageQuality. This represents **cumulative shift quality as observed at each time**, not instantaneous per-box quality. No frontend chart location has been changed by these files.

## Check

Send a new quality count, inspect **Save quality_shift_trend**, then query that measurement. Compare a trend point against the live summary at the same event cutoff. Tests compare directly against the attached live-summary Function and cover factor changes, grade 0, retries, duplicates and API conversion:

```text
node node-red/test-quality-shift-trend.mjs
```

No production database or sensor was modified by the local tests.
