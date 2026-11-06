# Dedicated production breakdown report API

Ruhana's updated `production-ai-chat.flow.json` includes the read-only `get_production_breakdown_report` tool. After deploying this API, reimport/deploy that chat flow as well. It supports a category, multiple lines, exact timestamps and size/design breakdown. Example: “Compare sorted production by design for all KEDA lines from 10 October 2026 08:00 to 12 October 2026 20:00.” The tool defaults an empty line selection to all category lines, preserves source warnings and avoids double-counting size and design representations. It remains excluded from the legacy Line Supervisor/JE chat tool set.

Import `production-report.flow.json` into Node-RED, select your existing MongoDB and InfluxDB connections if their configuration IDs do not resolve, and Deploy. The new frontend report already calls this API; it does not fall back to downloading whole months.

```text
GET /api/production/breakdown-report
```

Public Nginx/browser path with the existing proxy:

```text
/api/api/production/breakdown-report?category=green&lines=Glaze%20Line%201,Glaze%20Line%203&fromDate=2026-11-01&toDate=2026-11-05
```

## Parameters

### Exact date/time mode (used by the updated frontend)

Pass `fromTime` and `toTime` as ISO timestamps with explicit timezone, instead of date-only parameters. For example:

```text
/api/api/production/breakdown-report?category=green&lines=Glaze%20Line%201&fromTime=2026-10-10T02:45:00Z&toTime=2026-10-12T11:15:00Z
```

This selects 10 October 08:15 to 12 October 16:45 Sri Lankan time. Start is inclusive, end exclusive. Both timestamps are required, with start before end and a maximum 366-day duration. Future end times are capped at the query's current time.

Exact-time mode uses hybrid retrieval: fully covered completed shifts use MongoDB; partial endpoint shifts and the active shift use Influx tile events for only the clipped intervals. Missing saved summaries fall back to Influx only for affected lines/shifts. A completed shift crossing a calendar-month boundary also uses Influx so its production can be allocated accurately to each month. Adjacent Influx intervals with the same device selection are merged. Mongo and Influx source intervals do not overlap. It returns monthly size/design rows with `intervalStart` and `intervalEnd` clipped to the selected portion of each calendar month. These columns are report-period boundaries, not inferred first/last tile timestamps. Completed-shift totals retain the saved size/design data; partial/fallback intervals follow retained accepted Influx events and may differ from later manual corrections. Missing or expired telemetry cannot be reconstructed. `retrieval` reports Mongo shift counts, Influx partial/missing/month-boundary shift counts, and the exact Influx ranges. Counts refer to line-shift combinations. For full October choose 1 October 00:00 through 1 November 00:00; selecting 31 October 00:00 excludes the rest of that day.

The frontend date picker now includes a time picker, explicitly interprets its calendar values in Asia/Colombo, and displays Start Time / End Time columns. Reimport the complete updated API flow to install the hybrid query/merge functions and their wiring. Both date-only and date/time requests pass through the selected-shifts Mongo query first. No frontend changes are needed for this optimization.

### Legacy production-date mode

- `category`: `green`, `sorted`, or `kiln`.
- `lines`: comma-separated canonical names. Omit to select all three lines in the category.
- `fromDate`, `toDate`: inclusive production dates `YYYY-MM-DD`, up to 366 dates. A production date runs 06:00 to the following day 06:00 in Asia/Colombo.

Green uses Glaze Line 1/2/3; sorted uses Keda 1/2/3; kiln uses Kiln 1/2/3. Categories are kept separate to avoid counting the same tiles through multiple production stages.

## Data sources

Completed shifts are queried directly from the MongoDB `shifts` collection for the selected dates and configured devices/lines. The newest saved record per line/date/shift is retained. Within-shift breakdowns use saved size/design counts and known tile dimensions. Missing design assignments appear as `Unassigned`, and missing size evidence as `Unknown`; warnings identify incomplete records. Code-count discrepancies are reported rather than silently converting all tiles using the last configured size.

If the selected period includes the active shift, the endpoint reads only that shift's accepted `tile_events/count_delta` samples from InfluxDB bucket `RCLH`, grouped by device, size and design. A saved copy of that same active shift is excluded to avoid double counting. This requires the existing tile-event ingestion to be up to date. Missing or filtered telemetry cannot be recovered by this report.

The endpoint uses current `global.counterConfig` to resolve exact canonical line names to devices. Unknown lines are listed in `unavailableLines`; if none can be resolved the endpoint returns 503. Ambiguous duplicate line/device mappings return 409. There is no fallback to an unrelated counter. Historical device remapping needs explicit migration if a line previously used another device ID.

## Response

```js
{
  success: true,
  category: 'green',
  fromDate: '2026-11-01',
  toDate: '2026-11-05',
  rowsBySize: [/* {key,month,line,tileSize,designCode,tileCount,production} */],
  rowsByDesign: [/* same fields, grouped by size + design */],
  coverage: [/* line, expectedShifts, availableShifts, missingShifts */],
  unavailableLines: [],
  warnings: [],
  asOf: '...'
}
```

Both breakdowns contain only the selected dates, aggregated into monthly rows. Missing saved shifts are flagged and excluded, not filled with presumed zero production. No MongoDB writes occur. Live-query failures fail the request instead of silently showing completed-only totals.

The existing authenticated Nginx `/api/api/` proxy supports this route without a new location. Keep Node-RED private and retain the gateway's session checks. Report navigation follows existing Admin/Manager permissions.

For larger databases, consider a MongoDB index matching this query, such as `{ 'lineStats.device':1, 'lineStats.shiftDate':1 }`, and a corresponding line-name/date index if legacy records require that branch. Test indexes against your deployment workload.

Maintain using `node node-red/build-production-report-flow.mjs`. Offline validation: `node node-red/test-production-report-flow.mjs`. Live MongoDB/InfluxDB testing is required after import.
