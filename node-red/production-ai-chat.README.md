# Production AI chat — Node-RED import

Import **production-ai-chat.flow.json** with Node-RED's menu → Import → select a file → Import. It creates a separate "Production AI chat" tab. This uses only core nodes (Function, HTTP In, HTTP Request, HTTP Response, Catch); no AI palette package or database credentials are needed.

The flow exposes `POST /api/ai/chat`. It calls OpenAI's Responses API, executes the model's requested read-only production tools, and sends each result back until a final answer is returned. Model reasoning and function-call items are preserved between rounds. Each request has its own state; the flow does not share conversation history between users.

## 1. Set Node-RED environment variables

Set these in the environment of the Node-RED service/container, or the imported flow tab's Environment variables. Keep secrets out of exported flows and Git. Restart the service if changing its process environment.

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | Your server-side OpenAI API key, with API credits available |
| `OPENAI_MODEL` | An available model ID supporting Responses API function calling; select one from your OpenAI account |
| `PRODUCTION_API_BASE_URL` | Backend prefix **before `/api/production/...`**, e.g. `http://127.0.0.1:1880` |
| `AI_CHAT_BEARER_TOKEN` | A long, random private token for server-side/testing access to this endpoint |
| `PRODUCTION_API_BEARER_TOKEN` | Optional separate credential if your internal production APIs require a bearer token |

Important: the production base is NOT the frontend Axios base automatically. This flow appends `/api/production/monthly-summary`, etc. For example:

- Base `http://127.0.0.1:1880` → `http://127.0.0.1:1880/api/production/monthly-summary`
- Base `https://ruhanex.com/api` → `https://ruhanex.com/api/api/production/monthly-summary`

Use the prefix that matches your actual reverse-proxy routing. Prefer the internal Node-RED address when it exposes the existing API routes directly. In Docker, `127.0.0.1` means the current container.

The flow intentionally returns 503 when required configuration is missing, and 401 without the chat token. Never use your OpenAI key as the chat token.

## 2. Deploy and test

Deploy, then test with an HTTP client such as Postman:

```http
POST http://localhost:1880/api/ai/chat
Authorization: Bearer YOUR_PRIVATE_CHAT_TOKEN
Content-Type: application/json
```

```json
{
  "message": "Compare Keda 1 production in September and October 2026",
  "line": "Keda 1",
  "history": []
}
```

The model should request both monthly summaries. The response is:

```json
{
  "success": true,
  "answer": "The generated analysis...",
  "asOf": "2026-11-01T08:30:00.000Z",
  "sources": [
    {
      "tool": "get_monthly_production",
      "parameters": { "line": "Keda 1", "month": "2026-09" },
      "endpoint": "/api/production/monthly-summary",
      "retrievedAt": "2026-11-01T08:29:58.000Z",
      "success": true
    }
  ]
}
```

This response is illustrative, not actual production data. `asOf` is answer generation time; source API timestamps remain available to the model. Retain source warnings in the answer.

## 3. Available tools

| Tool | Route | Arguments |
|---|---|---|
| `get_monthly_production` | `/api/production/monthly-summary` | line, month (`YYYY-MM`) |
| `get_daily_production` | `/api/production/daily-line-summary` | line, date (`YYYY-MM-DD`) |
| `get_shift_summary` | `/api/production/shift-summary` | line, date, shift |
| `get_shift_downtime` | `/api/production/shift-stoppages` | line, date, shift |
| `get_floor_stocks` | `/api/production/floor-stock` | none |
| `get_car_stocks` | `/api/production/car-stock` | none |
| `get_live_production` | `/api/production/live-summary` | line |
| `get_historical_shifts` | `/api/getShiftsStats` | line, fromDate, toDate (inclusive) |
| `get_shift_count_series` | `/api/production/shift-count-series` | line, date, shift |
| `get_line_settings` | `/api/line-setting` (GET only) | line |
| `get_design_codes` | `/api/design-codes` (GET only) | tileSize, search (empty strings allowed) |
| `get_machines` | `/api/production/machines` | line, search (empty string allowed) |
| `get_device_inventory` | `/api/devices` (GET only) | none; sanitized response |
| `get_current_energy` | `/api/getEnergyMeterData` | deviceId (`1`–`5` as a string) |
| `get_energy_usage` | `/api/getHistoricalEnergyUsage` | source, fromTime, toTime, interval |
| `get_electricity_history` | `/api/getHistoricalElectricityData` | deviceId, fromTime, toTime, interval |
| `get_live_energy_series` | `/api/getLiveEnergyData` | source, metric, range |

Shifts: `06-14`, `14-22`, `22-06`. Lines are explicitly allowlisted in the flow. There is no current-shift restriction. Monthly summaries provide size-wise and code-wise data. Current stock tools do not provide historical stock snapshots.

Energy sources are `ceb` (ATS1 meters 1,3,5), `generator` (2,4), or `all`. Meter IDs and grouping follow the application's current energy pages; inventory provides configured labels. Energy usage uses `device_ids`, electrical history uses `device_id`, and live energy uses `meters`. These are mapped internally so the model cannot invent arbitrary URLs or Flux queries. Energy timestamps must include `Z` or an explicit offset, such as `2026-10-01T00:00:00+05:30`. Range ends are exclusive for energy. Historical shift date endpoints are inclusive.

`get_daily_production` is restricted to the current production day because the supplied backend implementation mixes saved records with current runtime. Historical daily questions use `get_historical_shifts` with equal start/end dates instead. The production day begins at 06:00 Sri Lanka time. Detailed backend findings are in **production-ai-backend-analysis.md**.

## Updating an existing AI flow

1. Back up the current AI tab and privately note its environment variables, including custom limits. Do not share an export containing secret values.
2. Replace the old **Production AI chat** tab with the regenerated `production-ai-chat.flow.json`. Do not keep both old and new HTTP In nodes active for `/api/ai/chat`. Leave your four production/energy/backend tabs unchanged.
3. Restore the same environment values to the new tab, or keep using the service environment. Set optional limit variables below if needed.
4. Deploy and test. The frontend request/response contract and Nginx private token forwarding are unchanged.

The generator embeds the toolkit into the Function nodes. No files, JavaScript modules, additional palette packages or Function-node library imports need to be copied onto the Node-RED server.

New answers use detailed breakdowns with source limitations. Existing conversation history is unverified evidence; start a new conversation/reload the UI when testing corrections to old answers.

## 4. Frontend integration and authentication

### Chart responses

The flow now uses Responses API **Structured Outputs** (`text.format`, JSON Schema, strict mode). Choose a model that supports both function calling and Structured Outputs. No new environment variables are required. The final model object is parsed by Node-RED and returned as:

```json
{
  "success": true,
  "answer": "October recorded production was 20% higher than September.",
  "charts": [
    {
      "type": "bar",
      "title": "Keda 1 monthly production",
      "unit": "m²",
      "labels": ["2026-09", "2026-10"],
      "series": [{ "name": "Production", "values": [100, 120] }],
      "sourceTools": ["get_monthly_production"]
    }
  ],
  "chartWarnings": [],
  "asOf": "2026-11-01T09:00:00.000Z",
  "sources": []
}
```

This is a shape-only example with illustrative values; real source entries are returned as before.

- Ruhana is instructed to include charts for useful comparisons, trends and breakdowns, and whenever a graph is explicitly requested and source data is available. Questions needing clarification or lacking evidence return `charts: []`.
- Supported types: `bar`, `line`, `pie`. Limits: 3 charts, 4 series per chart, 60 labels. Each series has exactly one value per label. `null` represents a missing bar/line value; it must not become zero. Pie charts require a single nonnegative series with a positive total and no nulls.
- Each chart has one unit and references tool names from successful sources in the current request. This verifies structural provenance, not a point-by-point numerical proof; model-selected values and arithmetic must still be checked against sources when accuracy matters.
- Node-RED validates the data shape and returns only allowlisted fields, never executable JavaScript, HTML or arbitrary ECharts options. Invalid charts are omitted with `chartWarnings`, retaining the answer. Invalid final JSON returns a 502 error. Model refusals return text with an empty chart list.
- Answers remain short by default; large code/date ranges should use suitable aggregation/top-N and disclose omissions. The 6,000-output-token budget still applies.
- The drawer now retains `charts` and `chartWarnings` with each answer. `AiChatCharts.jsx` renders validated bar/line/pie data using the fixed adapter in `src/utils/aiCharts.js`. Charts can be enlarged and their numeric values inspected in a data table. Bar/line charts with more than eight categories have a horizontal slider. Nulls remain gaps, warnings stay visible, and malformed charts do not block the text answer. Generated chart options, JavaScript and HTML are never executed. Existing text-only responses remain compatible.

Structured Outputs reference: https://developers.openai.com/api/docs/guides/structured-outputs

The drawer is connected through `src/api/aiChatApi.js`, using the shared Axios `API_BASE_URL` and the `/api/ai/chat` request path, consistent with the other production API helpers. It sends `{message, line, history}`, displays the answer and data sources, and supports loading, errors, and retry. History is limited to 20 user/assistant text messages of 4,000 characters each. Questions are limited to 4,000 characters. Conversations are kept in memory separately for each page, survive closing the drawer, and reset on reload. No date or current-shift restriction is sent.

With the current base `https://ruhanex.com/api`, Axios resolves the request to `https://ruhanex.com/api/api/ai/chat`. Ensure your reverse proxy maps this public path to Node-RED's `/api/ai/chat`, just as it maps the other production endpoints. If your deployed API prefix differs, adjust the shared base/routing accordingly. The browser timeout is four minutes.

The browser intentionally sends no private bearer token. A 401/403 in the drawer means the authenticated gateway/token forwarding still needs configuration. A successful Postman request using a private token does not configure this gateway automatically.

**Do not embed `AI_CHAT_BEARER_TOKEN` or `OPENAI_API_KEY` in React or localStorage.** For production, place a trusted backend/reverse proxy in front of this endpoint that validates each user's actual application session, enforces their line permissions and rate limits, and injects the private chat token server-side. Keep the raw Node-RED endpoint private. The project's current demo login does not provide verified server-side identity. Alternatively replace the token check with your real session-validation subflow, retaining a fail-closed check.

Apply permission checks to every tool request in `Validate + next data tool` when users have different line permissions. The shipped flow assumes the trusted caller is allowed to query all nine lines. Run tools with a separate read-only production credential where possible.

## Limits and errors

- Defaults: 10 tool rounds and 50 tool calls per question. Override with `AI_MAX_TOOL_ROUNDS` (1–30) and `AI_MAX_TOOL_CALLS` (1–100). Calls in a round execute sequentially. When a round would exceed the budget, its calls receive budget-error results and the model gets a final request with tools disabled, to explain collected evidence and incomplete coverage.
- Identical validated requests are cached within each question, including backend failures; repeating a request does not refetch data or add duplicate source entries.
- Individual HTTP requests time out after 60 seconds (AI) or 30 seconds (data).
- The overall budget is checked before each AI request and tool round at 180 seconds; it is not a hard cancellation timer. Set the upstream proxy/client timeout accordingly.
- Tool results above 150,000 characters omit detailed historical/time-series rows with an explicit disclosure while preserving aggregates calculated over all returned records. If the remaining result is still too large, it becomes an explicit error. Monthly and shift responses are never silently truncated.
- Historical ranges are limited to 3,660 days per call; electrical history/usage are limited to 5,000 expected time buckets. These are backend load safeguards, not a current-shift limitation.
- Rate limits and global concurrency limits must be enforced by your authenticated gateway.
- API HTTP failures produce safe errors; production data errors are passed to the model as failed tool results. Never enable complete-message Debug nodes on this flow: outgoing messages contain credentials.
- Do not store chat state in shared flow context. Pass each user's history with their request, and treat prior assistant text as unverified.

## Local verification

Run `node node-red/test-production-ai-flow.mjs` and `node node-red/test-production-ai-toolkit.mjs` for offline checks. These cover all tool schemas/routes, parameter validation, credential redaction, actual exported Function code in a sandbox, history deduplication/weighted totals, stock warnings, energy/downtime rollups, request caching, and final-answer fallback. No credentials, deployment, billable API calls, or production requests are involved. Live Node-RED and OpenAI execution must still be tested after import.

`node node-red/test-ai-chart-response.mjs` also verifies chart validation, null values, source checks, malformed data, refusals, and actual exported Structured Outputs request/response nodes.

To regenerate JSON after editing the generator:

```text
node node-red/build-production-ai-flow.mjs
```

Reference: https://developers.openai.com/api/docs/guides/function-calling
