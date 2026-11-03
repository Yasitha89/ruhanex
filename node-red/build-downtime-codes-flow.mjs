import fs from 'node:fs';
import { PRODUCTION_LINES } from '../src/utils/constants.js';

function codeApi(msg, operation, lines) {
  const fail = (status, error) => { msg.statusCode = status; msg.payload = { success: false, error }; return [null, msg]; };
  const types = ['planned', 'unplanned'];
  const categories = ['standard', 'additional'];
  if (operation === 'read') {
    const query = msg.req?.query || {};
    if (Object.keys(query).some((key) => !['line', 'type', 'plannedCategory'].includes(key))) return fail(400, 'Unsupported filter.');
    const filter = {};
    if (query.line !== undefined) {
      if (!lines.includes(query.line)) return fail(400, 'Invalid line.');
      filter.lines = query.line;
    }
    if (query.type !== undefined) {
      if (!types.includes(query.type)) return fail(400, 'Invalid downtime type.');
      filter.type = query.type;
    }
    if (query.plannedCategory !== undefined) {
      if (query.type !== 'planned' || !categories.includes(query.plannedCategory)) return fail(400, 'plannedCategory requires planned type and a valid category.');
      filter.plannedCategory = query.plannedCategory;
    }
    msg.payload = [filter, { sort: { value: 1 }, projection: { _id: 0 } }];
    return [msg, null];
  }
  const body = msg.payload;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'A JSON object is required.');
  if (typeof body.value !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(body.value)) return fail(400, 'Code must start with a letter and use uppercase letters, numbers or underscores, at most 80 characters.');
  if (typeof body.label !== 'string' || !body.label.trim() || body.label.trim().length > 200) return fail(400, 'Label is required, at most 200 characters.');
  if (!types.includes(body.type)) return fail(400, 'Invalid downtime type.');
  if (body.type === 'planned' && !categories.includes(body.plannedCategory)) return fail(400, 'Select standard or additional planned category.');
  if (body.type === 'unplanned' && body.plannedCategory != null && body.plannedCategory !== '') return fail(400, 'Unplanned downtime cannot have a planned category.');
  if (!Array.isArray(body.lines) || body.lines.length < 1 || body.lines.length > lines.length || body.lines.some((line) => !lines.includes(line))) return fail(400, 'Assign the code to one or more valid production lines.');
  const record = {
    value: body.value, label: body.label.trim(), type: body.type,
    plannedCategory: body.type === 'planned' ? body.plannedCategory : null,
    lines: [...new Set(body.lines)], updatedAt: new Date().toISOString(),
  };
  msg.codeOperation = operation;
  msg.codeRecord = record;
  if (operation === 'create') {
    record.createdAt = record.updatedAt;
    msg.payload = [{ _id: record.value, ...record }];
  } else {
    if (msg.req?.params?.value !== record.value) return fail(400, 'The code identifier cannot be renamed.');
    msg.payload = [{ _id: record.value }, { $set: record }, { upsert: false }];
  }
  return [msg, null];
}

function readResult(msg) {
  if (!Array.isArray(msg.payload)) throw new Error('Database did not return an array.');
  msg.statusCode = 200;
  msg.payload = { success: true, downtimeCodes: msg.payload.map(({ value, label, type, plannedCategory, lines, createdAt, updatedAt }) => ({ value, label, type, plannedCategory: plannedCategory ?? null, lines: Array.isArray(lines) ? lines : [], createdAt, updatedAt })) };
  return msg;
}

function writeResult(msg) {
  const result = msg.payload;
  if (result?.acknowledged !== true) throw new Error('Unacknowledged database write.');
  if (msg.codeOperation === 'update' && result.matchedCount !== 1) {
    msg.statusCode = 404;
    msg.payload = { success: false, error: 'Downtime code not found. Refresh the list.' };
  } else {
    msg.statusCode = msg.codeOperation === 'create' ? 201 : 200;
    msg.payload = { success: true, downtimeCode: msg.codeRecord };
  }
  delete msg.codeRecord;
  return msg;
}

function apiError(msg) {
  const duplicate = /E11000|duplicate key/i.test(String(msg.error?.message || ''));
  msg.statusCode = duplicate ? 409 : 500;
  msg.payload = { success: false, error: duplicate ? 'This downtime code already exists. Edit the existing code.' : 'Unable to process downtime codes. Check the Node-RED server logs.' };
  delete msg.error;
  return msg;
}

function prepareGuard(msg) {
  const record = msg.downtimeUpdate;
  if (!record || typeof record.downtimeCode !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/.test(record.downtimeCode) || !['planned', 'unplanned'].includes(record.downtimeType) || !record.line) {
    msg.statusCode = 400;
    msg.payload = { success: false, error: 'Select a valid registered downtime code.' };
    return [null, msg];
  }
  msg.downtimeMachineQuery = msg.payload;
  msg.payload = [{ _id: record.downtimeCode, value: record.downtimeCode, lines: record.line, type: record.downtimeType,
    plannedCategory: record.downtimeType === 'planned' ? record.plannedCategory : null }];
  return [msg, null];
}

function checkGuard(msg) {
  if (!msg.payload || msg.payload.value !== msg.downtimeUpdate?.downtimeCode) {
    msg.statusCode = 400;
    msg.payload = { success: false, error: 'Downtime code is not assigned to this line, type and planned category. Reload the available codes.' };
    delete msg.downtimeMachineQuery;
    return [null, msg];
  }
  msg.payload = msg.downtimeMachineQuery;
  delete msg.downtimeMachineQuery;
  return [msg, null];
}

const tab = 'rx_downtime_codes_tab';
const clientNode = '8120871193b8f276';
const nodes = [{ id: tab, type: 'tab', label: 'Downtime Codes API', disabled: false,
  info: 'GET/POST/PUT downtime codes in MongoDB downtime_codes. Uses existing RCLH mongodb4 client. Protect write endpoints with administrator authentication. See downtime-codes.README.md. Optional manual seed does not overwrite existing codes.' }];
const functionNode = (id, name, func, outputs, wires, x, y, z = tab, args = 'msg') => {
  nodes.push({ id, z, type: 'function', name, func: `return (${func.toString()})(${args});`, outputs, noerr: 0, initialize: '', finalize: '', libs: [], x, y, wires });
};
const mongo = (id, name, operation, wires, x, y, z = tab) => nodes.push({ id, z, type: 'mongodb4', name, clientNode, mode: 'collection', collection: 'downtime_codes', operation, output: 'toArray', maxTimeMS: operation === 'bulkWrite' ? '0' : '15000', handleDocId: false, x, y, wires });
for (const [operation, method, y] of [['read', 'get', 140], ['create', 'post', 260], ['update', 'put', 380]]) {
  const prefix = `rx_dc_${operation}`;
  nodes.push({ id: prefix + '_http', z: tab, type: 'http in', name: method.toUpperCase() + ' downtime codes', method,
    url: '/api/downtime-codes' + (operation === 'update' ? '/:value' : ''), upload: false, swaggerDoc: '', x: 140, y, wires: [[prefix + '_validate']] });
  functionNode(prefix + '_validate', 'Validate ' + operation, codeApi, 2, [[prefix + '_mongo'], ['rx_dc_response']], 390, y, tab, `msg, ${JSON.stringify(operation)}, ${JSON.stringify(PRODUCTION_LINES)}`);
  mongo(prefix + '_mongo', operation + ' downtime_codes', operation === 'read' ? 'find' : operation === 'create' ? 'insertOne' : 'updateOne', [[prefix + '_result']], 640, y);
  functionNode(prefix + '_result', operation + ' response', operation === 'read' ? readResult : writeResult, 1, [['rx_dc_response']], 890, y);
}
nodes.push({ id: 'rx_dc_response', z: tab, type: 'http response', name: 'JSON response', statusCode: '', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, x: 1150, y: 260, wires: [] });
nodes.push({ id: 'rx_dc_catch', z: tab, type: 'catch', name: 'Catalogue API errors', scope: nodes.filter((node) => node.type === 'function' || node.type === 'mongodb4').map((node) => node.id), uncaught: false, x: 150, y: 490, wires: [['rx_dc_error']] });
functionNode('rx_dc_error', 'Safe API error', apiError, 1, [['rx_dc_response']], 410, 490);

const seed = JSON.parse(fs.readFileSync(new URL('./downtime-codes.seed.json', import.meta.url), 'utf8'));
nodes.push({ id: 'rx_dc_seed_inject', z: tab, type: 'inject', name: 'OPTIONAL: seed legacy codes ONCE', props: [{ p: 'payload' }], repeat: '', crontab: '', once: false, onceDelay: 0.1, topic: '', payload: '', payloadType: 'date', x: 210, y: 620, wires: [['rx_dc_seed_prepare']] });
function seedQuery(msg, seed) {
  const now = new Date().toISOString();
  msg.payload = [seed.map((code) => ({ updateOne: { filter: { _id: code.value }, update: { $setOnInsert: { ...code, createdAt: now, updatedAt: now } }, upsert: true } })), { ordered: false, maxTimeMS: 15000 }];
  return msg;
}
functionNode('rx_dc_seed_prepare', 'Seed missing codes only', seedQuery, 1, [['rx_dc_seed_mongo']], 520, 620, tab, `msg, ${JSON.stringify(seed)}`);
mongo('rx_dc_seed_mongo', 'Seed downtime_codes', 'bulkWrite', [['rx_dc_seed_debug']], 790, 620);
nodes.push({ id: 'rx_dc_seed_debug', z: tab, type: 'debug', name: 'Seed write result', active: true, tosidebar: true, console: false, tostatus: false, complete: 'payload', targetType: 'msg', x: 1060, y: 620, wires: [] });

// Importable subflow to insert into the existing downtime-save endpoint.
const sub = 'rx_dc_guard_subflow';
nodes.push({ id: sub, type: 'subflow', name: 'Validate downtime code assignment', info: 'Insert after Validate Downtime + Machine, before its machines MongoDB lookup. Output 1: original machine query; output 2: HTTP error response. Requires msg.downtimeUpdate.',
  category: 'Ruhanex', color: '#D8BFD8', in: [{ x: 40, y: 100, wires: [{ id: 'rx_dc_guard_prepare' }] }],
  out: [{ x: 720, y: 80, wires: [{ id: 'rx_dc_guard_check', port: 0 }] }, { x: 720, y: 190, wires: [{ id: 'rx_dc_guard_prepare', port: 1 }, { id: 'rx_dc_guard_check', port: 1 }, { id: 'rx_dc_guard_error', port: 0 }] }], env: [], meta: {}, status: { x: 720, y: 260, wires: [] } });
functionNode('rx_dc_guard_prepare', 'Prepare assigned code lookup', prepareGuard, 2, [['rx_dc_guard_mongo'], []], 210, 100, sub);
mongo('rx_dc_guard_mongo', 'Find matching assigned code', 'findOne', [['rx_dc_guard_check']], 440, 100, sub);
functionNode('rx_dc_guard_check', 'Validate match + restore query', checkGuard, 2, [[], []], 580, 100, sub);
nodes.push({ id: 'rx_dc_guard_catch', z: sub, type: 'catch', name: 'Guard database error', scope: ['rx_dc_guard_mongo', 'rx_dc_guard_prepare', 'rx_dc_guard_check'], uncaught: false, x: 180, y: 210, wires: [['rx_dc_guard_error']] });
functionNode('rx_dc_guard_error', 'Fail closed', apiError, 1, [[]], 450, 210, sub);

fs.writeFileSync(new URL('./downtime-codes.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log(`Generated downtime-code API, optional seed and assignment validation subflow (${nodes.length} nodes).`);
export { nodes, codeApi, readResult, writeResult, prepareGuard, checkGuard };
