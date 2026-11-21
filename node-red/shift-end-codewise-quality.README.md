# Direct code-wise quality during shift-end summary processing

Use **shift-end-codewise-quality.complete.flow.json** instead of the previous quality-document integration. This version calculates quality **directly from Influx quality_events** and categories from **ruhanex_config / designGrades**. It never queries the Mongo `quality` collection and does not require its shift document to exist. The separate quality-storage flow may continue saving its own documents independently.

## Install

1. Back up the current shift-end flow.
2. Remove/disable the earlier `rx_eq_*` quality integration nodes, especially **Reconcile pending shift quality every 60 sec**, so the old worker cannot overwrite direct calculations.
3. Replace the nodes from the original shift-end export with **shift-end-codewise-quality.complete.flow.json**, preserving existing IDs. Avoid duplicate one-second timers, production summary writers or restore flows. Original Function bodies and their downstream external connections are preserved.
4. Retain the existing counter/status/startup and quality telemetry/restore nodes. The direct calculation needs persisted `grade_*_delta`, saved box factors, assignment snapshots and production run metadata in `quality_events`.
5. Select the existing Mongo client **8120871193b8f276**, Influx config **eef122fda5340dac**, organization **Ruhanex**, bucket **RCLH** if any imported nodes show missing connections. Deploy.

There is no Link Out to the separate quality-storage tab in this version. The original completed-production notification branches remain as before.

## Calculation path

```text
Existing Calculate Line Shift Statistics
 → Shift summary: initialize direct quality
 → Existing Save shift summary
 → Existing code-wise production calculation
 → Existing Build Shift Code-wise Update
 → Code-wise production: calculate quality directly
 → Read designGrades category catalogue
 → Read quality_events for that shift, sensor and line
 → Add quality to each code-wise entry + OLE
 → Existing Update Shift Code-wise Production
 → Existing downstream branches
```

If using **shift-end-codewise-quality.add-on.flow.json**, change the original Calculate → Save connection to pass through **Shift summary: initialize direct quality**. Change the original **Build Shift Code-wise Update → Update Shift Code-wise Production** connection to pass through **Code-wise production: calculate quality directly**. All other new wires are included by ID. Install this instead of the earlier `rx_eq_*` add-on, not alongside it.

## Matching production entries

Quality rows are grouped by saved design code, tile size, box factor, grade assignment and `production_run_id`. For each production entry:

- Match **designCode + tileSize + productionRunId** where run metadata agrees.
- If there is only one production entry for that design/size, a design/size-only fallback is allowed, with `qualityScope:'design-size'`.
- If several runs of a product exist and run metadata cannot distinguish them, affected entries remain unavailable. Whole-product totals are not copied into every run or divided by guesswork.

Tile size is normalized for whitespace, case and multiplication-sign spelling. Design codes and run IDs are matched as trimmed, case-sensitive identifiers. The timeline array remains unchanged: no attempt is made to allocate quality across timeline intervals without matching run boundaries.

For category 1, 2 and 3, calculate tile counts from **each saved event group's box deltas × saved tiles_per_box**, then divide by all quality-counted tiles for the matched entry. The current packing setting is not applied retrospectively. Grade 0 is undetected; unmapped categories remain in the denominator as unclassified. Category definitions come from the current catalogue during calculation and are copied to `lineStats.qualityCatalogueSnapshot`.

## Saved example

Existing code-wise production fields are retained:

```javascript
lineStats.codeWiseProduction = [{
    designCode: 'YKM',
    tileSize: '80x80',
    productionRunId: 'Keda_2-example',
    tileCount: 1000,
    production: 640,

    quality: 80,
    firstQuality: 80,
    normalDamageQuality: 15,
    cutDamageQuality: 5,
    qualityTotalBoxes: 100,
    qualityTotalTiles: 200,
    firstQualityTiles: 160,
    normalDamageTiles: 30,
    cutDamageTiles: 10,
    undetectedTiles: 0,
    unclassifiedTiles: 0,
    qualityAvailable: true,
    qualityAssumed: false,
    qualityStatus: 'measured',
    qualityScope: 'production-run',
    qualitySource: 'quality_events-direct',
    qualityDetails: {
        // Category box/tile totals, percentages, classification flags
        // and saved design/size/box-factor segments used for this entry.
    }
}];
```

Production `tileCount` is not replaced by quality tiles: they come from separate sensors and can differ. Code-wise quality totals must not be summed across overlapping/ambiguous run matches; the flow deliberately leaves those matches unavailable.

The same direct rows also calculate shift-wide `lineStats.quality`, `firstQuality`, `normalDamageQuality`, `cutDamageQuality`, `totalQualityTiles`, `qualitySummary`, `ole` and `oee`. OLE/OEE use availability × performance × category-1 quality / 10000. Existing production, downtime, availability/performance and size-wise arrays remain unchanged.

## No sensor, missing data and settling

No enabled line quality sensor gives 100% assumed quality at shift and code-wise level, with unknown damage/tile values left null. Missing registry, multiple enabled sensors or query failures do not fabricate measured quality. An enabled sensor with no matching events gives null quality. Old raw-only snapshots cannot supply deltas and are not summed.

The direct calculation runs in the original shift-end path; it does not wait for a separate quality document. It can see fewer readings if an Influx write is still pending. A new startup/60-second reconciliation timer recalculates unsettled saved summaries, including their code-wise entries, until at least 90 seconds after shift end. It reads Influx directly again and conditionally updates only the new quality fields/code-wise array if saved KPI values and original array have not changed concurrently. The entire production document is not replaced.

The timer uses persisted `qualitySource:'quality_events-direct'` and `directQualitySettled`/`qualityStatus` markers for restart recovery. After the grace period a successful calculation (including an explicit no-data result) is settled. Failed queries remain retryable. Long outages or readings arriving after settlement require a deliberate recheck: set `lineStats.directQualitySettled:false` on the affected document. Recheck uses the then-current category catalogue and retained events; it does not recreate missing physical telemetry.

Existing notifications are not delayed or resent by reconciliation, so consumers can see an initial result before the settling check. This patch does not change old downtime-boundary logic, existing insert retry/duplicate behaviour, or separate historical downtime recalculation flows that replace `lineStats`.

## Verify

Use a test shift with two designs, two sizes and repeated runs. Check each `codeWiseProduction` entry's existing production values remain unchanged and quality matches its saved run. Check no-match and no-sensor cases. Inspect **Direct shift quality result** after the settling timer runs. Local tests cover distinct runs, ambiguous matches, no double allocation, tile factors, percentages, OLE and generated Function syntax. Live Mongo/Flux validation remains necessary.

```powershell
node node-red/build-shift-end-codewise-quality-flow.mjs "path/to/original-shift-end-export.json"
node node-red/test-shift-end-codewise-quality.mjs
```
