const doc = Array.isArray(msg.payload) ? (msg.payload[0] || {}) : (msg.payload || {});

// Device Administration stores line configuration under doc.settings.
// doc.lineSettings is accepted too for backward compatibility.
const lineSettings =
    (doc.settings && typeof doc.settings === "object") ? doc.settings :
    (doc.lineSettings && typeof doc.lineSettings === "object") ? doc.lineSettings : {};

global.set("lineSettings", lineSettings);
global.set("settingsReady", true);

node.status({
    fill: Object.keys(lineSettings).length ? "green" : "yellow",
    shape: "dot",
    text: `${Object.keys(lineSettings).length} lines loaded`
});

msg.configPart = "lineSettings";
return msg;