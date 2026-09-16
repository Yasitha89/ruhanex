const meta = msg.live || {};
const requestId = String(meta.requestId || "");
if (!requestId) {
  msg.statusCode = 500;
  msg.payload = { success: false, error: "Live summary request ID is missing" };
  return msg;
}
let pending = context.get("liveSummaryPending") || {};
const now = Date.now();
for (const id of Object.keys(pending)) {
  if (now - Number(pending[id]?.createdAt || 0) > 30000) delete pending[id];
}
if (!pending[requestId])
  pending[requestId] = { createdAt: now, meta, influx: null, stops: null };
const e = pending[requestId];
e.meta = meta;
if (msg.livePart === "influx") e.influx = msg.livePartPayload || [];
else if (msg.livePart === "stops") e.stops = msg.livePartPayload || [];
else return null;
pending[requestId] = e;
context.set("liveSummaryPending", pending);
if (e.influx === null || e.stops === null) return null;
delete pending[requestId];
context.set("liveSummaryPending", pending);
const rows = e.influx || [],
  stops = e.stops || [],
  c = e.meta || {};
let shiftCount = 0,
  lastSignal = null,
  speed = 0,
  lastSeen = null;
const speedSamples = [];
for (const r of rows) {
  if (r.metric === "shiftCount") {
    shiftCount = Number(r._value || 0);
    lastSeen = new Date(r._time).getTime();
  } else if (r.metric === "lastSignal")
    lastSignal = Number(r._value || 0) || null;
  else if (r.metric === "speedSample") speedSamples.push(r);
}
speedSamples.sort(
  (a, b) => new Date(a._time).getTime() - new Date(b._time).getTime(),
);
if (speedSamples.length >= 2) {
  const first = speedSamples[0],
    last = speedSamples[speedSamples.length - 1];
  const dc = Number(last._value) - Number(first._value);
  const sec =
    (new Date(last._time).getTime() - new Date(first._time).getTime()) / 1000;
  if (Number.isFinite(dc) && sec > 0) speed = Math.max(0, (dc / sec) * 60);
}
function tileArea(size) {
  const d = String(size || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("x")
    .map(Number);
  return d.length === 2 && d.every((v) => Number.isFinite(v) && v > 0)
    ? (d[0] * d[1]) / 10000
    : 0;
}
function classify(stops, from, to, allowance, nowMs) {
  const start = new Date(from).getTime(),
    end = new Date(to).getTime(),
    calcEnd = Math.min(Math.max(nowMs, start), end);
  const full = Math.max(0, (end - start) / 60000),
    elapsed = Math.max(0, (calcEnd - start) / 60000);
  let standardActual = 0,
    additional = 0,
    explicitUnplanned = 0,
    total = 0,
    completed = 0,
    open = false,
    maximum = 0;
  for (const row of stops) {
    const st = Math.max(start, Number(row.stopStart_ts));
    if (!Number.isFinite(st)) continue;
    const isOpen = row.stopStop_ts == null;
    const en = Math.min(calcEnd, isOpen ? calcEnd : Number(row.stopStop_ts));
    if (!Number.isFinite(en) || en <= st) continue;
    const d = (en - st) / 60000;
    total += d;
    maximum = Math.max(maximum, d);
    const type = String(row.downtimeType || "unplanned").toLowerCase();
    const cat = String(row.plannedCategory || "").toLowerCase();
    if (type === "planned" && cat === "standard") standardActual += d;
    else if (type === "planned" && cat === "additional") additional += d;
    else explicitUnplanned += d;
    if (isOpen) open = true;
    else completed++;
  }
  const A = Math.max(0, Number(allowance || 0));
  const standardUsed = Math.min(standardActual, A);
  const remaining = Math.max(0, A - standardUsed);
  const excess = Math.max(0, standardActual - A);
  // Recalculate the unused standard allowance over the usable shift time.
  // With no assigned standard stop: A * elapsed/full.
  // Assigned Standard Planned consumes A; only the remainder is distributed.
  const distributableBase = Math.max(0, full - standardUsed);
  const elapsedBase = Math.max(0, elapsed - standardUsed);
  const distributedRemaining =
    distributableBase > 0
      ? remaining * Math.min(1, elapsedBase / distributableBase)
      : 0;
  const standardApplied = Math.min(A, standardUsed + distributedRemaining);
  const planned = standardApplied + additional;
  const unplanned = explicitUnplanned + excess;
  return {
    full,
    elapsed,
    total,
    standardActual,
    standardUsed,
    remaining,
    excess,
    distributedRemaining,
    standardApplied,
    additional,
    planned,
    unplanned,
    completed,
    open,
    maximum,
  };
}
const dt = classify(stops, c.from, c.to, c.plannedDowntime, now);
const plannedProductionMinutes = Math.max(0, dt.elapsed - dt.planned);
const operatingMinutes = Math.max(0, plannedProductionMinutes - dt.unplanned);
const availability =
  plannedProductionMinutes > 0
    ? (operatingMinutes / plannedProductionMinutes) * 100
    : 0;
const rated = Math.max(0, Number(c.configuredLineSpeed || 0));
const targetTiles = rated * operatingMinutes;
const performance = targetTiles > 0 ? (shiftCount / targetTiles) * 100 : 0;
// No reject/quality counter is currently available, so Quality = 100%.
// OLE = Availability x Performance x Quality / 10000.
const quality = 100;
const ole = (availability * performance * quality) / 10000;
const area = tileArea(c.tileSize);
const production = shiftCount * area;
const targetProduction = targetTiles * area;
const sensorStatus = lastSeen && now - lastSeen <= 30000 ? "Online" : "Offline";
const shiftStatus =
  lastSignal && now - lastSignal <= Number(c.stopDelayMs || 60000)
    ? "Running"
    : "Stopped";
const r = (v, d = 2) => {
  const p = 10 ** d;
  return Math.round(Number(v || 0) * p) / p;
};
msg.headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
msg.payload = {
  success: true,
  device: c.device,
  line: c.line,
  currentShift: c.shift,
  shiftDate: c.date,
  shiftFromTime: c.from,
  shiftToTime: c.to,
  shiftCount,
  shiftCountTimestamp: lastSeen,
  productionSqm: r(production, 2),
  tileSize: c.tileSize,
  speed: r(speed, 2),
  configuredLineSpeed: rated,
  ratedLineSpeed: rated,
  configuredStandardPlannedDowntime: r(c.plannedDowntime, 2),
  plannedDowntime: r(dt.planned, 2),
  plannedDowntimeMinutes: r(dt.planned, 2),
  standardPlannedDowntimeMinutes: r(dt.standardApplied, 2),
  recordedStandardDowntimeMinutes: r(dt.standardActual, 2),
  remainingStandardAllowanceMinutes: r(dt.remaining, 2),
  distributedStandardAllowanceMinutes: r(dt.distributedRemaining, 2),
  standardExcessDowntimeMinutes: r(dt.excess, 2),
  additionalPlannedDowntimeMinutes: r(dt.additional, 2),
  unplannedDowntimeMinutes: r(dt.unplanned, 2),
  totalDowntimeMinutes: r(dt.total, 2),
  maximumDowntimeMinutes: r(dt.maximum, 2),
  completedStops: dt.completed,
  openStop: dt.open,
  elapsedShiftMinutes: r(dt.elapsed, 2),
  plannedProductionMinutes: r(plannedProductionMinutes, 2),
  actualOperatingMinutes: r(operatingMinutes, 2),
  availability: r(availability, 2),
  targetTiles: r(targetTiles, 0),
  targetProduction: r(targetProduction, 2),
  performance: r(performance, 2),
  quality: r(quality, 2),
  ole: r(ole, 2),
  shiftStatus,
  sensorStatus,
  lastSeen,
  lastSignal,
  timestamp: now,
};
return msg;
