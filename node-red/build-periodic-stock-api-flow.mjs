import fs from 'node:fs';
import { stockSnapshotResponse } from './periodic-stock-api.mjs';
const source = JSON.parse(fs.readFileSync('C:/Users/Yasitha/.codex/attachments/101c6ca1-a4ca-4fc2-acf0-9ef8a91c2f5d/Pasted text.txt', 'utf8').replace(/^\uFEFF/, ''));
const removed = new Set(['ea392b398b0caf53', 'bb11d146802c05fe', 'cl_eb282b9b964f', 'cl_aad664d7b47e']);
const nodes = source.filter(n => !removed.has(n.id) && !['mongodb4-client', 'influxdb', 'global-config'].includes(n.type));
for (const [kind, queryId, responseId, httpId, catchId, dbId] of [
  ['floor', 'ec37e99d7d76a092', '9bacf53ce597b788', 'f1cbe436625b79b5', '0d7c06f5c99c1b7d', '2026b53c8337f194'],
  ['car', 'cl_4aaefa5b8633', 'cl_4c56cb0af8eb', 'cl_af01e397e6fd', 'cl_2e5cb986ef87', 'cl_94cc7fb788b2']
]) {
  const query = nodes.find(n => n.id === queryId);
  query.func = `msg.collection='${kind === 'floor' ? 'floorStocks' : 'carStocks'}';msg.mode='collection';msg.operation='find';msg.payload=[{}, {sort:{shiftEnd:-1,calculatedAt:-1},limit:1}];return msg;`;
  nodes.find(n => n.id === dbId).operation = 'find';
  const response = nodes.find(n => n.id === responseId);
  Object.assign(response, { name: `Return saved periodic ${kind} stock`, outputs: 1, wires: [[httpId]], func: `return (${stockSnapshotResponse.toString()})(msg,'${kind}');` });
  const catcher = nodes.find(n => n.id === catchId);
  catcher.scope = [queryId, dbId, responseId];
}
fs.writeFileSync(new URL('./periodic-stock-api.complete.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log('Generated MongoDB-only floor/car API flows with original endpoint IDs.');
