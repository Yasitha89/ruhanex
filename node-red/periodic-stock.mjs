export function stockPeriod(time) {
  const offset = 330 * 60000;
  const d = new Date(time + offset), h = d.getUTCHours();
  const hour = h >= 22 ? 22 : h >= 14 ? 14 : h >= 6 ? 6 : -2;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour) - offset;
  const local = new Date(start + offset);
  const shiftDate = local.toISOString().slice(0, 10);
  const shift = ['22-06', '06-14', '14-22'][Math.floor((local.getUTCHours() + 2) / 8) % 3];
  return { start, end: start + 28800000, shiftDate, shift, id: `${shiftDate}|${shift}` };
}

export function startPeriodicStock(msg, global, flow, kind, now = Date.now()) {
  const key = `periodicStock_${kind}`;
  if (flow.get(key)?.until > now) throw Error(`Stock update already in progress; lock expires in ${Math.ceil((flow.get(key).until - now) / 1000)} seconds.`);
  if (global.get('devicesReady') !== true) throw Error('Device registry is not ready: global.devicesReady is not true.');
  if (global.get('counterRestoreReady') === false) throw Error('Counter restore is not ready: global.counterRestoreReady is false.');
  const positive = kind === 'floor' ? 'kiln' : 'glaze';
  const negative = kind === 'floor' ? 'keda' : 'kiln';
  const roles = {}, overrides = global.get(`${kind}StockDeviceRoles`) || {};
  for (const [id, cfg] of Object.entries(global.get('counterConfig') || {})) {
    if (cfg?.enabled !== true) continue;
    const line = String(cfg.line || '');
    const role = overrides[id] || (/kiln|firing/i.test(line) ? 'kiln' : /keda|sorting/i.test(line) ? 'keda' : /glaze|glazing/i.test(line) ? 'glaze' : '');
    if ([positive, negative].includes(role)) roles[id] = role;
  }
  if (![positive, negative].every(role => Object.values(roles).includes(role))) throw Error('Enabled source and destination counters are required.');
  const id = msg._msgid || `${now}-${Math.random()}`;
  flow.set(key, { id, until: now + 240000 });
  msg.stock = { kind, key, id, at: now, roles, positive, negative };
  // Only use a completed, settled shift as the immutable opening balance.
  msg.payload = [{}, { sort: { shiftEnd: -1 }, limit: 3 }];
  return msg;
}

export function queryPeriodicStock(msg) {
  const s = msg.stock;
  if (!Array.isArray(msg.payload)) throw Error('Invalid opening stock response.');
  s.previous = msg.payload.find(d => d.status === 'completed' && Date.parse(d.shiftEnd) <= s.at - 600000 && (d.schema !== 2 || d.settled === true)) || null;
  const provisional = msg.payload.filter(d => d.schema === 2 && Number.isFinite(Date.parse(d.shiftStart)));
  s.manualOpenings = Object.fromEntries(provisional.filter(d => d.manualOpeningStocks).map(d => [d._id, d.manualOpeningStocks]));
  s.from = s.previous ? Date.parse(s.previous.shiftEnd) : provisional.length ? Math.min(...provisional.map(d => Date.parse(d.shiftStart))) : stockPeriod(s.at).start;
  if (!Number.isFinite(s.from) || s.from > s.at || stockPeriod(s.from).start !== s.from) throw Error('Invalid previous stock shift boundary.');
  // Process a bounded chronological batch after a long outage; later ticks continue it.
  s.to = Math.min(s.at, s.from + 7 * 86400000);
  if (s.to <= s.from) return null;
  msg.query = `from(bucket:"RCLH")
|> range(start:time(v:${JSON.stringify(new Date(s.from).toISOString())}),stop:time(v:${JSON.stringify(new Date(s.to).toISOString())}))
|> filter(fn:(r)=>r._measurement=="tile_events" and r._field=="count_delta")
|> filter(fn:(r)=>contains(value:r.device,set:${JSON.stringify(Object.keys(s.roles))}))
|> map(fn:(r)=>({r with tileSize:if exists r.tileSize then r.tileSize else "unknown"}))
|> group(columns:["device","tileSize"])
|> aggregateWindow(every:8h,offset:30m,fn:sum,createEmpty:false)
|> keep(columns:["device","tileSize","_time","_value"])`;
  delete msg.payload;
  return msg;
}

export function calculatePeriodicStock(msg) {
  const s = msg.stock;
  if (!Array.isArray(msg.payload)) throw Error('Invalid Influx stock response.');
  const area = size => { const p = size.split('x').map(Number); return p.length === 2 && p.every(n => Number.isFinite(n) && n > 0) ? p[0] * p[1] / 10000 : 0; };
  const normal = size => String(size || '').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
  const balances = new Map(), buckets = new Map();
  for (const row of s.previous?.stocks || []) {
    const size = normal(row.tileSize), value = Number(row.closingStock);
    if (!area(size) || !Number.isFinite(value) || value < 0) throw Error('Invalid opening stock balance.');
    balances.set(size, value);
  }
  for (const row of msg.payload) {
    const size = normal(row.tileSize), value = Number(row._value);
    let end = Date.parse(row._time);
    const role = s.roles[row.device];
    // Accept both scheduled-end and query-stop labels for the final partial window.
    const latestEnd = stockPeriod(s.to - 1).end;
    if (end === s.to && s.to < latestEnd) end = latestEnd;
    if (!area(size) || !Number.isFinite(value) || value < 0 || !role || !Number.isFinite(end) || end <= s.from || end > latestEnd || (end - s.from) % 28800000 !== 0) throw Error('Invalid stock event size, count or shift bucket; no stock written.');
    if (!buckets.has(end)) buckets.set(end, new Map());
    const bucket = buckets.get(end), totals = bucket.get(size) || { incoming: 0, outgoing: 0 };
    totals[role === s.positive ? 'incoming' : 'outgoing'] += value;
    bucket.set(size, totals);
  }
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const documents = [];
  let previousId = s.previous?._id || null;
  for (let start = s.from; start < s.to; start += 28800000) {
    const period = stockPeriod(start), bucket = buckets.get(period.end) || new Map();
    for (const [size, count] of Object.entries(s.manualOpenings?.[period.id] || {})) {
      if (!area(size) || !Number.isFinite(count) || count < 0) throw Error('Invalid manual opening stock.');
      balances.set(size, count);
    }
    const sizes = new Set([...balances.keys(), ...bucket.keys()]);
    const stocks = [...sizes].sort().map(tileSize => {
      const openingStock = balances.get(tileSize) || 0;
      const delta = bucket.get(tileSize) || { incoming: 0, outgoing: 0 };
      const rawClosingStock = openingStock + delta.incoming - delta.outgoing;
      const closingStock = Math.max(0, rawClosingStock);
      balances.set(tileSize, closingStock);
      return { tileSize, openingStock, [s.kind === 'floor' ? 'kilnOutput' : 'glazeOutput']: delta.incoming,
        [s.kind === 'floor' ? 'kedaOutput' : 'kilnOutput']: delta.outgoing, rawClosingStock, closingStock,
        zeroClampAdjustment: Math.max(0, -rawClosingStock), clampedToZero: rawClosingStock < 0,
        closingStockM2: round(closingStock * area(tileSize)) };
    });
    documents.push({ _id: period.id, schema: 2, shiftDate: period.shiftDate, shift: period.shift,
      shiftStart: new Date(start).toISOString(), shiftEnd: new Date(period.end).toISOString(),
      status: period.end <= s.at ? 'completed' : 'live', settled: period.end <= s.at - 600000,
      calculationFrom: new Date(start).toISOString(), calculationTo: new Date(Math.min(period.end, s.to)).toISOString(),
      previousSnapshotId: previousId, openingStockInitializedToZero: !s.previous,
      expectedDevices: Object.keys(s.roles), deviceRoles: s.roles, stocks,
      [s.kind === 'floor' ? 'totalFloorStockM2' : 'totalCarStockM2']: round(stocks.reduce((sum, row) => sum + row.closingStockM2, 0)),
      source: 'periodic-influx-count-delta', calculatedAt: new Date(s.at).toISOString() });
    previousId = period.id;
  }
  msg.stockDocuments = documents;
  msg.payload = [documents.map(({ _id, ...fields }) => ({ updateOne: {
    filter: { _id, $or: [{ calculatedAt: { $lte: new Date(s.at).toISOString() } }, { calculatedAt: { $exists: false } }] },
    update: { $set: fields }, upsert: true
  } })), { ordered: true }];
  return msg;
}
