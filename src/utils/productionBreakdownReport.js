export const PRODUCTION_CATEGORIES = {
  green: { label: 'Green Tile Production', lines: ['Glaze Line 1', 'Glaze Line 2', 'Glaze Line 3'] },
  sorted: { label: 'Sorted Tile Production', lines: ['Keda 1', 'Keda 2', 'Keda 3'] },
  kiln: { label: 'Kiln Production', lines: ['Kiln 1', 'Kiln 2', 'Kiln 3'] },
};
const sizeOf = row => String(row.tileSize || row.size || 'Unknown').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
const value = n => n != null && n !== '' && Number.isFinite(Number(n)) ? Number(n) : null;

export function buildProductionBreakdown(results, fromDate, toDate, byDesign) {
  const groups = new Map(), warnings = new Set();
  const add = (month, line, size, design, tiles, production) => {
    const key = JSON.stringify([month, line, size, design]);
    const row = groups.get(key) || { key, month, line, tileSize: size, designCode: design, tileCount: 0, production: 0 };
    row.tileCount = row.tileCount === null || tiles === null ? null : row.tileCount + tiles;
    row.production += production;
    groups.set(key, row);
  };
  for (const { line, month, data } of results) {
    if (!Array.isArray(data?.days)) { warnings.add(`${line}, ${month}: daily breakdown unavailable.`); continue; }
    for (const day of data.days) {
      if (day.date < fromDate || day.date > toDate || !day.date.startsWith(month)) continue;
      const shifts = new Map();
      for (const shift of day.shifts || []) shifts.set(shift.shift, shift);
      for (const shift of shifts.values()) {
        if (shift.productionComplete === false) warnings.add('Some shifts have incomplete or unreconciled size/count records.');
        const codes = (Array.isArray(shift.codeWiseProduction) ? shift.codeWiseProduction : []).filter(Boolean);
        const sizes = Array.isArray(shift.sizes) && shift.sizes.length ? shift.sizes : shift.sizeWiseProduction;
        if (byDesign && codes.length) {
          for (const code of codes) add(month, line, sizeOf(code), String(code.designCode || 'Unassigned').trim(), value(code.tileCount), value(code.production) ?? 0);
          // Preserve production lacking a design assignment, without attributing it to another code.
          if (Array.isArray(sizes)) for (const size of sizes) {
            const matched = codes.filter(code => sizeOf(code) === sizeOf(size));
            const remaining = (value(size.production) ?? 0) - matched.reduce((sum, code) => sum + (value(code.production) ?? 0), 0);
            if (remaining < -0.02) warnings.add('Some design totals exceed their saved size totals; design figures require reconciliation.');
            if (remaining > 0.02) {
              const count = value(size.tileCount);
              const tiles = count !== null && matched.every(code => value(code.tileCount) !== null) ? Math.max(0, count - matched.reduce((sum, code) => sum + Number(code.tileCount), 0)) : null;
              add(month, line, sizeOf(size), 'Unassigned', tiles, remaining);
              warnings.add('Production without design details is shown as Unassigned.');
            }
          }
        } else if (Array.isArray(sizes) && sizes.length) {
          for (const size of sizes) add(month, line, sizeOf(size), byDesign ? 'Unassigned' : '', value(size.tileCount), value(size.production) ?? 0);
          if (byDesign && Number(shift.production) > 0) warnings.add('Production without design details is shown as Unassigned.');
        } else if (codes.length) {
          for (const code of codes) add(month, line, sizeOf(code), '', value(code.tileCount), value(code.production) ?? 0);
        } else if (Number(shift.production) > 0) {
          add(month, line, 'Unknown', byDesign ? 'Unassigned' : '', value(shift.tileCount), Number(shift.production));
          warnings.add('Some production has no saved size breakdown and is shown as Unknown.');
        }
      }
    }
  }
  return { rows: [...groups.values()].sort((a, b) => a.month.localeCompare(b.month) || a.line.localeCompare(b.line) || b.production - a.production), warnings: [...warnings] };
}
