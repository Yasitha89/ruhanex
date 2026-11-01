# AI tool review against the supplied backend exports

Reviewed `device and line.json`, `ATS.json`, `Counters.json`, and `API.json` from the supplied Downloads files. These are configuration snapshots, not proof of live database contents or deployed behavior. Disabled nodes were excluded from the read-route inventory. No production backend flow or credential was copied into this repository or changed.

The updated AI flow covers **all 17 active GET routes** found in those exports. The 13 active non-GET endpoint definitions are intentionally excluded from the AI. No active duplicate GET paths were found; several alternate implementations are present but disabled.

## Findings that affect analysis

### Historical production and missing records

- `/api/getShiftsStats` accepts `line`, `fromDate`, `toDate` and returns raw saved Mongo shift documents with `lineStats`. Its query includes both endpoints. The query resolver can fall back to a default device; the AI normalizer independently filters returned line/date/shift scope rather than accepting a wrong line.
- The AI tool now deduplicates by device/date/shift and keeps latest `updatedAt`. Totals are calculated in JavaScript, with available-record counts per field. Empty or missing measurements remain null rather than invented zero totals.
- Daily rollups and design/size pairs are derived from those unique shifts. Availability is weighted by planned-production minutes and performance by target tiles only when all relevant records contain those denominators. Per-shift KPI values remain available for drill-down. No unweighted factory KPI average is claimed.
- Historical daily queries use this range tool instead of one request per shift/day, reducing repetitive calls. The unsaved current shift still requires the live/shift summary tool.
- The active `/api/production/daily-line-summary` code merges current runtime counters/status with completed saved shifts. Its requested date alone does not isolate runtime to a historical day. The AI wrapper therefore rejects past-day calls to this tool and directs the model to saved historical records.
- A monthly/shift response cannot establish that every unreturned day had zero production. The prompt explicitly requires missing-record language, correcting the earlier response that inferred a full-month absence from a small returned total.

### Monthly design totals versus changeovers

- The active monthly summary returns `totalProduction`, `days`, `sizeTotals`, `codeWiseProduction`, plus current-shift metadata. Breakdown values overlap and must not be added to the top-level total.
- `codeWiseProduction` aggregates unique size/code pairs and includes prior/current-shift quantities, sequence and first/last production dates. The top-level `codeWiseProductionTimeline` is commented out in this export; it is not available despite comments describing it.
- Active `/api/production/shift-summary` preserves saved `codeWiseProductionTimeline` when available. Use it to establish A→B→A production sequences. Older records can legitimately lack code details.
- Alternate "All Supported" count/stoppage/shift-summary HTTP handlers are disabled. The AI uses one valid line per call rather than assuming a new all-lines API is deployed.

### KPIs and telemetry

- Shift statistics set quality to **100% because reject counts are unavailable**. OLE therefore includes an assumed quality factor. This is not evidence of zero rejects.
- The planned-downtime model includes standard allowance, actual standard events, standard excess, additional planned and unplanned time. Availability may exceed 100%. Recorded event minutes cannot simply be added to an already adjusted summary.
- The active live summary Influx query uses `range(start:-60s)` despite a nearby comment mentioning five minutes. No recent telemetry does not prove a full shift produced zero. Source timestamps/status must be checked.
- Shift-count series returns cumulative `shift_count` points and tile size. These are not additive samples, and count decreases can reflect correction/reset. The AI wrapper includes first/last samples and decrease counts without inventing total production from them.
- Stoppage response rows contain computed `durationMinutes`. The wrapper groups event minutes by machine, reason and downtime type while retaining raw rows and classified summary. Unassigned reasons are not established causes.

### Floor and car stock

- Current stocks use latest Mongo snapshot plus Influx deltas. Floor = opening + kiln - Keda; car = opening + glaze - kiln.
- The API clamps negative raw stock balances to zero and returns both raw/clamped values, snapshot/live interval and warnings. The AI reports reconciliation warnings, including zero-initialized opening balances.
- No HTTP GET endpoint for historical stock snapshots exists in these exports. The AI must not claim it can retrieve historic balances.

### Energy APIs

- `/api/getEnergyMeterData`: latest meter values, `status`, `device_status`, timestamp and raw cumulative kWh. Missing measurements can default to zero and the timestamp can default to now. The AI reports freshness/quality limits and does not call raw cumulative kWh period consumption.
- `/api/getHistoricalEnergyUsage`: requires panel, comma-separated `device_ids`, `from_time`, `to_time`, interval (`1h`, `6h`, `1d`, `1mo`, `1y`). Returns `energyUsageKwh` per meter/interval and `totalEnergyUsageKwh`. This supplied implementation does not parse the frontend's optional `meters` parameter; the AI uses `device_ids`.
- Energy usage originates from accepted increments. Negative increments from meter resets and large spikes can be ignored during ingestion. Missing/filtered data must not be diagnosed as a confirmed outage.
- `/api/getHistoricalElectricityData`: one panel/device, explicit time range, averaged electrical samples; the AI reports min/max/mean and peak timestamps of returned means. An averaged peak is not an instantaneous maximum.
- `/api/getLiveEnergyData`: accepts `meters=ATS1:1,ATS1:3`, one metric and one of its nine recent ranges. The wrapper maps CEB/generator groups, supplies per-meter sample statistics and retains timestamps.
- CEB grouping 1/3/5 and generator grouping 2/4 on ATS1 match the current frontend. Inventory provides configured names; these defaults should be reviewed if physical meter configuration changes. No electricity tariffs or contracted capacity endpoint is provided.

### Configuration and writes

- Device inventory can contain arbitrary administrative fields. The AI sees only allowlisted identities, line/type, enabled status, and slave labels/IDs. IP addresses, connection details and credential fields are removed.
- GET line settings merges defaults into the result; it does not prove those settings existed historically. Master design search is a prefix match, returns active records and limits results to 50. Machine master search also limits active results to 50. Neither is a production or failure dataset.
- `API.json` defines POST downtime reason/machine updates and recalculates saved shift statistics afterward. No read-only analysis endpoint is added by that file; the AI deliberately cannot modify reasons, machines, counters, tile size or line settings.

## Runtime improvements

- 17 strict tools with fixed routes and validated parameters. No arbitrary SQL, Mongo, Flux, URL or mutation execution.
- Per-question caching avoids refetching identical results/failures. Default budgets are now 10 rounds/50 calls, configurable in the Node-RED environment.
- On tool-budget exhaustion the flow requests a final answer from existing evidence with tools disabled, instead of immediately throwing away the accumulated data.
- Large historical/energy responses retain full-data aggregates and explicitly disclose omitted detail. Remaining oversized results return an error, not partial totals.
- The HTTP contract and Nginx token forwarding remain compatible with the existing drawer.

## Verification and limits

All 17 route paths were checked against active GET HTTP In nodes in the four exports. Offline tests cover schema/route matching, actual exported Function execution, data normalization, credential isolation, invalid inputs, cache behavior and the final-answer fallback. No live Node-RED deployment, OpenAI request or production database query was performed. Answer quality still depends on model choice and actual saved-data coverage.
