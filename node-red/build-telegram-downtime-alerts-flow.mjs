import fs from 'node:fs';

export function downtimeAlertTools() {
  const boundary = ts => {
    const d = new Date(ts + 330 * 60000);
    return [6, 14, 22].includes(d.getUTCHours()) && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  };
  const chain = records => {
    const rows = records.filter(r => Number.isFinite(Number(r.stopStart_ts)) && Number(r.stopStart_ts) > 0)
      .sort((a, b) => Number(b.stopStart_ts) - Number(a.stopStart_ts));
    if (!rows.length) return null;
    const newest = rows[0]; let start = Number(newest.stopStart_ts);
    const linked = [newest];
    for (const row of rows.slice(1)) {
      if (Number(row.stopStart_ts) === start) continue;
      if (boundary(start) && row.stopStop_ts != null && Number(row.stopStop_ts) === start && Number(row.stopStart_ts) < start) {
        linked.push(row); start = Number(row.stopStart_ts);
      } else if (Number(row.stopStart_ts) < start) break;
    }
    const reason = linked.map(r => String(r.reason || r.downtimeReason || r.downtimeCode || '').trim()).find(Boolean) || 'Reason not assigned yet';
    return { start, end: newest.stopStop_ts == null ? null : Number(newest.stopStop_ts), reason,
      incomplete: rows.length >= 1000 && start === Number(rows.at(-1).stopStart_ts) && boundary(start) };
  };
  const time = ts => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
  const text = (device, episode, bucket) => {
    const recovered = bucket === 'running';
    const mins = Math.floor(((recovered ? episode.end : episode.observedAt) - episode.start) / 60000);
    return [recovered ? '✅ LINE RUNNING AGAIN' : '🚨 DOWNTIME ALERT', `Line: ${device.line}`,
      `Stopped at: ${time(episode.start)}`, `${recovered ? 'Total downtime' : 'Downtime'}: ${mins} minutes`,
      ...(recovered ? [`Running from: ${time(episode.end)}`] : []), `Reason: ${episode.reason.slice(0, 1000)}`].join('\n');
  };
  return { boundary, chain, text };
}

// Place this Function on the SAME TAB as ALL Lines: Downtime + Shift Change.
export function runtimeSnapshot(msg, flow, global, now = Date.now()) {
  if (flow.get('counterRestoreReady') !== true || flow.get('downtimeRestoreReady') !== true) return null;
  const config = global.get('counterConfig') || {}, states = flow.get('downtimeStates') || {};
  const devices = [];
  for (const [id, cfg] of Object.entries(config)) {
    const down = states[id];
    if (!cfg.enabled || !down || !['Running', 'Stopped'].includes(down.status)) continue;
    const event = Number(down.lastEventTs || 0);
    devices.push({ device: id, line: String(cfg.line || id), status: down.status, event,
      pending: Boolean(down.pendingShiftRecovery) });
  }
  return { downtimeSnapshot: { at: now, devices } };
}

export function downtimeAlertStep(msg, env, flow, tools, now = Date.now()) {
  const token = String(env.get('TELEGRAM_BOT_TOKEN') || '');
  const store = env.get('DOWNTIME_ALERT_CONTEXT_STORE') || undefined;
  const lock = () => flow.get('telegramDowntimeAlertLock', store);
  const setLock = value => flow.set('telegramDowntimeAlertLock', value, store);
  const finish = (ok, description) => {
    if (lock()?.id === msg.dt?.id) setLock(null);
    return [null, null, { payload: { ok, description } }];
  };
  if (!msg.dt) {
    if (String(env.get('DOWNTIME_ALERT_ENABLED')).toLowerCase() !== 'true') return null;
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return finish(false, 'Set TELEGRAM_BOT_TOKEN on the alert tab.');
    if (!Array.isArray(msg.downtimeSnapshot?.devices) || now - msg.downtimeSnapshot.at > 60000) return finish(false, 'Missing or stale runtime snapshot.');
    if (lock()?.until > now) return null;
    msg.dt = { id: msg._msgid || String(now), queue: msg.downtimeSnapshot.devices, at: msg.downtimeSnapshot.at };
  }
  const s = msg.dt;
  if (lock() && lock().id !== s.id) return null;
  setLock({ id: s.id, until: now + 300000 });
  const db = (operation, args, stage) => { s.stage = stage; msg.dtDb = operation; msg.payload = args; delete msg.url; delete msg.headers; return [msg, null, null]; };
  const next = () => {
    while (s.queue.length) {
      s.device = s.queue.shift();
      if (s.device.pending) continue;
      if (s.device.status === 'Running' && !(s.device.event > 0)) continue;
      return db('stops.find', [{ device: s.device.device }, { sort: { stopStart_ts: -1 }, limit: 1000 }], 'stops');
    }
    return finish(true, 'Downtime alert poll complete.');
  };
  const checkpoint = () => db('events.updateOne', [{ _id: s.eventKey, runId: s.id, status: 'sending' }, {
    $set: { [`processed.${s.target._id}`]: true, leaseUntil: new Date(now + 300000) },
  }], 'checkpoint');
  const recipient = () => {
    while (s.recipientIndex < s.delivery.recipients.length) {
      s.target = s.delivery.recipients[s.recipientIndex++];
      if (s.delivery.processed?.[s.target._id]) continue;
      return db('telegram.findOne', [{ _id: s.target._id, approved: true, ruhanexUsername: s.target.ruhanexUsername,
        approvalRevision: s.target.approvalRevision }], 'approval');
    }
    return db('events.updateOne', [{ _id: s.eventKey, runId: s.id, status: 'sending' }, { $set: { status: 'sent', leaseUntil: new Date(0), completedAt: new Date(now) } }], 'completed');
  };
  if (!s.stage) return next();
  if (s.stage === 'stops') {
    if (!Array.isArray(msg.payload)) return finish(false, 'Invalid stoppages query response.');
    s.episode = tools.chain(msg.payload.filter(row => row.device === s.device.device));
    if (!s.episode || s.episode.incomplete || s.episode.start > s.at) return next();
    if (s.device.status === 'Stopped' && s.episode.end !== null) return next(); // Wait for boundary reopen write.
    if (s.device.status === 'Running' && (s.episode.end === null || s.episode.end !== s.device.event)) return next(); // DB must agree with confirmed recovery.
    s.episode.observedAt = s.at;
    s.episodeKey = `${s.device.device}|${s.episode.start}`;
    return db('episodes.findOne', [{ _id: s.episodeKey }], 'episode');
  }
  if (s.stage === 'episode') {
    const saved = msg.payload;
    if (s.device.status === 'Running') {
      if (!saved?.alertSent || saved.recovered) return next();
      s.bucket = 'running';
    } else {
      const bucket = Math.floor((s.at - s.episode.start) / 1800000);
      if (bucket < 1 || saved?.recovered || Number(saved?.lastBucket || 0) >= bucket) return next();
      s.bucket = bucket;
    }
    s.eventKey = `${s.episodeKey}|${s.bucket}`;
    s.text = tools.text(s.device, s.episode, s.bucket);
    return db('telegram.find', [{ approved: true }, { limit: 501 }], 'recipients');
  }
  if (s.stage === 'recipients') {
    if (!Array.isArray(msg.payload) || msg.payload.length > 500) return finish(false, 'Expected at most 500 approved registrations.');
    const recipients = msg.payload.filter(r => /^[1-9]\d{0,19}$/.test(r._id) && typeof r.ruhanexUsername === 'string' && typeof r.approvalRevision === 'string')
      .map(({ _id, ruhanexUsername, ruhanexAccountGeneration, approvalRevision }) => ({ _id, ruhanexUsername, ruhanexAccountGeneration, approvalRevision }));
    return db('events.updateOne', [{ _id: s.eventKey }, { $setOnInsert: { text: s.text, recipients, processed: {}, status: 'pending',
      leaseUntil: new Date(0), createdAt: new Date(now), device: s.device.device, episodeStart: s.episode.start, bucket: s.bucket } }, { upsert: true }], 'ensured');
  }
  if (s.stage === 'ensured') {
    if (msg.payload?.acknowledged !== true) return finish(false, 'Could not initialize alert delivery.');
    return db('events.updateOne', [{ _id: s.eventKey, status: { $ne: 'sent' }, leaseUntil: { $lte: new Date(now) } },
      { $set: { runId: s.id, status: 'sending', leaseUntil: new Date(now + 300000) } }], 'claimed');
  }
  if (s.stage === 'claimed') {
    s.claimed = msg.payload?.acknowledged === true && msg.payload.matchedCount === 1;
    return db('events.findOne', [{ _id: s.eventKey }], 'delivery');
  }
  if (s.stage === 'delivery') {
    if (msg.payload?.status === 'sent') return next();
    if (!s.claimed || msg.payload?.runId !== s.id) return next();
    s.delivery = msg.payload; s.recipientIndex = 0; return recipient();
  }
  if (s.stage === 'approval') {
    if (!msg.payload) return checkpoint();
    return db('users.findOne', [{ _id: s.target.ruhanexUsername }], 'manager');
  }
  if (s.stage === 'manager') {
    const user = msg.payload;
    if (!user || user.role !== 'Manager' || user.enabled !== true || user.mustChangePassword === true ||
      (user.accountGeneration ?? null) !== s.target.ruhanexAccountGeneration) return checkpoint();
    msg.method = 'POST'; msg.url = `https://api.telegram.org/bot${token}/sendMessage`;
    msg.headers = { 'Content-Type': 'application/json' }; msg.requestTimeout = 15000;
    msg.payload = JSON.stringify({ chat_id: s.target._id, text: s.delivery.text });
    s.stage = 'sent'; return [null, msg, null];
  }
  if (s.stage === 'sent') {
    if (msg.statusCode === 200 && msg.payload?.ok === true) {
      // Persist evidence that at least one Manager received an alert before allowing recovery notices.
      return db('episodes.updateOne', [{ _id: s.episodeKey }, { $set: { alertSent: true, updatedAt: new Date(now) },
        $setOnInsert: { device: s.device.device, start: s.episode.start } }, { upsert: true }], 'accepted');
    }
    if ([400, 403].includes(msg.payload?.error_code)) return checkpoint();
    return finish(false, 'Telegram delivery failed; unprocessed recipients retry after the five-minute lease.');
  }
  if (s.stage === 'accepted') {
    if (msg.payload?.acknowledged !== true) return finish(false, 'Cannot save accepted alert state.');
    return checkpoint();
  }
  if (s.stage === 'checkpoint') {
    if (msg.payload?.acknowledged !== true || msg.payload.matchedCount !== 1) return finish(false, 'Cannot checkpoint recipient delivery.');
    s.delivery.processed[s.target._id] = true; return recipient();
  }
  if (s.stage === 'completed') {
    if (msg.payload?.acknowledged !== true || msg.payload.matchedCount !== 1) return finish(false, 'Cannot complete downtime delivery.');
    return db('episodes.updateOne', [{ _id: s.episodeKey }, { $set: { ...(s.bucket === 'running' ? { recovered: true, recoveryTime: s.episode.end } : { lastBucket: s.bucket }), updatedAt: new Date(now) },
      $setOnInsert: { device: s.device.device, start: s.episode.start } }, { upsert: true }], 'recorded');
  }
  if (s.stage === 'recorded') return msg.payload?.acknowledged === true ? next() : finish(false, 'Could not save downtime episode progress.');
  return finish(false, 'Unexpected downtime alert stage.');
}

const tab = 'rx_telegram_downtime_tab';
const nodes = [{ id: tab, type: 'tab', label: 'Telegram continuous downtime alerts', disabled: false, env: [], info: 'Requires snapshot connector on the actual downtime timer tab. Set DOWNTIME_ALERT_ENABLED=true and TELEGRAM_BOT_TOKEN. Managers only. Read telegram-downtime-alerts.README.md.' }];
const fn = (id, name, func, outputs, wires, x, y, z = tab) => nodes.push({ id, z, type: 'function', name, func, outputs, wires, x, y, initialize: '', finalize: '', libs: [], noerr: 0 });
nodes.push({ id: 'rx_dt_in', z: tab, type: 'link in', name: 'Confirmed downtime runtime snapshots', links: [], x: 140, y: 120, wires: [['rx_dt_step']] });
fn('rx_dt_step', 'Continuous stop + interval/recovery alerts', `const tools=(${downtimeAlertTools.toString()})();\ntry{return (${downtimeAlertStep.toString()})(msg,env,flow,tools);}catch{node.error('Downtime alert failed.',msg);return;}`, 3, [['rx_dt_router'], ['rx_dt_http'], ['rx_dt_debug']], 470, 120);
const ops = ['stops.find', 'episodes.findOne', 'episodes.updateOne', 'telegram.find', 'events.updateOne', 'events.findOne', 'telegram.findOne', 'users.findOne'];
nodes.push({ id: 'rx_dt_router', z: tab, type: 'switch', name: 'Downtime alert database operation', property: 'dtDb', propertyType: 'msg', rules: ops.map(v => ({ t: 'eq', v, vt: 'str' })), outputs: ops.length, checkall: 'true', wires: ops.map((_, i) => [i === 6 ? 'rx_dt_pace' : `rx_dt_db_${i}`]), x: 780, y: 120 });
ops.forEach((op, i) => nodes.push({ id: `rx_dt_db_${i}`, z: tab, type: 'mongodb4', name: op, clientNode: '8120871193b8f276', mode: 'collection', collection: { stops: 'stoppages', episodes: 'ruhanex_telegram_downtime_episodes', events: 'ruhanex_telegram_downtime_events', telegram: 'ruhanex_telegram_users', users: 'ruhanex_users' }[op.split('.')[0]], operation: op.split('.')[1], output: 'toArray', maxTimeMS: '15000', handleDocId: false, x: 1100, y: 80 + i * 65, wires: [['rx_dt_step']] }));
nodes.push({ id: 'rx_dt_pace', z: tab, type: 'delay', name: 'Pace before approval recheck', pauseType: 'rate', timeout: '1', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second', randomFirst: '1', randomLast: '5', randomUnits: 'seconds', drop: false, allowrate: false, outputs: 1, x: 770, y: 650, wires: [['rx_dt_db_6']] });
nodes.push({ id: 'rx_dt_http', z: tab, type: 'http request', name: 'Telegram downtime alert', method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '', insecureHTTPParser: false, authType: '', senderr: false, headers: [], x: 780, y: 740, wires: [['rx_dt_step']] });
nodes.push({ id: 'rx_dt_debug', z: tab, type: 'debug', name: 'Downtime alert safe result', active: false, tosidebar: true, console: false, tostatus: false, complete: 'payload', targetType: 'msg', x: 790, y: 820, wires: [] });
nodes.push({ id: 'rx_dt_catch', z: tab, type: 'catch', name: 'Downtime alert errors', scope: ['rx_dt_step', 'rx_dt_http', ...ops.map((_, i) => `rx_dt_db_${i}`)], uncaught: false, x: 190, y: 820, wires: [['rx_dt_error']] });
fn('rx_dt_error', 'Safe error and unlock', "const store=env.get('DOWNTIME_ALERT_CONTEXT_STORE')||undefined; if(flow.get('telegramDowntimeAlertLock',store)?.id===msg.dt?.id)flow.set('telegramDowntimeAlertLock',null,store);return {payload:{ok:false,description:'Downtime alert request failed. Check MongoDB, bot token and connectivity. Delivery lease expires in five minutes.'}};", 1, [['rx_dt_debug']], 470, 820);
fs.writeFileSync(new URL('./telegram-downtime-alerts.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
const sourceTab = 'e5489573e203f3d0';
const connector = [{ id: 'rx_dt_snapshot_timer', z: sourceTab, type: 'inject', name: 'Downtime alert snapshot every 15 seconds', props: [{ p: 'payload' }], payload: '', payloadType: 'date', repeat: '15', once: true, onceDelay: 30, crontab: '', x: 300, y: 2500, wires: [['rx_dt_snapshot']] }];
connector.push({ id: 'rx_dt_snapshot', z: sourceTab, type: 'function', name: 'Snapshot confirmed Running / Stopped status', func: `return (${runtimeSnapshot.toString()})(msg,flow,global);`, outputs: 1, initialize: '', finalize: '', libs: [], x: 650, y: 2500, wires: [['rx_dt_snapshot_out']] });
connector.push({ id: 'rx_dt_snapshot_out', z: sourceTab, type: 'link out', name: 'To Telegram continuous downtime alerts', mode: 'link', links: ['rx_dt_in'], x: 940, y: 2500, wires: [] });
fs.writeFileSync(new URL('./telegram-downtime-alerts.connector.flow.json', import.meta.url), JSON.stringify(connector, null, 2) + '\n');
console.log(`Generated ${nodes.length} downtime alert nodes and three runtime snapshot connector nodes.`);
export { nodes, connector };
