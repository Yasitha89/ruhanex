/*
 * OPTIONAL validation function for the existing
 * GET /api/getHistoricalEnergyUsage Node-RED flow.
 *
 * The new React Energy Overview reuses that endpoint, so this is only needed
 * if your current flow does not yet validate the requested interval/date range.
 */

const params = msg.req?.query || {};

const panel = String(params.panel || "").trim();
const deviceId = Number(params.device_id);
const fromTime = String(params.from_time || "").trim();
const toTime = String(params.to_time || "").trim();
const interval = String(params.interval || "").trim();

const allowedIntervals = new Set(["1h", "6h", "1d", "1mo"]);

if (!panel) {
    msg.statusCode = 400;
    msg.payload = { success: false, error: "panel is required" };
    return [null, msg];
}

if (!Number.isFinite(deviceId)) {
    msg.statusCode = 400;
    msg.payload = { success: false, error: "device_id must be a number" };
    return [null, msg];
}

if (!fromTime || !Number.isFinite(Date.parse(fromTime))) {
    msg.statusCode = 400;
    msg.payload = { success: false, error: "from_time is invalid" };
    return [null, msg];
}

if (!toTime || !Number.isFinite(Date.parse(toTime))) {
    msg.statusCode = 400;
    msg.payload = { success: false, error: "to_time is invalid" };
    return [null, msg];
}

if (Date.parse(toTime) <= Date.parse(fromTime)) {
    msg.statusCode = 400;
    msg.payload = { success: false, error: "to_time must be after from_time" };
    return [null, msg];
}

if (!allowedIntervals.has(interval)) {
    msg.statusCode = 400;
    msg.payload = {
        success: false,
        error: "interval must be one of 1h, 6h, 1d, 1mo"
    };
    return [null, msg];
}

msg.energyRequest = {
    panel,
    deviceId,
    fromTime,
    toTime,
    interval
};

// Continue to your EXISTING Flux-query builder / InfluxDB node.
return [msg, null];
