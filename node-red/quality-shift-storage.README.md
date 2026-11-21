# Save completed shift quality to MongoDB

Import **quality-shift-storage.flow.json**. It adds a separate **Quality — Mongo shift storage** tab. It does not replace the quality telemetry/restore flow, modify counter restoration, or change existing saved production summaries. Select the existing Mongo client **8120871193b8f276** and Influx configuration **eef122fda5340dac** if connections show as missing. The Influx reader uses organization **Ruhanex**, bucket **RCLH**, measurement **quality_events**.

The destination collection is **quality**, in the database selected by that Mongo client. Pending jobs and completed summaries share this collection; use **`{status:'complete'}`** when querying finished quality summaries.

## When it saves

The startup Inject runs after ten seconds and repeats every 60 seconds. It queues the **previous completed Colombo shift** for every enabled registered RX-QLT sensor assigned to Keda 1/2/3. It waits until 90 seconds after the shift end before processing, to allow ordinary final Influx writes to finish. No hardcoded device/line mapping is used.

Each job/summary has a deterministic `_id = JSON.stringify([device,line,shiftDate,shift])`. Repeated ticks or link messages do not create duplicates or replace completed summaries. Failed and abandoned jobs remain in Mongo and are retried, including after Node-RED restarts. A five-minute atomic lease prevents concurrent workers from overwriting each other. There is one active worker per flow instance; final saves require the same lease owner.

Startup waits for the shared configuration loader's `global.devicesReady` and `global.settingsReady` flags. It does not depend on production counter restore flags.

### Optional connection to the production shift-save flow

Connect a Link Out **after your successful final code-wise shift save** to **After completed production shift save (optional)** in this new tab. Keep your existing output connections. The message must preserve one of:

- `msg.codeWiseTarget`: `{line, shiftDate, shift}` — already present in your supplied completed-shift flow.
- `msg.summaryRequest`: `{line, shiftDate, shift}`.
- `msg.payload.lineStats`: `{lineName, shiftDate, shift}`.
- Explicit `msg.qualityShift`: `{line, date, shift}`.

This queues the actual completed shift, even if your existing production save was delayed. The standalone timer is a fallback; both can run safely. Do not connect an HTTP response/live-summary request to this Link In. This endpoint is internal and has no HTTP handler.

### Manual test or backfill

**Manual: queue previous shift (safe repeat)** queues the previous completed shift. To save a specific historical shift, connect a Function to **Queue quality jobs from registered devices**:

```javascript
msg.qualityShift = {
    line: 'Keda 2',
    date: '2026-11-21', // start date of the requested shift
    shift: '06-14'
};
return msg;
```

For night shifts the date is the date it started at 22:00. Do not request the current unfinished shift. Omitting `line` queues all enabled quality sensors for the requested shift.

To intentionally regenerate an existing completed summary from retained events and the current category catalogue, also set **`msg.rebuildQuality = true`**. Rebuild requests do not interrupt a currently processing job. They preserve the document identity and replace summary contents after successful aggregation. Ordinary triggers never rebuild a completed summary.

The automatic scheduler queues only the immediately previous shift. If the server was down for several shifts, or this is first installation, explicitly backfill older dates or use completion links; no all-history backfill is assumed. Pending jobs already stored in Mongo survive longer outages. Historical sensor registrations must still be available when manually queuing older shifts.

## Document layout

There is **one document per sensor + line + shift**, with separate design/size groups inside it. A design produced in two sizes creates two groups. A grade number reassigned during a shift creates separate grade-name/category entries within the group. This prevents counts for different assignments from being merged accidentally.

Illustrative abbreviated completed document:

```javascript
{
  _id: '["RX-QLT-4000","Keda 2","2026-11-21","06-14"]',
  version: 1,
  status: 'complete',
  device: 'RX-QLT-4000',
  deviceLabel: 'Keda 2 quality',
  line: 'Keda 2',
  tenantId: 'Rocell',
  siteId: 'RCLH',
  shiftDate: '2026-11-21',
  shift: '06-14',
  shiftFromTime: '2026-11-21T06:00:00+05:30',
  shiftToTime: '2026-11-21T14:00:00+05:30',

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
  firstQuality: 80,
  normalDamageQuality: 15,
  cutDamageQuality: 5,
  quality: 80,

  productGroups: [{
    designCode: 'YKM',
    tileSize: '80x80',
    totalBoxes: 100,
    totalTiles: 200,
    // Same category totals/percentages for this design and size.
    grades: [{
      gradeNumber: 1,
      grade: 'First',
      description: 'First quality',
      category: 1,
      classification: 'first',
      boxes: 80,
      tiles: 160,
      percentOfProductTiles: 80
    }],
    segments: [{
      tilesPerBox: 2,
      gradeAssignments: {'1':'First','2':'Normal','3':'Cut'},
      totalBoxes: 100,
      totalTiles: 200,
      grades: [/* all grade numbers 0–15 with boxes, tiles, name and category */]
    }]
  }],

  gradeCatalogueSnapshot: [/* grade names, categories and descriptions used */],
  categoryRules: {first:1, normalDamage:2, cutDamage:3, undetectedGrade:0},
  sourceMeasurement: 'quality_events',
  countBasis: 'saved-box-deltas-times-saved-tiles-per-box',
  coverage: 'tracked-deltas-only',
  dataStatus: 'tracked-data',
  // createdAt, shiftEnd, categorySnapshotAt, updatedAt, completedAt: BSON Dates.
  // attempts: number of worker claims.
}
```

Actual `grades` arrays also retain zero counts and undetected/unclassified entries. If a grade number maps to different names during the shift, it has multiple entries in `productGroups[].grades`; inspect its segment assignment map for the full context. Segments group identical saved design, size, box factor and assignments; they are aggregate groups, **not a chronological run timeline**.

All Mongo counts are numeric box/tile totals, without the Influx `i` suffix. Tile counts use each event segment's saved `tiles_per_box`, not the current value in line settings. Summing a product group's grade `tiles` gives its `totalTiles`; summing product-group totals gives the document total.

## Classification and coverage

The existing live-quality rule is reused: category **1 = first**, **2 = normal damage**, **3 = cut damage**. Percentages use all quality-counted tiles as the denominator. Grade 0 is undetected; unmapped/unknown-category grades are unclassified and remain in the denominator. They are not silently counted as good. Catalogue category codes must be numeric/string 1, 2 or 3.

The current `ruhanex_config` document `_id:'designGrades'` supplies categories/descriptions when the job runs. Event `design_grades_json` supplies the historical slot assignment. The chosen catalogue is copied into the completed document. Later catalogue edits do not automatically alter saved documents; an explicit rebuild uses the new catalogue.

Only saved `grade_*_delta` events from the independent quality restore flow are counted. Older raw cumulative readings are not summed. Initial/migration baseline production remains outside tracked totals. The summary does not claim full-shift coverage merely because `status:'complete'`.

No tracked tiles gives `dataStatus:'no-tracked-tiles'`, `quality:null`, empty groups and zero totals. This is saved explicitly rather than assuming 100%. There is no fabricated quality document for a line with no enabled quality sensor. The live API's no-sensor 100% fallback is separate.

A fixed 90-second grace period cannot guarantee that a long Influx outage has flushed every reading. Review/rebuild after delayed telemetry recovery. Cumulative data received across shift boundaries cannot reconstruct exact physical allocation; saved receive-time attribution is retained. Database write success does not prove the sensor captured every physical tile.

## Queries, indexes and validation

Use your existing Mongo client's database:

```javascript
db.quality.find({status:'complete',line:'Keda 2',shiftDate:'2026-11-21'})
```

Suggested indexes after deployment review: `{status:1,readyAt:1,shiftEnd:1}`, `{status:1,leaseUntil:1}`, `{line:1,shiftDate:1,shift:1,status:1}`. `_id` already enforces summary identity. Do not add TTL deletion without an explicit retention policy.

**Quality Mongo save result** shows confirmed completed saves. Failed jobs show `status:'failed'`, retry after a minute and are retained if Node-RED restarts. If even retry-status writes fail, an expired lease allows another attempt. Do not manually mark incomplete jobs complete. The flow deliberately does not export credentials or log full request messages.

Verify a known completed shift: compare per-grade boxes against saved Influx deltas, multiply by each segment's box factor, check design/size groups and category percentages. Click manual repeat to confirm no duplicate documents. Use an explicit rebuild to refresh a summary after fixing metadata or delayed writes. Local tests cover multi-design/size grouping, changing packing/assignments and job lease guards; live Mongo/Flux connections still need deployment verification.

```powershell
node node-red/build-quality-shift-storage-flow.mjs
node node-red/test-quality-shift-storage.mjs
```
