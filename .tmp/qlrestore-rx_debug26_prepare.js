const p = msg.payload || {};
if (!p.device || !p.sensorStatus) return null;
const cfg = (global.get('counterConfig') || {})[p.device] || {};
msg.payload = [{
  measurement: 'device_status_debug',
  tags: { device: String(p.device), line: String(cfg.line || p.device) },
  fields: {
    status: String(p.sensorStatus),
    received_status: typeof p.receivedStatus === 'object' ? JSON.stringify(p.receivedStatus) : String(p.receivedStatus ?? ''),
    last_seen: Number(p.lastSeen || Date.now())
  },
  timestamp: Date.now()
}];
return msg;