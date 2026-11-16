# Ruhana spray dryer temperature tools

Use **production-ai-chat.temperature.patch.flow.json** to update the AI flow you supplied. It preserves the supplied node IDs, wiring and custom answer instructions, and replaces the embedded toolkit in the three relevant Functions. It adds temperature guidance and keeps temperature tools unavailable to Line Supervisor/legacy JE roles, consistent with the Milling section's access. Admin and Manager can ask through the app and approved Telegram AI conversations.

## Deploy

1. Back up the current AI flow and keep its tab environment variables.
2. Import the patch into the existing AI tab and replace matching nodes. Do not run a second HTTP route for `/api/ai/chat`. Alternatively copy the three Function bodies from **Authenticate + tools**, **Validate + next data tool**, and **Append tool result** into the corresponding existing nodes.
3. Keep your existing `OPENAI_API_KEY`, `OPENAI_MODEL`, `PRODUCTION_API_BASE_URL`, and private chat token. The temperature endpoints must be reachable using the same internal base as the production tools, for example `http://127.0.0.1:1880`. No new keys or packages are needed.
4. Keep the supplied temperature ingestion/API flow deployed. No temperature API, scaling or sensor configuration is changed by this patch.
5. Deploy. Start a fresh app conversation or use `/reset` in an authorized Telegram chat before testing.

No frontend change or model training is needed. This uses read-only function tools with bounded API parameters; the model cannot invent arbitrary endpoints or execute Flux queries.

| Tool | Existing Node-RED endpoint | Parameters |
| --- | --- | --- |
| `get_latest_temperature` | `/api/getTemperatureData` | `slave_id` |
| `get_temperature_history` | `/api/getHistoricalTemperatureData` | `slave_id`, `from_time`, `to_time`, `interval`, `metric` |
| `get_live_temperature_series` | `/api/getLiveTemperatureData` | `slave_ids`, `metric`, `range` |
| `get_temperature_status` | `/api/getTemperatureGatewayStatus` | None |

Confirmed dashboard mapping: **Spray Dryer 2 inside = controller 3**, **output = controller 4**. Only those controller IDs are allowed in temperature data tools. Other dryers/controllers require an explicit verified mapping before adding them. Gateway status only returns the relevant controllers and safe status fields to the model.

PV is measured temperature, SV is set point and delta is recorded PV minus SV, in °C. Your supplied ingestion flow already corrects the firmware scaling; API values must not be multiplied again. The latest endpoint looks back 30 minutes and flags stale data, so Ruhana checks freshness before calling it current. A current communication problem does not prove a historical outage or identify a hardware cause.

Historical ranges require timezone offsets, allow at most 366 days and are capped at 5,000 expected buckets. Series statistics report extrema/mean of available **window averages**, not instantaneous peaks or time-weighted continuous averages. Missing samples remain null, and temperatures are never summed. Keep general warnings internal unless an actual issue affects the requested answer.

Example questions:

- What are Spray Dryer 2's inside and output temperatures now?
- Compare measured temperature and set point for the output over the last hour.
- Show the inside temperature trend for the previous 06:00–14:00 shift.
- What was the highest average output temperature yesterday?
- Is the spray dryer temperature gateway online?

The app can display the existing structured chart responses; Telegram remains text only. Existing Supervisor notification-only Telegram behavior stays unchanged.

## Verification

```sh
node node-red/test-temperature-ai.mjs
node node-red/test-production-ai-toolkit.mjs
node node-red/test-production-ai-flow.mjs
node node-red/test-ai-chart-response.mjs
```

These are local simulated checks, not live model/temperature API requests. The temperature-specific test checks the supplied patch's IDs/wiring, parameter allowlists, time-window limits, null/negative temperatures, statistics and account-role restrictions.

Rebuild for a later export with `node node-red/build-temperature-ai-patch.mjs path/to/your-ai-export.json`. The normal repository generator (`build-production-ai-flow.mjs`) also includes the new tools for future clean builds.
