const rows = (Array.isArray(msg.payload) ? msg.payload : [])
    .filter(row => Number.isFinite(Number(row?._value)))
    .sort((a, b) => {
        const ta = new Date(a?._time || 0).getTime();
        const tb = new Date(b?._time || 0).getTime();
        return ta - tb;
    });

const target = msg.codeWiseTarget;

if (!target) {
    node.error("Code-wise target identity was lost", msg);
    return null;
}

function round(v, n = 2) {
    const p = 10 ** n;
    return Math.round((Number(v || 0) + Number.EPSILON) * p) / p;
}

function tileAreaM2(size) {
    const d = String(size || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .split("x")
        .map(Number);

    if (
        d.length !== 2 ||
        !d.every(v => Number.isFinite(v) && v > 0)
    ) {
        return 0;
    }

    return (d[0] * d[1]) / 10000;
}

function cleanText(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
}

function isoTime(value) {
    if (value === undefined || value === null || value === "") return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const aggregateMap = new Map();
const timeline = [];

let previousShiftCount = 0;
let ignoredRollbacks = 0;
let activeRun = null;

for (const row of rows) {
    const currentShiftCount = Number(row._value);
    const delta = currentShiftCount - previousShiftCount;

    // Keep the last valid cumulative value if a lower/stale value
    // appears. This prevents the next valid row creating a spike.
    if (!Number.isFinite(delta) || delta < 0) {
        ignoredRollbacks += 1;

        node.warn(
            "Completed-shift shift_count rollback ignored: " +
            "previous=" + previousShiftCount +
            ", current=" + currentShiftCount +
            ", time=" + String(row?._time || "")
        );

        continue;
    }

    previousShiftCount = currentShiftCount;

    if (delta === 0) {
        continue;
    }

    const designCode = cleanText(row.designCode, "Unknown");
    const tileSize = cleanText(row.tileSize, "Unknown");
    const producedAt = isoTime(row._time);
    const production = delta * tileAreaM2(tileSize);

    // Prefer immutable tags written alongside each counter event.
    // Without these tags, a global setting read at shift end cannot
    // determine which earlier run produced a tile before a changeover.
    let productionRunId = cleanText(row.productionRunId, "") || null;
    let productionRunStartTime = isoTime(row.productionRunStartTime);
    let runIdSource = productionRunId ? "influx-event" : "unresolved";

    // Conservative fallback for legacy telemetry: only associate a row
    // with the end-of-shift run if the event is on/after its start AND
    // its tile size agrees. Do not guess the earlier production run.
    const fallbackStart = isoTime(target.productionRunStartTimeAtShiftEnd);
    const fallbackId = target.productionRunIdAtShiftEnd || null;
    if (!productionRunId && fallbackId && fallbackStart &&
        producedAt && Date.parse(producedAt) >= Date.parse(fallbackStart)) {
        const settings = global.get("lineSettings") || {};
        const ls = settings[target.line] || settings[String(target.line || "").toLowerCase()] || {};
        if (String(ls.tileSize || "").trim() === tileSize &&
            String(ls.productionRunId || "") === String(fallbackId)) {
            productionRunId = String(fallbackId);
            productionRunStartTime = fallbackStart;
            runIdSource = "shift-end-fallback";
        }
    }

    const key = JSON.stringify([designCode, tileSize, productionRunId, productionRunStartTime]);

    // ----------------------------------------------------------
    // AGGREGATED TOTAL PER DESIGN CODE + TILE SIZE
    // sequence records when this design was first produced.
    // ----------------------------------------------------------
    const aggregate = aggregateMap.get(key) || {
        sequence: aggregateMap.size + 1,
        designCode,
        tileSize,
        productionRunId,
        productionRunStartTime,
        runIdSource,
        firstProducedAt: producedAt,
        lastProducedAt: producedAt,
        tileCount: 0,
        production: 0
    };

    if (!aggregate.firstProducedAt && producedAt) {
        aggregate.firstProducedAt = producedAt;
    }

    if (producedAt) {
        aggregate.lastProducedAt = producedAt;
    }

    aggregate.tileCount += delta;
    aggregate.production += production;
    aggregateMap.set(key, aggregate);

    // ----------------------------------------------------------
    // CHRONOLOGICAL PRODUCTION RUNS
    // A -> B -> A is saved as three separate timeline entries.
    // ----------------------------------------------------------
    if (!activeRun || activeRun.key !== key) {
        activeRun = {
            key,
            sequence: timeline.length + 1,
            designCode,
            tileSize,
            productionRunId,
            productionRunStartTime,
            runIdSource,
            startTime: producedAt,
            endTime: producedAt,
            tileCount: 0,
            production: 0
        };

        timeline.push(activeRun);
    }

    if (!activeRun.startTime && producedAt) {
        activeRun.startTime = producedAt;
    }

    if (producedAt) {
        activeRun.endTime = producedAt;
    }

    activeRun.tileCount += delta;
    activeRun.production += production;
}

// Unique design-code totals, ordered by first production time.
msg.codeWiseProduction = [...aggregateMap.values()]
    .map(item => ({
        sequence: item.sequence,
        designCode: item.designCode,
        tileSize: item.tileSize,
        productionRunId: item.productionRunId,
        productionRunStartTime: item.productionRunStartTime,
        runIdSource: item.runIdSource,
        firstProducedAt: item.firstProducedAt,
        lastProducedAt: item.lastProducedAt,
        tileCount: Math.round(item.tileCount),
        production: round(item.production)
    }))
    .sort((a, b) => a.sequence - b.sequence);

// Every chronological production run. Use this array for a chart
// where the left side is the first run and the right side is the last.
msg.codeWiseProductionTimeline = timeline
    .map(({key, ...item}) => ({
        ...item,
        tileCount: Math.round(item.tileCount),
        production: round(item.production)
    }))
    .sort((a, b) => a.sequence - b.sequence);

const calculatedTileCount = msg.codeWiseProduction.reduce(
    (sum, item) => sum + Number(item.tileCount || 0),
    0
);

node.status({
    fill: ignoredRollbacks > 0 ? "yellow" : "green",
    shape: ignoredRollbacks > 0 ? "ring" : "dot",
    text:
        rows.length + " rows -> " +
        msg.codeWiseProduction.length + " codes, " +
        msg.codeWiseProductionTimeline.length + " runs, " +
        calculatedTileCount + " tiles"
});

return msg;