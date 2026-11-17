
const counterConfig =
    global.get("counterConfig") || {};

const globalLineSettings =
    global.get("lineSettings") || {};


// ============================================================
// WAIT UNTIL GLOBAL CONFIGURATION IS READY
// ============================================================

if (
    global.get("settingsReady") !== true ||
    global.get("counterConfigReady") !== true
) {

    node.status({
        fill: "yellow",
        shape: "ring",
        text: "waiting for global configuration"
    });

    return null;
}


if (
    Object.keys(counterConfig).length === 0
) {

    node.status({
        fill: "red",
        shape: "ring",
        text: "no counters configured"
    });

    return null;
}


// ============================================================
// RESTORE FLAGS
// ============================================================

flow.set(
    "counterRestoreReady",
    false
);

flow.set(
    "downtimeRestoreReady",
    false
);

flow.set(
    "pendingCounterTelemetry",
    {}
);


// ============================================================
// IMPORTANT:
//
// Preserve existing runtime communication information.
//
// MQTT retained status may arrive BEFORE this restore function.
//
// Previously:
//
// const counters = {};
//
// caused sensorStatus = Online to be destroyed and replaced
// with Unknown.
//
// We therefore read the existing counter state first.
// ============================================================

const existingCounters =
    flow.get("counters") || {};

const existingDowntimeStates =
    flow.get("downtimeStates") || {};


// New restore objects
const counters = {};

const downtimeStates = {};


// ============================================================
// BUILD COUNTER RUNTIME STATE
// ============================================================

for (
    const [deviceId, cfg]
    of Object.entries(counterConfig)
) {

    if (!cfg.enabled) {
        continue;
    }


    const existing =
        existingCounters[deviceId] || {};


    counters[deviceId] = {

        // ----------------------------------------------------
        // These values will be restored from InfluxDB
        // ----------------------------------------------------

        shiftCount: 0,

        deviceCount: 0,

        previousRaw: null,

        previousBootId: null,

        shiftName: null,

        shiftDate: null,


        // ----------------------------------------------------
        // PRESERVE MQTT COMMUNICATION STATE
        // ----------------------------------------------------

        lastSeen:
            existing.lastSeen ?? null,

        sensorStatus:
            existing.sensorStatus ??
            "Unknown",


        // ----------------------------------------------------
        // lastSignal will be restored from InfluxDB.
        //
        // Preserve it temporarily so status logic is not
        // unnecessarily lost while restore is in progress.
        // ----------------------------------------------------

        lastSignal:
            existing.lastSignal ?? null
    };


    // ========================================================
    // PRESERVE CURRENT DOWNTIME STATE TEMPORARILY
    // ========================================================

    const existingDown =
        existingDowntimeStates[deviceId] || {};


    downtimeStates[deviceId] = {

    status:
        existingDown.status ?? null,

    runningSince:
        existingDown.runningSince ?? null,

    lastEventTs:
        existingDown.lastEventTs ?? null,

    lastObservedSignal:
        existingDown.lastObservedSignal ?? null,

    pendingShiftRecovery:
        existingDown.pendingShiftRecovery ?? null
    };
}


// ============================================================
// SHIFT INFORMATION
// ============================================================

function getShiftInfo(
    timestamp = Date.now()
) {

    const p = {};


    for (
        const x
        of new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    "Asia/Colombo",

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit",

                hour:
                    "2-digit",

                hourCycle:
                    "h23"
            }
        ).formatToParts(
            new Date(timestamp)
        )
    ) {

        if (
            x.type !== "literal"
        ) {

            p[x.type] =
                x.value;
        }
    }


    const y =
        Number(p.year);

    const m =
        Number(p.month);

    const d =
        Number(p.day);

    const h =
        Number(p.hour);


    const fmt =
        (yy, mm, dd) =>
            `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;


    let shiftName;

    let shiftDate;

    let startIso;

    let endIso;


    // ========================================================
    // 06-14
    // ========================================================

    if (
        h >= 6 &&
        h < 14
    ) {

        shiftName =
            "06-14";

        shiftDate =
            fmt(
                y,
                m,
                d
            );

        startIso =
            `${shiftDate}T06:00:00+05:30`;

        endIso =
            `${shiftDate}T14:00:00+05:30`;
    }


    // ========================================================
    // 14-22
    // ========================================================

    else if (
        h >= 14 &&
        h < 22
    ) {

        shiftName =
            "14-22";

        shiftDate =
            fmt(
                y,
                m,
                d
            );

        startIso =
            `${shiftDate}T14:00:00+05:30`;

        endIso =
            `${shiftDate}T22:00:00+05:30`;
    }


    // ========================================================
    // 22-06 BEFORE MIDNIGHT
    // ========================================================

    else if (
        h >= 22
    ) {

        shiftName =
            "22-06";

        shiftDate =
            fmt(
                y,
                m,
                d
            );


        const dt =
            new Date(
                Date.UTC(
                    y,
                    m - 1,
                    d
                )
            );

        dt.setUTCDate(
            dt.getUTCDate() + 1
        );


        const next =
            dt
                .toISOString()
                .slice(0, 10);


        startIso =
            `${shiftDate}T22:00:00+05:30`;

        endIso =
            `${next}T06:00:00+05:30`;
    }


    // ========================================================
    // 22-06 AFTER MIDNIGHT
    // ========================================================

    else {

        shiftName =
            "22-06";


        const dt =
            new Date(
                Date.UTC(
                    y,
                    m - 1,
                    d
                )
            );


        dt.setUTCDate(
            dt.getUTCDate() - 1
        );


        shiftDate =
            dt
                .toISOString()
                .slice(0, 10);


        startIso =
            `${shiftDate}T22:00:00+05:30`;


        endIso =
            `${fmt(y, m, d)}T06:00:00+05:30`;
    }


    return {

        shiftName,

        shiftDate,

        startMs:
            new Date(
                startIso
            ).getTime(),

        endMs:
            new Date(
                endIso
            ).getTime(),

        startIso,

        endIso
    };
}


// ============================================================
// CURRENT SHIFT
// ============================================================

const currentShift =
    getShiftInfo();


for (
    const deviceId
    of Object.keys(counters)
) {

    counters[deviceId].shiftName =
        currentShift.shiftName;

    counters[deviceId].shiftDate =
        currentShift.shiftDate;
}


// ============================================================
// SAVE INITIAL RESTORE STATE
// ============================================================

flow.set(
    "counters",
    counters
);

flow.set(
    "downtimeStates",
    downtimeStates
);


// ============================================================
// PASS SHIFT INFORMATION THROUGH RESTORE FLOW
// ============================================================

msg.restoreShiftName =
    currentShift.shiftName;

msg.restoreShiftDate =
    currentShift.shiftDate;

msg.restoreShiftStartIso =
    currentShift.startIso;

msg.restoreShiftEndIso =
    currentShift.endIso;


// ============================================================
// ENABLED DEVICES
// ============================================================

const devices =
    Object.entries(
        counterConfig
    )
        .filter(
            ([, c]) =>
                c.enabled
        )
        .map(
            ([id]) =>
                `"${id}"`
        )
        .join(", ");


// ============================================================
// RESTORE LONG-TERM DEVICE STATE FROM INFLUXDB
//
// IMPORTANT:
// device_count and last_signal may safely come from older shifts.
// raw_count and boot_id MUST NOT be restored here.
// ============================================================

msg.query = `

from(bucket: "RCLH")

  |> range(start: -1h)

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
      r._field == "device_count" or
      r._field == "last_signal"
  )

  |> group(
      columns: [
          "device",
          "_field"
      ]
  )

  |> last()

`;

// ============================================================
// NODE STATUS
// ============================================================

node.status({

    fill:
        "yellow",

    shape:
        "ring",

    text:
        "restoring"
});


return msg;