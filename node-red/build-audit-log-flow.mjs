import fs from 'node:fs';

export function prepareAudit(msg) {
  const fail = reason => { msg.auditError = { message: reason }; return [null, msg]; };
  const audit = msg.audit;
  if (!audit || audit.success !== true || typeof audit.action !== 'string' || !/^[a-z][a-z0-9_.-]{0,99}$/i.test(audit.action)) return fail('Supply msg.audit.action and success:true after confirming the business write succeeded.');
  const headers = msg.req?.headers || {};
  const username = headers['x-ruhanex-user'];
  const role = headers['x-ruhanex-role'] === 'JE' ? 'Line Supervisor' : headers['x-ruhanex-role'];
  if (typeof username !== 'string' || !username || !['Admin', 'Manager', 'Line Supervisor'].includes(role)) return fail('Verified user headers are missing. Use the authenticated Nginx gateway.');
  // Only explicitly supplied metadata is stored; never serialize req or payload.
  const clean = (value, depth = 0) => {
    if (depth > 5) return '[depth limit]';
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return value.slice(0, 1000);
    if (Array.isArray(value)) return value.slice(0, 50).map(item => clean(item, depth + 1));
    if (typeof value !== 'object') return null;
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 50)) {
      if (/password|passwd|secret|token|cookie|authorization|api.?key|credential|salt|hash/i.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      result[key.slice(0, 100)] = clean(item, depth + 1);
    }
    return result;
  };
  const record = {
    timestamp: new Date(), username: username.slice(0, 100), role,
    action: audit.action, target: clean(audit.target || {}),
    changes: clean(audit.changes || {}), success: true,
    requestId: String(msg._msgid || '').slice(0, 100),
  };
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 32768) return fail('Audit metadata exceeds 32 KB. Supply fewer changed fields.');
  msg._ruhanexAuditState = { payload: msg.payload, headers: msg.headers, statusCode: msg.statusCode };
  delete msg.auditError;
  msg.payload = [record];
  return [msg, null];
}

export function restoreAudit(msg, failed = false) {
  const acknowledged = msg.payload?.acknowledged === true;
  const saved = msg._ruhanexAuditState;
  if (saved) {
    msg.payload = saved.payload; msg.headers = saved.headers; msg.statusCode = saved.statusCode;
  }
  delete msg._ruhanexAuditState; delete msg.error;
  if (failed || !acknowledged) {
    msg.auditError = { message: 'Audit record could not be confirmed. The business write has already succeeded.' };
    return [null, msg];
  }
  delete msg.audit;
  return [msg, null];
}

const id = 'rx_audit_log_subflow';
export const nodes = [
  { id, type: 'subflow', name: 'Write Ruhanex Audit Log', category: 'Ruhanex', color: '#C0DEED', info: 'Insert only after checking a business write succeeded. Supply msg.audit={action,target,changes,success:true}. Trusted identity comes from authenticated Nginx headers. Output 1: logged, original payload restored. Output 2: audit failure, original response preserved with msg.auditError; connect to a safe alert/response path. See audit-log.README.md.', in: [{ x: 40, y: 80, wires: [{ id: 'rx_audit_prepare' }] }], out: [{ x: 780, y: 60, wires: [{ id: 'rx_audit_restore', port: 0 }] }, { x: 780, y: 180, wires: [{ id: 'rx_audit_prepare', port: 1 }, { id: 'rx_audit_restore', port: 1 }, { id: 'rx_audit_failure', port: 1 }] }], env: [], meta: {} },
  { id: 'rx_audit_prepare', type: 'function', z: id, name: 'Validate and prepare audit', func: `return (${prepareAudit.toString()})(msg);`, outputs: 2, x: 220, y: 80, wires: [['rx_audit_mongo'], []] },
  { id: 'rx_audit_mongo', type: 'mongodb4', z: id, name: 'Insert ruhanex_audit_logs', clientNode: '8120871193b8f276', mode: 'collection', collection: 'ruhanex_audit_logs', operation: 'insertOne', output: 'toArray', maxTimeMS: '0', handleDocId: false, x: 470, y: 80, wires: [['rx_audit_restore']] },
  { id: 'rx_audit_restore', type: 'function', z: id, name: 'Restore API response', func: `return (${restoreAudit.toString()})(msg);`, outputs: 2, x: 690, y: 80, wires: [[], []] },
  { id: 'rx_audit_catch', type: 'catch', z: id, name: 'Audit database failure', scope: ['rx_audit_mongo'], uncaught: false, x: 230, y: 220, wires: [['rx_audit_failure']] },
  { id: 'rx_audit_failure', type: 'function', z: id, name: 'Restore after audit failure', func: `return (${restoreAudit.toString()})(msg, true);`, outputs: 2, x: 520, y: 220, wires: [[], []] },
];
fs.writeFileSync(new URL('./audit-log.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log('Generated reusable audit log subflow.');
