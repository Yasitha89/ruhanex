// Prefer the saved size breakdown; code runs are an alternative, never additive.
export function getSizeProduction(stats = {}) {
  const rows = [stats.sizeWiseProduction, stats.codeWiseProduction, stats.codeWiseProductionTimeline]
    .find(value => Array.isArray(value) && value.length);
  if (!rows) {
    if (stats.multipleTileSizes || stats.tileSizes?.length > 1) return [];
    return stats.tileSize ? [{ tileSize: stats.tileSize, tileCount: stats.tileCount ?? stats.shiftCount ?? 0, production: stats.production ?? stats.productionSqm ?? null }] : [];
  }
  const sizes = new Map();
  for (const row of rows) {
    if (!row) continue;
    const tileSize = String(row.tileSize || row.size || 'Unknown').trim() || 'Unknown';
    const current = sizes.get(tileSize) || { tileSize, tileCount: 0, production: 0 };
    current.tileCount += Number(row.tileCount) || 0;
    current.production += Number(row.production) || 0;
    sizes.set(tileSize, current);
  }
  return [...sizes.values()];
}
