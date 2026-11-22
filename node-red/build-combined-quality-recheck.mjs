import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const source = process.argv[2] || 'C:/Users/Yasitha/.codex/attachments/8a31fc63-3f72-429c-a4d2-8bcec878695a/Pasted text.txt';
const nodes = JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, ''));
const first = nodes.find(n => n.id === '805abc74014c5629');
const second = nodes.find(n => n.id === '6d121ebb811ce919');
assert.deepEqual(first.wires, [[second.id]]);
assert.equal(first.outputs, 1);
assert.equal(second.outputs, 2);
for (const n of [first, second]) {
  assert(!n.initialize && !n.finalize && !n.libs?.length);
  assert(!/\bcontext\s*\.|node\.(send|done)\s*\(/.test(n.func));
}
const code = `// Build one message per saved shift, then route each message independently.
const prepared = (function prepareSavedShifts(msg) {
${first.func}
})(msg);
if (prepared == null) return null;
const outputs = [[], []];
for (const shiftMessage of prepared[0]) {
  const routed = (function routeShift(msg) {
${second.func}
  })(shiftMessage);
  for (let index = 0; index < outputs.length; index++) {
    if (routed[index] != null) outputs[index].push(routed[index]);
  }
}
return outputs.map(messages => messages.length ? messages : null);`;
const formatted = generate(parse(code, { allowReturnOutsideFunction: true }), { comments: true }).code + '\n';
const normalize = value => JSON.stringify(parse(value, { allowReturnOutsideFunction: true }), (k, v) => ['start', 'end', 'loc', 'extra'].includes(k) ? undefined : v);
assert.equal(normalize(code), normalize(formatted));
const execute = (body, msg, registry) => vm.runInNewContext(`(function(msg){${body}\n})(msg)`, {
  msg, global: { get: key => ({ devices: registry, devicesReady: true })[key] }
});
const doc = (id, line, sensor) => ({ _id: id, lineStats: { lineName: line, device: 'RX-CNT-' + id, codeWiseProduction: [], ...(sensor ? { qualitySensorDevice: sensor } : {}) } });
let tests = 0;
for (const payload of [[], [doc('1', 'Keda 1')], [doc('2', 'Keda 2', 'RX-QLT-4000')], [doc('1', 'Keda 1'), doc('2', 'Keda 2', 'RX-QLT-4000'), doc('3', 'Keda 3')], [{ lineStats: {} }]]) {
  for (const registry of [{}, { 'RX-QLT-4001': { enabled: true, line: 'Keda 1' } }]) {
    const original = execute(first.func, { payload: structuredClone(payload) }, registry);
    let expected = null;
    if (original != null) {
      const groups = [[], []];
      for (const msg of original[0]) {
        const routed = execute(second.func, msg, registry);
        routed.forEach((item, index) => { if (item != null) groups[index].push(item); });
      }
      expected = groups.map(items => items.length ? items : null);
    }
    assert.equal(JSON.stringify(execute(formatted, { payload: structuredClone(payload) }, registry)), JSON.stringify(expected));
    tests++;
  }
}
const merged = { ...first, name: 'Prepare saved shifts + route quality recheck', func: formatted, outputs: 2, wires: second.wires, outputLabels: ['Read grade categories (quality sensor present)', 'Attach quality / continue (no sensor)'] };
// Reuse existing connection configurations; never copy connection credentials into the new export.
const full = nodes.filter(n => !['mongodb4-client', 'influxdb', 'global-config'].includes(n.type) && n.id !== second.id)
  .map(n => n.id === first.id ? merged : n);
for (const n of full) if (n.type === 'catch' && Array.isArray(n.scope)) n.scope = [...new Set(n.scope.map(id => id === second.id ? first.id : id))];
fs.writeFileSync(new URL('./combined-quality-recheck.function.js', import.meta.url), formatted);
fs.writeFileSync(new URL('./combined-quality-recheck.patch.flow.json', import.meta.url), JSON.stringify([merged], null, 2) + '\n');
fs.writeFileSync(new URL('./combined-quality-recheck.complete.flow.json', import.meta.url), JSON.stringify(full, null, 2) + '\n');
console.log(`Created combined node and complete recheck flow. ${tests} routing equivalence cases passed.`);
