let counters = flow.get("counters") || {};
const cfg = global.get("counterConfig") || {};
const rows = Array.isArray(msg.payload) ? msg.payload : [];

const currentShift =
    String(msg.restoreShiftName || "");

const currentShiftDate =
    String(msg.restoreShiftDate || "");


// ============================================================
// SAFE DEFAULT FOR EVERY ENABLED COUNTER
//
// No current-shift record means:
//   shiftCount = 0
//   previousRaw = null
//   previousBootId = null
//
// Therefore the first MQTT message becomes a baseline and cannot
// add an old previous-shift raw difference.
// ============================================================

for (const id of Object.keys(counters)) {
    counters[id].shiftName =
        currentShift;

    counters[id].shiftDate =
        currentShiftDate;

    counters[id].shiftCount =
        0;

    counters[id].previousRaw =
        null;

    counters[id].previousBootId =
        null;
}


// ============================================================
// RESTORE CURRENT SHIFT FIELDS
// ============================================================

for (const row of rows) {

    const id = row.device;

    if (
        !id ||
        !counters[id] ||
        !cfg[id] ||
        cfg[id].enabled !== true
    ) {
        continue;
    }

    if (
        String(row.shift || "") !== currentShift ||
        String(row.shiftDate || "") !== currentShiftDate
    ) {
        continue;
    }

    if (row._field === "shift_count") {

        const v =
            Number(row._value);

        if (
            Number.isFinite(v) &&
            v >= 0
        ) {
            counters[id].shiftCount =
                v;
        }
    }

    else if (row._field === "raw_count") {

        const v =
            Number(row._value);

        if (
            Number.isFinite(v) &&
            v >= 0 &&
            v <= 4294967295
        ) {
            counters[id].previousRaw =
                v;
        }
    }

    else if (row._field === "boot_id") {

        if (
            row._value !== undefined &&
            row._value !== null &&
            String(row._value) !== ""
        ) {
            counters[id].previousBootId =
                String(row._value);
        }
    }
}

flow.set("counters", counters);


// ============================================================
// RESTORE DOWNTIME STATE FROM MONGODB
// ============================================================

const enabledDevices =
    Object.entries(cfg)
        .filter(([, c]) => c.enabled === true)
        .map(([id]) => id);

msg.collection =
    "stoppages";

msg.operation =
    "find";

msg.payload = [
    {
        device: {
            $in: enabledDevices
        }
    },
    {
        sort: {
            _id: -1
        }
    }
];

return msg;