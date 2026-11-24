const meta = msg.live || {};
const requestId = String(meta.requestId || "");
if (!requestId) { msg.statusCode = 500; msg.payload = { success: false, error: "Live summary request ID is missing" }; return msg; }
let pending = context.get("liveSummaryPending") || {};
const now = Date.now();
for (const id of Object.keys(pending)) { if (now - Number(pending[id]?.createdAt || 0) > 30000) delete pending[id]; }
if (!pending[requestId]) pending[requestId] = { createdAt: now, meta, influx: null, stops: null };
const e = pending[requestId]; e.meta = meta;
if (msg.livePart === "influx") e.influx = msg.livePartPayload || [];
else if (msg.livePart === "stops") e.stops = msg.livePartPayload || [];
else return null;
pending[requestId] = e; context.set("liveSummaryPending", pending);
if (e.influx === null || e.stops === null) return null;
delete pending[requestId]; context.set("liveSummaryPending", pending);
const rows = e.influx || [], stops = e.stops || [], c = e.meta || {};

// ============================================================
// AUTHORITATIVE LIVE RUNTIME STATE
// ============================================================
// The central counter flow already maintains the current state.
// Do not re-derive these values from the latest Influx point.
const counters = flow.get("counters") || {};
const downtimeStates = flow.get("downtimeStates") || {};
const runtime = counters[c.device] || {};
const runtimeDown = downtimeStates[c.device] || {};

const shiftCount = Math.max(0, Number(runtime.shiftCount || 0));
const lastSeen = Number(runtime.lastSeen || 0) || null;
const lastSignal = Number(runtime.lastSignal || 0) || null;

const sensorStatus = String(runtime.sensorStatus || "Unknown");
const shiftStatus = String(runtimeDown.status || "Unknown");

let speed = 0;
const speedSamples = [];
for (const r of rows) {
    if (r.metric === "speedSample") speedSamples.push(r);
}
speedSamples.sort((a, b) => new Date(a._time).getTime() - new Date(b._time).getTime());
if (speedSamples.length >= 2) { const first = speedSamples[0], last = speedSamples[speedSamples.length - 1]; const dc = Number(last._value) - Number(first._value); const sec = (new Date(last._time).getTime() - new Date(first._time).getTime()) / 1000; if (Number.isFinite(dc) && sec > 0) speed = Math.max(0, dc / sec * 60); }
function tileArea(size) { const d = String(size || "").toLowerCase().replace(/\s+/g, "").split("x").map(Number); return d.length === 2 && d.every(v => Number.isFinite(v) && v > 0) ? d[0] * d[1] / 10000 : 0; }
function classify(stops, from, to, allowance, nowMs) {
    const start = new Date(from).getTime(), end = new Date(to).getTime(), calcEnd = Math.min(Math.max(nowMs, start), end);
    const full = Math.max(0, (end - start) / 60000), elapsed = Math.max(0, (calcEnd - start) / 60000);
    let standardActual = 0, additional = 0, explicitUnplanned = 0, total = 0, completed = 0, open = false, maximum = 0;
    for (const row of stops) {
        const st = Math.max(start, Number(row.stopStart_ts)); if (!Number.isFinite(st)) continue;
        const isOpen = row.stopStop_ts == null; const en = Math.min(calcEnd, isOpen ? calcEnd : Number(row.stopStop_ts)); if (!Number.isFinite(en) || en <= st) continue;
        const d = (en - st) / 60000; total += d; maximum = Math.max(maximum, d);
        const type = String(row.downtimeType || "unplanned").toLowerCase(); const cat = String(row.plannedCategory || "").toLowerCase();
        if (type === "planned" && cat === "standard") standardActual += d;
        else if (type === "planned" && cat === "additional") additional += d;
        else explicitUnplanned += d;
        if (isOpen) open = true; else completed++;
    }
    const A = Math.max(0, Number(allowance || 0));
    const standardUsed = A > 0 ? Math.min(standardActual, A) : standardActual;
    const remaining = A > 0 ? Math.max(0, A - standardUsed) : 0;
    const excess = A > 0 ? Math.max(0, standardActual - A) : 0;
    // No proportional/distributed planned downtime.
    // Only explicitly assigned Standard Planned stoppages consume the configured allowance.
    // When allowance is 0 there is no cap; all explicitly assigned Standard Planned downtime remains planned.
    // When allowance is > 0, Standard Planned duration above the allowance becomes unplanned.
    const standardApplied = standardUsed;
    const planned = standardApplied + additional;
    const unplanned = explicitUnplanned + excess;
    return { full, elapsed, total, standardActual, standardUsed, remaining, excess, standardApplied, additional, planned, unplanned, completed, open, maximum };
}
const dt = classify(stops, c.from, c.to, c.plannedDowntime, now);

const cfgAll =
    global.get("counterConfig") || {};

const cfg =
    cfgAll[c.device] || {};

const allSettings =
    global.get("lineSettings") || {};

const ls =
    allSettings[c.line] ||
    allSettings[String(c.line || "").toLowerCase()] ||
    {};

const requiredRunTimeMs =
    Math.max(
        0,
        Number(
            ls.requiredRunTimeMs ??
            cfg.requiredRunTimeMs ??
            60000
        )
    );

const runConfirmationMinutes =
    requiredRunTimeMs / 60000;

const recoveryCorrectionMinutes =
    dt.completed *
    runConfirmationMinutes;


// // const runConfirmationMinutes = 1; // 60 seconds

// // const recoveryCorrectionMinutes = dt.completed * runConfirmationMinutes;

// const plannedProductionMinutes = Math.max(0, dt.elapsed - dt.planned + recoveryCorrectionMinutes);

// const operatingMinutes=Math.max(0,dt.elapsed-dt.total+recoveryCorrectionMinutes);
// const availability=plannedProductionMinutes>0?operatingMinutes/plannedProductionMinutes*100:0;

const plannedProductionMinutes =
    Math.max(0, dt.elapsed - dt.planned);

const operatingMinutes =
    Math.max(0, dt.elapsed - dt.total);

const availability =
    plannedProductionMinutes > 0
        ? operatingMinutes / plannedProductionMinutes * 100
        : 0;


const rated = Math.max(0, Number(c.configuredLineSpeed || 0));
// Performance target uses actual running time only: elapsed shift time - TOTAL downtime.
const targetTiles = rated * operatingMinutes;
const performance = targetTiles > 0 ? shiftCount / targetTiles * 100 : 0;
// No reject/quality counter is currently available, so Quality = 100%.
// OLE = Availability x Performance x Quality / 10000.
const quality = 100;
const ole = (availability * performance * quality) / 10000;
const area = tileArea(c.tileSize); const production = shiftCount * area; const targetProduction = targetTiles * area;

// sensorStatus and shiftStatus come directly from the central runtime state.
// sensorStatus = flow.counters[device].sensorStatus
// shiftStatus  = flow.downtimeStates[device].status
const r = (v, d = 2) => { const p = 10 ** d; return Math.round(Number(v || 0) * p) / p; };
msg.headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
msg.payload = {
    success: true, device: c.device, line: c.line, currentShift: c.shift, shiftDate: c.date, shiftFromTime: c.from, shiftToTime: c.to,
    shiftCount, shiftCountTimestamp: lastSeen, productionSqm: r(production, 2), tileSize: c.tileSize, designCode: c.designCode, speed: r(speed, 2),
    configuredLineSpeed: rated, ratedLineSpeed: rated, configuredStandardPlannedDowntime: r(c.plannedDowntime, 2),
    plannedDowntime: r(dt.planned, 2), plannedDowntimeMinutes: r(dt.planned, 2), standardPlannedDowntimeMinutes: r(dt.standardApplied, 2),
    recordedStandardDowntimeMinutes: r(dt.standardActual, 2), remainingStandardAllowanceMinutes: r(dt.remaining, 2),
    standardExcessDowntimeMinutes: r(dt.excess, 2),
    additionalPlannedDowntimeMinutes: r(dt.additional, 2), unplannedDowntimeMinutes: r(dt.unplanned, 2),
    totalDowntimeMinutes: r(dt.total, 2), maximumDowntimeMinutes: r(dt.maximum, 2), completedStops: dt.completed, openStop: dt.open,
    elapsedShiftMinutes: r(dt.elapsed, 2), plannedProductionMinutes: r(plannedProductionMinutes, 2), actualOperatingMinutes: r(operatingMinutes, 2),
    availability: r(availability, 2), targetTiles: r(targetTiles, 0), targetProduction: r(targetProduction, 2), performance: r(performance, 2),
    quality: r(quality, 2), ole: r(ole, 2),
    shiftStatus, sensorStatus, lastSeen, lastSignal, timestamp: now
};
function attachQualitySensorStatus(response, flow, global) {
    if (response?.success !== true) return response;
    const registry = global.get('devices');
    const ready = global.get('devicesReady') === true && registry && typeof registry === 'object';
    const matches = ready ? Object.entries(registry).filter(([id, cfg]) => id.startsWith('RX-QLT-') && cfg?.enabled === true && cfg.line === response.line) : [];
    const [device] = matches.length === 1 ? matches[0] : [];
    const state = device ? (flow.get('qualitySensorStatus') || {})[device] : null;
    const status = ['Online', 'Offline'].includes(state?.sensorStatus) ? state.sensorStatus : 'Unknown';
    const timestamp = n => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
    Object.assign(response, {
        qualitySensorConfigured: ready ? matches.length === 1 : null,
        qualitySensorConfigStatus: !ready ? 'configuration-not-ready' : matches.length === 0 ? 'not-configured' : matches.length > 1 ? 'multiple-sensors' : 'configured',
        qualitySensorDevice: device || null,
        qualitySensorStatus: status,
        qualitySensorLastSeen: timestamp(state?.lastSeen),
        qualitySensorStatusObservedAt: timestamp(state?.lastStatusSeen),
        qualitySensorStatusRetained: state?.retained === true,
    });
    response.qualitySensor = {
        device: response.qualitySensorDevice,
        sensorStatus: status,
        lastSeen: response.qualitySensorLastSeen,
        statusObservedAt: response.qualitySensorStatusObservedAt,
        retained: response.qualitySensorStatusRetained,
        configured: response.qualitySensorConfigured,
        configStatus: response.qualitySensorConfigStatus,
    };
    return response;
}
msg.payload = attachQualitySensorStatus(msg.payload, flow, global);
return msg;