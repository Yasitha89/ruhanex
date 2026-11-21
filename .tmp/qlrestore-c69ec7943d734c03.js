const doc = Array.isArray(msg.payload) ? (msg.payload[0] || {}) : (msg.payload || {});
const devices = (doc.devices && typeof doc.devices === "object") ? doc.devices : {};

// Keep the complete device registry available to every Ruhanex flow.
global.set("devices", devices);

// Existing counter flow expects global.counterConfig. Build it dynamically
// from the central device registry, so no device list is hard-coded here.
const counterConfig = {};
for (const [key, cfg] of Object.entries(devices)) {
    const type = String(cfg?.deviceType || "").toLowerCase();
    if (key.startsWith("RX-CNT-") || type === "counter") {
        counterConfig[key] = cfg || {};
    }
}

global.set("counterConfig", counterConfig);
global.set("devicesReady", true);
global.set("counterConfigReady", true);

node.status({
    fill: Object.keys(counterConfig).length ? "green" : "yellow",
    shape: "dot",
    text: `${Object.keys(counterConfig).length} counters loaded`
});

msg.configPart = "devices";
return msg;