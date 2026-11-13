import fs from 'node:fs';

export function shiftAt(now) {
  const local = new Date(now + 330 * 60000);
  const h = local.getUTCHours();
  const date = new Date(local.getTime() - (h < 6 ? 86400000 : 0)).toISOString().slice(0, 10);
  const shift = h >= 6 && h < 14 ? '06-14' : h >= 14 && h < 22 ? '14-22' : '22-06';
  return { shiftDate: date, shift, key: `${date}|${shift}` };
}

export function defaults() {
  return {
    schema: 1, revision: 0, timestamp: 0,
    config: {
      'RX-QLT-1000': {
        enabled: false, line: 'Keda', summaryDevice: 'RX-CNT-1000',
        maxDelta: 10000, tilesPerBox: 4,
        grades: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [String(i + 1).padStart(2, '0'), {
          gradeName: `Grade ${i + 1}`, tileSize: '60x60', designCode: 'EDIT-ME', countsAsGood: i === 0
        }]))
      }
    },
    devices: {}, pending: {}, completed: {}
  };
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || !Object.keys(config).length) throw Error('Configuration must contain devices.');
  for (const [id, c] of Object.entries(config)) {
    if (!/^RX-QLT-[A-Za-z0-9_-]+$/.test(id) || typeof c.enabled !== 'boolean' || !c.line || !c.summaryDevice) throw Error('Invalid quality device configuration.');
    if (!Number.isSafeInteger(c.maxDelta) || c.maxDelta <= 0) throw Error('maxDelta must be a positive integer.');
    if (Object.keys(c.grades || {}).length !== 16) throw Error('Configure exactly 16 grades, 01 through 16.');
    for (let i = 1; i <= 16; i++) {
      const g = c.grades[String(i).padStart(2, '0')];
      if (!g || !g.gradeName || !g.tileSize || !g.designCode || typeof g.countsAsGood !== 'boolean' || !Number.isSafeInteger(g.tilesPerBox ?? c.tilesPerBox) || (g.tilesPerBox ?? c.tilesPerBox) <= 0) throw Error('Every grade requires size, design, classification and positive integer tilesPerBox.');
    }
  }
}

export function summary(device, cfg, s, end) {
  const grades = Object.values(s.rows);
  const totalBoxes = grades.reduce((a, r) => a + r.boxes, 0);
  const totalTiles = grades.reduce((a, r) => a + r.tiles, 0);
  const goodTiles = grades.reduce((a, r) => a + (r.countsAsGood ? r.tiles : 0), 0);
  return { device, summaryDevice: cfg.summaryDevice, line: cfg.line, ...s.period,
    endTime: new Date(end).toISOString(), totalBoxes, totalTiles, goodTiles,
    otherTiles: totalTiles - goodTiles, quality: totalTiles ? goodTiles / totalTiles * 100 : null,
    qualitySource: 'grade-box-sensor', attribution: 'received-time',
    baselineOnly: s.baselineOnly, anomalies: s.anomalies, grades };
}

export function advance(state, now) {
  const period = shiftAt(now);
  for (const [id, d] of Object.entries(state.devices)) {
    if (d.period.key === period.key) continue;
    const oldStart = Date.parse(`${d.period.shiftDate}T${d.period.shift.slice(0, 2)}:00:00+05:30`);
    state.pending[`${id}|${d.period.key}`] = summary(id, state.config[id], d, oldStart + 8 * 3600000);
    d.period = period; d.rows = {}; d.baselineOnly = false; d.anomalies = [];
    // Baselines survive shift changes: the ESP32 does not reset at shift end.
  }
}

export function transition(previous, msg, now) {
  const state = JSON.parse(JSON.stringify(previous));
  const signals = [];
  advance(state, now);
  if (msg.action === 'config') {
    validateConfig(msg.payload);
    for (const [id, d] of Object.entries(state.devices)) {
      const old = state.config[id], next = msg.payload[id];
      if (!next || old.line !== next.line || old.summaryDevice !== next.summaryDevice) throw Error('Do not remove or reassign an existing device; use a new ID.');
    }
    state.config = msg.payload;
  } else if (msg.action === 'saved') {
    state.completed ||= {};
    if (state.pending[msg.summaryKey]) state.completed[msg.summaryKey] = state.pending[msg.summaryKey];
    while (Object.keys(state.completed).length > 8) delete state.completed[Object.keys(state.completed)[0]];
    delete state.pending[msg.summaryKey];
  } else if (msg.topic) {
    const match = /^RX-QLT\/([A-Za-z0-9_-]+)\/telemetry$/.exec(msg.topic);
    if (!match) throw Error('Invalid quality MQTT topic.');
    const id = `RX-QLT-${match[1]}`, cfg = state.config[id];
    if (!cfg || !cfg.enabled) return null;
    let p = msg.payload;
    if (typeof p === 'string') p = JSON.parse(p);
    if (!p || !['string', 'number'].includes(typeof p.boot_id) || !String(p.boot_id).length || !p.counts || Array.isArray(p.counts)) throw Error('Expected boot_id and counts object.');
    const codes = Array.from({ length: 16 }, (_, i) => String(i + 1).padStart(2, '0'));
    if (Object.keys(p.counts).length !== 16 || codes.some(code => !Number.isInteger(p.counts[code]) || p.counts[code] < 0 || p.counts[code] > 4294967295)) throw Error('counts must contain all 16 uint32 counters, keyed 01..16.');
    const d = state.devices[id] ||= { period: shiftAt(now), raw: null, boot: null, retiredBoots: [], rows: {}, baselineOnly: false, anomalies: [] };
    const boot = String(p.boot_id);
    if (d.retiredBoots.includes(boot)) throw Error('Rejected message from previously retired boot.');
    const first = d.raw === null;
    const reboot = !first && boot !== d.boot;
    const deltas = {};
    for (const code of codes) {
      const raw = p.counts[code];
      const delta = first ? 0 : reboot ? raw : raw - d.raw[code];
      // Reject the complete snapshot; preserve every accepted baseline.
      if (delta < 0 || delta > cfg.maxDelta) throw Error(`Grade ${code}: rollback or excessive delta; baseline preserved.`);
      deltas[code] = delta;
    }
    if (first) d.baselineOnly = true;
    if (reboot) {
      d.retiredBoots.push(d.boot);
      if (d.retiredBoots.length > 128) throw Error('Boot history full; archive and commission a new device ID.');
      d.anomalies = [...new Set([...d.anomalies, 'esp32-reboot: unreported pre-reset boxes cannot be recovered'])];
    }
    for (const code of codes) {
      const g = cfg.grades[code], tilesPerBox = g.tilesPerBox ?? cfg.tilesPerBox;
      const row = { gradeCode: code, gradeName: g.gradeName, tileSize: g.tileSize, designCode: g.designCode, tilesPerBox, countsAsGood: g.countsAsGood };
      const key = JSON.stringify(row);
      // Distinct product/pack settings retain distinct rows within the shift.
      const r = d.rows[key] ||= { ...row, boxes: 0, tiles: 0 };
      r.boxes += deltas[code]; r.tiles += deltas[code] * tilesPerBox;
      if (!Number.isSafeInteger(r.tiles) || !Number.isSafeInteger(r.boxes)) throw Error('Count exceeds safe integer range.');
      signals.push({ device: id, line: cfg.line, ...row, raw: p.counts[code], delta: deltas[code], boot, eventType: first ? 'initial_sync' : reboot ? 'new_boot' : deltas[code] ? 'count' : 'heartbeat', ...d.period });
    }
    d.raw = { ...p.counts }; d.boot = boot; d.lastSeen = now;
  }
  state.revision++;
  state.timestamp = Math.max(now, previous.timestamp + 1);
  return { state, signals };
}

export function lineProtocol(result) {
  if (Buffer.byteLength(JSON.stringify(result.state), 'utf8') > 60000) throw Error('Quality checkpoint exceeds 60 KB. Save pending shifts or split devices across separate checkpoint namespaces before continuing.');
  const tag = s => String(s).replace(/\\/g, '\\\\').replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=').replace(/[\r\n]/g, '');
  const str = s => JSON.stringify(String(s)).replace(/\n/g, '\\n');
  const time = result.state.timestamp;
  const lines = result.signals.map(r => `quality_signals,device=${tag(r.device)},grade=${tag(r.gradeCode)},shift=${tag(r.shift)},shiftDate=${tag(r.shiftDate)} raw_count=${r.raw}i,box_delta=${r.delta}i,tiles_per_box=${r.tilesPerBox}i,tile_delta=${r.delta * r.tilesPerBox}i,boot_id=${str(r.boot)},tileSize=${str(r.tileSize)},designCode=${str(r.designCode)},eventType=${str(r.eventType)} ${time}`);
  lines.push(`quality_checkpoint,scope=quality-v1 state_json=${str(JSON.stringify(result.state))} ${time}`);
  return lines.join('\n');
}

export function engine(msg, flow, node, env) {
  const now = Date.now();
  if (msg.action === 'restored') {
    const rows = msg.payload;
    if (!Array.isArray(rows) || rows.length > 1) throw Error('Unexpected Influx restore response.');
    const state = rows.length ? JSON.parse(rows[0]._value) : defaults();
    if (state.schema !== 1 || !state.devices || !state.pending) throw Error('Invalid quality checkpoint.');
    validateConfig(state.config);
    flow.set('qualityState', state); flow.set('qualityReady', true);
    msg = { action: 'tick' };
  }
  if (msg.action === 'commit') {
    const candidate = flow.get('qualityCandidate');
    if (!candidate || msg.qualityRevision !== candidate.state.revision) throw Error('Unexpected write acknowledgement.');
    flow.set('qualityState', candidate.state); flow.set('qualityCandidate', null); flow.set('qualityBusy', false);
    msg = { action: 'drain' };
  }
  const queue = flow.get('qualityQueue') || [];
  if (!['drain', 'tick'].includes(msg.action)) {
    if (queue.length >= 5000) { node.error('Quality input queue full; cumulative snapshots can recover counts but boundary attribution may be lost.'); return null; }
    queue.push({ ...msg, payload: Buffer.isBuffer(msg.payload) ? msg.payload.toString() : msg.payload });
  }
  flow.set('qualityQueue', queue);
  if (!flow.get('qualityReady') || flow.get('qualityBusy')) return null;
  const next = queue.shift() || { action: 'tick' };
  flow.set('qualityQueue', queue);
  const old = flow.get('qualityState');
  let result;
  try { result = transition(old, next, now); }
  catch (e) { node.warn(e.message); return [null, { action: 'drain' }, null]; }
  if (!result) return [null, { action: 'drain' }, null];
  const changed = next.action !== 'tick' || JSON.stringify(result.state.devices) !== JSON.stringify(old.devices);
  const pending = Object.entries(old.pending).map(([summaryKey, payload]) => ({ summaryKey, payload }));
  if (!changed) return [null, null, pending.length ? pending : null];
  const base = env.get('QUALITY_INFLUX_URL'), token = env.get('QUALITY_INFLUX_TOKEN');
  if (!base || !token) throw Error('Set QUALITY_INFLUX_URL and QUALITY_INFLUX_TOKEN before enabling the sensor.');
  const payload = lineProtocol(result);
  flow.set('qualityCandidate', result); flow.set('qualityBusy', true);
  const org = env.get('QUALITY_INFLUX_ORG') || 'Ruhanex', bucket = env.get('QUALITY_INFLUX_BUCKET') || 'RCLH';
  return [{ method: 'POST', url: `${base.replace(/\/$/, '')}/api/v2/write?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)}&precision=ms`,
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
    payload, qualityRevision: result.state.revision }, null, pending.length ? pending : null];
}

export function enrich(msg, flow) {
  if (!flow.get('qualityReady')) throw Error('Quality restore is not complete; retry shift save.');
  const state = flow.get('qualityState');
  const s = msg.payload?.lineStats;
  if (!s) throw Error('Call enrichment after Calculate Line Shift Statistics and before Save shift summary.');
  const records = Object.values({ ...state.completed, ...state.pending }).filter(r => r.summaryDevice === s.device && r.shift === s.shift && r.shiftDate === s.shiftDate);
  if (records.length !== 1) throw Error('Expected exactly one completed quality shift for this production device; retry after quality rollover.');
  const q = records[0];
  msg.qualitySummaryKey = `${q.device}|${q.key}`;
  s.qualitySummary = q; s.quality = q.quality;
  s.ole = q.quality === null ? null : Number(s.availability) * Number(s.performance) * q.quality / 10000;
  return msg;
}

const tab = 'rx_quality_tab';
const fn = (id, name, body, outputs, wires, x, y, extra = {}) => ({ id, type: 'function', z: tab, name, func: body, outputs, wires, x, y, ...extra });
const prelude = [shiftAt, defaults, validateConfig, summary, advance, transition, lineProtocol, engine].map(f => f.toString()).join('\n');
const config = defaults().config;
export const nodes = [
  { id: tab, type: 'tab', label: 'Quality sensor - 16 grades', disabled: false, info: 'See quality-sensor.README.md. No MQTT output or device commands. Configure connections and environment variables before enabling a device.' },
  { id: 'ql_help', type: 'comment', z: tab, name: 'SETUP: connections + env vars; edit Apply grade settings (disabled device by default)', info: 'Default mode saves one quality_shift_summaries document per sensor/shift. Optional link-call enriches existing production summary. See README.', x: 470, y: 40, wires: [] },
  { id: 'ql_start', type: 'inject', z: tab, name: 'Restore on deploy', props: [], once: true, onceDelay: 1, repeat: '', x: 150, y: 100, wires: [['ql_query']] },
  fn('ql_query', 'Gate inputs + restore latest checkpoint', `flow.set('qualityReady',false); flow.set('qualityBusy',false); flow.set('qualityCandidate',null);\nmsg.query='from(bucket:'+JSON.stringify(env.get('QUALITY_INFLUX_BUCKET')||'RCLH')+') |> range(start: 1970-01-01T00:00:00Z) |> filter(fn:(r)=>r._measurement=="quality_checkpoint" and r.scope=="quality-v1" and r._field=="state_json") |> group(columns:[]) |> last()'; return msg;`, 1, [['ql_restore']], 430, 100,
    { initialize: "flow.set('qualityReady',false); flow.set('qualityBusy',false); flow.set('qualityQueue',[]);" }),
  { id: 'ql_restore', type: 'influxdb in', z: tab, influxdb: 'ql_influx', name: 'Read checkpoint - configure Influx token', query: '', rawOutput: false, org: 'Ruhanex', x: 770, y: 100, wires: [['ql_restored']] },
  fn('ql_restored', 'Restore completed', "msg.action='restored'; return msg;", 1, [['ql_engine']], 1050, 100),
  { id: 'ql_mqtt', type: 'mqtt in', z: tab, name: 'Quality cumulative counters', topic: 'RX-QLT/+/telemetry', qos: '1', datatype: 'utf8', broker: 'ql_broker', nl: false, rap: true, rh: 0, inputs: 0, x: 170, y: 200, wires: [['ql_engine']] },
  { id: 'ql_tick', type: 'inject', z: tab, name: 'Shift rollover + retry pending summaries', props: [{ p: 'action', v: 'tick', vt: 'str' }], once: false, repeat: '5', x: 210, y: 260, wires: [['ql_engine']] },
  { id: 'ql_config_inject', type: 'inject', z: tab, name: 'Apply grade settings - EDIT FUNCTION FIRST', props: [], once: false, repeat: '', x: 230, y: 320, wires: [['ql_config']] },
  fn('ql_config', 'EDIT grade settings (all 16 grades)', `msg.action='config'; msg.payload=${JSON.stringify(config, null, 2)}; return msg;`, 1, [['ql_engine']], 590, 320),
  fn('ql_engine', 'Quality state machine / boot-ID deltas', `${prelude}\ntry {return engine(msg,flow,node,env);} catch(e) {node.error(e.message,msg);return null;}`, 3, [['ql_write'], ['ql_engine'], ['ql_summary']], 630, 200),
  { id: 'ql_write', type: 'http request', z: tab, name: 'Write signals + checkpoint (wait for HTTP 204)', method: 'use', ret: 'txt', paytoqs: 'ignore', url: '', persist: false, insecureHTTPParser: false, senderr: false, headers: [], requestTimeout: '15000', x: 1000, y: 200, wires: [['ql_ack']] },
  fn('ql_ack', 'Commit only after Influx success', "if(msg.statusCode===204){ delete msg.headers; delete msg.url; msg.action='commit'; return [msg,null]; } node.warn('Influx write failed; counting paused and same checkpoint will retry.'); const c=flow.get('qualityCandidate'); if(!c)return null; msg.payload=("+lineProtocol.toString()+")(c); delete msg.statusCode; msg.headers={Authorization:'Token '+env.get('QUALITY_INFLUX_TOKEN'),'Content-Type':'text/plain; charset=utf-8'}; return [null,msg];", 2, [['ql_engine'], ['ql_retry']], 1330, 200),
  { id: 'ql_retry', type: 'delay', z: tab, name: 'Retry same write after 5 seconds', pauseType: 'delay', timeout: '5', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second', drop: false, x: 1300, y: 270, wires: [['ql_write']] },
  fn('ql_summary', 'Build one idempotent shift upsert', "if(env.get('QUALITY_SUMMARY_MODE')==='integrated')return null;if(flow.get('qualitySummaryBusy'))return null; flow.set('qualitySummaryBusy',true); const q=msg.payload; msg.payload=[{_id:msg.summaryKey},{$set:{qualitySummary:q,updatedAt:new Date().toISOString()}},{upsert:true}];return msg;", 1, [['ql_mongo']], 970, 380,
    { initialize: "flow.set('qualitySummaryBusy',false);" }),
  { id: 'ql_mongo', type: 'mongodb4', z: tab, name: 'Save quality_shift_summaries - configure Mongo', clientNode: 'ql_mongo_client', mode: 'collection', collection: 'quality_shift_summaries', operation: 'updateOne', output: 'toArray', maxTimeMS: '0', handleDocId: false, x: 1350, y: 380, wires: [['ql_saved']] },
  fn('ql_saved', 'Confirm shift save', "flow.set('qualitySummaryBusy',false); const r=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;if(!r?.acknowledged){node.warn('Quality summary not acknowledged; retrying on timer.');return null;} msg.action='saved'; delete msg.topic; return msg;", 1, [['ql_engine']], 1350, 440),
  { id: 'ql_catch_db', type: 'catch', z: tab, name: 'Mongo failure: leave pending for retry', scope: ['ql_mongo'], uncaught: false, x: 970, y: 450, wires: [['ql_db_fail']] },
  fn('ql_db_fail', 'Release summary retry gate', "flow.set('qualitySummaryBusy',false);node.warn('Quality summary database write failed; remains pending.');return null;", 1, [[]], 1000, 510),
  { id: 'ql_catch_write', type: 'catch', z: tab, name: 'HTTP transport failure: retry same write', scope: ['ql_write'], uncaught: false, x: 970, y: 570, wires: [['ql_ack']] },
  { id: 'ql_link_in', type: 'link in', z: tab, name: 'OPTIONAL: enrich existing production shift before save', links: [], x: 180, y: 650, wires: [['ql_enrich']] },
  fn('ql_enrich', 'Attach quality to existing lineStats', `try { return (${enrich.toString()})(msg,flow); } catch(e) {node.error(e.message,msg);return null;}`, 1, [['ql_return']], 470, 650),
  { id: 'ql_return', type: 'link out', z: tab, name: 'Return enriched summary to Link Call', mode: 'return', links: [], x: 720, y: 650, wires: [] },
  { id: 'ql_integrated_ack', type: 'link in', z: tab, name: 'INTEGRATED: production Mongo save confirmed', links: [], x: 180, y: 690, wires: [['ql_integrated_saved']] },
  fn('ql_integrated_saved', 'Acknowledge integrated summary', "const r=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;if(!r?.acknowledged||!msg.qualitySummaryKey){node.warn('Production write acknowledgement or qualitySummaryKey missing.');return null;}return {action:'saved',summaryKey:msg.qualitySummaryKey};", 1, [['ql_engine']], 500, 690),
  { id: 'ql_errors', type: 'catch', z: tab, name: 'Quality processing errors', scope: ['ql_engine', 'ql_restore', 'ql_enrich'], uncaught: false, x: 210, y: 730, wires: [['ql_error_clean']] },
  fn('ql_error_clean', 'Safe error message', "return {payload:{message:msg.error?.message||'Quality processing failed; check connections and configuration.'}};", 1, [['ql_debug']], 530, 730),
  { id: 'ql_debug', type: 'debug', z: tab, name: 'Quality errors (no credentials)', active: true, tosidebar: true, console: false, complete: 'payload', targetType: 'msg', x: 840, y: 730, wires: [] },
  { id: 'ql_broker', type: 'mqtt-broker', name: 'QUALITY - SELECT YOUR MQTT BROKER', broker: '', port: '1883', clientid: '', autoConnect: true, usetls: false, protocolVersion: '4', keepalive: '60', cleansession: true, autoUnsubscribe: true },
  { id: 'ql_influx', type: 'influxdb', name: 'QUALITY - CONFIGURE SAME INFLUX AS ENV', influxdbVersion: '2.0', url: 'http://127.0.0.1:8086', timeout: '60', rejectUnauthorized: true },
  { id: 'ql_mongo_client', type: 'mongodb4-client', name: 'QUALITY - SELECT YOUR MONGO CLIENT', protocol: 'mongodb', hostname: '127.0.0.1', port: '27017', dbName: 'RCLH', appName: '', authSource: '', authMechanism: 'DEFAULT', tls: false, connectTimeoutMS: '30000', socketTimeoutMS: '0', minPoolSize: '0', maxPoolSize: '100', maxIdleTimeMS: '0', uri: '', advanced: '{}', uriTabActive: 'tab-uri-simple' }
];
fs.writeFileSync(new URL('./quality-sensor.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log('Generated quality-sensor.flow.json');
