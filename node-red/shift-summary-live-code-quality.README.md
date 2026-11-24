Import `shift-summary-live-code-quality.patch.flow.json` and replace existing nodes with matching IDs. This updates the live summary output wiring and adds seven quality nodes. Deploy on the existing Counters tab; the live calculation uses its flow context. Keep the existing MongoDB and InfluxDB connections.

Alternatively use `shift-summary-live-code-quality.complete.flow.json`, containing the supplied API flow with the quality extension. Import only one version. Connection configuration is excluded; existing connection IDs are reused.

Current Keda shifts now read quality_events through the request time and attach overall and per-design/size quality using saved box deltas, tiles-per-box and design assignments, classified by the current grade catalogue. The response includes firstQuality, normalDamageQuality, cutDamageQuality and qualityTotalTiles on codeWiseProduction entries. Production counts and areas are preserved. Completed shifts retain the supplied MongoDB path.

Repeated timeline entries require matching production run IDs; ambiguous runs remain unavailable rather than duplicating design totals. Lookup failures return production with quality pending. No saved shift documents are modified. Quality trend storage alone is not a substitute for the raw quality_events required here.

Validation: `node node-red/test-shift-summary-live-code-quality.mjs`.
