export function sumHistoricalStock(documents, period, options = {}) {
  if (!Array.isArray(documents)) throw Error('Invalid shifts response.');
  const size = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
  const totals = { glaze: 0, kiln: 0, keda: 0 }, seen = new Set();
  let first = null, last = null, matchedDocuments = 0;
  const from = options.from ? Date.parse(options.from) : -Infinity;
  if (options.from && !Number.isFinite(from)) throw Error('Invalid history start date.');
  for (const doc of documents) {
    const s = doc.lineStats;
    if (!s) continue;
    const start = Date.parse(s.shiftStart);
    const end = Date.parse(s.shiftEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw Error('A shift summary has invalid shiftStart/shiftEnd.');
    if (end > period.start || end <= from) continue;
    if (start < from) throw Error('History start must align to a shift boundary.');
    const line = String(s.lineName || '');
    const role = /kiln|firing/i.test(line) ? 'kiln' : /keda|sorting/i.test(line) ? 'keda' : /glaze|glazing/i.test(line) ? 'glaze' : '';
    if (!role) continue;
    const identity = JSON.stringify([s.device || line, start, end]);
    if (seen.has(identity)) throw Error('Duplicate shift summaries found; resolve duplicates before correction.');
    seen.add(identity);
    const rows = Array.isArray(s.sizeWiseProduction) && s.sizeWiseProduction.length ? s.sizeWiseProduction : Array.isArray(s.codeWiseProduction) && s.codeWiseProduction.length ? s.codeWiseProduction : s.multipleTileSizes ? null : [{ tileSize: s.tileSize, tileCount: s.tileCount }];
    if (!rows) throw Error('A multi-size shift has no size-wise or code-wise production.');
    for (const row of rows) {
      if (size(row.tileSize) !== '60x30') continue;
      const count = Number(row.tileCount);
      if (row.tileCount == null || !Number.isSafeInteger(count) || count < 0) throw Error('Invalid 60x30 tile count in shift summary.');
      totals[role] += count;
    }
    first = first === null ? start : Math.min(first, start);
    last = last === null ? end : Math.max(last, end);
    matchedDocuments++;
  }
  if (!matchedDocuments || !totals.kiln) throw Error('No usable historical kiln production found. Check the history range.');
  const floorInitial = Number(options.floorOpening || 0), carInitial = Number(options.carOpening || 0);
  if (![floorInitial, carInitial].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('Opening balances must be nonnegative tile counts.');
  return { totals, matchedDocuments, historyFrom: new Date(first).toISOString(), historyTo: new Date(last).toISOString(),
    floorRaw: floorInitial + totals.kiln - totals.keda, carRaw: carInitial + totals.glaze - totals.kiln,
    floorOpening: Math.max(0, floorInitial + totals.kiln - totals.keda), carOpening: Math.max(0, carInitial + totals.glaze - totals.kiln) };
}

export function buildManualStockUpdate(doc, history, kind, now = Date.now()) {
  if (!doc || !Array.isArray(doc.stocks)) throw Error(`Current ${kind} stock document is missing; run the periodic stock flow first.`);
  const opening = history[kind + 'Opening'];
  const input = kind === 'floor' ? 'kilnOutput' : 'glazeOutput', output = kind === 'floor' ? 'kedaOutput' : 'kilnOutput';
  // MongoDB stock rows contain scalar fields; copy each row without sandbox globals.
  const stocks = doc.stocks.map(stock => ({ ...stock }));
  let row = stocks.find(r => String(r.tileSize || '').replace(/\s+/g, '').replace(/×/g, 'x').toLowerCase() === '60x30');
  if (!row) throw Error(`Current ${kind} document has no 60x30 entry; current-shift movements must be available before correction.`);
  if (![row[input], row[output]].every(v => v != null && Number.isSafeInteger(Number(v)) && Number(v) >= 0)) throw Error('Invalid current-shift stock movements.');
  const before = { ...row };
  const raw = opening + Number(row[input]) - Number(row[output]);
  Object.assign(row, { openingStock: opening, rawClosingStock: raw, closingStock: Math.max(0, raw), closingStockM2: Math.round(Math.max(0, raw) * 18) / 100,
    zeroClampAdjustment: Math.max(0, -raw), clampedToZero: raw < 0 });
  const total = stocks.reduce((sum, r) => {
    const value = Number(r.closingStockM2);
    if (!Number.isFinite(value)) throw Error('Invalid stock m² value.');
    return sum + value;
  }, 0);
  return { filter: { _id: doc._id, stocks: { $eq: doc.stocks }, calculatedAt: doc.calculatedAt },
    update: { $set: { stocks, [`manualOpeningStocks.60x30`]: opening,
      [kind === 'floor' ? 'totalFloorStockM2' : 'totalCarStockM2']: Math.round(total * 100) / 100,
      manualCorrection: { at: new Date(now).toISOString(), tileSize: '60x30', before, after: row, history } } },
    preview: { kind, shiftId: doc._id, before, after: row, history } };
}
