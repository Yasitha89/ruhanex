export function qualityReportDocument(doc, now = Date.now()) {
  const s = doc?.lineStats;
  if (!/^Keda [123]$/.test(s?.lineName || '')) throw Error('Quality reports are only supported for Keda 1, Keda 2 and Keda 3.');
  if (!s || !s.lineName || !s.shiftDate || !['06-14','14-22','22-06'].includes(s.shift) || !s.qualityUpdatedAt) throw Error('Missing saved shift quality identity/version.');
  if (!Number.isFinite(Date.parse(s.qualityUpdatedAt))) throw Error('Invalid quality version timestamp.');
  const totals = s.qualitySummary || null;
  const segments = totals?.gradeSegments;
  const catalogue = s.qualityCatalogueSnapshot || [];
  const definitions = new Map(catalogue.map(g => [String(g.grade || '').trim().toLowerCase(), g]));
  const products = new Map();
  if (Array.isArray(segments)) for (const segment of segments) {
    if (!Array.isArray(segment.gradeBoxes) || segment.gradeBoxes.length !== 16 || !Number.isSafeInteger(segment.tilesPerBox) || segment.tilesPerBox <= 0) throw Error('Invalid saved grade segment.');
    const key = JSON.stringify([segment.designCode, segment.tileSize]);
    if (!products.has(key)) products.set(key, { designCode: segment.designCode, tileSize: segment.tileSize, totalBoxes: 0, totalTiles: 0, firstTiles: 0, normalDamageTiles: 0, cutDamageTiles: 0, undetectedTiles: 0, unclassifiedTiles: 0, grades: new Map() });
    const product = products.get(key);
    segment.gradeBoxes.forEach((boxes, gradeNumber) => {
      if (!Number.isSafeInteger(boxes) || boxes < 0) throw Error('Invalid grade box count.');
      const tiles = boxes * segment.tilesPerBox;
      if (!Number.isSafeInteger(tiles)) throw Error('Invalid grade tile count.');
      product.totalBoxes += boxes; product.totalTiles += tiles;
      const grade = gradeNumber === 0 ? null : segment.designGrades?.[String(gradeNumber)] || null;
      const definition = definitions.get(String(grade || '').trim().toLowerCase());
      const category = gradeNumber === 0 ? null : Number(definition?.category);
      const label = gradeNumber === 0 ? 'undetected' : category === 1 ? 'first' : category === 2 ? 'normalDamage' : category === 3 ? 'cutDamage' : 'unclassified';
      product[label + 'Tiles'] += tiles;
      if (!boxes) return;
      const gradeKey = JSON.stringify([gradeNumber, grade, category]);
      if (!product.grades.has(gradeKey)) product.grades.set(gradeKey, { gradeNumber, grade, description: definition?.description || '', category: [1,2,3].includes(category) ? category : null, boxes: 0, tiles: 0 });
      const row = product.grades.get(gradeKey); row.boxes += boxes; row.tiles += tiles;
    });
  }
  const pct = (n,d) => d > 0 ? Math.round(n / d * 10000) / 100 : null;
  const designs = [...products.values()].map(p => ({ ...p, grades: [...p.grades.values()], firstQuality: pct(p.firstTiles,p.totalTiles), normalDamageQuality: pct(p.normalDamageTiles,p.totalTiles), cutDamageQuality: pct(p.cutDamageTiles,p.totalTiles) }));
  if (Array.isArray(segments) && (designs.reduce((n,p)=>n+p.totalTiles,0)!==totals.totalTiles || designs.reduce((n,p)=>n+p.totalBoxes,0)!==totals.totalBoxes)) throw Error('Saved quality segment totals disagree.');
  return { _id: JSON.stringify([s.lineName,s.shiftDate,s.shift]), schema: 1, line: s.lineName, shiftDate: s.shiftDate, shift: s.shift,
    shiftStart: s.shiftStart, shiftEnd: s.shiftEnd, productionDevice: s.device, qualitySensorDevice: s.qualitySensorDevice || null,
    sourceShiftId: String(doc._id), sourceQualityUpdatedAt: s.qualityUpdatedAt, source: 'saved-shift-summary',
    status: s.qualityStatus || 'unavailable', settled: s.directQualitySettled === true, qualityAvailable: s.qualityAvailable === true, qualityAssumed: s.qualityAssumed === true,
    quality: s.quality ?? null, firstQuality: s.firstQuality ?? null, normalDamageQuality: s.normalDamageQuality ?? null, cutDamageQuality: s.cutDamageQuality ?? null,
    totalBoxes: totals?.totalBoxes ?? null, totalTiles: totals?.totalTiles ?? null,
    firstTiles: totals?.firstTiles ?? null, normalDamageTiles: totals?.normalDamageTiles ?? null, cutDamageTiles: totals?.cutDamageTiles ?? null,
    undetectedTiles: totals?.undetectedTiles ?? null, unclassifiedTiles: totals?.unclassifiedTiles ?? null,
    designs, gradeBreakdownAvailable: Array.isArray(segments), codeWiseProduction: s.codeWiseProduction || [],
    gradeSegments: segments || [], gradeCatalogue: catalogue, qualitySummary: totals,
    availability: s.availability ?? null, performance: s.performance ?? null, oee: s.oee ?? s.ole ?? null,
    updatedAt: new Date(now).toISOString() };
}
