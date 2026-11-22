import fs from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const generate = require('@babel/generator').default;
const source = process.argv[2] || 'C:/Users/Yasitha/.codex/attachments/22d51d24-2cfc-4df3-809f-45800e691f9a/Pasted text.txt';
const nodes = JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, ''));
const first = nodes.find(n => n.id === '42ef6dce69e376fd');
const second = nodes.find(n => n.id === '5699300921ba4baa');
assert(first && second, 'Both source functions must exist.');
assert.deepEqual(first.wires, [[second.id]]);
for (const node of [first, second]) {
  assert.equal(node.outputs, 1);
  assert(!node.initialize && !node.finalize && !node.libs?.length);
  assert(!/\bcontext\s*\.|node\.(send|done)\s*\(/.test(node.func), 'Node-local state or asynchronous output requires separate handling.');
}

// Separate scopes preserve declarations and early returns from each original node.
const combined = `// Calculate production statistics before initializing quality for the shift save.
const calculatedMessage = (function calculateShiftStatistics(msg) {
${first.func}
})(msg);
if (calculatedMessage == null) return null;
return (function initializeShiftQuality(msg) {
${second.func}
})(calculatedMessage);`;
const ast = parse(combined, { allowReturnOutsideFunction: true });
const formatted = generate(ast, { comments: true, compact: false }).code + '\n';
// Formatting must preserve the program structure, including strings and operators.
const normalized = code => JSON.stringify(parse(code, { allowReturnOutsideFunction: true }), (key, value) =>
  ['start', 'end', 'loc', 'extra', 'tokens'].includes(key) ? undefined : value);
assert.equal(normalized(formatted), normalized(combined));

const run = (body, msg, settings) => {
  const FixedDate = class extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-21T09:00:00Z'])); }
    static now() { return Date.parse('2026-11-21T09:00:00Z'); }
  };
  const sandbox = { msg, global: { get: key => settings[key] }, node: { error() {}, warn() {}, status() {} }, Date: FixedDate };
  return vm.runInNewContext(`(function(msg){${body}\n})(msg)`, sandbox);
};
let cases = 0;
for (const line of ['Keda 2', 'Glaze Line 1']) {
  for (const hasSensor of [false, true]) {
    for (const payload of [[], [{ stopStart_ts: Date.parse('2026-11-21T01:30:00Z'), stopStop_ts: Date.parse('2026-11-21T02:00:00Z'), downtimeType: 'unplanned' }]]) {
      const input = { payload, summaryRequest: { device: 'RX-CNT-1004', line, shift: '06-14', shiftDate: '2026-11-21', fromTime: '2026-11-21T00:30:00Z', toTime: '2026-11-21T08:30:00Z', tileCount: 1000 } };
      const settings = { devicesReady: true, counterConfig: {}, lineSettings: { [line]: { tileSize: '80x80', lineSpeed: 16 } }, devices: hasSensor ? { 'RX-QLT-4000': { enabled: true, deviceType: 'quality_sensor', line } } : {} };
      const intermediate = run(first.func, structuredClone(input), settings);
      const expected = intermediate == null ? null : run(second.func, intermediate, settings);
      const actual = run(formatted, structuredClone(input), settings);
      assert.equal(JSON.stringify(actual), JSON.stringify(expected));
      cases++;
    }
  }
}
assert.equal(run(formatted, { payload: [] }, {}), null);
const output = { ...first, name: 'Calculate shift statistics + initialize quality', func: formatted, wires: second.wires, outputLabels: ['Save shift summary'] };
fs.writeFileSync(new URL('./combined-shift-statistics-quality.function.js', import.meta.url), formatted);
fs.writeFileSync(new URL('./combined-shift-statistics-quality.flow.json', import.meta.url), JSON.stringify([output], null, 2) + '\n');
console.log(`Created combined flow and formatted JavaScript; ${cases + 1} equivalence cases passed.`);
