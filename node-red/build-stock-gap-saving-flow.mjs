import fs from 'node:fs';

export function startStock(msg, global, kind) {
  const t = msg.codeWiseTarget || {};
  const result = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;
  if (!t.shiftDate || !['06-14', '14-22', '22-06'].includes(t.shift)) throw Error('Missing target shift/date.');
  if (!msg.manualStock && (!result?.acknowledged || Number(result.matchedCount) !== 1)) throw Error('Code-wise shift write was not confirmed.');
  const start = Date.parse(`${t.shiftDate}T${t.shift === '06-14' ? '06' : t.shift === '14-22' ? '14' : '22'}:00:00+05:30`);
  const end = start + 8 * 3600000;
  if (!Number.isFinite(start) || end > Date.now()) throw Error('Target shift is invalid or not completed.');
  const cfg = global.get('counterConfig') || {};
  const overrides = global.get(kind === 'floor' ? 'floorStockDeviceRoles' : 'carStockDeviceRoles') || {};
  const positive = kind === 'floor' ? 'kiln' : 'glaze';
  const negative = kind === 'floor' ? 'keda' : 'kiln';
  const roles = {};
  for (const [id, c] of Object.entries(cfg)) {
    if (c?.enabled !== true) continue;
    let role = String(overrides[id] || '').toLowerCase();
    if (![positive, negative].includes(role)) {
      const line = String(c.line || id);
      role = /kiln|firing/i.test(line) ? 'kiln' : /keda|sorting/i.test(line) ? 'keda' : /glaze|glazing/i.test(line) ? 'glaze' : '';
    }
    if ([positive, negative].includes(role)) roles[id] = role;
  }
  if (![positive, negative].every(role => Object.values(roles).includes(role))) throw Error('Configure enabled source and destination counters.');
  if (!msg.manualStock && !roles[t.device]) return null;
  msg.stockGap = { kind, positive, negative, roles, start, end, id: `${t.shiftDate}|${t.shift}`, shiftDate: t.shiftDate, shift: t.shift };
  msg.payload = [{}, { sort: { _id: -1 }, limit: 1 }];
  return msg;
}

export function queryStockGap(msg) {
  const f = msg.stockGap;
  f.previous = (Array.isArray(msg.payload) ? msg.payload : [])[0] || null;
  if (f.previous && String(f.previous._id) >= f.id) { msg.payload = { skipped: true, reason: 'Target already saved or older than latest snapshot', snapshotId: f.id }; return [null, msg]; }
  f.from = f.previous ? Date.parse(f.previous.shiftEnd) : f.start;
  const step = 8 * 3600000;
  if (!Number.isFinite(f.from) || f.from > f.start || (f.end - f.from) % step !== 0) throw Error('Previous snapshot end is not a valid preceding shift boundary.');
  if (f.end - f.from > 93 * 86400000) throw Error('Snapshot gap exceeds 93 days; recover in smaller chronological batches.');
  const ids = JSON.stringify(Object.keys(f.roles));
  msg.query = `from(bucket:"RCLH")
 |> range(start:time(v:${JSON.stringify(new Date(f.from).toISOString())}),stop:time(v:${JSON.stringify(new Date(f.end).toISOString())}))
 |> filter(fn:(r)=>r._measurement=="tile_events" and r._field=="count_delta")
 |> filter(fn:(r)=>contains(value:r.device,set:${ids}))
 |> filter(fn:(r)=>r._value>0)
 |> map(fn:(r)=>({r with tileSize:if exists r.tileSize then r.tileSize else "unknown"}))
 |> group(columns:["device","tileSize"])
 |> aggregateWindow(every:8h,offset:30m,fn:sum,createEmpty:false)
 |> keep(columns:["device","tileSize","_time","_value"])`;
  return [msg, null];
}

export function buildStockGap(msg) {
  const f = msg.stockGap;
  if (!Array.isArray(msg.payload)) throw Error('Influx did not return an array.');
  const step = 8 * 3600000;
  const normal = size => String(size || '').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
  const area = size => { const parts = size.split('x').map(Number); return parts.length === 2 && parts.every(n => Number.isFinite(n) && n > 0) ? parts[0] * parts[1] / 10000 : 0; };
  const sizes = new Map(), windows = new Map();
  const get = size => {
    if (!sizes.has(size)) sizes.set(size, { tileSize: size, openingStock: 0, incoming: 0, outgoing: 0, closingStock: 0, zeroClampAdjustment: 0 });
    return sizes.get(size);
  };
  for (const s of f.previous?.stocks || []) {
    const size = normal(s.tileSize), count = Number(s.closingStock);
    if (!area(size) || !Number.isFinite(count) || count < 0) throw Error('Invalid previous snapshot stock.');
    const item = get(size); item.openingStock = count; item.closingStock = count;
  }
  for (const row of msg.payload) {
    const size = normal(row.tileSize), count = Number(row._value), end = Date.parse(row._time), role = f.roles[String(row.device)];
    if (!area(size) || !Number.isFinite(count) || count < 0 || !role || !Number.isFinite(end) || end <= f.from || end > f.end || (end - f.from) % step !== 0) throw Error('Invalid production bucket from Influx. Snapshot not saved.');
    get(size);
    if (!windows.has(end)) windows.set(end, new Map());
    const bucket = windows.get(end);
    const value = bucket.get(size) || { incoming: 0, outgoing: 0 };
    value[role === f.positive ? 'incoming' : 'outgoing'] += count;
    bucket.set(size, value);
  }
  const intervalBalances = [];
  for (let end = f.from + step; end <= f.end; end += step) {
    const balances = [];
    for (const item of sizes.values()) {
      const delta = windows.get(end)?.get(item.tileSize) || { incoming: 0, outgoing: 0 };
      const opening = item.closingStock;
      const raw = opening + delta.incoming - delta.outgoing;
      item.incoming += delta.incoming; item.outgoing += delta.outgoing;
      item.zeroClampAdjustment += Math.max(0, -raw);
      item.closingStock = Math.max(0, raw);
      balances.push({ tileSize: item.tileSize, openingStock: opening, incoming: delta.incoming, outgoing: delta.outgoing, rawClosingStock: raw, closingStock: item.closingStock });
    }
    intervalBalances.push({ shiftEnd: new Date(end).toISOString(), stocks: balances });
  }
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const stocks = [...sizes.values()].map(item => ({ tileSize: item.tileSize, openingStock: item.openingStock,
    [f.kind === 'floor' ? 'kilnOutput' : 'glazeOutput']: item.incoming,
    [f.kind === 'floor' ? 'kedaOutput' : 'kilnOutput']: item.outgoing,
    rawClosingStock: item.openingStock + item.incoming - item.outgoing,
    zeroClampAdjustment: item.zeroClampAdjustment, closingStock: item.closingStock,
    closingStockM2: round(item.closingStock * area(item.tileSize)), clampedToZero: item.zeroClampAdjustment > 0,
  })).sort((a, b) => a.tileSize.localeCompare(b.tileSize));
  const doc = { _id: f.id, shiftDate: f.shiftDate, shift: f.shift, shiftStart: new Date(f.start).toISOString(), shiftEnd: new Date(f.end).toISOString(),
    status: 'completed', source: 'mongo+influx', previousSnapshotId: f.previous?._id || null,
    calculationFrom: new Date(f.from).toISOString(), calculationTo: new Date(f.end).toISOString(),
    coveredShifts: intervalBalances.length, recoveredMissingShifts: Math.max(0, intervalBalances.length - 1),
    openingStockInitializedToZero: !f.previous, expectedDevices: Object.keys(f.roles), stocks,
    intervalBalances, [f.kind === 'floor' ? 'totalFloorStockM2' : 'totalCarStockM2']: round(stocks.reduce((sum, row) => sum + row.closingStockM2, 0)),
    calculatedAt: new Date().toISOString() };
  msg.stockGapDocument = doc; msg.payload = [doc]; return msg;
}

const tab = 'rx_stock_gap_tab';
export const nodes = [{ id: tab, type: 'tab', label: 'Stock snapshot gap recovery', info: 'See stock-gap-saving.README.md. Replace old saving branches; connect completed code-wise update results to the matching entry. Single-flight queues per stock type.' }];
for (const kind of ['floor', 'car']) {
  const p = `rx_gap_${kind}`, collection = kind === 'floor' ? 'floorStocks' : 'carStocks';
  const fn = (suffix, name, func, wires, x, y) => nodes.push({ id: `${p}_${suffix}`, z: tab, type: 'function', name, func, outputs: wires.length, x, y, wires });
  const mongo = (suffix, operation, wires, x, y) => nodes.push({ id: `${p}_${suffix}`, z: tab, type: 'mongodb4', name: `${kind}: ${operation} ${collection}`, clientNode: '8120871193b8f276', mode: 'collection', collection, operation, output: 'toArray', maxTimeMS: '0', handleDocId: false, x, y, wires });
  const y = kind === 'floor' ? 180 : 520;
  fn('entry', `${kind}: QUEUED ENTRY after code-wise save`, `const key='${p}_queue'; const queue=flow.get(key)||[]; queue.push(msg); flow.set(key,queue); if(flow.get('${p}_busy')) return null; flow.set('${p}_busy',true); return queue.shift();`, [[`${p}_start`]], 200, y);
  fn('start', `${kind}: validate completed shift`, `const next=(${startStock.toString()})(msg,global,'${kind}'); return next ? [next,null] : [null,msg];`, [[`${p}_latest`], [`${p}_finish`]], 490, y);
  mongo('latest', 'find', [[`${p}_query`]], 760, y);
  fn('query', `${kind}: query entire snapshot gap`, `return (${queryStockGap.toString()})(msg);`, [[`${p}_influx`], [`${p}_finish`]], 1010, y);
  nodes.push({ id: `${p}_influx`, z: tab, type: 'influxdb in', influxdb: 'eef122fda5340dac', name: `${kind}: Influx shift buckets since last snapshot`, query: '', rawOutput: false, precision: '', retentionPolicy: '', org: 'Ruhanex', x: 1300, y, wires: [[`${p}_build`]] });
  fn('build', `${kind}: calculate chronological closing balances`, `return (${buildStockGap.toString()})(msg);`, [[`${p}_insert`]], 1590, y);
  mongo('insert', 'insertOne', [[`${p}_confirmed`]], 1880, y);
  fn('confirmed', `${kind}: verify snapshot insert`, `const result=Array.isArray(msg.payload)?msg.payload[0]:msg.payload; if(result?.acknowledged!==true) throw Error('Snapshot insert was not acknowledged'); msg.payload={saved:true,id:msg.stockGapDocument._id,calculationFrom:msg.stockGapDocument.calculationFrom,coveredShifts:msg.stockGapDocument.coveredShifts};return msg;`, [[`${p}_finish`]], 2110, y);
  fn('finish', `${kind}: release queue`, `const queue=flow.get('${p}_queue')||[]; const next=queue.shift(); flow.set('${p}_queue',queue); if(!next) flow.set('${p}_busy',false); return [msg,next||null];`, [[`${p}_debug`], [`${p}_start`]], 2350, y);
  const scope = ['start', 'latest', 'query', 'influx', 'build', 'insert', 'confirmed'].map(s => `${p}_${s}`);
  nodes.push({ id: `${p}_catch`, z: tab, type: 'catch', name: `${kind}: save failed`, scope, uncaught: false, x: 800, y: y + 100, wires: [[`${p}_error`]] });
  fn('error', `${kind}: report failure and release queue`, `const message=String(msg.error?.message||'Snapshot failed');node.warn(message);msg.payload={saved:false,error:message,snapshotId:msg.stockGap?.id};delete msg.error;return msg;`, [[`${p}_finish`]], 1160, y + 100);
  nodes.push({ id: `${p}_debug`, z: tab, type: 'debug', name: `${kind}: snapshot result`, active: true, tosidebar: true, complete: 'payload', targetType: 'msg', x: 2590, y, wires: [] });
}
fs.writeFileSync(new URL('./stock-gap-saving.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log('Generated floor/car snapshot gap-saving flow.');
