import fs from 'node:fs';
import { PRODUCTION_CATEGORIES, buildProductionBreakdown } from '../src/utils/productionBreakdownReport.js';

export function prepareReport(msg, global, categories) {
  let q = msg.req?.query || {};
  const fail = (status, error) => { msg.statusCode = status; msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }; msg.payload = { success: false, error }; return [null, msg]; };
  const category = categories[q.category];
  if (!category) return fail(400, 'Invalid production category.');
  let timeRange = null;
  if (q.fromTime != null || q.toTime != null) {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
    const start = Date.parse(q.fromTime), end = Date.parse(q.toTime);
    if (!iso.test(q.fromTime || '') || !iso.test(q.toTime || '') || !Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * 86400000) return fail(400, 'Supply valid fromTime/toTime with timezone, start before end, maximum 366 days.');
    if (start >= Date.now()) return fail(400, 'Start time must be in the past.');
    timeRange = { fromTime: new Date(start).toISOString(), toTime: new Date(end).toISOString() };
    q = { ...q, fromDate: new Date(start + 330 * 60000).toISOString().slice(0, 10), toDate: new Date(end - 1 + 330 * 60000).toISOString().slice(0, 10) };
  }
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(q.fromDate) || !validDate(q.toDate) || q.fromDate > q.toDate || Date.parse(q.toDate) - Date.parse(q.fromDate) >= 366 * 86400000) return fail(400, 'Select valid production dates spanning at most 366 days.');
  const lines = q.lines ? [...new Set(String(q.lines).split(',').map(line => line.trim()).filter(Boolean))] : category.lines;
  if (!lines.length || lines.some(line => !category.lines.includes(line))) return fail(400, 'Select lines belonging to the chosen category.');
  const cfg = global.get('counterConfig') || {};
  const mapping = {}, unavailableLines = [];
  for (const line of lines) {
    const matches = Object.entries(cfg).filter(([, c]) => String(c?.line || '').trim().toLowerCase() === line.toLowerCase());
    if (matches.length > 1) return fail(409, `Multiple devices are mapped to ${line}; correct the configuration first.`);
    if (!matches.length) unavailableLines.push(line); else mapping[matches[0][0]] = line;
  }
  if (!Object.keys(mapping).length) return fail(503, 'None of the selected lines has a configured counter.');
  const now = Date.now(), local = new Date(now + 330 * 60000), hour = local.getUTCHours();
  const productionDate = new Date(now + 330 * 60000 - 6 * 3600000).toISOString().slice(0, 10);
  const shift = hour >= 6 && hour < 14 ? '06-14' : hour >= 14 && hour < 22 ? '14-22' : '22-06';
  const liveStart = Date.parse(`${productionDate}T${shift === '06-14' ? '06' : shift === '14-22' ? '14' : '22'}:00:00+05:30`);
  msg.report = { category: q.category, lines, mapping, unavailableLines, fromDate: q.fromDate, toDate: q.toDate, productionDate, shift, liveStart, now,
    includeLive: q.fromDate <= productionDate && q.toDate >= productionDate };
  if (timeRange) {
    Object.assign(msg.report, timeRange, { timeMode: true });
    const firstShiftDate = new Date(Date.parse(timeRange.fromTime) + 330 * 60000 - 6 * 3600000).toISOString().slice(0, 10);
    msg.payload = [{ 'lineStats.shiftDate': { $gte: firstShiftDate, $lte: q.toDate }, $or: [{ 'lineStats.device': { $in: Object.keys(mapping) } }, { 'lineStats.lineName': { $in: Object.values(mapping) } }] }, { sort: { 'lineStats.updatedAt': -1 } }];
    return [msg, null];
  }
  msg.payload = [{ 'lineStats.shiftDate': { $gte: q.fromDate, $lte: q.toDate }, $or: [{ 'lineStats.device': { $in: Object.keys(mapping) } }, { 'lineStats.lineName': { $in: Object.values(mapping) } }] }, { sort: { 'lineStats.updatedAt': -1 } }];
  return [msg, null];
}

export function queryHybridReport(msg) {
  const r = msg.report, from = Date.parse(r.fromTime), end = Math.min(Date.parse(r.toTime), r.now);
  const step = 8 * 3600000, offset = 330 * 60000;
  const saved = new Map();
  for (const doc of Array.isArray(msg.payload) ? msg.payload : []) {
    const s = doc?.lineStats;
    if (!s) continue;
    const line = r.mapping[s.device] || Object.values(r.mapping).find(line => line === s.lineName);
    if (!line) continue;
    const key = `${line}|${s.shiftDate}|${s.shift}`;
    const stamp = Math.max(Date.parse(s.updatedAt || '') || 0, Date.parse(s.codeWiseUpdatedAt || '') || 0);
    if (!saved.has(key) || saved.get(key).stamp < stamp) saved.set(key, { doc, stamp });
  }
  const complete = [], jobs = [], coverage = { mongoShifts: 0, influxPartialShifts: 0, influxMissingShifts: 0, influxMonthBoundaryShifts: 0 };
  for (let shiftStart = Math.floor((from - 1800000) / step) * step + 1800000; shiftStart < end; shiftStart += step) {
    const shiftEnd = shiftStart + step, start = Math.max(from, shiftStart), stop = Math.min(end, shiftEnd);
    if (start >= stop) continue;
    const local = new Date(shiftStart + offset), date = local.toISOString().slice(0, 10), hour = local.getUTCHours();
    const shift = hour === 6 ? '06-14' : hour === 14 ? '14-22' : '22-06';
    const full = start === shiftStart && stop === shiftEnd && shiftEnd <= r.now;
    const crossMonth = new Date(shiftStart + offset).toISOString().slice(0, 7) !== new Date(shiftEnd - 1 + offset).toISOString().slice(0, 7);
    const devices = [];
    for (const [id, line] of Object.entries(r.mapping)) {
      const doc = saved.get(`${line}|${date}|${shift}`)?.doc;
      if (full && !crossMonth && doc) { complete.push(doc); coverage.mongoShifts++; }
      else {
        devices.push(id);
        if (!full) coverage.influxPartialShifts++;
        else if (crossMonth) coverage.influxMonthBoundaryShifts++;
        else coverage.influxMissingShifts++;
      }
    }
    if (devices.length) {
      const previous = jobs[jobs.length - 1];
      if (previous && previous.end === start && JSON.stringify(previous.devices) === JSON.stringify(devices)) previous.end = stop;
      else jobs.push({ start, end: stop, devices });
    }
  }
  r.hybrid = { complete, coverage, ranges: jobs.map(job => ({ from: new Date(job.start).toISOString(), to: new Date(job.end).toISOString(), devices: job.devices })) };
  r.effectiveToTime = new Date(end).toISOString();
  if (!jobs.length) { msg.payload = []; return [null, msg]; }
  const queries = jobs.map((job, i) => `part${i}=from(bucket:"RCLH")
 |> range(start:time(v:${JSON.stringify(new Date(job.start).toISOString())}),stop:time(v:${JSON.stringify(new Date(job.end).toISOString())}))
 |> filter(fn:(r)=>r._measurement=="tile_events" and r._field=="count_delta")
 |> filter(fn:(r)=>contains(value:r.device,set:${JSON.stringify(job.devices)}))
 |> filter(fn:(r)=>r._value>0)
 |> map(fn:(r)=>({r with tileSize:if exists r.tileSize then r.tileSize else "Unknown",designCode:if exists r.designCode then r.designCode else "Unassigned",month:string(v:date.truncate(t:r._time,unit:1mo))}))
 |> group(columns:["device","tileSize","designCode","month"])
 |> sum(column:"_value")
 |> keep(columns:["device","tileSize","designCode","month","_value"])`).join('\n');
  msg.query = `import "date"
import "timezone"
option location=timezone.location(name:"Asia/Colombo")
${queries}
${jobs.length === 1 ? 'part0' : `union(tables:[${jobs.map((_, i) => `part${i}`).join(',')}])`}
 |> group(columns:["device","tileSize","designCode","month"])
 |> sum(column:"_value")`;
  return [msg, null];
}

export function finishHybridReport(msg, aggregate, savedReport, timedReport) {
  const r = msg.report;
  const mongo = { report: { ...r, saved: r.hybrid.complete, includeLive: false }, payload: [] };
  savedReport(mongo, aggregate);
  const influx = { report: { ...r }, payload: msg.payload };
  timedReport(influx, aggregate);
  const merge = key => {
    const map = new Map();
    for (const row of [...mongo.payload[key], ...influx.payload[key]]) {
      const previous = map.get(row.key);
      if (previous) { previous.production += row.production; previous.tileCount = previous.tileCount === null || row.tileCount === null ? null : previous.tileCount + row.tileCount; }
      else map.set(row.key, { ...row });
    }
    return [...map.values()].map(row => {
      const monthStart = Date.parse(`${row.month}-01T00:00:00+05:30`);
      const next = new Date(`${row.month}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
      const monthEnd = Date.parse(next.toISOString().slice(0, 10) + 'T00:00:00+05:30');
      return { ...row, intervalStart: new Date(Math.max(monthStart, Date.parse(r.fromTime))).toISOString(), intervalEnd: new Date(Math.min(monthEnd, Date.parse(r.effectiveToTime))).toISOString() };
    }).sort((a, b) => a.month.localeCompare(b.month) || a.line.localeCompare(b.line) || b.production - a.production);
  };
  const warnings = [...mongo.payload.warnings.filter(w => !w.startsWith('Some shifts have no source records.')), ...influx.payload.warnings.filter(w => !w.startsWith('Exact-time production uses accepted tile events.'))];
  if (r.hybrid.ranges.length) warnings.push('Partial, active, missing, or month-boundary shifts use retained Influx events; absent telemetry cannot be reconstructed.');
  if (r.hybrid.coverage.influxMissingShifts) warnings.push('Some completed shift summaries were missing; those intervals were queried from Influx.');
  msg.statusCode = 200; msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  msg.payload = { ...influx.payload, source: r.hybrid.ranges.length ? r.hybrid.complete.length ? 'mongo+influx' : 'influx' : 'mongo',
    rowsBySize: merge('rowsBySize'), rowsByDesign: merge('rowsByDesign'), retrieval: { ...r.hybrid.coverage, influxRanges: r.hybrid.ranges }, warnings: [...new Set(warnings)] };
  delete msg.report; return msg;
}

export function finishTimedReport(msg, aggregate) {
  const r = msg.report, months = new Map(), warnings = new Set();
  for (const row of Array.isArray(msg.payload) ? msg.payload : []) {
    const line = r.mapping[row.device], count = Number(row._value), monthMs = Date.parse(row.month);
    if (!line || !Number.isFinite(count) || count < 0 || !Number.isFinite(monthMs)) throw Error('Invalid timed production query result.');
    const month = new Date(monthMs + 330 * 60000).toISOString().slice(0, 7);
    const size = String(row.tileSize || 'Unknown').trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
    const dims = size.split('x').map(Number), area = dims.length === 2 && dims.every(n => Number.isFinite(n) && n > 0) ? dims[0] * dims[1] / 10000 : 0;
    if (!area) warnings.add('Some tiles have unknown dimensions; their square metres cannot be verified.');
    const key = `${line}|${month}`;
    if (!months.has(key)) months.set(key, { line, month, codes: [] });
    months.get(key).codes.push({ tileSize: size, designCode: row.designCode || 'Unassigned', tileCount: count, production: count * area });
  }
  const source = [...months.values()].map(item => ({ line: item.line, month: item.month, data: { days: [{ date: item.month + '-01', shifts: [{ shift: 'timed', codeWiseProduction: item.codes }] }] } }));
  const firstMonthDate = r.fromDate.slice(0, 7) + '-01';
  const size = aggregate(source, firstMonthDate, r.toDate, false), design = aggregate(source, firstMonthDate, r.toDate, true);
  const intervals = rows => rows.map(row => {
    const start = Date.parse(`${row.month}-01T00:00:00+05:30`);
    const next = new Date(`${row.month}-01T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const end = Date.parse(next.toISOString().slice(0, 10) + 'T00:00:00+05:30');
    return { ...row, intervalStart: new Date(Math.max(start, Date.parse(r.fromTime))).toISOString(), intervalEnd: new Date(Math.min(end, Date.parse(r.effectiveToTime))).toISOString() };
  });
  msg.statusCode = 200; msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  msg.payload = { success: true, source: 'influx', category: r.category, lines: r.lines, fromDate: r.fromDate, toDate: r.toDate,
    fromTime: r.fromTime, toTime: r.effectiveToTime, requestedToTime: r.toTime, rowsBySize: intervals(size.rows), rowsByDesign: intervals(design.rows), unavailableLines: r.unavailableLines,
    warnings: [...new Set([...warnings, ...size.warnings, ...design.warnings, 'Exact-time production uses accepted tile events. Missing telemetry or expired Influx history is not reconstructed from saved shift totals.'])], asOf: new Date(r.now).toISOString() };
  delete msg.report; return msg;
}

export function queryActiveReport(msg) {
  const r = msg.report;
  r.saved = Array.isArray(msg.payload) ? msg.payload : [];
  if (!r.includeLive) { msg.payload = []; return [null, msg]; }
  const ids = JSON.stringify(Object.keys(r.mapping));
  msg.query = `from(bucket:"RCLH")
 |> range(start:time(v:${JSON.stringify(new Date(r.liveStart).toISOString())}),stop:time(v:${JSON.stringify(new Date(r.now).toISOString())}))
 |> filter(fn:(r)=>r._measurement=="tile_events" and r._field=="count_delta")
 |> filter(fn:(r)=>contains(value:r.device,set:${ids}))
 |> filter(fn:(r)=>r._value>0)
 |> map(fn:(r)=>({r with tileSize:if exists r.tileSize then r.tileSize else "Unknown",designCode:if exists r.designCode then r.designCode else "Unassigned"}))
 |> group(columns:["device","tileSize","designCode"])
 |> sum(column:"_value")
 |> keep(columns:["device","tileSize","designCode","_value"])`;
  return [msg, null];
}

export function finishReport(msg, aggregate) {
  const r = msg.report, shifts = new Map(), warnings = new Set();
  const area = size => { const dims = String(size || '').toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x').split('x').map(Number); return dims.length === 2 && dims.every(n => Number.isFinite(n) && n > 0) ? dims[0] * dims[1] / 10000 : null; };
  const clean = row => {
    const count = row.tileCount != null && Number.isFinite(Number(row.tileCount)) ? Number(row.tileCount) : null;
    const size = row.tileSize || row.size || 'Unknown';
    const sqm = area(size);
    if (sqm === null) warnings.add('Some production has unknown tile dimensions; its area could not be verified.');
    return { ...row, tileSize: size, tileCount: count, production: count !== null && sqm !== null ? count * sqm : Number(row.production) || 0 };
  };
  for (const doc of r.saved) {
    const s = doc?.lineStats;
    if (!s || !['06-14', '14-22', '22-06'].includes(s.shift) || s.shiftDate < r.fromDate || s.shiftDate > r.toDate) continue;
    const line = r.mapping[s.device] || Object.values(r.mapping).find(line => line === s.lineName);
    if (!line || (r.includeLive && s.shiftDate === r.productionDate && s.shift === r.shift)) continue;
    const shiftStart = Date.parse(`${s.shiftDate}T${s.shift.slice(0, 2)}:00:00+05:30`);
    if (shiftStart > r.now) continue;
    const key = `${line}|${s.shiftDate}|${s.shift}`;
    const updated = Date.parse(s.codeWiseUpdatedAt || s.updatedAt || doc.updatedAt || '') || 0;
    if (shifts.has(key) && shifts.get(key).updated >= updated) continue;
    const codes = (Array.isArray(s.codeWiseProduction) && s.codeWiseProduction.length ? s.codeWiseProduction : Array.isArray(s.codeWiseProductionTimeline) ? s.codeWiseProductionTimeline : []).filter(Boolean).map(clean);
    const explicitSizes = Array.isArray(s.sizeWiseProduction) ? s.sizeWiseProduction.map(clean) : [];
    let sizes = explicitSizes;
    if (!sizes.length && codes.length) {
      const map = new Map();
      for (const code of codes) {
        const value = map.get(code.tileSize) || { tileSize: code.tileSize, tileCount: 0, production: 0 };
        value.tileCount = value.tileCount === null || code.tileCount === null ? null : value.tileCount + code.tileCount;
        value.production += code.production; map.set(code.tileSize, value);
      }
      sizes = [...map.values()];
    }
    const recorded = codes.reduce((sum, code) => sum + (code.tileCount || 0), 0);
    if (codes.length && Number.isFinite(Number(s.tileCount)) && recorded !== Number(s.tileCount)) warnings.add('Some saved shift totals differ from their design/run counts.');
    shifts.set(key, { line, date: s.shiftDate, updated, stats: { ...s, codeWiseProduction: codes, sizes } });
  }
  const live = new Map();
  for (const row of Array.isArray(msg.payload) ? msg.payload : []) {
    const line = r.mapping[row.device], count = Number(row._value);
    if (!line || !Number.isFinite(count) || count < 0) continue;
    const rows = live.get(line) || []; rows.push(clean({ tileSize: row.tileSize, designCode: row.designCode || 'Unassigned', tileCount: count })); live.set(line, rows);
  }
  for (const [line, codes] of live) {
    shifts.set(`${line}|${r.productionDate}|${r.shift}`, { line, date: r.productionDate, stats: { shift: r.shift, codeWiseProduction: codes, tileCount: codes.reduce((sum, code) => sum + code.tileCount, 0), production: codes.reduce((sum, code) => sum + code.production, 0) } });
  }
  if (r.includeLive) warnings.add('Active-shift production uses accepted Influx tile events; no events do not prove zero production.');
  const source = [...shifts.values()].map(item => ({ line: item.line, month: item.date.slice(0, 7), data: { days: [{ date: item.date, shifts: [item.stats] }] } }));
  const bySize = aggregate(source, r.fromDate, r.toDate, false), byDesign = aggregate(source, r.fromDate, r.toDate, true);
  // Each source entry is one shift; merge repeated report keys across shifts.
  const merge = rows => {
    const map = new Map();
    for (const row of rows) { const old = map.get(row.key); if (!old) map.set(row.key, { ...row }); else { old.production += row.production; old.tileCount = old.tileCount === null || row.tileCount === null ? null : old.tileCount + row.tileCount; } }
    return [...map.values()];
  };
  const coverage = Object.values(r.mapping).map(line => {
    let expected = 0;
    for (let day = Date.parse(r.fromDate); day <= Date.parse(r.toDate); day += 86400000) {
      const date = new Date(day).toISOString().slice(0, 10);
      for (const hour of ['06', '14', '22']) if (Date.parse(`${date}T${hour}:00:00+05:30`) < r.now) expected++;
    }
    const available = [...shifts.values()].filter(item => item.line === line).length;
    return { line, expectedShifts: expected, availableShifts: available, missingShifts: Math.max(0, expected - available) };
  });
  if (coverage.some(c => c.missingShifts)) warnings.add('Some shifts have no source records. Missing records are excluded, not treated as confirmed zero.');
  msg.statusCode = 200; msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  msg.payload = { success: true, source: r.includeLive ? 'mongo+influx' : 'mongo', category: r.category, fromDate: r.fromDate, toDate: r.toDate, lines: r.lines,
    rowsBySize: merge(bySize.rows), rowsByDesign: merge(byDesign.rows), coverage, unavailableLines: r.unavailableLines,
    warnings: [...new Set([...warnings, ...bySize.warnings, ...byDesign.warnings])], asOf: new Date(r.now).toISOString() };
  delete msg.report; return msg;
}

const tab = 'rx_production_report_tab';
const helper = fs.readFileSync(new URL('../src/utils/productionBreakdownReport.js', import.meta.url), 'utf8').replace(/export /g, '');
export const nodes = [
  { id: tab, type: 'tab', label: 'Production Size and Design Report', info: 'Dedicated bounded date-range API. See production-report.README.md.' },
  { id: 'rx_report_http', z: tab, type: 'http in', name: 'GET production breakdown report', method: 'get', url: '/api/production/breakdown-report', upload: false, x: 180, y: 160, wires: [['rx_report_validate']] },
  { id: 'rx_report_validate', z: tab, type: 'function', name: 'Validate dates and selected category lines', func: `return (${prepareReport.toString()})(msg,global,${JSON.stringify(PRODUCTION_CATEGORIES)});`, outputs: 2, x: 490, y: 160, wires: [['rx_report_mongo'], ['rx_report_response']] },
  { id: 'rx_report_mongo', z: tab, type: 'mongodb4', name: 'Read selected shifts only', clientNode: '8120871193b8f276', mode: 'collection', collection: 'shifts', operation: 'find', output: 'toArray', maxTimeMS: '30000', handleDocId: false, x: 790, y: 160, wires: [['rx_report_live']] },
  { id: 'rx_report_live', z: tab, type: 'function', name: 'Include active shift when selected', func: `if(msg.report.timeMode)return (${queryHybridReport.toString()})(msg);\nreturn (${queryActiveReport.toString()})(msg);`, outputs: 2, x: 1060, y: 160, wires: [['rx_report_influx'], ['rx_report_finish']] },
  { id: 'rx_report_influx', z: tab, type: 'influxdb in', influxdb: 'eef122fda5340dac', name: 'Read active shift tile events', query: '', rawOutput: false, org: 'Ruhanex', x: 1330, y: 100, wires: [['rx_report_finish']] },
  { id: 'rx_report_finish', z: tab, type: 'function', name: 'Aggregate monthly size and design rows', func: `${helper}\nif(msg.report.timeMode)return (${finishHybridReport.toString()})(msg,buildProductionBreakdown,${finishReport.toString()},${finishTimedReport.toString()});\nreturn (${finishReport.toString()})(msg,buildProductionBreakdown);`, outputs: 1, x: 1620, y: 160, wires: [['rx_report_response']] },
  { id: 'rx_report_response', z: tab, type: 'http response', name: 'Report JSON', statusCode: '', headers: {}, x: 1920, y: 160, wires: [] },
  { id: 'rx_report_catch', z: tab, type: 'catch', name: 'Report query failed', scope: ['rx_report_validate', 'rx_report_mongo', 'rx_report_live', 'rx_report_influx', 'rx_report_finish'], uncaught: false, x: 260, y: 300, wires: [['rx_report_error']] },
  { id: 'rx_report_error', z: tab, type: 'function', name: 'Safe report error', func: `msg.statusCode=500;msg.payload={success:false,error:'Unable to retrieve the production breakdown report. Check database connections and query errors.'};delete msg.error;delete msg.report;return msg;`, outputs: 1, x: 620, y: 300, wires: [['rx_report_response']] },
];
fs.writeFileSync(new URL('./production-report.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log('Generated dedicated production breakdown report API.');
