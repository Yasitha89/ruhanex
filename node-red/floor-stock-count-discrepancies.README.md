# Allow floor-stock count discrepancies

Import `floor-stock-count-discrepancies.patch.flow.json` into the existing flow. It contains only the two updated Function nodes with their original IDs and wiring; no MongoDB configuration or credentials are included. Choose to update/replace the existing nodes if offered. If the editor imports copies instead, copy their Function contents into the existing nodes named below, then remove the disconnected copies. Do not run both copies.

Updated nodes:

- **FS: Verify ALL device summaries**: uses the same verification policy as the supplied car-stock flow. Missing summaries, missing code-wise enrichment, and invalid size/count entries still block. Finite summary counts that differ from valid code-wise totals generate warnings, but proceed using code-wise counts.
- **FS: Build rolling snapshot**: retains the existing calculation and saves `productionCountDiscrepancies` with device, summaryTiles, codeWiseTiles and differenceTiles.

Deploy after updating both nodes. This applies to subsequent triggers; it does not automatically retry or backfill the missing shift, and does not change the existing rejection of snapshots older than the latest saved snapshot. Historical recovery must be performed in sequence with any dependent balances recalculated.

Run `node node-red/test-floor-stock-count-discrepancies.mjs` for offline verification.
