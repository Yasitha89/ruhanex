# Quality reporting documents

Import `quality-recheck-reporting.complete.flow.json` to replace the attached recheck flow, or import `quality-report-storage.add-on.flow.json` and replace its existing **Direct code-wise quality saved** node (`e3e63d6b35ac8613`). Both alternatives use the IDs in your latest supplied export. Use only one alternative. Keep MongoDB client `8120871193b8f276` selected. New nodes are on Counters alongside the supplied recheck flow.

The original quality calculation and conditional shift update are preserved. After acknowledged shift saves, the added branch scans saved shifts for report copies that are missing or older than `lineStats.qualityUpdatedAt`. It also scans every minute, once 30 seconds after deployment, at most 50 source documents per scan. This copies already saved quality, including older saved shifts; it does not query Influx again or reset counters.

The collection **quality_reports** is created automatically on the first successful upsert. Each document has a deterministic `_id` from `[line, shiftDate, shift]`, so repeated runs update the same document. Reports are shift-level, not live one-minute sensor summaries. Overview graphs for the current shift must continue to use the live quality API until a saved shift summary exists.

Fields include:

- `line`, `shiftDate`, `shift`, `shiftStart`, `shiftEnd`, sensor/production device IDs, `sourceShiftId`, `sourceQualityUpdatedAt`.
- `totalBoxes`, `totalTiles`, `firstTiles`, `normalDamageTiles`, `cutDamageTiles`, `undetectedTiles`, `unclassifiedTiles`.
- `quality`, `firstQuality`, `normalDamageQuality`, `cutDamageQuality`, availability, performance, OEE.
- `designs[]`: design code, tile size, total boxes/tiles, category tile totals and percentages, `grades[]` with grade number/name/description/category/boxes/tiles.
- Original `gradeSegments`, saved `gradeCatalogue`, `qualitySummary` and `codeWiseProduction`, preserving per-run details and historical categories.
- `status`, `qualityAvailable`, `qualityAssumed`, `settled`, `gradeBreakdownAvailable` and update timestamp. Missing quality is kept null; assumed quality does not create fictional production counts.

After a report upsert succeeds, conditionally mark the source shift with `qualityReportSourceUpdatedAt` and `qualityReportCopiedAt`. Failures leave it eligible for the next scan. If source quality changes during the copy, the marker does not match and a later scan copies the newer version. Older concurrent report writes cannot overwrite a newer version; they may return a duplicate-key error and retry. Separate shift/report writes are eventually consistent, not a cross-collection transaction.

Saved gradeSegments and qualityCatalogueSnapshot are required for detailed grade reporting. Older summaries without grade segments still copy their saved totals and code-wise data, with `gradeBreakdownAvailable:false`. The flow does not invent absent grade history. Duplicate shift documents for the same line/date/shift must be resolved; the report collection expects one authoritative source shift for that identity.

Suggested MongoDB indexes, run once in mongosh against the application database:

```js
db.quality_reports.createIndex({line:1,shiftDate:1,shift:1},{unique:true})
db.quality_reports.createIndex({shiftDate:1,line:1})
```

Use tile-weighted reporting across shifts: sum `firstTiles` / sum `totalTiles` × 100, likewise for normal/cut damages. Do not average the saved percentages. Group designs by designCode and tileSize; when tilesPerBox varies, use saved tile totals.

Deploy and click **Retry quality report copies every minute**. Inspect **Quality reporting save result** and `quality_reports`. Existing overview APIs are unchanged; a future report API can read this collection by date range and line. No live database changes were executed during development. Local check: `node node-red/test-quality-report-storage.mjs`.
