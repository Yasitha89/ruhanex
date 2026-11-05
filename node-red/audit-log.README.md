# Reusable audit log

Import `audit-log.flow.json`. Drag **Write Ruhanex Audit Log** from the Ruhanex subflow palette into each API that changes data. Select your existing MongoDB client inside the subflow if `8120871193b8f276` does not resolve. It uses the existing mongodb4 node package and writes to `ruhanex_audit_logs`.

Wire:

```text
Business MongoDB write → confirm business success → build response + msg.audit
    → Write Ruhanex Audit Log
        output 1 → existing HTTP Response
        output 2 → audit failure handling → existing HTTP Response
```

**A MongoDB output is not automatically business success.** Check `acknowledged`, `matchedCount`, or the relevant result before entering this subflow. A valid update may have `modifiedCount:0` if nothing changed; choose whether to record that as a separate action. This subflow requires explicit `success:true` and does not interpret the business result for you.

Before the business update, retain the relevant old values and normalized new values in a message property such as `msg.auditChanges`. MongoDB cannot reconstruct the old values after updating. Do not copy the complete HTTP request into that property.

After confirming success, use a Function node like:

```js
msg.audit = {
    action: 'line.tile_size_changed',
    target: { line: msg.line }, // use your actual validated line property
    changes: msg.auditChanges, // e.g. {before:{tileSize:'60x30'},after:{tileSize:'60x60'}}
    success: true
};
msg.statusCode = 200;
msg.payload = { success: true };
return msg;
```

Output 1 restores the original API payload, headers and status after MongoDB acknowledges the audit insert. Output 2 also preserves the response, adding a safe `msg.auditError.message`. Connect output 2 to an operational alert path and then the HTTP response exactly once. For a simple initial setup, wire output 2 to both the HTTP Response and a Debug node configured to show **only `auditError`**. Do not debug the complete message: it includes request credentials. An audit failure does not roll back the already completed business update. Do not report that the business write failed and encourage blind retries. If guaranteed atomic business/audit writes are required, implement a MongoDB transaction or durable outbox instead.

Identity is taken from `msg.req.headers['x-ruhanex-user']` and `['x-ruhanex-role']`, not from client-supplied `msg.audit` fields. Keep the authenticated Nginx gateway installed, ensure it overwrites those headers, and keep Node-RED's direct port private. Requests without verified identity go to output 2. This subflow is for authenticated successful business writes; login failures and bootstrap events need a separate logger because no verified user exists yet.

Records include server timestamp, username, role, action, target, before/after changes, success and the Node-RED message ID for correlation. Sensitive key names are removed recursively, and metadata size/depth is bounded. Only send selected non-secret fields: a sanitizer cannot detect secrets hidden under arbitrary names or within free text. AI prompts/responses and full request bodies are not logged automatically.

Recommended MongoDB indexes:

```js
db.ruhanex_audit_logs.createIndex({ timestamp: -1 })
db.ruhanex_audit_logs.createIndex({ username: 1, timestamp: -1 })
db.ruhanex_audit_logs.createIndex({ action: 1, timestamp: -1 })
```

No public audit-read or audit-delete endpoint is added. Define a retention period and restrict database access as appropriate. Maintain the generator with `node node-red/build-audit-log-flow.mjs`.
