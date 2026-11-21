# Category-based quality in the live production summary

This extends the supplied **GET Production Live Summary** flow. It is the live API, not the end-of-shift Mongo writer. Existing Function bodies remain unchanged. The added nodes run after **Merge Live Influx + Mongo / Calculate KPI**, replace its assumed quality of 100% for Keda lines, and then return the response. Production counter totals, speed, availability and downtime calculations remain unchanged.

## Install

Back up the existing live-summary endpoint. Replace it with **production-live-quality.complete.flow.json**, preserving/replacing node IDs instead of importing duplicate endpoint copies. Keep the existing Mongo client `8120871193b8f276` and Influx config `eef122fda5340dac`. Verify Mongo/Influx nodes select the existing connections, then deploy. No quality-counter or production-counter changes are required.

Alternatively import **production-live-quality.add-on.flow.json** into the same tab. Disconnect **Merge Live Influx + Mongo / Calculate KPI → Return Live Summary** and connect the merge output to **Live quality: resolve registered sensor**. All remaining new connections are included by ID. Do not leave the old direct response wire connected.

The Mongo read fetches `{_id:'designGrades'}` from `ruhanex_config` using the existing `grades` array format. Catalogue `category` must be **1**, **2** or **3**, stored as text or numbers:

| Category | Classification | Calculation |
| --- | --- | --- |
| 1 | First quality | First-quality tiles / total quality-counted tiles × 100 |
| 2 | Normal damages | Normal-damage tiles / total quality-counted tiles × 100 |
| 3 | Cut damages | Cut-damage tiles / total quality-counted tiles × 100 |

The grade name assigned to each line slot resolves to a catalogue grade name (case-insensitive, trimmed). It is not the design/product code such as YKM. Sensor grades 1–15 use the same numbered assignment. Grade 0 remains undetected regardless of settings. Slot 16 is unused.

## Why read quality_events rather than multiply shiftGrades by current TilesPerBox?

An entire shift's `qualityCounters.shiftGrades` multiplied by the latest `TilesPerBox` would miscount tiles if box packing changed. Likewise, applying today's slot assignment to every old box would reclassify old production. This extension queries the current shift's saved `grade_0_delta` through `grade_15_delta` in **quality_events**, retaining each saved `tiles_per_box` and `design_grades_json`. It groups matching metadata in Influx and sums box deltas there; JavaScript resolves the categories and converts each segment to tiles.

For example: 10 category-1 boxes × 2 tiles/box plus 10 category-2 boxes × 4 tiles/box = 60 tiles; first quality is 33.33%, not 50%. Saved size/design metadata is returned per segment for inspection. The current line-setting assignments enter the calculation through the snapshot saved by the quality telemetry flow, rather than overwriting historical event assignments.

The **quality restore/count flow must already be installed** and saving delta fields. Old raw-only snapshots are not summed, since they are cumulative and would overcount. Initial/legacy baseline production is not reconstructed. Results cover tracked deltas since quality counting was commissioned. A successful query with zero tracked tiles returns top-level `firstQuality:0`, `normalDamageQuality:0`, `cutDamageQuality:0`, `quality:0` and `totalQualityTiles:0` for the display. It retains `qualityAvailable:false`, `qualityDetails.status:'no-tracked-quality-tiles'` and `ole:null`, since no measured percentage exists yet. Nested calculated percentages remain null. This zero-output behaviour does not apply to query/configuration failures or the no-sensor 100% assumption.

Category definitions themselves are read from the **current** designGrades document. Editing a catalogue category can therefore reclassify earlier events using that grade name, including the current shift. Events do not yet contain category snapshots. Freeze catalogue categories during a shift if you need a stable interpretation; fully immutable category history requires extending ingestion with category snapshots/versioning.

## Response fields

```javascript
{
  // Existing production-counter result; not overwritten:
  shiftCount: 2000,

  // New totals/percentages from quality boxes:
  totalQualityTiles: 200,
  firstQuality: 80,
  normalDamageQuality: 15,
  cutDamageQuality: 5,
  qualityAvailable: true,

  // Existing KPI fields now use category 1:
  quality: 80,
  ole: 48,

  qualityDetails: {
    totalBoxes: 100,
    totalTiles: 200,
    firstBoxes: 80,
    firstTiles: 160,
    normalDamageBoxes: 15,
    normalDamageTiles: 30,
    cutDamageBoxes: 5,
    cutDamageTiles: 10,
    undetectedBoxes: 0,
    undetectedTiles: 0,
    unclassifiedBoxes: 0,
    unclassifiedTiles: 0,
    // Additional source, percentages, sensor/shift identity and segment metadata.
  }
}
```

The example uses availability 75%, performance 80% and category-1 quality 80%: OLE = 75 × 80 × 80 / 10000 = 48%. The endpoint uses the existing `ole` name, not a new `oee` field.

`totalQualityTiles` is the sum of **quality sensor** box deltas × each segment's tiles/box. It does not replace the production sensor's `shiftCount` or `productionSqm`, and the two sensor totals can differ. First/normal/cut percentages all use `qualityDetails.totalTiles` as their denominator. Grade 0 and unmapped/unknown-category grades stay in that denominator, as undetected/unclassified tiles, so the three percentages may sum to less than 100%. Missing mappings set `classificationComplete:false`; the first-quality percentage counts known category-1 tiles only, not an assumption that unknowns are good.

## Availability and errors

For Keda lines, no enabled registered `RX-QLT-*` sensor matching the line gives `quality:100`, `firstQuality:100`, `qualityAssumed:true`, `qualityAvailable:false`, and `qualityDetails.status:'no-enabled-quality-sensor'`. OLE uses this 100% assumption. Damage percentages and tile totals remain null because there are no measured values. A disabled sensor also qualifies for this fallback. Replace only **Live quality: resolve registered sensor** to add this behaviour; its embedded helper is included in the generated Function.

When an enabled sensor exists, exactly one must match. Ambiguous sensors, a missing device registry/catalogue, query failures or no tracked tiles return `qualityAvailable:false`, `qualityAssumed:false`, `quality:null`, `ole:null`, with a `qualityDetails.status`. Measured responses explicitly return `qualityAssumed:false`. Other production fields still return. Non-Keda lines retain their original quality/OLE behaviour. Errors are caught on the new database and calculation nodes, without emitting a second HTTP response.

There is no new Mongo insert/update here: these fields are in the API response. Persisting completed shift quality to a separate Mongo collection and incorporating it into saved production shifts remains a separate integration. The current frontend may need a follow-up change to show the three new quality metrics and distinguish null/unavailable from zero.

The quality query covers the current Colombo shift, up to the original live-summary calculation timestamp. It converts `_value` to strings before pivoting to avoid numeric/string schema collisions. This adds one Mongo read and a shift-scoped Influx aggregation per live request. For many simultaneous dashboard users, add a short shared cache or incremental materialized totals before scaling; the current 60-second production speed query is unchanged. Buffered/offline readings remain attributed to their saved receive-time metadata and cannot reconstruct exact physical shift allocation.

## Verification

Check saved event assignments, category definitions, deltas and box packing before comparing the response. Test a known mix, a packing change, Grade 0, an unmapped grade and a no-data shift. Compare `qualityDetails.totalTiles` and category tile sums. Confirm existing downtime/speed fields remain present.

```powershell
node node-red/build-live-quality-flow.mjs "path/to/original-live-summary-export.json"
node node-red/test-live-quality.mjs
```
