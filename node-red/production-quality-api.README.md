# Quality pie chart and design-grade drill-down API

Import **production-quality-api.flow.json**. It adds a standalone read-only endpoint:

```text
GET /api/production/shift-quality
```

Select existing Mongo client **8120871193b8f276**, Influx config **eef122fda5340dac**, organization **Ruhanex**, bucket **RCLH**. Keep the existing quality telemetry/restore flow saving `grade_*_delta` fields in **quality_events**. Current-shift requests use those events. Completed-shift requests read **lineStats in the shifts collection** saved by **shift-end-codewise-quality.complete.flow.json**; they do not read the separate quality collection, query Influx, or fetch the current grade catalogue. Replace the previous version of this same endpoint when importing the updated flow; do not create a duplicate HTTP route.

The endpoint accepts trusted `X-Ruhanex-User` and `X-Ruhanex-Role` from your existing authentication gateway. Admin, Manager and Line Supervisor/legacy JE can read it. Your existing `/api/production/` GET authorization covers this endpoint; ensure the proxy forwards verified identity headers and direct Node-RED access is restricted. No credentials are supplied by the frontend. Unauthorized requests return 401.

## Request

```text
/api/production/shift-quality?line=Keda%202&date=2026-11-21&shift=06-14
```

| Parameter | Meaning |
| --- | --- |
| `line` | Required: `Keda 1`, `Keda 2` or `Keda 3` |
| `date` | Shift start date, `YYYY-MM-DD`; `shiftDate` is also accepted |
| `shift` | `06-14`, `14-22` or `22-06` |
| `category` | Optional `1`, `2` or `3`: also populate the selected `drilldown` object |
| `device` | Optional registered quality sensor ID, to resolve multiple matches |

Omit both date and shift for the current Colombo shift. Provide both from the dashboard's date/shift dropdowns for a selected historical/current shift. Night shifts use the date they began at 22:00. Future shifts are rejected. Before the requested shift ends, data comes from Influx up to the request timestamp. At and after the shift end, data comes from the matching Mongo document. No current-shift data is substituted for a historical request.

Historical Mongo lookup uses `lineStats.lineName`, `lineStats.shiftDate`, `lineStats.shift` and optional `lineStats.qualitySensorDevice`; it does not depend on the current device registry or whether a historical sensor is still enabled/registered. Multiple matching shift documents give 409: specify a quality sensor ID if that distinguishes them, or resolve duplicate production shift documents. Current shifts select enabled sensors from the registry and require loaded device configuration. Zero current matching sensors returns a successful no-data response; multiple current matches also require an explicit device.

The response shape is identical for both sources. `historical:false`, `dataSource:'influxdb'`, `source:'quality_events'` identifies current data. `historical:true`, `dataSource:'mongodb'`, `source:'shifts'`, `shiftDocumentId` and `savedAt` identify historical data. The historical adapter uses `lineStats.qualitySummary.gradeSegments` and `lineStats.qualityCatalogueSnapshot` saved at shift processing time, so current catalogue edits do not change the old chart.

The updated shift-end flow now persists those per-grade segments. Deploy the updated **shift-end-codewise-quality.complete.flow.json** as well as this API, or replace its Function nodes **Shift summary: initialize direct quality**, **Read quality_events for completed shift**, **Add quality to each code-wise entry + OLE**, **Save production with pending quality**, **Recalculate with saved production metadata**, **Query shift quality directly again**, and **Update saved code-wise quality (conditional)**; these carry the shared quality helper. No new shift-end wiring is needed for this snapshot addition. Full flow replacement is simpler if you preserve node IDs and existing surrounding nodes.

Older saved shifts without per-grade segments still return their saved pie totals from `lineStats.qualitySummary` and design/category detail from `lineStats.codeWiseProduction[].qualityDetails`. They return `gradeBreakdownAvailable:false`, with empty nested `grades` arrays rather than invented grade counts. `designBreakdownComplete` indicates whether the available code-wise details cover all shift quality tiles. Rechecking retained history with the updated direct shift-end flow can populate the new snapshot; no historical Influx fallback occurs in this API.

Use the same public API base/proxy as the other dashboard calls. The path above is the Node-RED route; your existing deployment may expose it under `/api/api/production/shift-quality` externally. Do not bypass the authenticated proxy.

## Response and frontend binding

The response contains **all three category drill-downs**. A slice click can use the already downloaded `categories` array, avoiding another API request. An optional category request provides the same selected object in `drilldown`.

```javascript
{
  success: true,
  line: 'Keda 2',
  device: 'RX-QLT-4000',
  shift: '06-14',
  shiftDate: '2026-11-21',
  qualityAvailable: true,
  status: 'available',
  totalQualityBoxes: 100,
  totalQualityTiles: 200,
  firstQuality: 80,
  normalDamageQuality: 15,
  cutDamageQuality: 5,
  undetectedTiles: 0,
  unclassifiedTiles: 0,
  pie: {
    valueUnit: 'tiles',
    percentageBasis: 'all-quality-counted-tiles',
    hasRemainder: false,
    data: [
      {id:'first', category:1, name:'First quality', value:160, boxes:80, percentage:80},
      {id:'normalDamage', category:2, name:'Normal damages', value:30, boxes:15, percentage:15},
      {id:'cutDamage', category:3, name:'Cut damages', value:10, boxes:5, percentage:5}
    ]
  },
  categories: [{
    category: 1,
    key: 'first',
    name: 'First quality',
    boxes: 80,
    tiles: 160,
    percentage: 80,
    designs: [{
      designCode: 'YKM',
      tileSize: '80x80',
      totalDesignBoxes: 100,
      totalDesignTiles: 200,
      boxes: 80,
      tiles: 160,
      percentageOfDesign: 80,
      percentageOfCategory: 100,
      grades: [{
        gradeNumber: 1,
        grade: 'First',
        description: 'First quality',
        category: 1,
        boxes: 80,
        tiles: 160,
        percentageOfDesign: 80,
        percentageOfCategory: 100
      }]
    }]
  }, /* category 2 and 3 have the same structure */],
  selectedCategory: null,
  drilldown: null,
  source: 'quality_events',
  categorySource: 'current-designGrades-catalogue',
  coverage: 'tracked-deltas-only'
}
```

Metadata also includes `shiftFromTime`, `shiftToTime`, `calculatedTo` and `timestamp`. Percentages are rounded to two decimals. Per-grade rows retain sensor grade numbers, assigned grade names and descriptions. Counts merge matching grade/name entries across packing changes after weighted tile conversion. The same design in different sizes remains separate. Grade reassignment produces distinct grade-name rows rather than relabelling previous counts.

### ECharts data and click contract

```javascript
// Backend contract example; chart/modal frontend wiring is not included in this flow.
const series = [{ type: 'pie', data: result.pie.data }];

const onSliceClick = (params) => {
  const category = params.data?.category;
  if (category == null) return;
  const selected = result.categories.find(item => item.category === category);
  // Open your modal with selected.name, selected.percentage and selected.designs.
  // Each design contains nested grade rows for the table.
};
```

`value` is the **tile count** used for slice geometry, not an already formatted percentage. Display `params.data.percentage` with `%` in labels/tooltips, or use ECharts' computed percentage. A modal should show design code, size, grade number/name, boxes, tiles, percentage of design and percentage of category. Do not label raw tile values as percentages.

Grade 0 and unclassified counts stay in the total denominator. When nonzero, a fourth neutral slice **Undetected / unclassified** is included, with `category:null` (no category 1/2/3 modal). Without that remainder, a three-slice pie would renormalize the known categories and inflate their visible shares. When the remainder is zero, exactly the requested three slices are returned.

## No data, classification and operational limits

No tracked tiles gives `qualityAvailable:false`, null quality percentages and `pie.data:[]`; show an empty state, not a fake 100% pie. No current registered sensor gives `status:'no-quality-sensor'`; a current sensor with no delta data gives `status:'no-tracked-quality-data'`. Missing historical production summary gives `status:'historical-shift-not-saved'`; a pending saved quality status gives `historical-quality-pending`; an old summary without usable quality fields gives `historical-quality-details-unavailable`. Saved assumed quality gives `historical-quality-assumed` and `assumedQuality:100`, with no fabricated measured pie. These states return HTTP 200 with an empty chart and never substitute live data.

Category **1 = first quality**, **2 = normal damage**, **3 = cut damage**. Current requests use `ruhanex_config` document `_id:'designGrades'`; historical requests use the saved shift's catalogue snapshot/counts (`categorySource:'saved-shift-summary'`). Old raw-only data and pre-baseline production cannot be reconstructed. Explicitly rechecking/rebuilding a production summary changes what this endpoint returns for it.

Errors return 503 with a safe message. Results disable browser caching. All data is read-only. Current requests perform one catalogue read and a shift-scoped Influx aggregation; historical requests perform one Mongo shifts lookup only. Consider a short shared server cache for many simultaneous current dashboards. Gate requests on the selected line/date/shift and ignore stale responses if the user changes selection. Refresh current-shift data periodically; historical selections need not poll continuously, except briefly while waiting for pending quality. Buffered/offline readings retain saved receive-time attribution.

## Validate

Deploy and call through the authenticated app/proxy. Check all three percentages against known grade/category mappings; compare total tiles against box deltas × saved box factors. Click contract data can be tested by inspecting `categories[0].designs` and its nested `grades`. Verify a packing change, same design in two sizes, grade reassignment, Grade 0 and missing mappings. Local tests passed; the live Influx query and proxy configuration still need deployment verification.

```powershell
node node-red/build-production-quality-api-flow.mjs
node node-red/test-production-quality-api.mjs
```
