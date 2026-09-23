export function getDesignProduction(rows, tileSize) {
  const normalizeSize = (value) => String(value || "").toLowerCase().replace(/\s/g, "").replace(/×/g, "x");
  const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (normalizeSize(row?.tileSize) !== normalizeSize(tileSize)) continue;
    const designCode = String(row.designCode || "Unknown").trim() || "Unknown";
    const current = grouped.get(designCode) || { designCode, previousShiftsProduction: 0, currentShiftProduction: 0, total: 0 };
    current.previousShiftsProduction += numeric(row.previousShiftsProduction);
    current.currentShiftProduction += numeric(row.currentShiftProduction);
    current.total += numeric(row.totalProduction);
    grouped.set(designCode, current);
  }
  return [...grouped.values()].sort((a, b) => b.total - a.total);
}
