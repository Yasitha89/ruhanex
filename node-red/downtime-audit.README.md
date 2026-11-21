# Audit downtime edits

## Complete replacement flow

**downtime-audit.complete.flow.json** contains all nodes from your supplied downtime endpoint export, plus the audit nodes with both connection changes already made. Every original Function body is unchanged, including your temporary identity-debug function. The existing Mongo client is referenced by ID; its configuration and credentials are not exported.

Back up the existing endpoint flow first. Replace its nodes with this complete flow on the same tab, retaining your existing Mongo client. If Node-RED offers an import conflict/update option, replace the existing nodes by ID; do not import copies with new IDs. There must be only one HTTP In node for `/api/update-downtime-reason`. If you already imported the add-on, replace those audit nodes too rather than duplicating them. Select the existing Mongo client if any Mongo nodes show a missing configuration, then deploy. No manual wiring changes are required with the complete file.

To rebuild from the original export:

```powershell
node node-red/build-downtime-audit-flow.mjs
node node-red/build-downtime-audit-complete.mjs "path/to/original-export.json"
```

## Add-on alternative

Import **downtime-audit.add-on.flow.json** into the existing tab containing the supplied `/api/update-downtime-reason` flow. It references your existing Mongo client `8120871193b8f276`, response node `e77e4bc92ffd6b11`, update node `1dca19134e960bb9` and verify/recalculation node `940c7e9bf259add4`. No new HTTP endpoint or database credentials are included.

## Wiring: two existing connections change

1. Disconnect **Check Machine Match → Update Stoppage** (first / successful output only). Connect that first output to **Audit: capture verified user + read old values**. The add-on reads the old document and its **Audit: previous values + concurrent edit guard** first output connects to **Update Stoppage**. Keep Check Machine Match's validation-error output connected to the existing HTTP Response.
2. Disconnect **Update Stoppage → Verify Update + Find Saved Shift**. Connect Update Stoppage to **Audit: acknowledged update → log** instead. The add-on saves the audit and its **Audit saved → existing shift recalculation** first output connects to **Verify Update + Find Saved Shift**.

```text
Check Machine Match (successful output)
 → Audit: capture verified user + read old values
 → Audit: read stoppage before edit
 → Audit: previous values + concurrent edit guard
 → Update Stoppage (existing)
 → Audit: acknowledged update → log
 → Save ruhanex_audit_logs
 → Audit saved → existing shift recalculation
 → Verify Update + Find Saved Shift (existing)
 → existing summary recalculation / HTTP response
```

Do not leave the original two direct connections in parallel: doing so bypasses the audit sequence or responds twice. Ensure all add-on second/error outputs reach the existing HTTP Response, and select the existing Mongo client on the two new Mongo nodes if necessary. Deploy after checking wiring.

## What is saved

Mongo collection **ruhanex_audit_logs**, one document per successful stoppage edit request:

- `_id`: `downtime:` plus the Node-RED HTTP message ID. An upsert with `$setOnInsert` prevents duplicate audit inserts for the same message replay.
- `timestamp`: BSON Date representing the stoppage update's server timestamp (display it in Asia/Colombo in a future UI).
- `username`, `role`: verified gateway headers; not request-body values.
- `action`: `downtime.details.updated`; `result`: `success`.
- Line, shift/date, start timestamp and Mongo stoppage ID.
- `before` and `after`: reason, machine, machine code, planned/unplanned type, planned category and downtime code. Missing old values appear as null.
- `changedFields`: changed field names; empty for a repeat save with identical business values.
- `scope`: `stoppage-update-only`. This records the saved downtime edit, not the success of subsequent shift-summary recalculation.

The update includes conditions on the values read before editing, including `updatedAt`. A concurrent edit or deletion returns HTTP 409 rather than recording an inaccurate before/after pair. The dashboard user should refresh and retry.

Only trust `x-ruhanex-user` and `x-ruhanex-role` when your authentication proxy overwrites them and direct Node-RED API access is blocked. Missing/unknown identity rejects the change. Never debug the entire HTTP request or save its session cookies.

## Verification

Save a reason as Admin, Manager or Supervisor and inspect the newest `ruhanex_audit_logs` document. Change it again: the previous new value should be the next document's old value. Validate current and completed shifts; existing summary logic is preserved. Invalid machine/reason requests are not logged by this add-on. To inspect newest records in mongosh, using the database selected for your existing Mongo client:

```javascript
db.ruhanex_audit_logs.find({action:'downtime.details.updated'}).sort({timestamp:-1}).limit(10)
```

Optional query indexes: `{timestamp:-1}`, `{username:1,timestamp:-1}`, `{line:1,timestamp:-1}`. Do not add a TTL index unless automatic removal matches your audit retention policy.

## Failure and security limits

The stoppage update and audit write are separate Mongo operations, not a transaction. If logging fails after a confirmed update, the response is HTTP 500 with `downtimeUpdated:true`, `auditSaved:false`, `shiftSummaryUpdated:false`; the downtime is already saved and recalculation was not started. Review the changed stoppage before retrying. A process crash in this interval can leave a missing audit record. A transactional/outbox implementation is needed for a strict no-gap guarantee.

This collection is an application audit history, not a tamper-proof database audit system. The existing shared Mongo client may have permission to alter records. For stronger isolation, provision a separate audit writer identity with narrowly scoped privileges and protect retention/backups. This add-on does not change database roles or add an audit viewer/API.

Development checks:

```powershell
node node-red/build-downtime-audit-flow.mjs
node node-red/test-downtime-audit.mjs
```
