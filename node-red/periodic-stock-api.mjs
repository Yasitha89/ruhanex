export function stockSnapshotResponse(msg, kind, now = Date.now()) {
  if (!Array.isArray(msg.payload)) throw Error('Invalid stock database response.');
  const doc = msg.payload[0] || null;
  if (doc && !Array.isArray(doc.stocks)) throw Error('Saved stock document has no stocks array.');
  const valueField = kind === 'floor' ? 'floorStockM2' : 'carStockM2';
  const stocks = (doc?.stocks || []).map(row => {
    const tileSize = String(row.tileSize || '').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
    const dimensions = tileSize.split('x').map(Number);
    const closing = Number(row.closingStock);
    if (dimensions.length !== 2 || !dimensions.every(v => Number.isFinite(v) && v > 0) || row.closingStock == null || !Number.isFinite(closing) || closing < 0) throw Error('Invalid tile size or closing stock in saved stock document.');
    const area = dimensions[0] * dimensions[1] / 10000;
    return { ...row, tileSize, [valueField]: Math.round((closing * area + Number.EPSILON) * 100) / 100,
      [kind === 'floor' ? 'currentFloorStock' : 'currentCarStock']: closing };
  }).sort((a, b) => a.tileSize.localeCompare(b.tileSize, undefined, { numeric: true }));
  const asOf = doc ? doc.calculationTo || doc.calculatedAt || doc.shiftEnd : null;
  if (doc && (!Number.isFinite(Date.parse(asOf)) || Date.parse(asOf) > now + 5000)) throw Error('Saved stock calculation time is invalid or in the future.');
  msg.statusCode = 200;
  msg.headers = { ...msg.headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  msg.payload = {
    success: true, source: 'mongodb-periodic-stock', status: doc?.status || 'no-data',
    shift: doc?.shift || null, shiftDate: doc?.shiftDate || null,
    currentShiftStart: doc?.shiftStart || null, asOf,
    snapshot: doc ? { id: String(doc._id), shiftDate: doc.shiftDate, shift: doc.shift, shiftStart: doc.shiftStart, shiftEnd: doc.shiftEnd } : null,
    stocks, [kind === 'floor' ? 'totalFloorStockM2' : 'totalCarStockM2']: doc ? Math.round(stocks.reduce((sum, row) => sum + row[valueField], 0) * 100) / 100 : null,
    stale: doc ? now - Date.parse(asOf) > 15 * 60000 : false, warnings: []
  };
  return msg;
}
