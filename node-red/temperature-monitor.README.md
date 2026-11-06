# Milling live temperature page

Frontend navigation: **Process → Milling**, with Process immediately below Production. Clicking Milling opens the temperature chart directly. The page is temporarily Admin-only during testing; Managers and Line Supervisors cannot see or open it.

Uses the supplied existing backend endpoints:

- `/api/getHistoricalTemperatureData?slave_id=…&metric=all&from_time=…&to_time=…&interval=…`: PV and SV together, initial rolling history and incremental updates.
- `/api/getTemperatureData?slave_id=…`: latest PV/SV and reading timestamp.
- `/api/getTemperatureGatewayStatus`: controller communication status and gateway LWT status.
- `/api/devices`: registered controller labels and enabled states.

No new backend endpoint is required. Deploy the previously supplied temperature monitoring flow and device support patch before using the page. No temporary backend restriction is added. The existing authenticated API role rules remain unchanged; only the frontend navigation and page route are temporarily Admin-only.

The supplied API is hard-coded to gateway `RX-TEMP-3000`. The dashboard now fixes controller/slave ID **1** to **Spray Dryer 1** and ID **2** to **Spray Dryer 2**, showing both graph cards together. No controller selector or device-registry discovery is used. Other gateways need generalized backend routes before they can be monitored.

The page title is **Milling and Spray Dryer Monitoring**. Each spray-dryer card has independently controlled live window, pause/resume switch, green live dot and refresh button, right-aligned in its header. PV and SV values are right-aligned inside the card. PV is a solid blue line and SV a dashed orange line, with Y-axis padding below the minimum reading. Time labels use Asia/Colombo. The top-right Wi-Fi icon uses the supplied gateway-status endpoint (green online, red offline, grey unknown), with a status-only tooltip. It represents last-reported MQTT gateway connectivity, not measured Wi-Fi signal strength.

Polling runs five seconds after the previous batch finishes without overlapping. Changing the window or leaving the page aborts the current requests. Recent aggregation buckets are fetched again and replaced without duplication; history is bounded to the selected window and 5,000 samples per dryer. Pausing stops graph-history requests and freezes both datasets while status/latest readings continue refreshing. Memoized chart components and merged ECharts options preserve each chart's zoom; it resets intentionally when the live window changes.

Charts show the backend's mean aggregate PV/SV samples, not instantaneous values. Missing values remain null, with gaps inserted for prolonged telemetry gaps. Latest readings older than 30 seconds are marked stale. Gateway LWT status is last-reported state, not independent proof of current communication. Controller communication status is also displayed.

Offline test: `node node-red/test-temperature-monitor.mjs`. Frontend/backend live testing still requires your running gateway, InfluxDB and authenticated session.
