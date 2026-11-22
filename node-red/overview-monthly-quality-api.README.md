# Overview monthly quality

Import `overview-monthly-quality-api.flow.json`, select existing MongoDB client `8120871193b8f276`, and deploy. It adds GET `/api/production/monthly-quality?month=2026-11`. Keep one active HTTP In node for that path.

The endpoint uses trusted `x-ruhanex-user` and `x-ruhanex-role` headers from the existing authenticated backend/proxy, matching the quality API pattern. Do not expose an unprotected Node-RED port where clients can supply trusted identity headers directly.

Read `quality_reports` for Keda 1, Keda 2 and Keda 3 using `shiftDate` within the requested production month. The frontend supplies the current month and refreshes every five minutes. For the active production month, replace any saved active-shift reports with live `quality_events` deltas, using saved tiles-per-box and grade assignments with the current category catalogue. Read enabled quality sensors from global.devices and categories from ruhanex_config/designGrades. Saved reports remain the only source for historical months. Assumed/unavailable quality is excluded, not counted as perfect-quality production. A live lookup failure returns 503 rather than presenting completed-only totals as complete. No data is written by the API.

`overview-monthly-quality-live.complete.flow.json` preserves the node IDs and tab from the latest supplied API attachment. Replace that existing endpoint using this variant. The generic `overview-monthly-quality-api.flow.json` is also updated; deploy one variant only. The added Influx node reuses configuration eef122fda5340dac. All functions use global or database data and may remain on the API tab. No frontend changes are needed. Current-shift production month uses the shift start date, including the overnight shift at month boundaries.

Percentages = sum of category tiles / sum of all measured tiles × 100. Do not average report percentages. Undetected/unclassified tiles are included in the denominator and shown in a fourth neutral slice if present. Empty months return an empty chart, not fabricated 100% quality. Duplicate line/date/shift reports or invalid category totals return an error rather than double-counting.

Response includes `month`, `totalTiles`, `totalBoxes`, `firstQuality`, `normalDamageQuality`, `cutDamageQuality`, category counts, per-line totals, report counts, `asOf`, and `pie.data` with tile counts and percentages.

The overview removes FloorStockChart and CarStockChart and displays MonthlyQualityChart across their combined space. Existing stock flows and APIs are retained for other uses. No frontend credentials or endpoint URL changes are required beyond deploying the new API flow.

Local checks: `node node-red/test-overview-monthly-quality.mjs` and targeted ESLint. No live server requests were made during implementation.
