import fs from 'node:fs';

// Runs AFTER the existing timer. Its shifts, counts and stop timing are preserved.
export function annotateCommunication(result, flow, global, now) {
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
      if (!gap) gap = tracked[id] = { start: lastSeen > 0 && lastSeen <= now ? lastSeen : now, lastWrite: 0,
        evidence: offline ? 'mqtt_offline' : 'telemetry_timeout' };
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
    output.push({ collection: 'stoppages', mode: 'collection', operation: 'updateMany', payload: [
      { device: id, stopStart_ts: { $lt: active.end }, $or: [ { stopStop_ts: null }, { stopStop_ts: { $gt: active.start } } ] },
      { $set: { communicationAffected: true, communicationEvidence: active.evidence },
        $min: { communicationGapStart_ts: active.start }, $max: { communicationGapObservedUntil_ts: active.end } }
    ] });
  }
  // New STOP_START records are flagged directly: async Mongo operations may
  // otherwise execute the overlap update before the new insert completes.
  for (const message of output) {
    if (message.operation !== 'insertOne' || message.collection !== 'stoppages') continue;
    const row = message.payload?.[0];
    if (!row) continue;
    const gap = gaps.find(g => g.id === row.device && Number(row.stopStart_ts) < g.end && (row.stopStop_ts == null || Number(row.stopStop_ts) > g.start));
    if (gap) Object.assign(row, { communicationAffected: true, communicationEvidence: gap.evidence,
      communicationGapStart_ts: gap.start, communicationGapObservedUntil_ts: gap.end });
  }
  flow.set('communicationGapTracking', tracked);
  result[0] = output.length ? output : null;
  return result;
}

if (process.argv[2]) {
  const source = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  // Only replace the connected timer function, no credentials or other flows.
  const timer = source.find(n => n.id === 'd02981e2959d1438' && n.type === 'function');
  if (!timer) throw Error('Expected connected downtime timer was not found.');
  const patched = { ...timer, func: `${annotateCommunication}\nconst timerResult=(function(){\n${timer.func}\n})();\nreturn annotateCommunication(timerResult,flow,global,Date.now());` };
  fs.writeFileSync(new URL('./communication-stoppages.patch.flow.json', import.meta.url), JSON.stringify([patched], null, 2) + '\n');
  console.log('Generated communication-stoppages.patch.flow.json (one existing timer node).');
}
