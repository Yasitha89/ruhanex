Import the two patches and replace matching node IDs:

1. `quality-trend-output-sqm.patch.flow.json`: replaces the attached trend engine `d83b73010139a186`. New trend snapshots include cumulative `output_production_sqm` and `output_production_complete`, calculated from each saved quality segment's tile count and size in cm. Queue, retry and write acknowledgement behavior is retained. Unknown sizes omit area rather than guessing.
2. `live-summary-quality-snapshot.patch.flow.json`: updates four attached API nodes. The sensor resolver now goes directly to the latest-snapshot query, bypassing the MongoDB grade catalogue. The existing Influx connection reads quality_shift_trend in RCLH, restricted to the registered sensor, line, shift and shiftDate. Latest field values are pivoted by timestamp and the latest total_tiles snapshot is selected; fields from older timestamps are not combined with it.

Deploy both on the existing Counters tab. Existing connections are reused; no connection secrets are included. The complete variants are alternatives to the patches, not additional flows to import. The old catalogue node may remain disconnected. No raw quality_events rescan fallback is used by the live API.

Production, downtime, availability and performance retain the attached calculation. Quality, tile/box totals and output area come from the latest successfully written trend point. OLE/OEE is recalculated with current availability/performance and snapshot quality. Response includes qualitySnapshotAt and qualityDetails.calculatedAt; an old snapshot can be valid during a stoppage. No current-shift snapshot yields unavailable quality, not last shift's values or assumed 100%.

Existing trend points have no cumulative area: percentages/counts still work; area remains unavailable until the next positive telemetry event saves a new snapshot. This change does not backfill old trend points. Catalogue edits are reflected when the next trend snapshot is calculated. The frontend consumes qualityOutputProductionSqm for its Output label; it retains the previous segment-based calculation for older API responses.

Validation: `node node-red/test-live-quality-snapshot.mjs` and `node node-red/test-quality-shift-trend.mjs`. No production services were contacted.
