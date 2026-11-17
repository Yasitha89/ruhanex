let counters = flow.get("counters") || {};
let downtimeStates = flow.get("downtimeStates") || {};
const cfg = global.get("counterConfig") || {};
const rows = Array.isArray(msg.payload) ? msg.payload : [];
const restoredDevices = new Set();
const now = Date.now();

// Query is sorted newest MongoDB _id first.
// Therefore first document seen for each device is its latest stoppage.
for (const row of rows) {
    const deviceId = row.device;

    if (
        !deviceId ||
        !cfg[deviceId] ||
        restoredDevices.has(deviceId)
    ) {
        continue;
    }

    if (!downtimeStates[deviceId]) {
        downtimeStates[deviceId] = {
            status: null,
            runningSince: null,
            lastEventTs: null,
            lastObservedSignal: null,
            pendingShiftRecovery: null
        };
    }

    const isOpenStop =
        row.downStatus === "STOP_START" &&
        (row.stopStop_ts === null || row.stopStop_ts === undefined);

    if (isOpenStop) {
        downtimeStates[deviceId].status = "Stopped";
        downtimeStates[deviceId].lastEventTs =
            Number(row.stopStart_ts) || null;
    } else {
        downtimeStates[deviceId].status = "Running";
        downtimeStates[deviceId].lastEventTs =
            Number(row.stopStop_ts) || Number(row.stopStart_ts) || null;
    }

    downtimeStates[deviceId].runningSince = null;
    downtimeStates[deviceId].lastObservedSignal =
        Number(counters[deviceId]?.lastSignal || 0) || null;

    restoredDevices.add(deviceId);
}

// Devices with no Mongo stoppage history:
// infer state from the restored last real production signal.
const allLineSettings = global.get("lineSettings") || {};

for (const [deviceId, deviceCfg] of Object.entries(cfg)) {
    if (deviceCfg.enabled !== true) continue;

    if (!downtimeStates[deviceId]) {
        downtimeStates[deviceId] = {
         status: null,
         runningSince: null,
         lastEventTs: null,
         lastObservedSignal: null,
         pendingShiftRecovery: null
        };
    }

    if (restoredDevices.has(deviceId)) continue;

    const lastSignal =
        Number(counters[deviceId]?.lastSignal || 0);

    const lineSettings =
        allLineSettings[deviceCfg.line] ||
        allLineSettings[String(deviceCfg.line).toLowerCase()] ||
        {};

    const stopDelayMs =
        Number(
            lineSettings.stopDelayMs ??
            60000
        );

    const recentProduction =
        lastSignal > 0 &&
        (now - lastSignal) <= stopDelayMs;

    downtimeStates[deviceId].status =
        recentProduction ? "Running" : "Stopped";

    downtimeStates[deviceId].runningSince = null;
    downtimeStates[deviceId].lastEventTs = null;
    downtimeStates[deviceId].lastObservedSignal =
        lastSignal || null;
}

flow.set("downtimeStates", downtimeStates);
flow.set("counterRestoreReady", true);
flow.set("downtimeRestoreReady", true);

// Release the newest buffered MQTT telemetry per device.
const pending =
    flow.get("pendingCounterTelemetry") || {};

flow.set("pendingCounterTelemetry", {});

const outputMessages =
    Object.values(pending).filter(Boolean);

node.status({
    fill: "green",
    shape: "dot",
    text: `restored ${Object.keys(counters).length} counters`
});

return outputMessages.length
    ? [outputMessages]
    : null;