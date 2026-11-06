export const temperatureNumber = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
export function mergeTemperatureSeries(previous, incoming, start, end) {
  const rows = new Map();
  for (const row of [...previous, ...incoming]) {
    const timestamp = typeof row.timestamp === 'number' ? row.timestamp : Date.parse(row.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp >= end) continue;
    rows.set(timestamp, { timestamp, pv: temperatureNumber(row.pv), sv: temperatureNumber(row.sv) });
  }
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-5000);
}

export function temperatureChartPoints(rows, field, bucketMs) {
  const points = [];
  for (let index = 0; index < rows.length; index++) {
    if (index && rows[index].timestamp - rows[index - 1].timestamp > bucketMs * 3) points.push([rows[index - 1].timestamp + bucketMs, null]);
    points.push([rows[index].timestamp, rows[index][field]]);
  }
  return points;
}
