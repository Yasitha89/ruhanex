import assert from 'node:assert/strict';
import { reportImport, nodes } from './build-design-codes-import-flow.mjs';
for (const payload of [
  { upsertedCount: 347, matchedCount: 0, modifiedCount: 0 },
  { upsertedCount: 0, matchedCount: 347, modifiedCount: 0 },
  { acknowledged: true, upsertedCount: 100, matchedCount: 247, modifiedCount: 0 },
]) assert.equal(reportImport({ payload, importCount: 347 }).payload.success, true);
for (const payload of [null, {}, { acknowledged: false, upsertedCount: 347, matchedCount: 0, modifiedCount: 0 }, { upsertedCount: 20, matchedCount: 0, modifiedCount: 0 }]) assert.throws(() => reportImport({ payload, importCount: 347 }));
for (const node of nodes.filter(n => n.type === 'function')) new Function('msg', node.func);
console.log('PASS: bulk results without acknowledged, repeat imports, partial/unacknowledged failure and function syntax.');
