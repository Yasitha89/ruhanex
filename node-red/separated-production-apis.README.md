# Production APIs on a separate tab

Import `separated-production-apis.complete.flow.json` using the option to replace/update existing nodes with matching IDs. It uses the API export supplied in this conversation, not a fresh export of your deployed server. If you have edited those APIs since that export, compare those changes before replacing them.

The import creates **Production APIs**, moves HTTP/database/API processing there, and leaves these five functions on the existing **Counters** tab (`e5489573e203f3d0`):

- Merge Daily Line Summary
- Build Monthly Queries + Runtime Current Shift
- Merge Monthly Summary
- Build Live Shift Summary
- Merge Live Influx + Mongo / Calculate KPI

These retain their exact original Function code and node IDs. Reads such as `flow.get("counters")`, `flow.get("downtimeStates")` and `flow.get("qualitySensorStatus")` still execute on Counters. This supplied API export does not read `flow.get("qualityCounters")`; quality data is queried from its databases. Any future function that reads qualityCounters must likewise stay on its owning runtime tab, with link nodes connecting it to the API tab.

Ordinary Link Out / Link In pairs replace each cross-tab wire. No Link Call timeouts or return configuration are required. Message branches, multiple outputs, request metadata, and HTTP response handling follow the original routes. Node-local `context` accumulation in merge functions remains in the same nodes. Scoped Catch nodes are split by tab so errors from runtime functions still reach their existing API error handlers.

MongoDB and InfluxDB configuration nodes are reused, not exported with credentials. There are no unresolved wire targets. The original Counters tab must exist; this file does not create or replace its runtime sensor processing nodes. Functions on Production APIs that use `global.get` continue to use the same global values.

Two shift-quality HTTP routes were active in the supplied export. The generated file disables **rx_qapi_http** and leaves **a81605f532b71056** active. If your deployed route is instead the rx_qapi variant, reverse that choice before deploying; only one should be active. Both branches remain in the export.

Deploy, then verify live summary, shift summary, shift count series, stoppages, daily/monthly summary and shift-quality in the frontend. No endpoint URL or frontend change is required. Local generation checks verify original Function bodies, syntax, all original output destinations through the link pairs, and Catch scopes. Live database and authenticated HTTP checks have not been run here.

The floor/car stock APIs are in the separate `periodic-stock-api.complete.flow.json` artifact; they are not present in this source export and are not changed by this migration.
