const m=String(msg.topic||"").match(/^RX-CNT\/([^/]+)\/telemetry$/);
if (!m) return null;

const id="RX-CNT-"+m[1];
const cfg=global.get("counterConfig")||{};
if (!cfg[id] || cfg[id].enabled!==true) return null;

if (flow.get("counterRestoreReady")!==true || flow.get("downtimeRestoreReady")!==true) {
    const pending=flow.get("pendingCounterTelemetry")||{};
    pending[id]={topic:msg.topic,payload:msg.payload};
    flow.set("pendingCounterTelemetry",pending);
    return null;
}
return msg;