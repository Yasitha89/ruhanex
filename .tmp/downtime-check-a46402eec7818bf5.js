function annotateCommunication(result, flow, global, now) {
    if (!result) return result;
    const counters = flow.get('counters') || {};
    const config = global.get('counterConfig') || {};
    const settings = global.get('lineSettings') || {};
    const tracked = flow.get('communicationGapTracking') || {};
    const output = result[0] ? (Array.isArray(result[0]) ? result[0] : [result[0]]) : [];
    const gaps = [];
    for (const [id, cfg] of Object.entries(config)) {
        if (cfg.enabled !== true || !counters[id]) continue;
        const state = counters[id];
        const ls = settings[cfg.line] || settings[String(cfg.line).toLowerCase()] || {};
        const timeout = Number(ls.communicationTimeoutMs ?? cfg.communicationTimeoutMs ?? 60000);
        if (!Number.isFinite(timeout) || timeout < 1000) continue;
        const lastSeen = Number(state.lastSeen || 0);
        const offline = String(state.sensorStatus || '').toLowerCase() === 'offline';
        const stale = lastSeen > 0 && now - lastSeen > timeout;
        let gap = tracked[id];
        if (offline || stale) {
            if (!gap) gap = tracked[id] = {
                start: lastSeen > 0 && lastSeen <= now ? lastSeen : now, lastWrite: 0,
                evidence: offline ? 'mqtt_offline' : 'telemetry_timeout'
            };
            if (offline) gap.evidence = 'mqtt_offline';
            gaps.push({ id, start: gap.start, end: now, evidence: gap.evidence });
            if (now - gap.lastWrite < 30000) continue;
            gap.lastWrite = now;
        } else if (gap) {
            // A fresh message confirms communication resumed. It does NOT prove
            // whether the machine was running throughout the missing interval.
            gaps.push({ id, start: gap.start, end: Math.min(now, Math.max(gap.start, lastSeen)), evidence: gap.evidence });
            delete tracked[id];
        } else continue;
        const active = gaps[gaps.length - 1];
        output.push({
            collection: 'stoppages', mode: 'collection', operation: 'updateMany', payload: [
                { device: id, stopStart_ts: { $lt: active.end }, $or: [{ stopStop_ts: null }, { stopStop_ts: { $gt: active.start } }] },
                {
                    $set: { communicationAffected: true, communicationEvidence: active.evidence },
                    $min: { communicationGapStart_ts: active.start }, $max: { communicationGapObservedUntil_ts: active.end }
                }
            ]
        });
    }
    // New STOP_START records are flagged directly: async Mongo operations may
    // otherwise execute the overlap update before the new insert completes.
    for (const message of output) {
        if (message.operation !== 'insertOne' || message.collection !== 'stoppages') continue;
        const row = message.payload?.[0];
        if (!row) continue;
        const gap = gaps.find(g => g.id === row.device && Number(row.stopStart_ts) < g.end && (row.stopStop_ts == null || Number(row.stopStop_ts) > g.start));
        if (gap) Object.assign(row, {
            communicationAffected: true, communicationEvidence: gap.evidence,
            communicationGapStart_ts: gap.start, communicationGapObservedUntil_ts: gap.end
        });
    }
    flow.set('communicationGapTracking', tracked);
    result[0] = output.length ? output : null;
    return result;
}
const timerResult = (function () {
    if (
        flow.get("counterRestoreReady") !== true ||
        flow.get("downtimeRestoreReady") !== true
    ) {
        return null;
    }

    const now = Date.now();

    const cfgAll =
        global.get("counterConfig") || {};

    let counters =
        flow.get("counters") || {};

    let downs =
        flow.get("downtimeStates") || {};

    const allLineSettings =
        global.get("lineSettings") || {};

    const mongoMsgs = [];
    const displayMsgs = [];
    const summaryMsgs = [];


    // ========================================================
    // SHIFT HELPER
    // ========================================================
    function getShiftInfo(timestamp = Date.now()) {

        const p = {};

        for (
            const x of new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone: "Asia/Colombo",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    hourCycle: "h23"
                }
            ).formatToParts(new Date(timestamp))
        ) {
            if (x.type !== "literal") {
                p[x.type] = x.value;
            }
        }

        const y = Number(p.year);
        const m = Number(p.month);
        const d = Number(p.day);
        const h = Number(p.hour);

        const fmt = (yy, mm, dd) =>
            `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;

        let shiftName;
        let shiftDate;
        let startIso;
        let endIso;


        // --------------------------------------------------------
        // 06:00 - 14:00
        // --------------------------------------------------------
        if (
            h >= 6 &&
            h < 14
        ) {

            shiftName = "06-14";
            shiftDate = fmt(y, m, d);

            startIso =
                `${shiftDate}T06:00:00+05:30`;

            endIso =
                `${shiftDate}T14:00:00+05:30`;
        }


        // --------------------------------------------------------
        // 14:00 - 22:00
        // --------------------------------------------------------
        else if (
            h >= 14 &&
            h < 22
        ) {

            shiftName = "14-22";
            shiftDate = fmt(y, m, d);

            startIso =
                `${shiftDate}T14:00:00+05:30`;

            endIso =
                `${shiftDate}T22:00:00+05:30`;
        }


        // --------------------------------------------------------
        // 22:00 - MIDNIGHT
        // --------------------------------------------------------
        else if (
            h >= 22
        ) {

            shiftName = "22-06";
            shiftDate = fmt(y, m, d);

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


        // --------------------------------------------------------
        // MIDNIGHT - 06:00
        // --------------------------------------------------------
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
            startIso,
            endIso,

            startMs:
                new Date(startIso).getTime(),

            endMs:
                new Date(endIso).getTime()
        };
    }


    // ========================================================
    // GET RANGE FOR A SAVED SHIFT
    // ========================================================
    function getShiftRange(
        shiftName,
        shiftDate
    ) {

        const dt =
            new Date(
                `${shiftDate}T00:00:00Z`
            );


        if (
            shiftName === "06-14"
        ) {

            return {
                startIso:
                    `${shiftDate}T06:00:00+05:30`,

                endIso:
                    `${shiftDate}T14:00:00+05:30`
            };
        }


        if (
            shiftName === "14-22"
        ) {

            return {
                startIso:
                    `${shiftDate}T14:00:00+05:30`,

                endIso:
                    `${shiftDate}T22:00:00+05:30`
            };
        }


        dt.setUTCDate(
            dt.getUTCDate() + 1
        );

        const next =
            dt
                .toISOString()
                .slice(0, 10);


        return {
            startIso:
                `${shiftDate}T22:00:00+05:30`,

            endIso:
                `${next}T06:00:00+05:30`
        };
    }


    // ========================================================
    // CREATE STOP_START
    // ========================================================
    // Boot identity is observed when this timer processes the event. Event timestamps
    // can be backdated, so observation times are stored separately.
    function sensorBootId(id) {
        // Process ALL Counters uses previousBootId as its live counting baseline.
        // Prefer it over a legacy bootId field that may be null or stale.
        const value = counters[id]?.previousBootId ?? counters[id]?.bootId ?? counters[id]?.boot_id;
        if (typeof value === "string") return value.trim() || null;
        if (typeof value === "number" && Number.isFinite(value)) return String(value);
        return null;
    }

    function mongoStart(
        id,
        cfg,
        shiftName,
        shiftDate,
        ts
    ) {

        return {

            collection:
                "stoppages",

            mode:
                "collection",

            operation:
                "insertOne",

            payload: [
                {
                    date:
                        shiftDate,

                    shift:
                        shiftName,

                    device:
                        id,

                    line:
                        String(
                            cfg.line || id
                        ),

                    machine:
                        String(
                            cfg.machine || ""
                        ),

                    downStatus:
                        "STOP_START",

                    stopStart_ts:
                        Number(ts),

                    bootIdAtStopStart: sensorBootId(id),
                    bootIdAtStopEnd: null,
                    bootIdStartObservedAt: new Date().toISOString(),
                    bootIdEndObservedAt: null,

                    stopStop_ts:
                        null,

                    reason:
                        ""
                }
            ]
        };
    }


    // ========================================================
    // CLOSE OPEN STOP
    //
    // IMPORTANT:
    // Only closes an open stop belonging to the SAME:
    //
    // device
    // line
    // shift
    // date
    //
    // Also prevents STOP_END being earlier than STOP_START.
    // ========================================================
    function mongoEnd(
        id,
        cfg,
        shiftName,
        shiftDate,
        ts
    ) {

        return {

            collection:
                "stoppages",

            mode:
                "collection",

            operation:
                "updateOne",

            payload: [
                {
                    device:
                        id,

                    line:
                        String(
                            cfg.line || id
                        ),

                    shift:
                        shiftName,

                    date:
                        shiftDate,

                    downStatus:
                        "STOP_START",

                    stopStop_ts:
                        null,

                    stopStart_ts: {
                        $lte:
                            Number(ts)
                    }
                },

                {
                    $set: {
                        downStatus:
                            "STOP_END",

                        stopStop_ts:
                            Number(ts),

                        bootIdAtStopEnd: sensorBootId(id),
                        bootIdEndObservedAt: new Date().toISOString()
                    }
                }
            ]
        };
    }


    // ========================================================
    // CURRENT SHIFT
    // ========================================================
    const currentShift =
        getShiftInfo(now);


    // ========================================================
    // PROCESS EACH COUNTER
    // ========================================================
    for (
        const [id, cfg]
        of Object.entries(cfgAll)
    ) {

        if (!cfg.enabled) {
            continue;
        }


        const state =
            counters[id];

        if (!state) {
            continue;
        }


        // ====================================================
        // INITIALIZE DOWNTIME STATE
        // ====================================================
        if (!downs[id]) {

            downs[id] = {

                status:
                    "Stopped",

                runningSince:
                    null,

                lastEventTs:
                    null,

                lastObservedSignal:
                    null,

                /*
                 * Used only when:
                 *
                 * production restarts before a shift boundary,
                 * but REQUIRED_RUN_TIME confirmation finishes
                 * after the boundary.
                 */
                pendingShiftRecovery:
                    null
            };
        }


        const down =
            downs[id];


        // Backward compatibility with existing flow context
        if (
            down.pendingShiftRecovery === undefined
        ) {
            down.pendingShiftRecovery =
                null;
        }


        // ====================================================
        // LINE SETTINGS
        // ====================================================
        const ls =
            allLineSettings[cfg.line] ||
            allLineSettings[
            String(cfg.line).toLowerCase()
            ] ||
            {};


        const STOP_DELAY =
            Number(
                ls.stopDelayMs ??
                60000
            );


        const MAX_PULSE_GAP =
            Number(
                ls.maxPulseGapMs ??
                10000
            );


        const REQUIRED_RUN_TIME =
            Number(
                ls.requiredRunTimeMs ??
                60000
            );


        // ====================================================
        // PRODUCTION SIGNAL STATE
        //
        // IMPORTANT:
        // This is now evaluated BEFORE shift transition.
        // ====================================================
        const lastSignal =
            Number(
                state.lastSignal || 0
            );


        const since =
            lastSignal > 0
                ? now - lastSignal
                : Number.MAX_SAFE_INTEGER;


        const previousObservedSignal =
            Number(
                down.lastObservedSignal || 0
            );


        const hasNewProductionSignal =
            lastSignal > 0 &&
            lastSignal !==
            previousObservedSignal;


        const signalGap =
            previousObservedSignal > 0 &&
                lastSignal > 0

                ? lastSignal -
                previousObservedSignal

                : null;


        // ====================================================
        // NEW PRODUCTION SIGNAL
        // ====================================================
        if (
            hasNewProductionSignal
        ) {

            if (
                down.status ===
                "Stopped"
            ) {

                /*
                 * Start sustained-running confirmation
                 * from first real production signal.
                 */
                if (
                    !down.runningSince ||
                    signalGap === null ||
                    signalGap >
                    MAX_PULSE_GAP
                ) {

                    down.runningSince =
                        lastSignal;
                }
            }


            down.lastObservedSignal =
                lastSignal;
        }


        // ====================================================
        // SHIFT CHANGE
        // ====================================================
        if (
            state.shiftName !==
            currentShift.shiftName ||

            state.shiftDate !==
            currentShift.shiftDate
        ) {

            const oldShift =
                state.shiftName;

            const oldDate =
                state.shiftDate;

            const oldCount =
                Number(
                    state.shiftCount || 0
                );

            const boundary =
                currentShift.startMs;


            // =================================================
            // DETECT RECOVERY THAT STARTED BEFORE BOUNDARY
            // =================================================
            const recoveryStartedAt =
                Number(
                    down.runningSince || 0
                );


            const recoveryCrossingBoundary =
                down.status === "Stopped" &&

                recoveryStartedAt > 0 &&

                recoveryStartedAt <
                boundary &&

                lastSignal > 0 &&

                since <=
                MAX_PULSE_GAP;


            // =================================================
            // BUILD OLD SHIFT SUMMARY REQUEST
            // =================================================
            let oldShiftSummary =
                null;


            if (
                oldShift &&
                oldDate
            ) {

                const range =
                    getShiftRange(
                        oldShift,
                        oldDate
                    );


                oldShiftSummary = {

                    summaryRequest: {

                        device:
                            id,

                        line:
                            String(
                                cfg.line || id
                            ),

                        machine:
                            String(
                                cfg.machine || ""
                            ),

                        shift:
                            oldShift,

                        shiftDate:
                            oldDate,

                        fromTime:
                            range.startIso,

                        toTime:
                            range.endIso,

                        tileCount:
                            oldCount,

                        shiftStatus:
                            down.status ||
                            "Unknown",

                        // Configuration snapshot captured when the old shift closes.
                        // Not a substitute for per-event run tags if a changeover
                        // happened within this shift.
                        productionRunIdAtShiftEnd:
                            String(ls.productionRunId || "") || null,
                        productionRunStartTimeAtShiftEnd:
                            ls.productionRunStartTime || null
                    }
                };
            }


            // =================================================
            // LINE IS STOPPED AT SHIFT CHANGE
            // =================================================
            if (
                down.status ===
                "Stopped" &&

                oldShift &&
                oldDate
            ) {

                // =============================================
                // CASE 1:
                //
                // Production already restarted BEFORE
                // shift boundary, but REQUIRED_RUN_TIME
                // is still being confirmed.
                //
                // DO NOT SPLIT STOP YET.
                // =============================================
                if (
                    recoveryCrossingBoundary
                ) {

                    down.pendingShiftRecovery = {

                        oldShift:
                            oldShift,

                        oldDate:
                            oldDate,

                        boundary:
                            boundary,

                        summaryRequest:
                            oldShiftSummary
                    };


                    /*
                     * Do not:
                     *
                     * close old stop at boundary
                     * create new stop at boundary
                     *
                     * We wait to see whether recovery
                     * becomes confirmed or fails.
                     */
                }


                // =============================================
                // CASE 2:
                //
                // Genuinely stopped through boundary.
                // Normal shift split.
                // =============================================
                else {

                    mongoMsgs.push(
                        mongoEnd(
                            id,
                            cfg,
                            oldShift,
                            oldDate,
                            boundary
                        )
                    );


                    mongoMsgs.push(
                        mongoStart(
                            id,
                            cfg,
                            currentShift.shiftName,
                            currentShift.shiftDate,
                            boundary
                        )
                    );


                    down.lastEventTs =
                        boundary;


                    down.pendingShiftRecovery =
                        null;


                    if (
                        oldShiftSummary
                    ) {

                        summaryMsgs.push(
                            oldShiftSummary
                        );
                    }
                }
            }


            // =================================================
            // LINE WAS RUNNING AT SHIFT CHANGE
            // =================================================
            else {

                if (
                    oldShiftSummary
                ) {

                    summaryMsgs.push(
                        oldShiftSummary
                    );
                }
            }


            // =================================================
            // RESET SHIFT COUNTER
            // =================================================
            state.shiftCount =
                0;


            state.shiftName =
                currentShift.shiftName;


            state.shiftDate =
                currentShift.shiftDate;


            // =================================================
            // DISPLAY RESET
            // =================================================
            displayMsgs.push({

                topic:
                    cfg.displayTopic ||
                    `display/${id}/shiftCount`,

                payload:
                    JSON.stringify({

                        device:
                            id,

                        line:
                            cfg.line,

                        shift:
                            state.shiftName,

                        shiftDate:
                            state.shiftDate,

                        count:
                            0
                    })
            });
        }


        // ====================================================
        // CURRENT DOWNTIME STATE
        // ====================================================
        const oldStatus =
            down.status ||
            "Stopped";


        let newStatus =
            oldStatus;


        let eventTs =
            null;


        // ====================================================
        // PENDING CROSS-SHIFT RECOVERY FAILED
        //
        // Production started before shift boundary,
        // but stopped again before REQUIRED_RUN_TIME.
        //
        // Therefore the original downtime really DID
        // continue through the shift boundary.
        // ====================================================
        if (
            oldStatus === "Stopped" &&

            down.pendingShiftRecovery &&

            since >
            MAX_PULSE_GAP
        ) {

            const pending =
                down.pendingShiftRecovery;


            // Close previous shift stop
            // exactly at shift boundary.
            mongoMsgs.push(
                mongoEnd(
                    id,
                    cfg,
                    pending.oldShift,
                    pending.oldDate,
                    pending.boundary
                )
            );


            // Create new shift stop
            // exactly at boundary.
            mongoMsgs.push(
                mongoStart(
                    id,
                    cfg,
                    state.shiftName,
                    state.shiftDate,
                    pending.boundary
                )
            );


            down.lastEventTs =
                pending.boundary;


            // Save old shift summary now that
            // we know recovery actually failed.
            if (
                pending.summaryRequest
            ) {

                pending.summaryRequest
                    .summaryRequest
                    .shiftStatus =
                    "Stopped";


                summaryMsgs.push(
                    pending.summaryRequest
                );
            }


            down.pendingShiftRecovery =
                null;


            down.runningSince =
                null;
        }


        // ====================================================
        // RUNNING -> STOPPED
        // ====================================================
        if (
            since >
            STOP_DELAY
        ) {

            down.runningSince =
                null;


            if (
                oldStatus !==
                "Stopped"
            ) {

                newStatus =
                    "Stopped";


                /*
                 * Downtime begins from last
                 * real production signal.
                 */
                eventTs =
                    lastSignal > 0

                        ? lastSignal

                        : now -
                        STOP_DELAY;
            }
        }


        // ====================================================
        // STOPPED -> RUNNING
        // ====================================================
        else if (
            oldStatus ===
            "Stopped"
        ) {

            // -----------------------------------------------
            // Production confirmation broken
            // -----------------------------------------------
            if (
                since >
                MAX_PULSE_GAP
            ) {

                down.runningSince =
                    null;
            }


            // -----------------------------------------------
            // Production confirmed
            // -----------------------------------------------
            if (
                down.runningSince &&

                since <=
                MAX_PULSE_GAP &&

                (
                    now -
                    down.runningSince
                ) >=
                REQUIRED_RUN_TIME
            ) {

                newStatus =
                    "Running";


                /*
                 * STOP_END is backdated to the first
                 * signal of confirmed continuous running.
                 */
                eventTs =
                    Number(
                        down.runningSince
                    );


                down.runningSince =
                    null;
            }
        }


        // ====================================================
        // STATUS CHANGED
        // ====================================================
        if (
            newStatus !==
            oldStatus
        ) {

            down.status =
                newStatus;


            down.lastEventTs =
                eventTs;


            // =================================================
            // RUNNING -> STOPPED
            // =================================================
            if (
                newStatus ===
                "Stopped"
            ) {

                mongoMsgs.push(
                    mongoStart(
                        id,
                        cfg,
                        state.shiftName,
                        state.shiftDate,
                        eventTs
                    )
                );
            }


            // =================================================
            // STOPPED -> RUNNING
            // =================================================
            else {

                // =============================================
                // RECOVERY STARTED IN PREVIOUS SHIFT
                // =============================================
                if (
                    down.pendingShiftRecovery
                ) {

                    const pending =
                        down.pendingShiftRecovery;


                    /*
                     * IMPORTANT:
                     *
                     * Recovery began BEFORE the shift
                     * boundary.
                     *
                     * Therefore close the PREVIOUS
                     * shift's stop using the actual
                     * recovery-start timestamp.
                     *
                     * Do NOT attempt to close a
                     * current-shift stop because one
                     * was never created.
                     */
                    mongoMsgs.push(
                        mongoEnd(
                            id,
                            cfg,
                            pending.oldShift,
                            pending.oldDate,
                            eventTs
                        )
                    );


                    // Save old shift summary after
                    // recovery has been confirmed.
                    if (
                        pending.summaryRequest
                    ) {

                        pending
                            .summaryRequest
                            .summaryRequest
                            .shiftStatus =
                            "Running";


                        summaryMsgs.push(
                            pending.summaryRequest
                        );
                    }


                    down.pendingShiftRecovery =
                        null;
                }


                // =============================================
                // NORMAL SAME-SHIFT RECOVERY
                // =============================================
                else {

                    mongoMsgs.push(
                        mongoEnd(
                            id,
                            cfg,
                            state.shiftName,
                            state.shiftDate,
                            eventTs
                        )
                    );
                }
            }
        }


        // ====================================================
        // SAVE DEVICE STATE
        // ====================================================
        counters[id] =
            state;


        downs[id] =
            down;
    }


    // ========================================================
    // SAVE FLOW CONTEXT
    // ========================================================
    flow.set(
        "counters",
        counters
    );


    flow.set(
        "downtimeStates",
        downs
    );


    // ========================================================
    // NODE STATUS
    // ========================================================
    node.status({

        fill:
            "green",

        shape:
            "dot",

        text:
            `${Object.values(cfgAll)
                .filter(x => x.enabled)
                .length} lines`
    });


    // ========================================================
    // OUTPUTS
    //
    // OUTPUT 1 = MongoDB downtime
    // OUTPUT 2 = Display
    // OUTPUT 3 = Shift summary
    // ========================================================
    return [

        mongoMsgs.length
            ? mongoMsgs
            : null,

        displayMsgs.length
            ? displayMsgs
            : null,

        summaryMsgs.length
            ? summaryMsgs
            : null
    ];
})();
return annotateCommunication(timerResult, flow, global, Date.now());