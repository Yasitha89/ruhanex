# Include quality in saved production shift summaries

Built from your supplied 2026-11-21 shift-end flow export. All existing Function bodies remain unchanged, including the one-second downtime/shift timer, production statistics, code-wise query and design/size production calculations. Added nodes override the old assumed `quality:100` result and calculate the quality-adjusted metric before saving. Existing `ole` is retained; `oee` is added as an alias with the same formula, not a new availability/performance definition.

## Install the complete flow

1. Keep the previously installed **quality-restore.complete.flow.json** and the separate **quality-shift-storage.flow.json** tab running. Quality storage must save completed documents into collection **quality**.
2. Back up your existing shift-end nodes. Replace the nodes from your attached export with **shift-summary-quality.complete.flow.json**, preserving/replacing existing IDs rather than importing a second one-second timer or duplicate summary writer. Other counter/status/startup nodes not in that export must remain.
3. Reuse Mongo client **8120871193b8f276** and the existing Influx configuration. Credentials/configuration nodes are referenced, not exported.
4. Open **Queue separate quality collection shift job** (new Link Out) and ensure it targets **After completed production shift save (optional)** in the existing quality storage tab (`rx_qs_link`). This queues the actual completed shift; the quality-storage scheduler also remains active.
5. Deploy. Inspect **Saved production shift quality result** and the saved `shifts.lineStats` fields after a shift completes.

The original export contains outgoing connections to nodes not included in that export, including your display, floor/car processing and Telegram report link. They are preserved by ID in the complete file. Those external nodes must remain in your deployed flow. The new completion link does not replace or remove them.

## Add-on alternative

Import **shift-summary-quality.add-on.flow.json** into the same tab and make these changes:

- **Calculate Line Shift Statistics → Shift quality: mark measured / assumed / pending → Save shift summary**. Remove the original direct connection.
- **Build Shift Code-wise Update → Final code-wise save: read matching quality**. Remove its original direct connection to **Update Shift Code-wise Production**. The new first output reads the quality document and attaches fields; the second output bypasses the lookup for lines with no sensor. Both paths return to the existing **Update Shift Code-wise Production** node.
- Add an output branch from **Update Shift Code-wise Production** to **After confirmed code-wise save: queue quality storage**, preserving every existing downstream branch.
- Configure the new Link Out to your existing quality storage Link In. The add-on includes the lookup and pending-reconciliation nodes already wired by ID.

## Quality matching and calculations

The line's enabled RX-QLT registration is captured when the production summary is created. Its exact quality document ID is:

```javascript
JSON.stringify([qualitySensorDevice, lineName, shiftDate, shift])
```

The saved document must have `status:'complete'` and matching sensor, line and shift/date. The quality collection supplies tile-based, design/size-aware category totals; no cumulative raw counters are summed in this integration.

- Category **1** → `lineStats.firstQuality` and `lineStats.quality`.
- Category **2** → `lineStats.normalDamageQuality`.
- Category **3** → `lineStats.cutDamageQuality`.
- `lineStats.totalQualityTiles` → the quality sensor's tracked tile total.
- `lineStats.ole` and `lineStats.oee` → availability × performance × quality / 10000, rounded to two decimals.

Example: availability 75%, performance 80%, category-1 quality 80% gives OLE/OEE **48%**.

The separate `quality` document contains full design/size/grade details. Saved `lineStats.qualitySummary` contains its reference, category box/tile counts, unclassified/undetected counts, coverage and classification status. Large product/segment arrays are not duplicated into the production document.

### New saved fields

```javascript
lineStats: {
    // Existing production/downtime fields remain unchanged.
    quality: 80,
    firstQuality: 80,
    normalDamageQuality: 15,
    cutDamageQuality: 5,
    totalQualityTiles: 200,
    qualityAvailable: true,
    qualityAssumed: false,
    qualityStatus: 'measured',
    qualitySensorDevice: 'RX-QLT-4000',
    qualityDocumentId: '["RX-QLT-4000","Keda 2","2026-11-21","06-14"]',
    qualitySummary: {
        qualityDocumentId: '...',
        device: 'RX-QLT-4000',
        totalBoxes: 100,
        totalTiles: 200,
        firstTiles: 160,
        normalDamageTiles: 30,
        cutDamageTiles: 10
        // Remaining category counts and coverage metadata also included.
    },
    ole: 48,
    oee: 48,
    qualityUpdatedAt: '2026-11-21T08:33:00.000Z'
}
```

## Timing, recovery and missing data

The production summary can arrive before the quality worker's 90-second grace period ends. An enabled sensor therefore starts with `qualityStatus:'pending'`, `quality:null`, `ole:null`, `oee:null`. Code-wise production is still saved normally. If quality is already complete, it is attached in that same final code-wise update.

A startup Inject (15 seconds) and 60-second timer scan saved production documents with `lineStats.qualityStatus:'pending'`. When matching quality is available they update only the quality/metric fields, using the production document's saved availability/performance. This persisted pending marker survives Node-RED restarts. Per-document identity/status and KPI comparison conditions prevent a stale reconciliation from overwriting concurrent KPI changes. If a matching quality document is still missing, `qualityLastCheckedAt` rotates pending checks so old missing jobs do not monopolize the first batch of 100.

No enabled quality sensor gives **quality 100%**, `qualityAssumed:true`, `qualityAvailable:false`, `qualityStatus:'assumed'`. Damage percentages and quality tile totals remain null. This applies to all lines using this shift-end flow, not only Keda. A missing device registry is pending rather than an assumption. Multiple enabled quality sensors for the same line produce `qualityStatus:'configuration-error'`; resolve the assignment and explicitly requeue/resynchronize affected shifts.

A completed quality document with no tracked tiles produces `qualityStatus:'unavailable'`, null quality/OLE/OEE, not 100%. Quality data remains limited to tracked deltas since commissioning; category mapping and undetected/unclassified handling are inherited from the separate quality document.

Existing downstream processing/Telegram branches are preserved and are not delayed. They may run before pending quality is reconciled. Consumers must respect `qualityStatus` and null metrics; this addition does not resend reports automatically when quality becomes ready. If reports must wait for final quality, add that readiness check to their dispatch flow separately.

Rebuilding a completed quality document does not automatically change already measured production summaries: deliberately set the affected production document's `lineStats.qualityStatus` to `pending` (retaining its sensor/document reference) to request reconciliation. Other flows that replace the entire `lineStats` object, such as historical downtime recalculation, must preserve these fields or requeue reconciliation; they are outside this shift-end patch.

This does not change the existing production writer's insert/retry semantics, repair existing duplicate shift documents or backfill old summaries lacking the pending marker. The separate `quality` worker is still required to populate quality documents. If a pending summary remains pending, inspect that worker's job status, quality sensor registration and exact shift identity.

## Validate

Verify an enabled-sensor shift progresses from pending to measured after the quality save; compare category percentages against the separate quality document. Check a no-sensor line uses 100% and a no-data sensor returns null. Confirm existing code-wise/size-wise production arrays and downtime values remain unchanged. Temporarily fail a quality read to verify production saving continues and later reconciliation repairs the metrics.

Local tests cover field preservation, exact matching, category quality, 100% assumptions, missing data, pending recovery and conditional updates. Live Mongo/Influx wiring still requires deployment verification.

```powershell
node node-red/build-shift-summary-quality-flow.mjs "path/to/original-shift-end-export.json"
node node-red/test-shift-summary-quality.mjs
```
