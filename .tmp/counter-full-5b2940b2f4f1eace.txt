const m = String(msg.topic || "").match(/^RX-CNT\/([^/]+)\/telemetry$/);
if (!m) return [null, null];

const deviceId = "RX-CNT-" + m[1];
const allCfg = global.get("counterConfig") || {};
const cfg = allCfg[deviceId];
if (!cfg || cfg.enabled !== true) return [null, null];

let data;
try {
    data = typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
} catch (e) {
    node.warn(`${deviceId}: invalid JSON`);
    return [null, null];
}

const raw = Number(data?.count);
if (
    !Number.isInteger(raw) ||
    raw < 0 ||
    raw > 4294967295 ||
    data?.boot_id === undefined ||
    data?.boot_id === null
) {
    node.warn(`${deviceId}: invalid payload`);
    return [null, null];
}

const boot = String(data.boot_id);

let counters = flow.get("counters") || {};
let state = counters[deviceId];
if (!state) return [null, null];

const now = Date.now();
state.lastSeen = now;

let delta = 0;
let eventType = "heartbeat";

// previousRaw + previousBootId are restored ONLY from the current shift.
// If there is no trustworthy current-shift baseline, the first MQTT
// message becomes a baseline and is not added to the shift count.
if (
    state.previousRaw === null ||
    state.previousRaw === undefined ||
    state.previousBootId === null ||
    state.previousBootId === undefined
) {
    delta = 0;
    eventType = "initial_sync";
}
else if (boot !== String(state.previousBootId)) {
    // A valid current-shift state existed, but the ESP rebooted.
    // The new raw counter started from zero, therefore its current raw
    // value represents counts after that reboot.
    delta = raw;
    eventType = "new_boot";
}
else if (raw >= Number(state.previousRaw)) {
    delta = raw - Number(state.previousRaw);
    eventType = delta > 0 ? "count" : "heartbeat";
}
else {
    delta = 0;
    eventType = "counter_rollback";
}

if (!Number.isFinite(delta) || delta < 0 || delta > 10000) {
    delta = 0;
    eventType = "rejected_delta";
}

if (delta > 0) {
    state.shiftCount = Number(state.shiftCount || 0) + delta;
    state.deviceCount = Number(state.deviceCount || 0) + delta;
    state.lastSignal = now;
}

state.previousRaw = raw;
state.previousBootId = boot;

counters[deviceId] = state;
flow.set("counters", counters);

const allLineSettings = global.get("lineSettings") || {};
const lineSettings =
    allLineSettings[cfg.line] ||
    allLineSettings[String(cfg.line).toLowerCase()] ||
    {};

const tileSize = lineSettings.tileSize ?? "unknown";
const designCode = lineSettings.designCode ?? "Not Assigned";
const tileCode = lineSettings.tileCode ?? "unknown";
const productionRunId = String(lineSettings.productionRunId || "");

const display = {
    topic: cfg.displayTopic || `display/${deviceId}/shiftCount`,
    payload: JSON.stringify({
        device: deviceId,
        line: cfg.line,
        shift: state.shiftName,
        shiftDate: state.shiftDate,
        count: state.shiftCount
    })
};

const influx = {
    payload: [
        {
            shift_count: Number(state.shiftCount || 0),
            device_count: Number(state.deviceCount || 0),
            raw_count: Number(raw),
            count_delta: Number(delta),
            boot_id: String(boot),
            last_signal: Number(state.lastSignal || 0)
        },
        {
            device: deviceId,
            line: String(cfg.line || deviceId),
            shift: String(state.shiftName || ""),
            shiftDate: String(state.shiftDate || ""),
            tileSize: String(tileSize),
            designCode: String(designCode),
            productionRunId: productionRunId,
            tileCode: String(tileCode),
            eventType: String(eventType)
        }
    ]
};

node.status({
    fill: delta > 0 ? "green" : "blue",
    shape: delta > 0 ? "dot" : "ring",
    text: `${deviceId} +${delta} shift=${state.shiftCount} raw=${raw}`
});

return [display, influx];