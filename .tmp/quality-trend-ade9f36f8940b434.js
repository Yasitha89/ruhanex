function calculateLiveQuality(rows, grades) {
  if (!Array.isArray(rows) || !Array.isArray(grades)) throw Error('Invalid quality events or grade catalogue.');
  const key = v => String(v || '').trim().toLowerCase();
  const categories = new Map();
  for (const g of grades) { const k = key(g.grade); if (!k) continue; if (categories.has(k)) throw Error('Duplicate grade name in catalogue.'); categories.set(k, String(g.category ?? '').trim()); }
  const totals = { totalBoxes: 0, totalTiles: 0, firstBoxes: 0, firstTiles: 0, normalDamageBoxes: 0, normalDamageTiles: 0, cutDamageBoxes: 0, cutDamageTiles: 0, undetectedBoxes: 0, undetectedTiles: 0, unclassifiedBoxes: 0, unclassifiedTiles: 0 };
  const segments = [];
  for (const row of rows) {
    const factor = Number(row.tiles_per_box), map = JSON.parse(row.design_grades_json);
    if (!Number.isSafeInteger(factor) || factor <= 0 || !map || typeof map !== 'object' || Array.isArray(map)) throw Error('Invalid saved quality tiles-per-box or grade assignments.');
    const segment = { device: row.device, designCode: row.design_code, tileSize: row.tile_size, tilesPerBox: factor, totalBoxes: 0, totalTiles: 0 };
    for (let grade = 0; grade < 16; grade++) {
      const boxes = Number(row[`grade_${grade}_delta`]);
      if (!Number.isSafeInteger(boxes) || boxes < 0) throw Error('Invalid saved quality box delta.');
      const tiles = boxes * factor; if (!Number.isSafeInteger(tiles)) throw Error('Quality tile count exceeds safe integer range.');
      const category = grade === 0 ? 'undetected' : categories.get(key(map[String(grade)]));
      const label = category === '1' ? 'first' : category === '2' ? 'normalDamage' : category === '3' ? 'cutDamage' : grade === 0 ? 'undetected' : 'unclassified';
      totals.totalBoxes += boxes; totals.totalTiles += tiles;
      totals[label + 'Boxes'] += boxes; totals[label + 'Tiles'] += tiles;
      segment.totalBoxes += boxes; segment.totalTiles += tiles;
    }
    segments.push(segment);
  }
  if (!Number.isSafeInteger(totals.totalTiles) || !Number.isSafeInteger(totals.totalBoxes)) throw Error('Quality total exceeds safe integer range.');
  const pct = tiles => totals.totalTiles > 0 ? Math.round(tiles / totals.totalTiles * 10000) / 100 : null;
  return {
    ...totals, firstQuality: pct(totals.firstTiles), normalDamageQuality: pct(totals.normalDamageTiles), cutDamageQuality: pct(totals.cutDamageTiles), undetectedPercent: pct(totals.undetectedTiles), unclassifiedPercent: pct(totals.unclassifiedTiles), segments,
    qualityAvailable: totals.totalTiles > 0, classificationComplete: totals.unclassifiedTiles === 0,
    categorySource: 'current-designGrades-catalogue', countSource: 'quality_events-grade-deltas'
  };
}
function applyLiveQuality(response, details) {
  response.qualityDetails = details;
  response.qualityAvailable = details.qualityAvailable === true;
  response.qualityAssumed = details.qualityAssumed === true;
  const noOutput = details.status === 'no-tracked-quality-tiles' && details.totalTiles === 0;
  response.totalQualityTiles = details.qualityAvailable || noOutput ? details.totalTiles : null;
  response.firstQuality = response.qualityAssumed ? 100 : details.qualityAvailable ? details.firstQuality : noOutput ? 0 : null;
  response.normalDamageQuality = details.qualityAvailable ? details.normalDamageQuality : noOutput ? 0 : null;
  response.cutDamageQuality = details.qualityAvailable ? details.cutDamageQuality : noOutput ? 0 : null;
  response.quality = response.firstQuality;
  response.ole = response.quality === null || noOutput ? null : Math.round(Number(response.availability) * Number(response.performance) * response.quality / 100) / 100;
  return response;
}
function finishLiveQuality(msg) {
  const details = calculateLiveQuality(msg.payload, msg.liveQualityGrades);
  details.device = msg.liveQualityDevice;
  details.shift = msg.liveQualityResponse.currentShift; details.shiftDate = msg.liveQualityResponse.shiftDate;
  details.status = details.qualityAvailable ? 'available' : 'no-tracked-quality-tiles';
  msg.payload = applyLiveQuality(msg.liveQualityResponse, details);
  delete msg.liveQualityResponse; delete msg.liveQualityGrades;
  return msg;
}
return finishLiveQuality(msg);