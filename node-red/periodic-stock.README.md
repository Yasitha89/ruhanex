# Periodic floor and car stock

Import `periodic-stock.flow.json`. This creates a separate tab with two independent pipelines. Reuse MongoDB configuration `8120871193b8f276` and InfluxDB configuration `eef122fda5340dac`; connection credentials are not included. Verify these existing configurations are selected on the imported database nodes.

## Disconnect the old shift-end branches

On **Update Shift Code-wise Production** (`ba29ac1848fbe345`), remove only the outgoing wires to:

- **floor: QUEUED ENTRY after code-wise save** (`c3fc35bad70ed5ba`)
- **car: QUEUED ENTRY after code-wise save** (`0deef794aab463d7`)

Keep its Debug and Telegram connections. `periodic-stock.disconnect-shift.patch.flow.json` contains that exact updated save node. Replace the existing node when importing this patch, rather than creating a duplicate. Disable or remove the disconnected old stock branches, including any other triggers that could still write stock snapshots. The new flow needs no connection to the shift-summary flow.

## Schedule and calculation

The Inject nodes run 30 seconds after deployment/restart and every 300 seconds thereafter. Change **Repeat** to 600 seconds for ten-minute updates, or 60 seconds for one-minute updates. Startup skips ticks until the device registry is ready. Each stock type has its own expiring, owner-checked flow-context lock.

Read enabled counters from `global.counterConfig`. Infer roles from line names (kiln/firing, Keda/sorting, glaze/glazing). Existing `global.floorStockDeviceRoles` and `global.carStockDeviceRoles` overrides remain supported. These must classify each physical production stream once; duplicate counters for one stream would double-count it.

Read persisted Influx `tile_events.count_delta` events by device and immutable event `tileSize`. Aggregate into Colombo 06–14, 14–22 and 22–06 shifts. Recalculate totals from the shift opening balance on every tick; do not add the previous tick's totals again. One increment here is a production counter tile, not a quality sensor box.

- Floor: opening stock + kiln output − Keda output.
- Car: opening stock + glaze output − kiln output.
- Calculate each tile size independently, then convert centimetre dimensions to m².

Upsert one document per shift into **floorStocks** and another into **carStocks**, with `_id` such as `2026-11-21|06-14`. Keep existing `stocks`, `kilnOutput`, `kedaOutput`, `glazeOutput`, `closingStock`, `closingStockM2`, `totalFloorStockM2` and `totalCarStockM2` field conventions. Additional fields include `schema: 2`, `status: live/completed`, `settled`, `calculationTo`, `deviceRoles` and `source: periodic-influx-count-delta`.

Each size records `openingStock`, incoming/outgoing totals, `rawClosingStock`, nonnegative `closingStock`, and `zeroClampAdjustment`. Negative raw balances remain visible as discrepancies, while displayed stock and the next shift's opening balance are clamped to zero, matching the earlier stock convention. These discrepancies can indicate an incorrect initial stock, missing events, or mismatched counters; clamping does not establish the physical inventory.

## Opening balances, restarts and late data

The newest completed, settled snapshot provides the opening balance. Existing completed legacy stock documents are accepted as opening balances. **Check that balance before enabling this flow if the old calculation was wrong.** This rewrite cannot reconstruct an unknown physical opening inventory.

With no saved balance, calculation starts at the current shift's start with zero opening stock, explicitly flagged `openingStockInitializedToZero: true`. If an initial live document exists after a restart, replay that shift before building the next shift; do not discard the unfinished shift. Earlier history before that first shift is not backfilled automatically.

The ended shift is replayed until at least ten minutes after its end, then becomes a settled opening anchor. Catch up missed shifts chronologically, at most seven days per tick. Influx retention must still contain those events. Data arriving after settlement requires an explicit historical rebuild and recalculation of subsequent balances; there is no automatic unlimited late-data correction. Historical device role changes are not reconstructed; catch-up uses the currently configured counters.

Invalid sizes/counts stop the write and appear in the stock Debug result. MongoDB errors release the lock and retry on the next tick. If Influx has already expired events, an empty query cannot prove that production was zero; confirm retention covers the replay interval. No existing database documents are deleted by these files.

## Verify

Deploy and click each Inject once. Inspect **floor: periodic stock result** and **car: periodic stock result**, then check the current shift document in each collection. A second click updates the same `_id`. At a shift boundary, the previous document becomes completed and the next document inherits its balance. Local tests: `node node-red/test-periodic-stock.mjs`.
