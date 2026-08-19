# Energy Overview Integration - Final

This project adds a responsive Energy Overview page to the existing Ruhanex platform while keeping the existing production dashboard, KEDA 1 downtime-reason popup, ATS1 detail page, reports, and sidebar behavior.

## Routes

- `/energyoverview` - new Energy Overview
- `/energydashboard` - existing ATS1 detailed energy dashboard

The Energy sidebar submenu contains:

- Overview
- ATS1

## Time zone

All Energy Overview ranges and chart labels use the Sri Lankan IANA time zone:

`Asia/Colombo` (`UTC+05:30`)

The browser timezone is not used to determine the energy-day boundary.

Example:

- Sri Lanka local time: `2026-08-02 00:00:00 +05:30`
- API UTC value: `2026-08-01T18:30:00.000Z`

This matches the Node-RED response supplied for the existing historical energy endpoint.

Timezone helpers are in:

`src/utils/energyTime.js`

## Existing Node-RED / InfluxDB endpoint reused

The overview uses:

`GET /api/getHistoricalEnergyUsage`

With the current Axios base URL, the deployed URL is currently:

`https://ruhanex.chikirisoft.com/api/api/getHistoricalEnergyUsage`

React sends:

- `panel`
- `device_id`
- `from_time`
- `to_time`
- `interval`

React never queries InfluxDB directly.

## Exact supported response

The supplied backend response is supported directly:

```json
{
  "success": true,
  "panel": "ATS1",
  "device_id": 1,
  "fromTime": "2026-08-01T18:30:00.000Z",
  "toTime": "2026-08-04T18:29:59.999Z",
  "interval": "1d",
  "count": 3,
  "totalEnergyUsageKwh": 207.32,
  "data": [
    {
      "panel": "ATS1",
      "device_id": 1,
      "interval": "1d",
      "intervalStart": "2026-08-01T18:30:00.000Z",
      "intervalEnd": "2026-08-02T18:30:00.000Z",
      "firstEnergyKwh": 115757.28,
      "lastEnergyKwh": 115826.38,
      "energyUsageKwh": 69.1
    }
  ]
}
```

The frontend plots `energyUsageKwh`. It does not re-sum cumulative kWh readings. A fallback calculation of `lastEnergyKwh - firstEnergyKwh` is retained only if a record does not contain `energyUsageKwh`.

## Aggregation intervals

Main chart:

- Day -> `1h`
- Week -> `1d`
- Month -> `1d`
- Year -> `1mo`
- Total -> last 3 years using `1mo`

Summary mini charts:

- 24 Hours -> `1h`
- 7 Days -> `1d`
- 30 Days -> `1d`
- 12 Months -> `1mo`
- 3 Years -> `1mo`

## Live power

The current-power gauge reuses:

`GET /api/getEnergyData`

for panel `ATS1`, device ID `1`, refreshing every 5 seconds.

## Files added

- `src/pages/EnergyOverview.jsx`
- `src/pages/EnergyOverview.css`
- `src/components/EnergyPowerGauge.jsx`
- `src/components/EnergyOverviewMiniChart.jsx`
- `src/components/EnergyOverviewUsageChart.jsx`
- `src/utils/energyTime.js`

## Existing files integrated

- `src/App.jsx`
- `src/components/Sidebar.jsx`
- `src/api/energyApi.js`

No production-page structure was removed.

## Export controls
The main Energy Overview chart toolbar now keeps the period selector centered and provides two export actions:
- **Excel** exports the currently displayed chart data to `.xlsx`, including Sri Lankan interval start/end times, first/last cumulative kWh, interval usage, and total usage.
- **Save Image** exports the current ECharts chart as a high-resolution PNG.

All exported timestamps are formatted using `Asia/Colombo` (UTC+05:30).
