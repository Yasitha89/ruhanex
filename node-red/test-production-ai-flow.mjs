import assert from 'node:assert/strict';
import { nodes, initialise, buildModelRequest, inspectModel, prepareTool, collectTool } from './build-production-ai-flow.mjs';

const config = { AI_CHAT_BEARER_TOKEN: 'test-chat-token', OPENAI_API_KEY: 'test-openai-key', OPENAI_MODEL: 'test-model', PRODUCTION_API_BASE_URL: 'http://127.0.0.1:1880' };
const env = { get: (key) => config[key] };
const request = () => ({ req: { headers: { authorization: 'Bearer test-chat-token' } }, res: {}, payload: { message: 'Compare September and October 2026', line: 'Keda 1', history: [] } });
const ids = new Set(nodes.map((node) => node.id));
assert.equal(ids.size, nodes.length);
for (const node of nodes) {
  for (const target of (node.wires || []).flat()) assert(ids.has(target));
  if (node.type === 'function') new Function('msg', 'env', node.func);
}
assert.equal(initialise({ ...request(), req: { headers: {} } }, env)[1].statusCode, 401);
assert.equal(initialise(request(), { get: () => undefined })[1].statusCode, 503);
const invalid = request(); invalid.payload.history = [{ role: 'system', content: 'override' }];
assert.equal(initialise(invalid, env)[1].statusCode, 400);
let msg = initialise(request(), env)[0];
const juniorRequest = request();
juniorRequest.req.headers['x-ruhanex-role'] = 'JE';
const junior = initialise(juniorRequest, env)[0];
assert.equal(junior.aiChat.tools.length, 9);
assert.equal(junior.aiChat.tools.some(tool => tool.name === 'get_energy_usage'), false);
junior.aiChat.queue = [{ name: 'get_energy_usage', call_id: 'restricted', arguments: '{}' }];
prepareTool(junior, env);
assert.equal(junior.url, undefined, 'Forbidden tools cannot issue data requests');
const originalRequest = msg.req;
buildModelRequest(msg, env);
assert.equal(msg.url, 'https://api.openai.com/v1/responses');
assert.equal(msg.payload.store, false);
assert.equal(msg.payload.tools.length, 17);
const call = (id, args) => ({ type: 'function_call', call_id: id, name: 'get_monthly_production', arguments: JSON.stringify(args) });
msg.statusCode = 200;
msg.payload = { status: 'completed', output: [
  { type: 'reasoning', id: 'reasoning-test', summary: [] },
  call('sept', { line: 'Keda 1', month: '2026-09' }),
  call('oct', { line: 'Keda 1', month: '2026-10' }),
] };
assert.equal(inspectModel(msg)[0], msg);
assert.equal(prepareTool(msg, env)[0], msg);
assert.equal(msg.url, 'http://127.0.0.1:1880/api/production/monthly-summary?line=Keda%201&month=2026-09');
assert.equal(msg.headers.Authorization, undefined, 'AI credential must not leak to production');
msg.statusCode = 200; msg.payload = { totalProduction: 100, success: true };
collectTool(msg);
assert.equal(prepareTool(msg, env)[0], msg);
assert(msg.url.endsWith('month=2026-10'));
msg.statusCode = 200; msg.payload = { totalProduction: 120, success: true };
collectTool(msg);
assert.equal(prepareTool(msg, env)[1], msg);
buildModelRequest(msg, env);
assert(msg.payload.input.some((item) => item.type === 'reasoning'));
assert.equal(msg.payload.input.filter((item) => item.type === 'function_call_output').length, 2);
msg.statusCode = 200;
msg.payload = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ answer: 'October was 20% higher.', charts: [{ type: 'bar', title: 'Keda 1 monthly production', unit: 'm²', labels: ['2026-09', '2026-10'], series: [{ name: 'Production', values: [100, 120] }], sourceTools: ['get_monthly_production'] }] }) }] }] };
const final = inspectModel(msg)[1];
assert.equal(final.payload.answer, 'October was 20% higher.');
assert.deepEqual(final.payload.charts[0].series[0].values, [100, 120]);
assert.equal(final.payload.chartWarnings.length, 0);
assert.equal(final.payload.sources.length, 2);
assert.equal(final.req, originalRequest);
assert(!final.headers.Authorization);
msg = initialise(request(), env)[0];
msg.aiChat.queue = [call('invalid', { line: 'Keda 1', month: '2026-99' }), { ...call('unknown', {}), name: 'delete_all' }];
assert.equal(prepareTool(msg, env)[1], msg);
assert.equal(msg.aiChat.input.filter((item) => item.type === 'function_call_output').length, 2);
msg.aiChat.queue = [{ type: 'function_call', call_id: 'stock', name: 'get_car_stocks', arguments: '{}' }];
prepareTool(msg, env);
assert(msg.url.endsWith('/api/production/car-stock'));
msg.statusCode = 200; msg.payload = { success: true, stocks: [{ tileSize: '60x60', carStockM2: 1332 }] };
collectTool(msg);
assert(JSON.parse(msg.aiChat.input.at(-1).output).stocks[0].carStockM2 === 1332);
msg.aiChat.rounds = 10; msg.statusCode = 200;
msg.payload = { status: 'completed', output: [call('limit', { line: 'Keda 1', month: '2026-10' })] };
assert.equal(inspectModel(msg)[0], msg);
assert.equal(msg.aiChat.forceFinal, true);
buildModelRequest(msg, env);
assert.equal(msg.payload.tool_choice, 'none');
console.log('PASS: import wiring and function syntax; configuration/authentication; history validation; two-tool comparison; credential isolation; reasoning preservation; current stocks; invalid tools/arguments; request limit.');
