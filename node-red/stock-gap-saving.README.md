# Save floor/car stocks across missing snapshots

Import `stock-gap-saving.flow.json`. This is a **replacement saving flow**, not an API replacement. It creates a new tab, reusing your existing MongoDB and InfluxDB configuration IDs. Select the appropriate existing configurations if the imported database nodes show configuration errors. No credentials are included.

## Wiring

1. Disconnect both old stock-saving branches from **Update Shift Code-wise Production**, including their 3-second Delay nodes. Disable the old saving branches; do not run two writers for the same collection.
2. Wire that MongoDB node's successful output to both new entry nodes (use Link Out / Link In nodes to connect across tabs):
   - **floor: QUEUED ENTRY after code-wise save**
   - **car: QUEUED ENTRY after code-wise save**
3. Retain the message's existing `codeWiseTarget` with `device`, `shiftDate` (`YYYY-MM-DD`) and `shift` (`06-14`, `14-22`, `22-06`). Entry validates the Mongo result (`acknowledged:true`, `matchedCount:1`) and ignores unrelated device triggers.
4. Deploy. Inspect the two **snapshot result** Debug nodes. They report `saved`, snapshot ID, calculation start and covered-shift count, or a failure. The old 3-second delays are unnecessary because these branches run queued, one complete save at a time per collection. Use the default memory context store for these transient queues. Deploy/restart clears pending work; see manual retry below.

The old ALL-device summary verifier is no longer part of saving. Production comes directly from Influx `RCLH` → `tile_events` → positive `count_delta` grouped by device and tile size. Different summary totals no longer block the calculation. This assumes Influx telemetry is complete when the completed shift trigger arrives; late or missing telemetry cannot be inferred from an empty query. Do not treat this as automatic telemetry reconciliation.

## Calculation

- Read the latest snapshot's `shiftEnd` and closing stock.
- Read Influx from that timestamp (inclusive) to the target completed shift's end (exclusive).
- Aggregate into Sri Lankan 06–14 / 14–22 / 22–06 shifts using UTC eight-hour buckets with a 30-minute offset.
- Roll balances forward in chronological order, clamping negatives to zero **at each shift end**.
- Insert one **new target-shift snapshot**. Earlier saved documents are not overwritten and missing intermediate documents are not inserted.

Example: last snapshot `2026-11-04|22-06`, target `2026-11-05|14-22`. Production is read from 5 November 06:00 to 22:00 Sri Lankan time. Both 06–14 and 14–22 are included. The final closing balance is stored as `2026-11-05|14-22`.

Existing live APIs remain compatible because `stocks[].closingStock`, `shiftEnd`, and total square-metre fields remain present. Added fields describe the recovered interval: `calculationFrom`, `calculationTo`, `coveredShifts`, `recoveredMissingShifts` and `intervalBalances`. Opening stock and output totals cover the **whole calculation interval**, potentially multiple shifts. `zeroClampAdjustment` records the amount introduced by intermediate zero-clamping, so `closingStock = rawClosingStock + zeroClampAdjustment`. `clampedToZero` indicates a negative balance occurred within the calculation interval.

If no previous snapshot exists, the flow starts at the target shift's start with zero opening stock and records `openingStockInitializedToZero:true`. It cannot infer an earlier opening balance. Gaps over 93 days fail explicitly. Invalid/unknown tile sizes and malformed bucket data block saving. Current enabled device roles in `counterConfig` / role overrides are used for the entire interval; historical device enable/role changes require explicit recovery planning.

## Retrying and existing incorrect snapshots

For a manual retry, send a message into the matching QUEUED ENTRY with:

```js
msg.manualStock = true;
msg.codeWiseTarget = { shiftDate: '2026-11-05', shift: '14-22' };
return msg;
```

This uses the same queue and calculations. No automatic retry timer is installed. Only completed shifts can be saved. A target at or older than the latest saved ID is skipped; inserts use the unique snapshot `_id`.

**Already-saved incorrect later snapshots are not repaired automatically.** Back up and review affected documents before any historical rebuild. Starting after an incorrect snapshot carries its incorrect balance forward. No database deletion/rebuild is performed by this import.

The queue prevents overlapping reads/writes within this single Node-RED flow instance. Multiple Node-RED replicas or other writers require a shared database lock/transaction design. No need to change the live API flows.

Maintain the generator with `node node-red/build-stock-gap-saving-flow.mjs`. Offline checks: `node node-red/test-stock-gap-saving.mjs`.
