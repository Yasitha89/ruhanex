return (function buildStockGap(msg) {
  const f = msg.stockGap;
  if (!Array.isArray(msg.payload)) throw Error('Influx did not return an array.');
  const step = 8 * 3600000;
  const normal = size => String(size || '').trim().toLowerCase().replace(/\s+/g, '').replace(/Ã—/g, 'x');
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
})(msg);