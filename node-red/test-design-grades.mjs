import assert from 'node:assert/strict';
import { designGradesStep, nodes } from './build-design-grades-flow.mjs';
let doc = null;
function database(operation, args) {
  const [q, update, options] = args;
  assert.equal(q._id, 'designGrades');
  if (operation === 'findOne') return structuredClone(doc);
  if (!doc && options?.upsert) { doc = { _id: q._id, ...structuredClone(update.$setOnInsert) }; return { acknowledged: true, matchedCount: 0 }; }
  const key = q['grades.gradeKey'];
  const index = doc?.grades.findIndex(g => g.gradeKey === (key?.$ne || key));
  const matches = doc && (key === undefined || (key?.$ne ? index === -1 : index >= 0));
  if (matches) {
    if (update.$push) doc.grades.push(structuredClone(update.$push.grades));
    for (const [field, value] of Object.entries(update.$set || {})) {
      if (field.startsWith('grades.$.')) doc.grades[index][field.slice(9)] = value;
      else doc[field] = value;
    }
  }
  return { acknowledged: true, matchedCount: matches ? 1 : 0 };
}
function request(action, payload = {}, role = 'Admin', params = {}) {
  let msg = { designGradeAction: action, payload, req: { headers: { 'x-ruhanex-role': role }, params } };
  for (let i = 0; i < 5; i++) {
    const [pending, response] = designGradesStep(msg);
    if (response) return response;
    msg = pending; msg.payload = database(msg.designGradeDb, msg.payload);
  }
  throw new Error('State loop');
}
assert.equal(request('read', {}, 'Manager').statusCode, 200);
assert.equal(request('create', { grade: 'A', description: 'Good' }, 'Manager').statusCode, 403);
assert.equal(request('create', { grade: 'A', description: 'Good' }, 'Line Supervisor').statusCode, 403);
assert.equal(request('read', {}, undefined).payload.grades.length, 0);
assert.equal(request('create', { grade: ' ', description: 'Empty' }).statusCode, 400);
assert.equal(request('create', { grade: { $ne: '' }, description: 'Invalid' }).statusCode, 400);
assert.equal(request('create', { grade: ' A ', description: ' First quality ' }).statusCode, 201);
assert.equal(doc._id, 'designGrades'); assert.equal(doc.grades[0].description, 'First quality');
assert.equal(request('create', { grade: 'a', description: 'Duplicate' }).statusCode, 409);
assert.equal(request('create', { grade: 'B', description: 'Second quality' }).statusCode, 201);
assert.equal(doc.grades.length, 2);
assert.equal(request('update', { grade: 'A', description: 'Updated' }, 'Admin', { grade: 'A' }).statusCode, 200);
assert.equal(doc.grades[0].description, 'Updated'); assert.equal(doc.grades[1].description, 'Second quality');
assert.equal(request('update', { grade: 'C', description: 'Missing' }, 'Admin', { grade: 'C' }).statusCode, 404);
assert.equal(request('update', { grade: 'C', description: 'Rename' }, 'Admin', { grade: 'A' }).statusCode, 400);
assert.deepEqual(request('read').payload.grades.map(g => g.grade), ['A', 'B']);
assert.equal(request('create', { grade: 'C', description: 'Third', category: ' Quality ' }).statusCode, 201);
assert.equal(request('read').payload.grades.find(g => g.grade === 'C').category, 'Quality');
request('update', { grade: 'C', description: 'Updated third' }, 'Admin', { grade: 'C' });
assert.equal(request('read').payload.grades.find(g => g.grade === 'C').category, 'Quality');
request('update', { grade: 'C', description: 'Updated third', category: 'Other' }, 'Admin', { grade: 'C' });
assert.equal(request('read').payload.grades.find(g => g.grade === 'C').category, 'Other');
assert.equal(request('create', { grade: 'D', description: 'Invalid category', category: {} }).statusCode, 400);
assert.equal(request('create', { grade: 'D', description: 'Too long', category: 'x'.repeat(101) }).statusCode, 400);
assert.equal(request('read').payload.grades.find(g => g.grade === 'A').category, '');
const ids = new Set(nodes.map(n => n.id));
for (const n of nodes) {
  if (n.type === 'function') new Function('msg', n.func);
  for (const wire of n.wires || []) for (const target of wire) assert.ok(ids.has(target));
}
console.log('PASS: Admin enforcement, required fields/injection rejection, single config document, case-insensitive duplicate protection, isolated description edits, reads and generated wiring/syntax.');
