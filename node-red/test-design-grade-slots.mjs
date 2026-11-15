import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDesignGradeSlots } from '../src/utils/designGradeSlots.js';
import { routeSpeeds, prepareSpeedWrite, finishSpeedWrite, preserveSpeeds } from './build-keda-saved-speeds-flow.mjs';
const current = { tileSize: '60x30', lineSpeed: 30, savedSpeeds: {}, savedTilesPerBox: { '60x30': 8 }, TilesPerBox: 6,
  productionRunId: 'unchanged', designCode: 'XYZ', stopDelayMs: 60000 };
const state = { settingsReady: true, lineSettings: { 'Keda 1': current } };
const global = { get: k => state[k], set: (k, v) => { state[k] = v; } };
const slots = validateDesignGradeSlots({ 1: 'First', 2: 'Second', 16: 'Reject' }, ['First', 'Second', 'Reject']);
assert.equal(Object.keys(slots).length, 16); assert.equal(slots[3], null);
assert.throws(() => validateDesignGradeSlots({ 0: 'First' }));
assert.throws(() => validateDesignGradeSlots({ 17: 'First' }));
assert.throws(() => validateDesignGradeSlots({ 1: 'Invented' }, ['First']));
const make = (line = 'Keda 1', role = 'Manager') => ({ req: { headers: { 'x-ruhanex-role': role } }, payload: { line, settingsAction: 'saveDesignGrades', designGrades: slots } });
assert.equal(routeSpeeds(make('Kiln 1'), global)[2].statusCode, 400);
assert.equal(routeSpeeds(make('Keda 1', 'Line Supervisor'), global)[2].statusCode, 403);
for (const line of ['Keda 1', 'Keda 2', 'Keda 3']) {
  state.lineSettings[line] = structuredClone(current);
  const msg = make(line); assert.equal(routeSpeeds(msg, global)[1], msg); assert.equal(msg.payload[0]._id, 'designGrades');
  msg.payload = { grades: [{ grade: 'First' }, { grade: 'Second' }, { grade: 'Reject' }] };
  assert.equal(prepareSpeedWrite(msg)[2], msg); assert.equal(msg.payload[0]._id, 'lineSettings');
  msg.payload = { settings: { [line]: current } }; assert.equal(prepareSpeedWrite(msg)[0], msg);
  const patch = msg.payload[1].$set;
  assert.deepEqual(patch[`settings.${line}.designGrades`], slots);
  assert.equal(patch[`settings.${line}.TilesPerBox`], undefined);
  assert.equal(patch[`settings.${line}.lineSpeed`], undefined);
  msg.payload = { acknowledged: true, matchedCount: 1 }; finishSpeedWrite(msg, global);
  assert.equal(state.lineSettings[line].designGrades[16], 'Reject');
  assert.equal(state.lineSettings[line].productionRunId, 'unchanged');
  const ordinary = { savedLine: line, savedSettings: { ...current, designGrades: { 1: 'Invented' } }, req: { body: { designGrades: { 1: 'Invented' } } } };
  preserveSpeeds(ordinary, global); assert.deepEqual(ordinary.savedSettings.designGrades, slots);
}
const bad = make(); routeSpeeds(bad, global); bad.payload = { grades: [{ grade: 'First' }] };
assert.equal(prepareSpeedWrite(bad)[1].statusCode, 400);
for (const n of JSON.parse(fs.readFileSync(new URL('./keda-line-settings-save.patch.flow.json', import.meta.url)))) if (n.type === 'function') new Function('msg', 'global', 'node', n.func);
console.log('PASS: 16 slots, catalogue validation, all Keda lines, Manager permissions, isolated Mongo patch, runtime update and preservation on unrelated saves.');
