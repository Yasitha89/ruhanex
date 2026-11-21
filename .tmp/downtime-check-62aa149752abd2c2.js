const rows = Array.isArray(msg.payload) ? [...msg.payload] : [];
const r = msg.summaryRequest;

if (!r) return null;

// ========================================================
// GET CONFIGURATION
// ========================================================

const cfgAll = global.get("counterConfig") || {};
const cfg = cfgAll[r.device] || {};

const allSettings = global.get("lineSettings") || {};

const ls =
    allSettings[r.line] ||
    allSettings[String(r.line).toLowerCase()] ||
    {};


const lineSpeed =
    Math.max(
        0,
        Number(
            ls.lineSpeed ??
            cfg.lineSpeed ??
            0
        )
    );


const tileSize =
    String(
        ls.tileSize ??
        cfg.tileSize ??
        ""
    ).trim();


const configuredPlannedDowntime =
    Math.max(
        0,
        Number(
            ls.plannedDowntime ??
            cfg.plannedDowntime ??
            0
        )
    );


// ========================================================
// SHIFT TIME RANGE
// ========================================================

const fromMs =
    new Date(r.fromTime).getTime();

const toMs =
    new Date(r.toTime).getTime();

const now =
    Date.now();


if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs <= fromMs
) {
    node.error(
        "Invalid shift time range",
        msg
    );

    return null;
}


// ========================================================
// HELPERS
// ========================================================

function round(v, n = 2) {

    const p =
        10 ** n;

    return Math.round(
        (Number(v || 0) + Number.EPSILON) * p
    ) / p;
}


function tileAreaM2(size) {

    const d =
        String(size || "")
            .toLowerCase()
            .replace(/\s+/g, "")
            .split("x")
            .map(Number);

    if (
        d.length !== 2 ||
        !d.every(
            v =>
                Number.isFinite(v) &&
                v > 0
        )
    ) {
        return 0;
    }

    // Tile dimensions assumed to be centimetres.
    return (
        d[0] *
        d[1]
    ) / 10000;
}


// ========================================================
// SHIFT TIME
// ========================================================

const calculationEndMs =
    Math.min(
        Math.max(now, fromMs),
        toMs
    );


const fullShiftMinutes =
    Math.max(
        0,
        (toMs - fromMs) / 60000
    );


const elapsedMinutes =
    Math.max(
        0,
        (calculationEndMs - fromMs) / 60000
    );


// ========================================================
// CLASSIFY DOWNTIME
//
// FINAL RULE:
//
// Planned -> Standard
//     Actual recorded duration is planned,
//     but limited by configured standard allowance.
//
//     Any duration above the allowance becomes
//     UNPLANNED.
//
// Planned -> Additional
//     Entire recorded duration is planned.
//
// Everything else
//     Unplanned.
//
// IMPORTANT:
//
// Unused configured standard allowance is NOT
// automatically distributed across the shift.
// ========================================================

let totalDowntimeMinutes = 0;

let standardActualMinutes = 0;
let additionalPlannedMinutes = 0;
let explicitUnplannedMinutes = 0;

let completedStops = 0;
let openStop = false;

let currentOpenStopMinutes = 0;
let maximumDowntimeMinutes = 0;


for (const stop of rows) {

    let start =
        Number(stop.stopStart_ts);

    if (!Number.isFinite(start)) {
        continue;
    }


    // Clamp start to shift boundary.
    start =
        Math.max(
            start,
            fromMs
        );


    const isOpen =
        stop.stopStop_ts === null ||
        stop.stopStop_ts === undefined;


    let end;

    if (isOpen) {

        end =
            calculationEndMs;

    } else {

        end =
            Number(
                stop.stopStop_ts
            );

        if (!Number.isFinite(end)) {
            continue;
        }

        end =
            Math.min(
                end,
                calculationEndMs,
                toMs
            );
    }


    if (end <= start) {
        continue;
    }


    const durationMinutes =
        (end - start) / 60000;


    // ----------------------------------------
    // TOTAL ACTUAL DOWNTIME
    // ----------------------------------------

    totalDowntimeMinutes +=
        durationMinutes;


    maximumDowntimeMinutes =
        Math.max(
            maximumDowntimeMinutes,
            durationMinutes
        );


    // ----------------------------------------
    // CLASSIFICATION
    // ----------------------------------------

    const downtimeType =
        String(
            stop.downtimeType ||
            "unplanned"
        ).toLowerCase();


    const plannedCategory =
        String(
            stop.plannedCategory ||
            ""
        ).toLowerCase();


    if (
        downtimeType === "planned" &&
        plannedCategory === "standard"
    ) {

        standardActualMinutes +=
            durationMinutes;

    }

    else if (
        downtimeType === "planned" &&
        plannedCategory === "additional"
    ) {

        additionalPlannedMinutes +=
            durationMinutes;

    }

    else {

        explicitUnplannedMinutes +=
            durationMinutes;

    }


    // ----------------------------------------
    // STOP COUNTS
    // ----------------------------------------

    if (isOpen) {

        openStop = true;

        currentOpenStopMinutes =
            Math.max(
                currentOpenStopMinutes,
                durationMinutes
            );

    } else {

        completedStops += 1;

    }
}


// ========================================================
// STANDARD PLANNED DOWNTIME
// ========================================================

const allowance =
    configuredPlannedDowntime;


// IMPORTANT:
//
// If allowance = 0,
// manually classified Standard Planned downtime
// remains planned.
//
// This matches the live KPI rule.

const standardUsed =
    allowance > 0
        ? Math.min(
            standardActualMinutes,
            allowance
        )
        : standardActualMinutes;


const remainingStandardAllowance =
    allowance > 0
        ? Math.max(
            0,
            allowance -
            standardUsed
        )
        : 0;


const standardExcess =
    allowance > 0
        ? Math.max(
            0,
            standardActualMinutes -
            allowance
        )
        : 0;



const standardApplied =
    standardUsed;


// ========================================================
// PLANNED / UNPLANNED DOWNTIME
// ========================================================

const plannedDowntimeMinutes =
    standardApplied +
    additionalPlannedMinutes;


// Everything not accepted as planned is unplanned.
//
// This automatically includes:
//     explicit unplanned
//     standard excess

const unplannedDowntimeMinutes =
    Math.max(
        0,
        totalDowntimeMinutes -
        plannedDowntimeMinutes
    );


// // ========================================================
// // PRODUCTION TIME
// // ========================================================

// // Planned production time:
// //
// // Elapsed shift time minus accepted planned downtime.

// const plannedProductionMinutes =
//     Math.max(
//         0,
//         elapsedMinutes -
//         plannedDowntimeMinutes
//     );


// // IMPORTANT:
// //
// // Physical operating time depends ONLY on
// // actual stoppage duration.
// //
// // Planned/unplanned classification does not
// // change physical operating time.

// // ========================================================
// // RUN CONFIRMATION CORRECTION
// // ========================================================
// //
// // STOP_END is confirmed only after the line has been running
// // continuously for requiredRunTimeMs.
// //
// // Tiles are already counted during this confirmation period,
// // while that same period is still included in the recorded
// // downtime. Add it back once for every COMPLETED stop.
// //
// // Open stops are intentionally excluded because they have not
// // completed the recovery-confirmation period yet.

// const requiredRunTimeMs =
//     Math.max(
//         0,
//         Number(
//             ls.requiredRunTimeMs ??
//             cfg.requiredRunTimeMs ??
//             60000
//         )
//     );

// const runConfirmationMinutes =
//     requiredRunTimeMs / 60000;

// const recoveryCorrectionMinutes =
//     completedStops *
//     runConfirmationMinutes;



// const actualOperatingMinutes =
//     Math.max(
//         0,
//         Math.min(
//             elapsedMinutes,
//             elapsedMinutes -
//             totalDowntimeMinutes +
//             recoveryCorrectionMinutes
//         )
//     );


// // ========================================================
// // AVAILABILITY
// // ========================================================

// const availability =
//     plannedProductionMinutes > 0
//         ? (
//             actualOperatingMinutes /
//             (plannedProductionMinutes+recoveryCorrectionMinutes)
//         ) * 100
//         : 0;

// ========================================================
// PRODUCTION TIME
// ========================================================

const plannedProductionMinutes = Math.max(
    0,
    elapsedMinutes - plannedDowntimeMinutes
);

// Stored STOP_END is already backdated to runningSince.
// The confirmation minute is therefore already operating time.
const actualOperatingMinutes = Math.max(
    0,
    Math.min(
        elapsedMinutes,
        elapsedMinutes - totalDowntimeMinutes
    )
);

// ========================================================
// AVAILABILITY
// ========================================================

const availability =
    plannedProductionMinutes > 0
        ? (actualOperatingMinutes / plannedProductionMinutes) * 100
        : 0;


// ========================================================
// PRODUCTION
// ========================================================

const tileCount =
    Math.max(
        0,
        Number(
            r.tileCount || 0
        )
    );


const areaPerTile =
    tileAreaM2(
        tileSize
    );


const production =
    tileCount *
    areaPerTile;


// ========================================================
// TARGET PRODUCTION
//
// Target is based on PHYSICAL OPERATING TIME.
//
// Example:
//
// Operating time = 400 min
// Rated speed    = 12 tiles/min
//
// Target = 4,800 tiles
// ========================================================

const targetTiles =
    lineSpeed > 0
        ? lineSpeed *
          actualOperatingMinutes
        : 0;


const targetProduction =
    targetTiles *
    areaPerTile;


// ========================================================
// PERFORMANCE
// ========================================================

const performance =
    targetTiles > 0
        ? (
            tileCount /
            targetTiles
        ) * 100
        : 0;


// ========================================================
// QUALITY
// ========================================================

// No reject / quality counter is currently available.
// Therefore quality remains 100%.

const quality =
    100;


// ========================================================
// OLE
// ========================================================

const ole =
    (
        availability *
        performance *
        quality
    ) / 10000;


// ========================================================
// BUILD SHIFT SUMMARY
// ========================================================

msg.payload = {

    lineStats: {

        // ----------------------------------------
        // IDENTIFICATION
        // ----------------------------------------

        device:
            r.device,

        lineName:
            r.line,

        machine:
            r.machine || "",

        shift:
            r.shift,

        shiftDate:
            r.shiftDate,

        shiftStart:
            r.fromTime,

        shiftEnd:
            r.toTime,

        status:
            r.shiftStatus ||
            "Unknown",

        // Configuration at the end of this shift. Run IDs inside
        // codeWiseProduction / Timeline identify individual production.
        productionRunId: r.productionRunIdAtShiftEnd || null,
        productionRunStartTime: r.productionRunStartTimeAtShiftEnd || null,


        // ----------------------------------------
        // KPI
        // ----------------------------------------

        ole:
            round(ole),

        availability:
            round(availability),

        performance:
            round(performance),

        quality:
            quality,


        // ----------------------------------------
        // PRODUCTION
        // ----------------------------------------

        tileCount:
            Math.round(tileCount),

        production:
            round(production),

        productionUnit:
            "mÂ²",

        targetTiles:
            round(targetTiles, 0),

        targetProduction:
            round(targetProduction),


        // ----------------------------------------
        // SHIFT TIME
        // ----------------------------------------

        fullShiftMinutes:
            round(fullShiftMinutes),

        elapsedShiftMinutes:
            round(elapsedMinutes),

        plannedProductionMinutes:
            round(
                plannedProductionMinutes
            ),

        actualOperatingMinutes:
            round(
                actualOperatingMinutes
            ),


        // ----------------------------------------
        // DOWNTIME
        // ----------------------------------------

        totalDowntimeMinutes:
            round(
                totalDowntimeMinutes
            ),

        plannedDowntimeMinutes:
            round(
                plannedDowntimeMinutes
            ),

        unplannedDowntimeMinutes:
            round(
                unplannedDowntimeMinutes
            ),


        // ----------------------------------------
        // STANDARD PLANNED
        // ----------------------------------------

        configuredPlannedDowntime:
            round(
                configuredPlannedDowntime
            ),

        recordedStandardDowntimeMinutes:
            round(
                standardActualMinutes
            ),

        standardPlannedDowntimeMinutes:
            round(
                standardApplied
            ),

        remainingStandardAllowanceMinutes:
            round(
                remainingStandardAllowance
            ),

        standardExcessDowntimeMinutes:
            round(
                standardExcess
            ),


        // ----------------------------------------
        // ADDITIONAL PLANNED
        // ----------------------------------------

        additionalPlannedDowntimeMinutes:
            round(
                additionalPlannedMinutes
            ),

        appliedPlannedDowntime:
            round(
                plannedDowntimeMinutes
            ),


        // ----------------------------------------
        // STOP INFORMATION
        // ----------------------------------------

        completedStops:
            completedStops,

        totalStops:
            rows.length,

        openStop:
            openStop,

        currentOpenStopMinutes:
            round(
                currentOpenStopMinutes
            ),

        maximumDowntimeMinutes:
            round(
                maximumDowntimeMinutes
            ),


        // ----------------------------------------
        // LINE CONFIGURATION
        // ----------------------------------------

        ratedLineSpeed:
            lineSpeed,

        tileSize:
            tileSize,

        stopDelayMs:
            Number(
                ls.stopDelayMs ??
                cfg.stopDelayMs ??
                60000
            ),

        maxPulseGapMs:
            Number(
                ls.maxPulseGapMs ??
                cfg.maxPulseGapMs ??
                10000
            ),

        requiredRunTimeMs:
            Number(
                ls.requiredRunTimeMs ??
                cfg.requiredRunTimeMs ??
                60000
            ),


        // Availability may legitimately exceed
        // 100% under this planned-downtime model.
        availabilityMayExceed100:
            true,


        source:
            "shift-summary",

        updatedAt:
            new Date().toISOString()
    }
};


// ========================================================
// SAVE TO MONGODB
// ========================================================

msg.collection =
    "shifts";

msg.operation =
    "insertOne";


return msg;