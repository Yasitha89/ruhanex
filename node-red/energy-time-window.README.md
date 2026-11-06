# Energy consumption during selected daily hours

Import `energy-time-window.patch.flow.json` and replace the two existing Function nodes with the matching IDs/names:

- **Validate + Build Energy Query** (`a00404334d5d5f7c`)
- **Format Energy Response** (`fe83c684e92dd30b`)

Keep the existing GET `/api/getHistoricalEnergyUsage` HTTP In, InfluxDB query, error handling, and HTTP Response wiring. Do not create a duplicate HTTP endpoint. If import creates copies, copy the Function contents into the original nodes and remove the copies. Deploy both replacements.

The endpoint already supported multiple devices on one panel with `device_ids`. The patch adds a recurring daily time filter, using Asia/Colombo, applied to raw accepted energy increments **before** aggregation. Existing requests without the new fields remain unchanged.

The optimized version creates bounded source ranges for each selected daily period, aggregates each range before combining the results, then merges matching meter/interval buckets. It avoids a full-month per-sample `date.hour/date.minute` filter. For October 18:30–22:30, this reads 31 four-hour ranges rather than all 744 hours. Performance depends on your InfluxDB version, indexes, server load and telemetry volume; it is not a guaranteed timeout fix. If necessary, raise the existing InfluxDB config node's request timeout from 60 to 120 seconds after testing a smaller range. That shared config setting can affect other flows. The browser/API proxy timeout must also allow the longer request.

## Example: October 2026, daily 18:30–22:30, meters 1/3/5

For the authenticated browser/public Nginx route:

```text
/api/api/getHistoricalEnergyUsage?panel=ATS1&device_ids=1,3,5&from_time=2026-09-30T18:30:00Z&to_time=2026-10-31T18:30:00Z&interval=1d&daily_start=18:30&daily_end=22:30&timezone=Asia/Colombo
```

The UTC timestamps represent 1 October 00:00 through 1 November 00:00 in Sri Lanka. This includes all October calendar dates. `totalEnergyUsageKwh` is the combined selected-window total for the selected meters across that whole range, even when `interval=1d` returns daily rows.

For an internal Node-RED request, use the private backend address and single `/api/getHistoricalEnergyUsage` path, according to your existing network configuration. Do not bypass Nginx for browser access.

Parameters:

With selected hours, 1h and 6h buckets are anchored to the selected window's start, with a shortened final bucket. For 22:30–05:30, 6h yields 22:30–04:30 and 04:30–05:30. Daily returns one whole window. Monthly/yearly combine windows by their starting calendar month/year, with the final night truncated at the selected date range end. Returned start/end labels describe the envelope of included windows; monthly/yearly envelopes contain the excluded daytime gaps, not continuous consumption. The frontend table, chart and export group by exact returned interval boundaries instead of rounding them back to calendar buckets.

| Field | Meaning |
| --- | --- |
| panel | One panel, e.g. ATS1 |
| device_ids | Comma-separated device IDs, e.g. 1,3,5; up to 12 |
| from_time / to_time | ISO timestamps with timezone; inclusive start / exclusive end; maximum 366 days with a daily window |
| daily_start / daily_end | Both required for filtering; HH:mm, start inclusive / end exclusive |
| timezone | Optional; only Asia/Colombo is supported |
| interval | Existing aggregation choice: 1h, 6h, 1d, 1mo, 1y |

Start and end cannot be equal. For a date-picker range (local midnight boundaries), an end earlier than the start means overnight windows identified by their **starting dates**, capped at the selected range end. Selecting October 1–31 with `22:30`–`05:30` includes October 1 at 22:30 through October 2 at 05:30, continuing through October 31 at 22:30 through October 31 at 24:00 (November 1 at 00:00, exclusive). November 1 early-morning consumption is excluded for every interval selection. Daily rows represent each whole selected window, with exact start/end timestamps rather than midnight calendar buckets. The response preserves the original date selection as `selectedFromTime`/`selectedToTime` and returns the effective queried envelope as `fromTime`/`toTime`. It marks `dailyWindow.dateBasis` as `overnight-start-date`. Arbitrary intraday outer timestamp ranges retain strict clipping and can contain partial overnight segments. No tariff rates are implied by “peak”; users choose the time window. Multiple distinct daily windows require separate calls.

New response fields:

- `dailyWindow`: boundaries, timezone, overnight flag and inclusion rules.
- `byMeter`: totals for each requested meter, including labels.
- `missingMeters`: requested meters with no returned samples; their totals are null, not zero.
- `asOf`, `method`, `warnings`: calculation context.

The combined and per-meter totals are summed from raw returned interval values before final rounding. A known zero sample means zero consumption; no samples mean unavailable. Increment timestamps determine window membership. An increment spanning a boundary is not prorated, and missing/filtered telemetry is not reconstructed. Per-meter values must not be combined when meters measure overlapping parent/child loads.

## Ruhana

Reimport the updated `production-ai-chat.flow.json` and deploy. The new read-only tool **get_energy_time_window** accepts panel, selected meter IDs, date range and daily window. The old general energy tool remains available. Line Supervisors remain excluded from energy tools.

Example questions:

- “Show October 2026 energy consumption from 18:30 to 22:30 for ATS CEB, MSB CEB and ATS KEDA 2, separately and combined.”
- “Compare last month's daily 22:30–05:30 consumption for generator meters 2 and 4.”

No Nginx route change is needed because this extends the existing endpoint. Offline checks: `node node-red/test-energy-time-window.mjs` plus the existing AI flow tests. A live InfluxDB check is still required after import.

References: [Flux local-time hour extraction](https://docs.influxdata.com/flux/v0/stdlib/date/hour/) and [aggregation windows](https://docs.influxdata.com/flux/v0/stdlib/universe/aggregatewindow/).
