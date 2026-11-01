import assert from 'node:assert/strict';
import vm from 'node:vm';
import { chartResponseContract } from './ai-chart-response.mjs';
import { nodes } from './build-production-ai-flow.mjs';

const contract = chartResponseContract();
const sources = [{ tool: 'get_monthly_production', success: true }];
const chart = { type: 'line', title: 'Monthly production', unit: 'm²', labels: ['September', 'October'], series: [{ name: 'Keda 1', values: [null, 120] }], sourceTools: ['get_monthly_production'] };
const parse = (charts) => contract.parse(JSON.stringify({ answer: 'Recorded production increased.', charts }), sources);
assert.equal(parse([chart]).charts.length, 1);
assert.equal(parse([chart]).charts[0].series[0].values[0], null);
assert.equal(parse([]).charts.length, 0);
for (const bad of [
  { ...chart, type: 'script' },
  { ...chart, series: [{ name: 'Mismatch', values: [1] }] },
  { ...chart, series: [{ name: 'String value', values: ['1', 2] }] },
  { ...chart, sourceTools: ['invented_tool'] },
  { ...chart, type: 'pie' },
  { ...chart, type: 'pie', series: [{ name: 'Negative', values: [-1, 5] }] },
  { ...chart, series: [{ name: 'No data', values: [null, null] }] },
]) {
  const result = parse([bad]);
  assert.equal(result.charts.length, 0);
  assert.equal(result.chartWarnings.length, 1);
}
assert.equal(parse([{ ...chart, type: 'pie', series: [{ name: 'Production', values: [0, 120] }] }]).charts.length, 1);
assert(!('formatter' in parse([{ ...chart, formatter: 'malicious code' }]).charts[0]));
assert.throws(() => contract.parse('plain text', sources));
assert.throws(() => parse([chart, chart, chart, chart]));
const run = (id, msg) => vm.runInNewContext('(function(){\n' + nodes.find((node) => node.id === id).func + '\n})()', { msg, env: { get: () => 'test' } });
const request = { aiChat: { started: Date.now(), input: [], tools: [], instructions: 'Test' } };
run('ai_chat_build', request);
assert.equal(request.payload.text.format.type, 'json_schema');
assert.equal(request.payload.text.format.strict, true);
const response = { statusCode: 200, aiChat: { input: [], sources }, payload: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'Test answer.', charts: [chart] }) }] }] } };
const final = run('ai_chat_inspect', response)[1];
assert.equal(final.payload.charts[0].type, 'line');
const refused = { statusCode: 200, aiChat: { input: [], sources: [] }, payload: { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Unable to help with that.' }] }] } };
assert.equal(run('ai_chat_inspect', refused)[1].payload.charts.length, 0);
console.log('PASS: structured format; bar/line/pie validation; null gaps; mismatched/non-numeric/unsupported charts; source validation; extra-field stripping; refusals; exported request and response nodes.');
