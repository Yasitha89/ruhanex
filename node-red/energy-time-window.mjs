// Self-contained helpers embedded into the existing API Function nodes.
export function validateWindow(msg) {
  const q = msg.req?.query || {};
  if (q.daily_start == null && q.daily_end == null) return null;
  const fail = error => { msg.statusCode = 400; msg.payload = { success: false, error }; msg.headers = { 'Content-Type': 'application/json' }; return [null, msg]; };
  const start = String(q.daily_start || ''), end = String(q.daily_end || '');
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!clock.test(start) || !clock.test(end) || start === end) return fail('Supply different daily_start and daily_end in HH:mm format.');
  if (q.timezone && q.timezone !== 'Asia/Colombo') return fail('Only Asia/Colombo timezone is supported.');
  const ids = String(q.device_ids || '').split(',').map(s => s.trim());
  if (!ids.length || ids.length > 12 || ids.some(id => !/^\d{1,3}$/.test(id) || Number(id) < 1 || Number(id) > 247)) return fail('Select 1–12 device_ids between 1 and 247.');
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
  const from = Date.parse(q.from_time), to = Date.parse(q.to_time);
  if (!iso.test(q.from_time || '') || !iso.test(q.to_time || '') || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 366 * 86400000) return fail('Use ISO timestamps with timezone and a range of at most 366 days.');
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  msg.energyTimeWindow = { start, end, startMinute: minutes(start), endMinute: minutes(end), timezone: 'Asia/Colombo', wrapsMidnight: start > end };
  return null;
}

export function applyWindow(msg) {
  const w = msg.energyTimeWindow;
  if (!w) return msg;
  const request = msg.energyRequest;
  const from = Date.parse(request.fromTime), to = Date.parse(request.toTime);
  const offset = 330 * 60000, day = 86400000;
  const firstDay = Math.floor((from + offset) / day) * day - offset;
  const startDateNights = w.wrapsMidnight && (from + offset) % day === 0 && (to + offset) % day === 0;
  const ranges = [];
  for (let midnight = firstDay; midnight < to; midnight += day) {
    const segments = startDateNights
      ? [[midnight + w.startMinute * 60000, midnight + day + w.endMinute * 60000]]
      : w.wrapsMidnight
      ? [[midnight, midnight + w.endMinute * 60000], [midnight + w.startMinute * 60000, midnight + day]]
      : [[midnight + w.startMinute * 60000, midnight + w.endMinute * 60000]];
    for (const [a, b] of segments) {
      const start = Math.max(from, a), end = Math.min(to, b);
      if (start < end) ranges.push([start, end]);
    }
  }
  if (startDateNights && ranges.length) {
    request.selectedFromTime = request.fromTime; request.selectedToTime = request.toTime;
    request.fromTime = new Date(ranges[0][0]).toISOString();
    request.toTime = new Date(ranges[ranges.length - 1][1]).toISOString();
  }
  const fixedMs = request.interval === '1h' ? 3600000 : request.interval === '6h' ? 21600000 : 0;
  const calendar = ['1mo', '1y'].includes(request.interval);
  const periodBounds = new Map();
  const periodKey = start => new Date(start + offset).toISOString().slice(0, request.interval === '1y' ? 4 : 7);
  if (calendar) for (const [start, end] of ranges) {
    const key = periodKey(start), bounds = periodBounds.get(key) || [start, end];
    periodBounds.set(key, [Math.min(bounds[0], start), Math.max(bounds[1], end)]);
  }
  const meterFilter = request.deviceIds.map(id => `r.device_id == ${JSON.stringify(String(id))}`).join(' or ');
  const definitions = ranges.map(([start, end], i) => {
    const [labelStart, labelEnd] = calendar ? periodBounds.get(periodKey(start)) : [start, end];
    const iso = time => `time(v:${JSON.stringify(new Date(time).toISOString())})`;
    const bucketOffset = fixedMs ? ((start % fixedMs) + fixedMs) % fixedMs : 0;
    const aggregate = fixedMs
      ? `|> aggregateWindow(every:${request.interval},offset:${bucketOffset}ms,location:timezone.location(name:"UTC"),fn:sum,createEmpty:false,timeSrc:"_start")
 |> map(fn:(r)=>({r with _time:if r._time < ${iso(start)} then ${iso(start)} else r._time,windowEnd:if date.add(d:${request.interval},to:r._time)>${iso(end)} then ${iso(end)} else date.add(d:${request.interval},to:r._time)}))`
      : `|> sum(column:"_value")
 |> map(fn:(r)=>({r with _time:${iso(labelStart)},windowEnd:${iso(labelEnd)}}))`;
    return `window${i} = from(bucket:"energy_monitoring")
 |> range(start:time(v:${JSON.stringify(new Date(start).toISOString())}),stop:time(v:${JSON.stringify(new Date(end).toISOString())}))
 |> filter(fn:(r)=>r._measurement=="energy_data" and r._field=="energy_increment_kwh" and r.panel==${JSON.stringify(request.panel)} and (${meterFilter}))
 |> filter(fn:(r)=>r._value >= 0.0)
 |> group(columns:["panel","device_id"])
 ${aggregate}
 |> keep(columns:["_time","panel","device_id","_value","windowEnd"])`;
  }).join('\n\n');
  // An empty source handles outer ranges that do not intersect the selected hours.
  const source = ranges.length > 1 ? `union(tables:[${ranges.map((_, i) => `window${i}`).join(',')}])` : ranges.length ? 'window0' : `from(bucket:"energy_monitoring") |> range(start:time(v:${JSON.stringify(request.fromTime)}),stop:time(v:${JSON.stringify(request.toTime)})) |> filter(fn:(r)=>false)`;
  msg.query = `import "date"
import "timezone"
option location = timezone.location(name:"Asia/Colombo")
${definitions}
${source}
 |> group(columns:["panel","device_id","_time","windowEnd"])
 |> sum(column:"_value")
 |> map(fn:(r)=>({panel:r.panel,device_id:r.device_id,_time:r._time,intervalStart:r._time,intervalEnd:r.windowEnd,energyUsageKwh:r._value}))
 |> group(columns:[])
 |> sort(columns:["_time","panel","device_id"])`;
  msg.energyRequest.dailyWindow = { start: w.start, end: w.end, timezone: w.timezone, wrapsMidnight: w.wrapsMidnight, startInclusive: true, endExclusive: true };
  msg.energyRequest.dailyWindow.intervalBasis = 'selected-window';
  if (startDateNights) msg.energyRequest.dailyWindow.dateBasis = 'overnight-start-date';
  return msg;
}

export function summariseWindow(msg, rawRows, global) {
  if (!msg.energyRequest?.dailyWindow) return msg;
  const request = msg.energyRequest, data = msg.payload;
  const sums = new Map();
  for (const row of rawRows) {
    const value = Number(row.energyUsageKwh);
    if (!Number.isFinite(value) || value < 0) continue;
    const id = Number(row.device_id);
    sums.set(id, (sums.get(id) || 0) + value);
  }
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const config = global.get('energyDeviceConfig') || {};
  data.dailyWindow = request.dailyWindow;
  if (request.selectedFromTime) { data.selectedFromTime = request.selectedFromTime; data.selectedToTime = request.selectedToTime; }
  data.byMeter = request.deviceIds.map(id => {
    const label = config[request.panel]?.[id];
    return { panel: request.panel, device_id: id,
      device_label: typeof label === 'string' ? label : label?.deviceLabel || label?.label || `Device ${id}`,
      energyUsageKwh: sums.has(id) ? round(sums.get(id)) : null, hasData: sums.has(id) };
  });
  data.totalEnergyUsageKwh = sums.size ? round([...sums.values()].reduce((a, b) => a + b, 0)) : null;
  data.missingMeters = request.deviceIds.filter(id => !sums.has(id));
  data.asOf = new Date().toISOString();
  data.method = 'Sum accepted energy_increment_kwh samples timestamped within the selected daily window before aggregation.';
  data.warnings = ['Sample timestamps determine window membership; boundary-spanning meter increments are not prorated. Missing telemetry cannot be measured from energy increments alone.'];
  return msg;
}
