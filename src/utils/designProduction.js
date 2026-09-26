export function getDesignProduction(rows, tileSize) {
  const normalizeSize = (value) => String(value || "").toLowerCase().replace(/\s/g, "").replace(/×/g, "x");
  const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const sequence = (row) => row.sequence != null && Number.isFinite(Number(row.sequence))
    ? Number(row.sequence) : Infinity;
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && normalizeSize(row.tileSize) === normalizeSize(tileSize))
    .map((row) => ({
      ...row,
      designCode: String(row.designCode || "Unknown").trim() || "Unknown",
      total: numeric(row.totalProduction),
    }))
    .sort((a, b) => sequence(a) - sequence(b));
}
