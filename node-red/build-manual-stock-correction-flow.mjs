import fs from 'node:fs';
import { stockPeriod } from './periodic-stock.mjs';
import { sumHistoricalStock, buildManualStockUpdate } from './manual-stock-correction.mjs';
const tab = 'rx_manual_stock_correction';
const nodes = [{ id: tab, type: 'tab', label: 'Manual 60x30 stock correction' }];
const fn = (id, name, func, targets, x, y = 180) => nodes.push({ id, type: 'function', z: tab, name, func, outputs: targets.length, wires: targets.map(t => [t]), x, y });
const db = (id, collection, operation, target, x, y = 180) => nodes.push({ id, type: 'mongodb4', z: tab, name: `${operation} ${collection}`, clientNode: '8120871193b8f276', collection, mode: 'collection', operation, output: 'toArray', maxTimeMS: operation === 'find' ? '30000' : '', handleDocId: false, wires: [[target]], x, y });
for (const apply of [false, true]) nodes.push({ id: `rx_mc_${apply ? 'apply' : 'preview'}`, type: 'inject', z: tab, name: apply ? 'APPLY 60x30 correction' : 'PREVIEW 60x30 correction', props: [{ p: 'apply', v: apply ? 'true' : 'false', vt: 'bool' }], once: false, repeat: '', x: 180, y: apply ? 240 : 120, wires: [['rx_mc_start']] });
fn('rx_mc_start', 'History settings / current shift', `${stockPeriod.toString()}
// Optional: specify a known shift boundary and opening stock in TILES.
const options={from:'2026-11-04T06:00:00+05:30',floorOpening:0,carOpening:0};
msg.correction={period:stockPeriod(Date.now()),options,apply:msg.apply===true};
msg.payload=[{'lineStats.shiftStart':{$exists:true}}, {sort:{'lineStats.shiftStart':1}}];return msg;`, ['rx_mc_history'], 480);
db('rx_mc_history', 'shifts', 'find', 'rx_mc_sum', 760);
fn('rx_mc_sum', 'Total historical 60x30 production', `${sumHistoricalStock.toString()}
msg.correction.history=sumHistoricalStock(msg.payload,msg.correction.period,msg.correction.options);
msg.payload=[{_id:msg.correction.period.id}];return msg;`, ['rx_mc_floor_read'], 1060);
db('rx_mc_floor_read', 'floorStocks', 'findOne', 'rx_mc_floor_hold', 1360);
fn('rx_mc_floor_hold', 'Keep floor / read car', `msg.correction.floor=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;msg.payload=[{_id:msg.correction.period.id}];return msg;`, ['rx_mc_car_read'], 1620);
db('rx_mc_car_read', 'carStocks', 'findOne', 'rx_mc_prepare', 1880);
fn('rx_mc_prepare', 'Preview or prepare conditional writes', `${buildManualStockUpdate.toString()}
const c=msg.correction;const car=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
if(Date.now()>=c.period.end)throw Error('Shift changed during correction; run preview again.');
c.floorUpdate=buildManualStockUpdate(c.floor,c.history,'floor');c.carUpdate=buildManualStockUpdate(car,c.history,'car');
if(!c.apply){msg.payload={preview:true,floor:c.floorUpdate.preview,car:c.carUpdate.preview};return [null,msg];}
msg.payload=[c.floorUpdate.filter,c.floorUpdate.update];return [msg,null];`, ['rx_mc_floor_write', 'rx_mc_debug'], 2180);
db('rx_mc_floor_write', 'floorStocks', 'updateOne', 'rx_mc_next', 750, 400);
fn('rx_mc_next', 'Confirm floor / update car', `const r=msg.payload;if(r?.acknowledged!==true||r.matchedCount!==1)throw Error('Floor changed during calculation. Preview and retry.');msg.correction.floorSaved=true;const u=msg.correction.carUpdate;msg.payload=[u.filter,u.update];return msg;`, ['rx_mc_car_write'], 1100, 400);
db('rx_mc_car_write', 'carStocks', 'updateOne', 'rx_mc_done', 1450, 400);
fn('rx_mc_done', 'Confirm correction', `const r=msg.payload;if(r?.acknowledged!==true||r.matchedCount!==1)throw Error('Car changed during calculation. Floor saved; preview and retry car correction.');return {payload:{saved:true,floor:msg.correction.floorUpdate.preview,car:msg.correction.carUpdate.preview}};`, ['rx_mc_debug'], 1800, 400);
nodes.push({ id: 'rx_mc_catch', type: 'catch', z: tab, name: 'Correction failed', scope: nodes.filter(n => ['function','mongodb4'].includes(n.type)).map(n => n.id), uncaught: false, x: 500, y: 540, wires: [['rx_mc_error']] });
fn('rx_mc_error', 'Report correction error', `return {payload:{saved:false,floorSaved:msg.correction?.floorSaved===true,error:String(msg.error?.message||'Correction failed')}};`, ['rx_mc_debug'], 900, 540);
nodes.push({ id: 'rx_mc_debug', type: 'debug', z: tab, name: '60x30 stock correction result', active: true, tosidebar: true, complete: 'payload', targetType: 'msg', x: 2500, y: 400, wires: [] });
fs.writeFileSync(new URL('./manual-stock-correction.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log('Generated manual preview/apply correction flow.');
