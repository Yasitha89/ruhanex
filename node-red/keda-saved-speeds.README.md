# Production line saved speeds

## Keda sensor grade assignments

The Keda production line settings now have **Assign design grades**, available to Admins/Managers. Its modal lists sensor numbers 1–16, each with a dropdown populated from the existing **Design Grades** catalogue. Clear a slot to leave it unassigned; multiple slots may represent the same grade. This is per line, not per tile size.

Import the updated **keda-line-settings-save.patch.flow.json** replacing matching nodes, and the updated **design-grades.flow.json**. The latter allows Managers to read the catalogue, while only Admins may create/edit it. Keep existing MongoDB configuration and authenticated gateway. The partial-save preparation Function now has a third internal output to read line settings after validating the catalogue; import the full patch rather than only copying that Function's code.

Saving sends `{line,settingsAction:"saveDesignGrades",designGrades:{"1":"First","2":"Second",...}}`. The backend validates every assignment against `ruhanex_config` document `_id:"designGrades"`, then atomically patches `settings.<Keda line>.designGrades` on document `_id:"lineSettings"`. All 16 keys are stored; unused slots are null. Ordinary line-settings/Admin saves preserve the mapping and cannot overwrite it through a submitted body. Speed, packing, detection and run settings are preserved by the dedicated action.

```json
{"settings":{"Keda 1":{"designGrades":{"1":"First","2":"Second","3":null,"4":null,"5":null,"6":null,"7":null,"8":null,"9":null,"10":null,"11":null,"12":null,"13":null,"14":null,"15":null,"16":"Reject"}}}}
```

The grade labels above are examples. Create your actual grades first in Admin → Design Grades. Future sensor events can resolve grade using `lineSettings[line].designGrades[String(sensorNumber)]`. Null means unassigned, not a default grade. Sensor ingestion, historical mapping snapshots and yield calculations are not introduced by this settings change. Test: `node node-red/test-design-grade-slots.mjs`.

## Keda tiles per box

Each Keda line also has an independent active **`TilesPerBox`** field next to `savedTilesPerBox`. For example: `{"TilesPerBox":6,"savedTilesPerBox":{"60x30":8,"60x60":4}}`. The normal line Save updates the active value without modifying presets. On a tile-size change, the server selects that size's preset if available; otherwise it retains the submitted/current active value. Saving **Size quantities** edits presets only, without changing the active quantity. Reloading uses the active field; legacy records without it initially display the selected size's preset. Blank active quantity is stored as null. These fields apply only to Keda lines.

The production Line Settings page (Admin/Manager access) now includes **Tiles per Box** for the selected Keda size and **Size quantities** for configuring all supported sizes on that Keda line. Quantities must be positive whole numbers. Blank removes a preset; no packing counts are assumed. This is not shown for Glaze/Kiln lines or in the separate downtime-administration section.

Import the updated **keda-line-settings-save.patch.flow.json**, replacing matching nodes and preserving existing MongoDB configuration/connections. It updates the existing partial-settings router and embedded preservation logic. No new HTTP endpoint is added. The router must handle partial `settingsAction` requests before the full-settings/detection validator, just as it does for rated-speed presets; Admin/Manager authorization remains enforced in the router. Use the existing authenticated Nginx gateway and keep Node-RED private.

The size dialog POSTs `{line, settingsAction: "saveTilesPerBox", savedTilesPerBox: {"60x60": 4}}`. Only `settings.<Keda line>.savedTilesPerBox` and timestamps are patched in `ruhanex_config`, document `_id: "lineSettings"`. Ordinary line saves preserve every preset, rated speeds, run metadata and detection settings while saving the independent active `TilesPerBox`. Existing counts are preserved when saving the separate administration section.

```json
{"settings":{"Keda 1":{"savedTilesPerBox":{"40x40":6,"60x30":8,"60x60":4}}}}
```

The values above are illustrative; enter your actual packing quantities. The frontend verifies the server returned the saved map instead of reporting success against an older backend that ignores it. Tests: `node node-red/test-tiles-per-box.mjs` and `node node-red/test-keda-saved-speeds.mjs`.

## Kiln presets

Each kiln size now takes one input: **standard output in m² per 24 hours**, at full operation without downtime allowances. The tile size is in centimetres and determines its nominal area. Kiln length, cycle time, tiles per row and shrinkage are no longer inputs to this calculation.

```text
rated speed (tiles/min) = standardDailyOutputSqm / (widthCm * lengthCm / 10000) / 1440
```

Full precision is retained in the preset and active line speed; the modal preview rounds to two decimal places. The backend recalculates the speed and does not trust a submitted lineSpeed. Existing downtime calculations adjust target time separately.

For 60x60 at 6,090 m² per 24 hours: `6090 / 0.36 / 1440 = 11.747685185185185` tiles/min, displayed as 11.75. Sample persisted structure:

```json
{
  "settings": {
    "Kiln 1": {
      "savedSpeeds": {
        "60x60": { "standardDailyOutputSqm": 6090, "lineSpeed": 11.747685185185185 }
      }
    }
  }
}
```

Saving replaces that kiln's `savedSpeeds`, updates the current size's `lineSpeed` if a preset exists, and preserves design/run/downtime metadata. Blank sizes have no preset; nonpositive or nonnumeric outputs are rejected. Manual line-speed changes still save for an unchanged tile size; changing sizes selects that size's calculated preset.

Migration: open Size speeds and enter the actual standard outputs, then Save speeds. Old cycle-based presets cannot be converted automatically; the UI identifies them and ordinary saves ask for replacement. No daily outputs are invented. Re-saving the modal replaces old per-size cycle fields. Any old top-level kilnLengthMeters field is left in the database as unused metadata; it is no longer sent or used for speed calculation.

* Kiln 1: 40x40, 60x30, 60x60, 90x45, 120x60.
* Kiln 2: 60x60, 90x45, 120x60, 120x80, 80x80, 100x100.
* Kiln 3: 40x40, 60x30, 60x60.

Import and deploy the updated `keda-line-settings-save.patch.flow.json`; its filename and node IDs remain unchanged for upgrades. The earlier Keda-named subflows now support all production lines. This still targets the line-settings endpoint, not the separate dashboard tile-size endpoint.

## Glaze presets

The same modal/save path now supports Glaze Line 1, 2 and 3. Import and deploy the updated `keda-line-settings-save.patch.flow.json` (the filename and existing subflow IDs are retained for upgrades). Each glaze line has its own supported sizes:

* Glaze Line 1: 60x30, 60x60, 90x45, 120x60, 40x40.
* Glaze Line 2: 40x40, 60x30, 60x60.
* Glaze Line 3: 60x60, 90x45, 120x60, 120x80, 80x80, 100x100.

Glaze inputs are **press cycles per minute** and a positive whole number of **tiles per press**. Rated speed is their product in tiles/min, rounded to two decimal places. The API calculates the product itself rather than trusting a submitted lineSpeed.

```json
{
  "settings": {
    "Glaze Line 1": {
      "savedSpeeds": {
        "60x60": { "pressCyclesPerMinute": 10.5, "tilesPerPress": 4, "lineSpeed": 42 }
      }
    }
  }
}
```

These are illustrative values. Save speeds updates the active tile size's rated speed, while changing the size in line settings selects its saved product. Both blank inputs remove that preset; filling only one is rejected. Ordinary line saves retain both inputs. Manual speed changes with the same tile size still save as before.

The remaining setup instructions apply to Keda, glaze and kiln lines.

Import `keda-line-settings-save.patch.flow.json` to replace/update the supplied POST `/api/line-setting` flow. Retain existing node IDs when importing; do not create a second HTTP route. The patch contains no Mongo credentials and uses your existing Mongo client `8120871193b8f276`. Check that both Mongo nodes inside **Keda: save speeds action** use that client. Keep your existing gateway authorization and any line-settings detection guard before this flow.

The frontend **Save speeds** button posts:

```json
{
  "line": "Keda 1",
  "settingsAction": "saveSpeeds",
  "savedSpeeds": { "40x40": 40, "60x30": 28.5, "60x60": 18 }
}
```

These numbers are examples, not seeded defaults. Speeds are tiles/min. Blank inputs remove a preset; existing current speed is retained if the active size has no preset.

The speeds-only branch reads the existing document in `ruhanex_config` and performs a dotted `$set` on `_id: "lineSettings"`:

```text
settings.Keda 1.savedSpeeds = {"40x40":40,"60x30":28.5,"60x60":18}
settings.Keda 1.lineSpeed = the saved speed matching its current tileSize, if configured
settings.Keda 1.updatedAt = timestamp
```

Other sizes and lines are independent. Design code, production run IDs, downtime and other settings remain intact. The Mongo filter includes the current size: if it changes concurrently, the save returns 409 and can be retried. Existing lines are updated with `upsert:false`. Runtime `global.lineSettings` updates only after Mongo acknowledges the write. Startup already restores this document through the existing configuration loader; GET line settings already returns all fields for that line.

The full settings validator also retains `savedSpeeds`, and selects a saved speed when its tile size changes. The settings UI selects the saved speed immediately when changing sizes; **Save line** persists that form selection. Saving the speed modal does not submit unrelated unsaved form changes. The database's currently active size gets its new matching speed immediately.

Saving presets requires Admin/Manager via the existing trusted gateway's `X-Ruhanex-Role` header. Do not expose Node-RED directly to untrusted requests that can forge that header. No new authorization route is required because the endpoint remains `/api/line-setting`.

This patch targets the supplied **line settings save** endpoint. The separate production dashboard `/api/line-tile-size` endpoint is not changed by this patch; it needs equivalent preset selection if changes made there must also apply saved speeds.

Supported sizes:

* Keda 1: 40x40, 60x30, 60x60.
* Keda 2: 60x60, 90x45, 80x80, 120x60, 120x80, 100x100.
* Keda 3: 60x30, 60x60, 90x45.

For manual wiring instead, import `keda-saved-speeds.flow.json`. Insert **Keda: save speeds action** before your current validator (output 1 to validator; output 2 to HTTP response), and **Keda: preserve saved speeds** on the validator's success output (output 1 continues to master design lookup; output 2 to HTTP response). Use either the direct patch or manual wiring, not both.

Validation: `node node-red/test-keda-saved-speeds.mjs`. The patch is prepared locally; no live database or Node-RED deployment has been performed.
