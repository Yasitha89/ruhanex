// MongoDB is the permanent source of truth.
// Reset readiness before each manual/startup reload.
global.set("settingsReady", false);
global.set("counterConfigReady", false);
global.set("devicesReady", false);
flow.set("startupConfigTriggered", false);

const deviceMsg = RED.util.cloneMessage(msg);
deviceMsg.operation = "findOne";
deviceMsg.payload = [{ _id: "devices" }];

const lineMsg = RED.util.cloneMessage(msg);
lineMsg.operation = "findOne";
lineMsg.payload = [{ _id: "lineSettings" }];

return [deviceMsg, lineMsg];