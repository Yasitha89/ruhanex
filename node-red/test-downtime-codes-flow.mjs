import assert from 'node:assert/strict';
import vm from 'node:vm';
import { nodes, codeApi, readResult, writeResult, prepareGuard, checkGuard } from './build-downtime-codes-flow.mjs';
import { PRODUCTION_LINES } from '../src/utils/constants.js';

const valid = { value: 'SHIFT_END', label: 'SHIFT_END - Shift End / Handover', type: 'planned', plannedCategory: 'standard', lines: ['Keda 1', 'Kiln 2'] };
const request = (body) => ({ req: { params: { value: 'SHIFT_END' } }, payload: structuredClone(body) });
let msg = codeApi(request(valid), 'create', PRODUCTION_LINES)[0];
assert.equal(msg.payload[0]._id, 'SHIFT_END');
assert.deepEqual(msg.payload[0].lines, ['Keda 1', 'Kiln 2']);
msg.payload = { acknowledged: true, insertedId: 'SHIFT_END' };
assert.equal(writeResult(msg).statusCode, 201);
msg = codeApi(request({ ...valid, lines: ['Kiln 2'], label: 'Updated label' }), 'update', PRODUCTION_LINES)[0];
assert.equal(msg.payload[0]._id, 'SHIFT_END');
assert.equal(msg.payload[2].upsert, false);
assert.equal(msg.payload[1].$set.label, 'Updated label');
msg.payload = { acknowledged: true, matchedCount: 0 };
assert.equal(writeResult(msg).statusCode, 404);
for (const patch of [ { value: '$bad' }, { label: '' }, { type: 'unknown' }, { plannedCategory: 'bad' }, { lines: [] }, { lines: ['Invalid line'] }, { lines: { $ne: '' } } ]) {
  assert.equal(codeApi(request({ ...valid, ...patch }), 'create', PRODUCTION_LINES)[1].statusCode, 400);
}
assert.equal(codeApi({ req: { params: { value: 'OTHER' } }, payload: valid }, 'update', PRODUCTION_LINES)[1].statusCode, 400);
msg = codeApi({ req: { query: { line: 'Kiln 2', type: 'planned', plannedCategory: 'standard' } } }, 'read', PRODUCTION_LINES)[0];
assert.deepEqual(msg.payload[0], { lines: 'Kiln 2', type: 'planned', plannedCategory: 'standard' });
assert.deepEqual(codeApi({ req: { query: {} } }, 'read', PRODUCTION_LINES)[0].payload[0], {});
assert.equal(codeApi({ req: { query: { type: 'unplanned', plannedCategory: 'standard' } } }, 'read', PRODUCTION_LINES)[1].statusCode, 400);
assert.equal(codeApi({ req: { query: { line: { $ne: '' } } } }, 'read', PRODUCTION_LINES)[1].statusCode, 400);
assert.equal(readResult({ payload: [valid] }).payload.downtimeCodes[0].value, 'SHIFT_END');
const machineQuery = [{ line: 'Kiln 2', machineName: 'M1' }];
msg = { downtimeUpdate: { downtimeCode: 'SHIFT_END', downtimeType: 'planned', plannedCategory: 'standard', line: 'Kiln 2' }, payload: machineQuery };
assert.equal(prepareGuard(msg)[0], msg);
assert.deepEqual(msg.payload[0], { _id: 'SHIFT_END', value: 'SHIFT_END', lines: 'Kiln 2', type: 'planned', plannedCategory: 'standard' });
msg.payload = valid;
assert.deepEqual(checkGuard(msg)[0].payload, machineQuery);
msg.payload = null;
assert.equal(checkGuard(msg)[1].statusCode, 400);
const ids = new Set(nodes.map((node) => node.id));
assert.equal(ids.size, nodes.length);
for (const node of nodes) {
  for (const id of (node.wires || []).flat()) assert(ids.has(id));
  if (node.type === 'function') new Function('msg', node.func);
}
const validateNode = nodes.find((node) => node.id === 'rx_dc_create_validate');
const response = vm.runInNewContext('(function(){' + validateNode.func + '})()', { msg: request(valid) });
assert.equal(response[0].payload[0].value, 'SHIFT_END');
const seedNode = nodes.find((node) => node.id === 'rx_dc_seed_prepare');
const seed = vm.runInNewContext('(function(){' + seedNode.func + '})()', { msg: {} });
assert.equal(seed.payload[0].length, 15);
assert.equal(nodes.find((node) => node.id === 'rx_dc_seed_mongo').maxTimeMS, '0');
assert.equal(seed.payload[1].maxTimeMS, 15000);
assert(seed.payload[0].every((op) => op.updateOne.update.$setOnInsert.lines.length === 9 && !op.updateOne.update.$set));
console.log('PASS: create/update/read contracts, immutable unique IDs, multiple-line filters, invalid inputs, assignment guard and query preservation, seed non-overwrite, wiring and exported Function execution.');
