import fs from 'node:fs';

export function shiftReportTools() {
  const lines = ['Glaze Line 1', 'Glaze Line 3', 'Kiln 1', 'Kiln 2', 'Keda 1', 'Keda 2', 'Keda 3'];
  const canonical = name => {
    const key = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return lines.find(line => line.toLowerCase().replace(/\s/g, '') === key) ||
      ({ gl1: 'Glaze Line 1', gl3: 'Glaze Line 3' })[key] || null;
  };
  const valid = (date, shift) => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date && ['06-14', '14-22', '22-06'].includes(shift);
  const end = (date, shift) => Date.parse(`${date}T${shift.slice(0, 2)}:00:00+05:30`) + 8 * 3600000;
  const previous = now => {
    const local = new Date(now + 330 * 60000);
    const hour = local.getUTCHours();
    const startHour = hour >= 22 ? 22 : hour >= 14 ? 14 : hour >= 6 ? 6 : -2;
    const start = Date.parse(local.toISOString().slice(0, 10) + 'T00:00:00+05:30') + startHour * 3600000 - 8 * 3600000;
    const prior = new Date(start + 330 * 60000);
    return { shiftDate: prior.toISOString().slice(0, 10), shift: ({ 6: '06-14', 14: '14-22', 22: '22-06' })[prior.getUTCHours()] };
  };
  const select = rows => {
    const chosen = new Map();
    for (const doc of rows) {
      const s = doc.lineStats; const line = canonical(s?.lineName || s?.line);
      if (!line) continue;
      const rank = Math.max(Date.parse(s.updatedAt) || 0, Date.parse(s.codeWiseUpdatedAt) || 0);
      const old = chosen.get(line);
      if (!old || rank > old.rank || (rank === old.rank && String(doc._id || '') > old.id)) chosen.set(line, { stats: s, rank, id: String(doc._id || '') });
    }
    return chosen;
  };
  const format = (date, shift, chosen) => {
    const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const number = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
    const fmt = value => value === null ? 'N/A' : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
    const nextDate = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    const header = `📊 <b>SHIFT SUMMARY</b>\n📅 ${date}${shift === '22-06' ? ' → ' + nextDate : ''}\n🕒 ${shift.slice(0, 2)}:00–${shift.slice(3)}:00 · Sri Lanka`;
    const blocks = [];
    for (const line of lines) {
      const s = chosen.get(line).stats;
      const production = number(s.production), target = number(s.targetProduction), ole = number(s.ole);
      const percent = target > 0 && production !== null ? fmt(production / target * 100) + '% of target' : 'target N/A';
      const rows = [`<b>${escape(line)}</b>`, `<b>${fmt(production)} m²</b> (${percent}) · OLE <b>${ole === null ? 'N/A' : fmt(ole) + '%'}</b>`];
      const codes = new Map();
      // Use the aggregate array only, never add the timeline to it.
      for (const row of s.codeWiseProduction) {
        const code = String(row.designCode || 'Unassigned').trim();
        let area = number(row.production);
        if (area === null) {
          const dims = String(row.tileSize || '').replace(/×/g, 'x').toLowerCase().split('x').map(Number);
          const count = number(row.tileCount);
          if (count !== null && dims.length === 2 && dims.every(n => Number.isFinite(n) && n > 0)) area = count * dims[0] * dims[1] / 10000;
        }
        codes.set(code, !codes.has(code) ? area : codes.get(code) === null || area === null ? null : codes.get(code) + area);
      }
      if (!codes.size) rows.push(production === 0 ? '  No production' : '  Code breakdown unavailable');
      for (const [code, area] of codes) rows.push(`  • ${escape(code.slice(0, 200))} — ${fmt(area)} m²`);
      rows.push(`⏱ Downtime: <b>${fmt(number(s.totalDowntimeMinutes))} min</b>`);
      blocks.push(rows);
    }
    // HTML tags/entities remain intact. Keep each complete line in one message.
    const parts = []; let body = '';
    for (const rows of blocks) {
      for (const row of [...rows, '']) {
        if (body.length + row.length + 1 > 3200) { parts.push(header + '\n\n' + body.trimEnd()); body = ''; }
        body += row + '\n';
      }
    }
    if (body.trim()) parts.push(header + '\n\n' + body.trimEnd());
    return parts;
  };
  return { lines, canonical, valid, end, previous, select, format };
}

export function shiftReportStep(msg, env, flow, tools, now = Date.now()) {
  const store = env.get('SHIFT_REPORT_CONTEXT_STORE') || undefined;
  const get = () => flow.get('telegramShiftReports', store) || {};
  const put = value => flow.set('telegramShiftReports', value, store);
  const enabled = String(env.get('SHIFT_REPORT_ENABLED')).toLowerCase() === 'true';
  const token = String(env.get('TELEGRAM_BOT_TOKEN') || '');
  const database = (operation, args, stage) => {
    msg.shiftReport.stage = stage; msg.shiftReportDb = operation; msg.payload = args;
    delete msg.headers; delete msg.url; delete msg.error; return [msg, null, null];
  };
  const finish = (ok, description, complete = false) => {
    const states = get(); const s = msg.shiftReport;
    if (s && states[s.key]) Object.assign(states[s.key], { busyUntil: complete ? 0 : now + 30000, status: complete ? 'sent' : 'pending' });
    put(states);
    return [null, null, { payload: { ok, shift: s?.shift, shiftDate: s?.shiftDate, description } }];
  };
  if (!msg.shiftReport) {
    if (!enabled) return null;
    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return [null, null, { payload: { ok: false, description: 'Set TELEGRAM_BOT_TOKEN on the shift-report tab.' } }];
    const states = get();
    // Bound local dedup state. MongoDB remains authoritative for sent reports.
    for (const [key, state] of Object.entries(states)) if (state.since < now - 14 * 86400000) delete states[key];
    if (msg.shiftReportEvent === 'saved' || msg.shiftReportEvent === 'manual') {
      const target = msg.shiftReportEvent === 'manual' ? (msg.shiftDate && msg.shift ? msg : tools.previous(now)) : msg.codeWiseTarget;
      if (msg.shiftReportEvent === 'saved' && (msg.payload?.acknowledged !== true || !(msg.payload.matchedCount >= 1))) return null;
      if (!target || !tools.valid(target.shiftDate, target.shift) || tools.end(target.shiftDate, target.shift) > now) return null;
      const key = `${target.shiftDate}|${target.shift}`;
      if (!states[key] || (msg.shiftReportEvent === 'manual' && states[key].status !== 'sent')) states[key] = { shiftDate: target.shiftDate, shift: target.shift, since: now, busyUntil: 0, status: 'pending' };
    }
    const ready = Object.entries(states).filter(([, s]) => s.status === 'pending' && s.busyUntil <= now);
    const output = []; const notices = [];
    for (const [key, state] of ready) {
      if (now - state.since > 30 * 60000) { state.status = 'timed-out'; notices.push({ payload: { ok: false, shiftDate: state.shiftDate, shift: state.shift, description: 'Shift report timed out waiting for completed lines/delivery. Use manual retry after fixing the cause.' } }); continue; }
      state.busyUntil = now + 300000;
      output.push({ shiftReport: { ...state, key, runId: `${msg._msgid || now}-${key}-${now}` }, shiftReportDb: 'shifts.find',
        payload: [{ 'lineStats.shiftDate': state.shiftDate, 'lineStats.shift': state.shift }, { limit: 1000 }] });
    }
    put(states); return [output.length ? output : null, null, notices.length ? notices : null];
  }
  const s = msg.shiftReport;
  const lease = () => new Date(now + 300000);
  const checkpoint = () => database('reports.updateOne', [{ _id: s.key, runId: s.runId, status: 'sending' }, {
    $set: { [`progress.${s.target._id}`]: s.part, leaseUntil: lease(), updatedAt: new Date(now) },
  }], 'checkpoint');
  const recipient = () => {
    while (s.index < s.report.recipients.length) {
      s.target = s.report.recipients[s.index];
      s.part = Number(s.report.progress?.[s.target._id] || 0);
      if (s.part >= s.report.parts.length) { s.index++; continue; }
      return database('telegram.findOne', [{ _id: s.target._id, approved: true, approvalRevision: s.target.approvalRevision,
        ruhanexUsername: s.target.ruhanexUsername }], 'approval');
    }
    return database('reports.updateOne', [{ _id: s.key, runId: s.runId, status: 'sending' }, { $set: { status: 'sent', sentAt: new Date(now), leaseUntil: new Date(0) } }], 'finished');
  };
  if (s.stage === undefined) s.stage = 'documents';
  if (s.stage === 'documents') {
    if (!Array.isArray(msg.payload) || msg.payload.length >= 1000) return finish(false, 'Invalid or excessive shift query results.');
    const rows = msg.payload.filter(d => d.lineStats?.shiftDate === s.shiftDate && d.lineStats?.shift === s.shift);
    const chosen = tools.select(rows);
    const missing = tools.lines.filter(line => !chosen.has(line) || !chosen.get(line).stats.codeWiseUpdatedAt || !Array.isArray(chosen.get(line).stats.codeWiseProduction));
    if (missing.length) return finish(false, 'Waiting for completed code-wise summaries: ' + missing.join(', '));
    s.parts = tools.format(s.shiftDate, s.shift, chosen);
    return database('telegram.find', [{ approved: true }, { limit: 501, projection: { _id: 1, ruhanexUsername: 1, ruhanexAccountGeneration: 1, approvalRevision: 1 } }], 'recipients');
  }
  if (s.stage === 'recipients') {
    if (!Array.isArray(msg.payload) || msg.payload.length > 500) return finish(false, 'Expected at most 500 approved Telegram registrations.');
    const recipients = msg.payload.filter(r => /^[1-9]\d{0,19}$/.test(r._id) && typeof r.approvalRevision === 'string' && typeof r.ruhanexUsername === 'string');
    return database('reports.updateOne', [{ _id: s.key }, { $setOnInsert: { _id: s.key, shiftDate: s.shiftDate, shift: s.shift,
      status: 'pending', leaseUntil: new Date(0), parts: s.parts, recipients, progress: {}, createdAt: new Date(now) } }, { upsert: true }], 'ensured');
  }
  if (s.stage === 'ensured') {
    if (msg.payload?.acknowledged !== true) return finish(false, 'Unable to initialize delivery record.');
    return database('reports.updateOne', [{ _id: s.key, status: { $ne: 'sent' }, leaseUntil: { $lte: new Date(now) } },
      { $set: { status: 'sending', runId: s.runId, leaseUntil: lease() } }], 'claimed');
  }
  if (s.stage === 'claimed') {
    if (msg.payload?.acknowledged !== true) return finish(false, 'Unable to claim delivery record.');
    s.claimed = msg.payload.matchedCount === 1;
    return database('reports.findOne', [{ _id: s.key }], 'report');
  }
  if (s.stage === 'report') {
    if (msg.payload?.status === 'sent') return finish(true, 'Shift summary already sent; duplicate trigger ignored.', true);
    if (!s.claimed || msg.payload?.runId !== s.runId) return finish(false, 'Another shift report sender owns the delivery lease.');
    s.report = msg.payload; s.index = 0; return recipient();
  }
  if (s.stage === 'approval') {
    if (!msg.payload) { s.part = s.report.parts.length; return checkpoint(); }
    return database('users.findOne', [{ _id: s.target.ruhanexUsername }], 'manager');
  }
  if (s.stage === 'manager') {
    const user = msg.payload;
    if (!user || user.enabled !== true || user.mustChangePassword === true || user.role !== 'Manager' ||
      (user.accountGeneration ?? null) !== s.target.ruhanexAccountGeneration) { s.part = s.report.parts.length; return checkpoint(); }
    // Pace BEFORE this final approval/account check, not after it.
    msg.method = 'POST'; msg.url = `https://api.telegram.org/bot${token}/sendMessage`;
    msg.headers = { 'Content-Type': 'application/json' }; msg.requestTimeout = 15000;
    msg.payload = JSON.stringify({ chat_id: s.target._id, text: s.report.parts[s.part], parse_mode: 'HTML' });
    s.stage = 'sent'; return [null, msg, null];
  }
  if (s.stage === 'sent') {
    if (msg.statusCode === 200 && msg.payload?.ok === true) s.part++;
    else if ([400, 403].includes(msg.payload?.error_code)) s.part = s.report.parts.length;
    else return finish(false, 'Telegram delivery failed. Saved progress will be retried after the lease expires.');
    return checkpoint();
  }
  if (s.stage === 'checkpoint') {
    if (msg.payload?.acknowledged !== true || msg.payload.matchedCount !== 1) return finish(false, 'Unable to checkpoint Telegram delivery.');
    s.report.progress[s.target._id] = s.part;
    if (s.part >= s.report.parts.length) s.index++;
    return recipient();
  }
  if (s.stage === 'finished') return msg.payload?.acknowledged === true && msg.payload.matchedCount === 1 ? finish(true, 'Completed shift report delivery to approved Managers.', true) : finish(false, 'Unable to mark report delivery complete.');
  return finish(false, 'Unexpected report stage.');
}

const tab = 'rx_telegram_shift_reports_tab';
const nodes = [{ id: tab, type: 'tab', label: 'Telegram completed shift summary', disabled: false, env: [], info: 'See telegram-shift-summary.README.md. Connect a branch AFTER Update Shift Code-wise Production, preserving existing branches. Set TELEGRAM_BOT_TOKEN and SHIFT_REPORT_ENABLED=true here. Approved Manager accounts only. No AI call.' }];
const fn = (id, name, func, outputs, wires, x, y) => nodes.push({ id, z: tab, type: 'function', name, func, outputs, noerr: 0, initialize: '', finalize: '', libs: [], wires, x, y });
nodes.push({ id: 'rx_shift_report_in', z: tab, type: 'link in', name: 'After completed shift code-wise save', links: [], x: 150, y: 140, wires: [['rx_shift_report_saved']] });
fn('rx_shift_report_saved', 'Successful final save → report trigger', "return {shiftReportEvent:'saved',codeWiseTarget:msg.codeWiseTarget,payload:msg.payload};", 1, [['rx_shift_report_step']], 420, 140);
nodes.push({ id: 'rx_shift_report_tick', z: tab, type: 'inject', name: 'Retry waiting reports every 15 sec', props: [{ p: 'payload' }], payload: '', payloadType: 'date', once: true, onceDelay: 5, repeat: '15', crontab: '', x: 240, y: 230, wires: [['rx_shift_report_step']] });
nodes.push({ id: 'rx_shift_report_manual', z: tab, type: 'inject', name: 'MANUAL: latest completed shift (real send)', props: [{ p: 'shiftReportEvent', v: 'manual', vt: 'str' }], once: false, onceDelay: 0.1, repeat: '', crontab: '', x: 270, y: 310, wires: [['rx_shift_report_step']] });
fn('rx_shift_report_step', 'Wait for all lines + deliver report', `const tools = (${shiftReportTools.toString()})();\ntry { return (${shiftReportStep.toString()})(msg, env, flow, tools); } catch { node.error('Shift report failed.',msg); return; }`, 3, [['rx_shift_report_router'], ['rx_shift_report_http'], ['rx_shift_report_debug']], 650, 220);
const ops = ['shifts.find', 'telegram.find', 'reports.updateOne', 'reports.findOne', 'telegram.findOne', 'users.findOne'];
nodes.push({ id: 'rx_shift_report_router', z: tab, type: 'switch', name: 'Shift report database operation', property: 'shiftReportDb', propertyType: 'msg', rules: ops.map(v => ({ t: 'eq', v, vt: 'str' })), outputs: ops.length, checkall: 'true', wires: ops.map((_, i) => [i === 4 ? 'rx_shift_report_pace' : `rx_shift_report_db_${i}`]), x: 950, y: 160 });
ops.forEach((op, i) => nodes.push({ id: `rx_shift_report_db_${i}`, z: tab, type: 'mongodb4', name: op, clientNode: '8120871193b8f276', mode: 'collection', collection: { shifts: 'shifts', telegram: 'ruhanex_telegram_users', reports: 'ruhanex_telegram_shift_reports', users: 'ruhanex_users' }[op.split('.')[0]], operation: op.split('.')[1], output: 'toArray', maxTimeMS: '15000', handleDocId: false, x: 1250, y: 80 + i * 70, wires: [['rx_shift_report_step']] }));
nodes.push({ id: 'rx_shift_report_pace', z: tab, type: 'delay', name: 'One recipient/part per second', pauseType: 'rate', timeout: '1', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second', randomFirst: '1', randomLast: '5', randomUnits: 'seconds', drop: false, allowrate: false, outputs: 1, x: 950, y: 520, wires: [['rx_shift_report_db_4']] });
nodes.push({ id: 'rx_shift_report_http', z: tab, type: 'http request', name: 'Send shift summary to Telegram', method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '', insecureHTTPParser: false, authType: '', senderr: false, headers: [], x: 950, y: 610, wires: [['rx_shift_report_step']] });
nodes.push({ id: 'rx_shift_report_debug', z: tab, type: 'debug', name: 'Shift summary safe result', active: true, tosidebar: true, console: false, tostatus: false, complete: 'payload', targetType: 'msg', x: 950, y: 700, wires: [] });
nodes.push({ id: 'rx_shift_report_catch', z: tab, type: 'catch', name: 'Shift report request errors', scope: ['rx_shift_report_step', 'rx_shift_report_http', ...ops.map((_, i) => `rx_shift_report_db_${i}`)], uncaught: false, x: 220, y: 700, wires: [['rx_shift_report_error']] });
fn('rx_shift_report_error', 'Safe error + allow later retry', "const store=env.get('SHIFT_REPORT_CONTEXT_STORE')||undefined; const states=flow.get('telegramShiftReports',store)||{}; if(msg.shiftReport&&states[msg.shiftReport.key]) states[msg.shiftReport.key].busyUntil=Date.now()+30000; flow.set('telegramShiftReports',states,store); return {payload:{ok:false,description:'Shift report failed. Check MongoDB, bot configuration and connectivity. Delivery lease expires after five minutes.'}};", 1, [['rx_shift_report_debug']], 570, 700);
fs.writeFileSync(new URL('./telegram-shift-summary.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
// Import this small connector on the existing shift-save tab.
fs.writeFileSync(new URL('./telegram-shift-summary.connector.flow.json', import.meta.url), JSON.stringify([{ id: 'rx_shift_report_after_save_link', z: 'e5489573e203f3d0', type: 'link out', name: 'To Telegram shift summary (AFTER code-wise save)', mode: 'link', links: ['rx_shift_report_in'], x: 1710, y: 1150, wires: [] }], null, 2) + '\n');
console.log(`Generated ${nodes.length} shift-report nodes and an after-save connector. No credentials exported.`);
export { nodes };
