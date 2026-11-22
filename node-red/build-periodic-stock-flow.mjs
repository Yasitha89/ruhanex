import fs from 'node:fs';
import { stockPeriod, startPeriodicStock, queryPeriodicStock, calculatePeriodicStock } from './periodic-stock.mjs';
const tab = 'rx_periodic_stock_tab';
const nodes = [{ id: tab, type: 'tab', label: 'Periodic floor and car stock', info: 'Standalone five-minute stock updates. See periodic-stock.README.md.' }];
for (const kind of ['floor', 'car']) {
  const p = `rx_periodic_${kind}`, y = kind === 'floor' ? 180 : 540;
  const fn = (id, name, func, to, x, dy = 0) => nodes.push({ id: `${p}_${id}`, type: 'function', z: tab, name: `${kind}: ${name}`, func, outputs: 1, x, y: y + dy, wires: [[`${p}_${to}`]] });
  const mongo = (id, operation, to, x) => nodes.push({ id: `${p}_${id}`, type: 'mongodb4', z: tab, name: `${kind}: ${operation}`, clientNode: '8120871193b8f276', mode: 'collection', collection: kind === 'floor' ? 'floorStocks' : 'carStocks', operation, output: 'toArray', maxTimeMS: operation === 'bulkWrite' ? '' : '30000', handleDocId: false, x, y, wires: [[`${p}_${to}`]] });
  nodes.push({ id: `${p}_tick`, type: 'inject', z: tab, name: `${kind}: update every 5 minutes`, props: [], repeat: '300', once: true, onceDelay: 30, x: 180, y, wires: [[`${p}_start`]] });
  fn('start', 'prepare stock update', `${stockPeriod.toString()}\nreturn (${startPeriodicStock.toString()})(msg,global,flow,'${kind}');`, 'read', 440);
  mongo('read', 'find', 'query', 700);
  fn('query', 'query production from opening balance', `${stockPeriod.toString()}\nreturn (${queryPeriodicStock.toString()})(msg);`, 'influx', 1000);
  nodes.push({ id: `${p}_influx`, type: 'influxdb in', z: tab, influxdb: 'eef122fda5340dac', name: `${kind}: read count_delta`, query: '', rawOutput: false, org: 'Ruhanex', x: 1300, y, wires: [[`${p}_calculate`]] });
  fn('calculate', 'calculate and upsert each shift', `${stockPeriod.toString()}\nif(flow.get(msg.stock.key)?.id!==msg.stock.id) return null;\nreturn (${calculatePeriodicStock.toString()})(msg);`, 'write', 1600);
  mongo('write', 'bulkWrite', 'finish', 1900);
  fn('finish', 'verify save and release lock', `const s=msg.stock;const r=msg.payload;if(r?.acknowledged!==true&&r?.result?.ok!==1&&r?.ok!==1)throw Error('Stock bulk write was not acknowledged.');if(flow.get(s.key)?.id===s.id)flow.set(s.key,null);return {payload:{saved:true,kind:s.kind,documents:msg.stockDocuments.length,shiftIds:msg.stockDocuments.map(d=>d._id)}};`, 'debug', 2180);
  nodes.push({ id: `${p}_catch`, type: 'catch', z: tab, name: `${kind}: stock update failed`, scope: ['start','read','query','influx','calculate','write','finish'].map(id => `${p}_${id}`), uncaught: false, x: 750, y: y + 100, wires: [[`${p}_error`]] });
  fn('error', 'release lock after failure', `const s=msg.stock;if(s&&flow.get(s.key)?.id===s.id)flow.set(s.key,null);return {payload:{saved:false,kind:'${kind}',message:String(msg.error?.message||'Stock update failed'),retry:'Next five-minute tick'}};`, 'debug', 1150, 100);
  nodes.push({ id: `${p}_debug`, type: 'debug', z: tab, name: `${kind}: periodic stock result`, active: true, tosidebar: true, complete: 'payload', targetType: 'msg', x: 2460, y, wires: [] });
}
fs.writeFileSync(new URL('./periodic-stock.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
const source = JSON.parse(fs.readFileSync('C:/Users/Yasitha/.codex/attachments/ee69cd2e-7371-4374-8b7b-536ca77dca3e/Pasted text.txt', 'utf8').replace(/^\uFEFF/, ''));
const save = source.find(n => n.id === 'ba29ac1848fbe345');
save.wires = save.wires.map(w => w.filter(id => !['c3fc35bad70ed5ba', '0deef794aab463d7'].includes(id)));
fs.writeFileSync(new URL('./periodic-stock.disconnect-shift.patch.flow.json', import.meta.url), JSON.stringify([save], null, 2) + '\n');
console.log('Generated standalone periodic stock flow and shift-save disconnection patch.');
