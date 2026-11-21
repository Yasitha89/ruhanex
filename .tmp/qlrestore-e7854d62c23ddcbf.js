const m =
    String(msg.topic || "")
        .match(/^RX-CNT\/([^/]+)\/status$/);

if (!m) {
    return null;
}


// ============================================================
// DEVICE ID
// RX-CNT/1000/status -> RX-CNT-1000
// ============================================================

const id =
    "RX-CNT-" + m[1];


// ============================================================
// CONFIG
// ============================================================

const cfg =
    global.get("counterConfig") || {};


// Ignore completely unknown devices
if (!cfg[id]) {

    node.warn(
        `[STATUS] Unknown device: ${id}`
    );

    return null;
}


// ============================================================
// GET RUNTIME COUNTER STATE
// ============================================================

let counters =
    flow.get("counters") || {};


// ============================================================
// IMPORTANT:
//
// Status MQTT message may arrive before counter restore.
//
// Do NOT discard the status.
//
// Create a minimal runtime state if it does not exist yet.
// Restore logic can later populate the remaining properties.
// ============================================================

if (!counters[id]) {

    counters[id] = {

        rawCount: 0,

        shiftCount: 0,

        deviceCount: 0,

        bootId: null,

        lastSignal: null,

        lastSeen: null,

        sensorStatus: "Unknown",

        shiftName: null,

        shiftDate: null
    };
}


// ============================================================
// PARSE MQTT STATUS
//
// Supports:
//
// online
// offline
//
// "online"
// "offline"
//
// {"status":"online"}
// {"status":"offline"}
// ============================================================

let statusValue = msg.payload;


// Buffer -> string
if (Buffer.isBuffer(statusValue)) {

    statusValue =
        statusValue.toString();
}


// Try JSON if payload is string
if (typeof statusValue === "string") {

    const raw =
        statusValue.trim();

    try {

        const parsed =
            JSON.parse(raw);

        if (
            parsed &&
            typeof parsed === "object"
        ) {

            statusValue =
                parsed.status ??
                parsed.state ??
                parsed.sensorStatus ??
                raw;

        } else {

            statusValue =
                parsed;
        }

    } catch (e) {

        // Normal plain-text MQTT message
        statusValue =
            raw;
    }
}


// Object payload
else if (
    statusValue &&
    typeof statusValue === "object"
) {

    statusValue =
        statusValue.status ??
        statusValue.state ??
        statusValue.sensorStatus ??
        "Unknown";
}


// ============================================================
// NORMALIZE STATUS
// ============================================================

const v =
    String(
        statusValue ?? ""
    )
        .trim()
        .toLowerCase();


let sensorStatus =
    "Unknown";


if (
    v === "online" ||
    v === "connected" ||
    v === "1" ||
    v === "true"
) {

    sensorStatus =
        "Online";
}

else if (
    v === "offline" ||
    v === "disconnected" ||
    v === "0" ||
    v === "false"
) {

    sensorStatus =
        "Offline";
}


// ============================================================
// SAVE STATUS
// ============================================================

counters[id].sensorStatus =
    sensorStatus;


// A status message itself confirms that Node-RED received
// communication from the MQTT broker/device status topic.
counters[id].lastSeen =
    Date.now();


flow.set(
    "counters",
    counters
);


// ============================================================
// DEBUG OUTPUT
// ============================================================

msg.payload = {

    device: id,

    receivedStatus:
        statusValue,

    sensorStatus:
        sensorStatus,

    lastSeen:
        counters[id].lastSeen
};


return msg;