// Clip display boundaries to the included daily hours; energy values are unchanged.
export function clipEnergyWindowInterval(record, window, fromTime, toTime) {
  if (!window) return record;
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(window.start) || !clock.test(window.end) || window.start === window.end) return record;
  const originalStart = Date.parse(record.intervalStart);
  const originalEnd = Date.parse(record.intervalEnd);
  const start = Math.max(originalStart, Number.isFinite(Date.parse(fromTime)) ? Date.parse(fromTime) : originalStart);
  const end = Math.min(originalEnd, Number.isFinite(Date.parse(toTime)) ? Date.parse(toTime) : originalEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return record;
  const minute = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const firstMinute = minute(window.start), lastMinute = minute(window.end);
  const offset = 330 * 60000, day = 86400000;
  const firstDay = Math.floor((start + offset) / day) * day - offset;
  let clippedStart = Infinity, clippedEnd = -Infinity;
  for (let midnight = firstDay; midnight < end; midnight += day) {
    const segments = firstMinute < lastMinute
      ? [[midnight + firstMinute * 60000, midnight + lastMinute * 60000]]
      : [[midnight, midnight + lastMinute * 60000], [midnight + firstMinute * 60000, midnight + day]];
    for (const [a, b] of segments) {
      const left = Math.max(start, a), right = Math.min(end, b);
      if (left < right) { clippedStart = Math.min(clippedStart, left); clippedEnd = Math.max(clippedEnd, right); }
    }
  }
  if (!Number.isFinite(clippedStart)) return record;
  return { ...record, intervalStart: new Date(clippedStart).toISOString(), intervalEnd: new Date(clippedEnd).toISOString() };
}
