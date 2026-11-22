# Manual 60×30 floor and car stock correction

1. Replace the periodic stock nodes using the updated `periodic-stock.flow.json` first. This version respects a saved `manualOpeningStocks["60x30"]` for each shift.
2. Import `manual-stock-correction.flow.json`, reusing MongoDB client `8120871193b8f276`. Neither Inject runs automatically.
3. Inspect **History settings / current shift**. Default history starts **4 November 2026 at 06:00 Sri Lanka time** (`2026-11-04T06:00:00+05:30`), with zero inventory at that boundary. To use a known baseline, change `from` to a Colombo shift start and enter `floorOpening` / `carOpening` in TILES at that time. These are separate from current shift opening values calculated by the flow.
4. Click **PREVIEW 60x30 correction**. Inspect **60x30 stock correction result**, including historical glaze/kiln/Keda totals, history range, and before/after values for each stock.
5. To avoid concurrent updates, disable both periodic stock Inject nodes and let any running stock update finish before applying. Click **APPLY 60x30 correction**, inspect its result, then enable the periodic Inject nodes again. If either conditional update fails, read `floorSaved` in the error result and preview/retry. The two collections are updated sequentially, not in one transaction.

## Calculation

Read MongoDB `shifts.lineStats`. Prefer `sizeWiseProduction`; otherwise use `codeWiseProduction`; otherwise use the single-size `tileSize` / `tileCount`. Do not sum both arrays. Use only completed time intervals before the current shift start. Identify glaze, kiln and Keda from saved line names, including historical lines that may now be disabled. A duplicate device/time interval fails the correction instead of double-counting it.

For 60×30 only:

- Current shift floor opening = initial floor inventory + historical kiln tiles − historical Keda tiles.
- Current shift car opening = initial car inventory + historical glaze tiles − historical kiln tiles.
- Current closing = corrected opening + current shift's saved incoming − outgoing.

Negative opening values are clamped to zero, with the historical raw result retained in correction metadata. This is a net-history calculation, not a replay of old per-shift zero clamps. Convert each 60×30 tile to 0.18 m².

The current stock documents must already exist and contain 60×30 movements (`kilnOutput`, `kedaOutput` / `glazeOutput`). Those movements come from the last periodic run; this manual flow does not query current Influx events. Other sizes and the stock `calculationTo` timestamp remain unchanged. Update the total m² fields and save before/after/history metadata under `manualCorrection`. Persist the corrected opening under `manualOpeningStocks.60x30`, so future periodic recalculations retain it and later shifts inherit the corrected closing stock.

Production summaries alone cannot establish physical inventory unless the history is complete and its initial stock is known. Retained history may start after production began. Check that all required lines/shifts are present and that historical line names classify correctly; document counts do not prove completeness. The preview's history range covers all included summaries, not only summaries with nonzero 60×30 output. A zero result after this correction can mean outgoing production exceeds recorded incoming production, rather than a display error.

The flow writes only after Apply and uses conditional updates against the read stock array and `calculatedAt`; it never deletes documents or changes the production summaries.

Local verification: `node node-red/test-manual-stock-correction.mjs`.
