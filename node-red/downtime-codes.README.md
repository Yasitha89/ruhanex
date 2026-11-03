# Database-backed downtime codes

Import `downtime-codes.flow.json` into the existing Node-RED instance. It creates a **Downtime Codes API** tab and a reusable **Validate downtime code assignment** subflow. It reuses your existing `mongodb4` client `8120871193b8f276` (RCLH) and creates the `downtime_codes` collection on the first write. If the Mongo nodes show an unresolved client, select your existing RCLH client in each node; no credentials are included in the export.

No existing production, stock, energy, or AI endpoint is replaced. No new AI-flow import is required.

## Catalogue APIs

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/downtime-codes` | List the full catalogue for the admin editor |
| GET | `/api/downtime-codes?line=Kiln%202&type=planned&plannedCategory=standard` | Return only matching line/type/category codes |
| GET | `/api/downtime-codes?line=Keda%201&type=unplanned` | Unplanned codes assigned to Keda 1 |
| POST | `/api/downtime-codes` | Create a new code |
| PUT | `/api/downtime-codes/SHIFT_END` | Update label, type/category and assigned lines for an existing code |

POST/PUT body:

```json
{
  "value": "SHIFT_END",
  "label": "SHIFT_END - Shift End / Handover",
  "type": "planned",
  "plannedCategory": "standard",
  "lines": ["Keda 1", "Kiln 2"]
}
```

Use `plannedCategory: null` for unplanned codes. Assign at least one valid line; an empty `lines` array does not mean all lines. Choose all nine lines explicitly to make a code available everywhere. Mongo stores `createdAt` and `updatedAt` as ISO strings. Code values are immutable uppercase identifiers (letters, digits, underscores, starting with a letter, maximum 80 characters).

Codes use their value as Mongo `_id`, so duplicates are atomically rejected using Mongo's built-in unique `_id` index. Updates do not upsert or rename codes, preventing accidental creation or breaking historical code identifiers. Reassignment changes future dropdown availability; it does not rewrite previous downtime records.

Read response: `{ "success": true, "downtimeCodes": [...] }`.
Write response: `{ "success": true, "downtimeCode": {...} }`.
Status codes: 201 create, 200 update/read, 400 invalid input, 404 missing update target, 409 duplicate, 500 database error.

## Seed existing codes (optional)

After importing and checking the Mongo client, manually click **OPTIONAL: seed legacy codes ONCE**. This is never run automatically on Deploy.

It inserts the 15 previous frontend codes, assigning each to all nine existing production lines so the previous behavior is preserved. It uses `$setOnInsert`, so repeated runs do not overwrite labels or line assignments you have edited. Check **Seed write result** in the Debug sidebar, then adjust the assignments in the admin UI. The source records are also available in `downtime-codes.seed.json`.

The frontend no longer falls back to hardcoded codes. Seed the database or create records before operators use the new dropdown. Network/database errors and empty results are displayed rather than silently showing unrelated codes.

## Validate downtime assignments on the backend

The new catalogue APIs validate code records. To also validate the code on **saving a downtime reason**, insert the imported **Validate downtime code assignment** subflow into your existing `/api/update-downtime-reason` flow:

```text
Validate Downtime + Machine
  output 1 → Validate downtime code assignment
               output 1 → original Mongo machines lookup → Check Machine Match → existing update/recalculation
               output 2 → existing HTTP error response
  output 2 → existing HTTP error response (unchanged)
```

The supplied `API.json` has `Validate Downtime + Machine` node `bb730faf05dca453`, original Mongo machines node `25c94d3dcb05305c`, and error response node `e77e4bc92ffd6b11`. Wire these only if those IDs/names still match your deployed flow.

This subflow reads `msg.downtimeUpdate`, checks Mongo for the exact code + line + type + category, then restores the original prepared machine query. The existing machine validation, downtime write and KPI recalculation are unchanged. Invalid/missing/unassigned codes fail with 400; database failures fail closed. Importing the definition alone does not automatically wire it into your existing endpoint.

## Frontend

- **Settings → Admin → Line Settings → Downtime Codes** adds a shared catalogue tab with add/edit fields, multiple-line assignment, and table pagination. The existing administrator password gate protects this page.
- Production downtime dialogs retrieve codes from this API using the event's line (falling back to the dashboard line), selected downtime type and planned category. Changing filters cancels stale requests and clears selections. Existing codes that no longer match require reselection before saving.
- Production-manager Line Settings does not expose catalogue administration.
- The Axios helper uses the existing shared API base and route convention. Keep your existing Nginx API prefix mapping.

As with the other administrative endpoints, enforce administrator authorization on POST/PUT in your authenticated backend/gateway. The frontend password gate is not a substitute for server authorization. Keep GET available to authenticated operators. These routes do not embed or require the private AI token.

## Verification

Run `node node-red/test-downtime-codes-flow.mjs` for offline validation of routes, filtering, schema validation, unique IDs, guard behavior, seed behavior and generated Function syntax. No live database writes or deployment occur in that test.

Regenerate the export after editing its source:

```text
node node-red/build-downtime-codes-flow.mjs
```

Test after deployment: seed/create a code assigned only to Kiln 2, verify it is available for the matching type/category there and absent on Keda 1, edit its assignments in the UI, and verify the backend guard rejects an old/forged selection. Also verify that saving a valid reason still triggers the existing shift recalculation.
