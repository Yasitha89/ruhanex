let counters = flow.get("counters") || {};
const cfg = global.get("counterConfig") || {};
const rows = Array.isArray(msg.payload) ? msg.payload : [];

// ============================================================
// RESTORE LONG-TERM DEVICE STATE ONLY
// ============================================================

for (const row of rows) {
    const id = row.device;

    if (!id || !cfg[id] || !counters[id]) {
        continue;
    }

    if (row._field === "device_count") {
        const v = Number(row._value);

        if (Number.isFinite(v)) {
            counters[id].deviceCount = v;
        }
    }
    else if (row._field === "last_signal") {
        const v = Number(row._value);

        if (Number.isFinite(v) && v > 0) {
            counters[id].lastSignal = v;
        }
    }
}

flow.set("counters", counters);


// ============================================================
// CURRENT SHIFT INFORMATION
// ============================================================

const currentShift =
    String(msg.restoreShiftName || "");

const currentShiftDate =
    String(msg.restoreShiftDate || "");

const currentShiftStartIso =
    String(msg.restoreShiftStartIso || "");

if (
    !currentShift ||
    !currentShiftDate ||
    !currentShiftStartIso
) {
    node.error(
        "Missing restore shift information",
        msg
    );

    return null;
}


// ============================================================
// ENABLED DEVICES
// ============================================================

const devices =
    Object.entries(cfg)
        .filter(([, c]) => c.enabled === true)
        .map(([id]) => `"${id}"`)
        .join(", ");


// ============================================================
// RESTORE CURRENT SHIFT STATE ONLY
//
// CRITICAL DEPLOY-JUMP FIX:
// shift_count, raw_count and boot_id are all taken from the
// current shift/date only.
//
// If the current shift has no telemetry yet, this query returns
// nothing for that device. The next function leaves previousRaw
// and previousBootId as null so the first MQTT message becomes
// initial_sync with delta = 0.
// ============================================================

msg.query = `
from(bucket: "RCLH")

  |> range(
      start: time(v: "${currentShiftStartIso}")
  )

  |> filter(fn: (r) =>
      r._measurement == "tile_events"
  )

  |> filter(fn: (r) =>
      contains(
          value: r.device,
          set: [${devices}]
      )
  )

  |> filter(fn: (r) =>
      r.shift == "${currentShift}"
  )

  |> filter(fn: (r) =>
      r.shiftDate == "${currentShiftDate}"
  )

  |> filter(fn: (r) =>
      r._field == "shift_count" or
      r._field == "raw_count" or
      r._field == "boot_id"
  )

  |> group(
      columns: [
          "device",
          "_field"
      ]
  )

  |> last()
`;

node.status({
    fill: "yellow",
    shape: "ring",
    text:
        `restore current shift ${currentShiftDate} ${currentShift}`
});

return msg;