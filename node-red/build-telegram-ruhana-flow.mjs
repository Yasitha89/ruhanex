import fs from 'node:fs';
import { telegramAlarmStep } from './telegram-alarm-runtime.mjs';

// Embedded in the exported Function node: no custom runtime modules needed.
export function bridgeStep(msg, env, flow, now = Date.now()) {
  const store = env.get('TELEGRAM_CONTEXT_STORE') || undefined;
  const get = key => flow.get('tgRuhana.' + key, store);
  const set = (key, value) => flow.set('tgRuhana.' + key, value, store);
  const safe = description => {
    const lock = get('lock');
    if (lock?.id === msg.tg?.id) { set('lock', null); set('typing', null); }
    return [null, null, null, { payload: { ok: false, description } }];
  };
  const token = String(env.get('TELEGRAM_BOT_TOKEN') || '');
  const bearer = String(env.get('AI_CHAT_BEARER_TOKEN') || '');
  const aiUrl = String(env.get('RUHANA_AI_URL') || 'http://127.0.0.1:1880/api/ai/chat');
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || !bearer || !/^https?:\/\/[a-z0-9.:[\]-]+(?::\d+)?\/[a-z0-9/_-]+$/i.test(aiUrl))
    return safe('Configure TELEGRAM_BOT_TOKEN, AI_CHAT_BEARER_TOKEN and a valid internal RUHANA_AI_URL.');
  const request = (kind, method, payload, stage) => {
    msg.tg.stage = stage; msg.method = 'POST'; msg.payload = JSON.stringify(payload);
    msg.headers = { 'Content-Type': 'application/json' }; delete msg.statusCode; delete msg.error;
    msg.requestTimeout = kind === 'ai' ? 240000 : 15000;
    msg.url = kind === 'ai' ? aiUrl : `https://api.telegram.org/bot${token}/${method}`;
    if (kind === 'ai') Object.assign(msg.headers, { Authorization: `Bearer ${bearer}`, 'X-Ruhanex-Role': msg.tg.account.role, 'X-Ruhanex-User': msg.tg.account.username });
    return kind === 'ai' ? [null, msg, null, null] : [msg, null, null, null];
  };
  const database = (operation, args, stage) => {
    msg.tg.stage = stage; msg.tgDb = operation; msg.payload = args;
    delete msg.headers; delete msg.url; return [null, null, msg, null];
  };
  const lookup = stage => database('users.findOne', [{ _id: msg.tg.username }], stage);
  const registration = stage => database('telegram.findOne', [{ _id: msg.tg.chatId }], stage);
  const htmlParts = text => {
    const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Only generate known Telegram tags; model-provided HTML is always escaped.
    const pattern = /```(?:[^\n`]*\n)?([\s\S]*?)```|`([^`\n]+)`|\*\*([^*]+)\*\*|__([^_]+)__/g;
    const segments = []; let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) });
      segments.push({ text: match[1] ?? match[2] ?? match[3] ?? match[4], tag: match[1] !== undefined ? 'pre' : match[2] !== undefined ? 'code' : 'b' });
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) segments.push({ text: text.slice(cursor) });
    const parts = []; let chunk = ''; let length = 0;
    for (const segment of segments) {
      let run = '';
      const append = () => { if (run) chunk += segment.tag ? `<${segment.tag}>${escape(run)}</${segment.tag}>` : escape(run); run = ''; };
      for (const character of segment.text) {
        // Count UTF-16 units conservatively; never split a surrogate pair or HTML entity.
        if (length + character.length > 3500) { append(); parts.push(chunk); chunk = ''; length = 0; }
        run += character; length += character.length;
      }
      append();
    }
    if (chunk) parts.push(chunk);
    return parts;
  };
  const sendPart = () => {
    if (get('typing')?.id === msg.tg.id) set('typing', null);
    return request('telegram', 'sendMessage', { chat_id: msg.tg.chatId, text: msg.tg.parts.shift(), parse_mode: 'HTML' }, 'sent');
  };
  const reply = text => {
    const chars = Array.from(String(text));
    msg.tg.parts = htmlParts(chars.slice(0, 24000).join(''));
    if (chars.length > 24000) msg.tg.parts.push('Answer shortened. Ask a narrower question or open Ruhana in Ruhanex.');
    return sendPart();
  };
  const commit = () => {
    set('offset', msg.tg.current.update_id + 1);
    delete msg.tg.current; delete msg.tg.answer; delete msg.tg.question; delete msg.tg.account; delete msg.tg.saveHistory;
    return next();
  };
  const next = () => {
    while (msg.tg.queue.length) {
      const update = msg.tg.queue.shift(); msg.tg.current = update;
      const m = update.message;
      // No groups, edited messages, bot senders, attachments or unmapped users.
      const reason = !m ? 'not a new message' : m.chat?.type !== 'private' ? 'not a private chat' :
        m.from?.is_bot || String(m.from?.id) !== String(m.chat.id) ? 'sender mismatch' :
        typeof m.text !== 'string' ? 'not text' :
        now / 1000 - m.date > 600 ? 'message older than ten minutes' : '';
      if (reason) {
        msg.tg.ignored.push({ chatId: m?.chat?.id, reason });
        set('offset', update.update_id + 1); continue;
      }
      msg.tg.chatId = String(m.chat.id); msg.tg.question = m.text.trim();
      const clean = value => typeof value === 'string' ? value.slice(0, 100) : '';
      return database('telegram.updateOne', [{ _id: msg.tg.chatId }, {
        $setOnInsert: { chatId: msg.tg.chatId, approved: false, ruhanexUsername: null, firstSeenAt: new Date(now) },
        $set: { telegramUserId: String(m.from.id), telegramUsername: clean(m.from.username), firstName: clean(m.from.first_name), lastName: clean(m.from.last_name), lastSeenAt: new Date(now) },
      }, { upsert: true }], 'registered');
    }
    set('lock', null);
    return [null, null, null, { payload: { ok: true, description: 'Telegram polling batch complete.', received: msg.tg.received, ignored: msg.tg.ignored } }];
  };
  if (!msg.tg) {
    if (String(env.get('TELEGRAM_RUHANA_ENABLED')).toLowerCase() !== 'true') return safe('Polling disabled. Set TELEGRAM_RUHANA_ENABLED to true on this flow tab.');
    if (get('backoffUntil') > now) return null;
    if (get('lock')?.until > now) return null;
    const id = msg._msgid || String(now);
    msg.tg = { id }; set('lock', { id, until: now + 300000 });
    return request('telegram', 'getUpdates', { offset: get('offset') || 0, timeout: 0, limit: 10, allowed_updates: ['message'] }, 'polled');
  }
  if (get('lock')?.id !== msg.tg.id) return null;
  set('lock', { id: msg.tg.id, until: now + 300000 });
  if (msg.tg.stage === 'polled') {
    if (msg.payload?.parameters?.retry_after) set('backoffUntil', now + Math.min(86400, Math.max(1, Number(msg.payload.parameters.retry_after) || 60)) * 1000);
    if (msg.statusCode !== 200 || msg.payload?.ok !== true || !Array.isArray(msg.payload.result))
      return safe(`Telegram polling failed (HTTP ${Number(msg.statusCode) || 'unknown'}, API ${Number(msg.payload?.error_code) || 'unknown'}). Check token, connectivity, webhook status and competing pollers.`);
    msg.tg.queue = msg.payload.result.filter(u => Number.isSafeInteger(u.update_id)).sort((a, b) => a.update_id - b.update_id);
    msg.tg.received = msg.tg.queue.length; msg.tg.ignored = [];
    return next();
  }
  const validUser = user => user?.enabled === true && user.mustChangePassword !== true && ['Admin', 'Manager', 'Line Supervisor', 'JE'].includes(user.role);
  const identity = user => ({ username: user._id, role: user.role === 'JE' ? 'Line Supervisor' : user.role,
    generation: user.accountGeneration ?? null, version: user.authVersion, approvalRevision: msg.tg.binding.approvalRevision });
  const approved = row => row?.approved === true && typeof row.ruhanexUsername === 'string' && typeof row.approvalRevision === 'string';
  if (msg.tg.stage === 'registered') {
    if (msg.payload?.acknowledged !== true) return safe('Unable to save Telegram registration.');
    return registration('mapping');
  }
  if (msg.tg.stage === 'mapping') {
    if (!approved(msg.payload)) {
      set('history.' + msg.tg.chatId, null);
      return reply('Registration received. Waiting for administrator approval. Your Telegram chat ID is ' + msg.tg.chatId + '.');
    }
    msg.tg.binding = msg.payload; msg.tg.username = msg.payload.ruhanexUsername;
    return lookup('user');
  }
  if (msg.tg.stage === 'user') {
    const user = msg.payload;
    if (!validUser(user) || (user.accountGeneration ?? null) !== msg.tg.binding.ruhanexAccountGeneration) { set('history.' + msg.tg.chatId, null); return reply('Your Ruhanex account is unavailable. Contact your administrator or complete your initial password change in the app.'); }
    msg.tg.account = identity(user);
    const command = msg.tg.question.toLowerCase();
    if (command === '/reset') { set('history.' + msg.tg.chatId, null); return reply('Conversation cleared. What would you like to ask Ruhana?'); }
    if (command === '/start' || command === '/help') return reply('Hi, I am Ruhana. Ask about production, downtime or energy. Your Ruhanex account permissions apply. Use /reset to clear this conversation.');
    if (!msg.tg.question || msg.tg.question.length > 4000) return reply('Please send a text question between 1 and 4000 characters.');
    if (get('last.' + msg.tg.chatId) > now - 10000) return reply('Please wait a few seconds before asking another question.');
    set('last.' + msg.tg.chatId, now);
    const previous = get('history.' + msg.tg.chatId);
    const history = previous?.until > now && JSON.stringify(previous.account) === JSON.stringify(msg.tg.account) ? previous.messages : [];
    msg.tg.history = history;
    return request('ai', '', { message: msg.tg.question, history }, 'answered');
  }
  if (msg.tg.stage === 'answered') {
    if (msg.statusCode !== 200 || msg.payload?.success !== true || typeof msg.payload.answer !== 'string' || !msg.payload.answer.trim())
      return reply('Ruhana could not answer right now. Please try again later.');
    msg.tg.answer = msg.payload.answer;
    return registration('mappingRecheck');
  }
  if (msg.tg.stage === 'mappingRecheck') {
    if (!approved(msg.payload) || msg.payload.ruhanexUsername !== msg.tg.username || msg.payload.approvalRevision !== msg.tg.binding.approvalRevision) {
      set('history.' + msg.tg.chatId, null); return reply('Your Telegram approval changed. Please contact your administrator.');
    }
    return lookup('recheck');
  }
  if (msg.tg.stage === 'recheck') {
    if (!validUser(msg.payload) || JSON.stringify(identity(msg.payload)) !== JSON.stringify(msg.tg.account)) {
      set('history.' + msg.tg.chatId, null);
      return reply('Your account access changed. Please ask again after your administrator checks your access.');
    }
    msg.tg.saveHistory = true;
    return reply(msg.tg.answer);
  }
  if (msg.tg.stage === 'sent') {
    if (msg.payload?.parameters?.retry_after) set('backoffUntil', now + Math.min(86400, Math.max(1, Number(msg.payload.parameters.retry_after) || 60)) * 1000);
    if (msg.payload?.ok === false && [400, 403].includes(msg.payload.error_code)) { msg.tg.saveHistory = false; return commit(); }
    if (msg.statusCode !== 200 || msg.payload?.ok !== true) return safe('Telegram reply failed. The update is unacknowledged and may be retried.');
    if (msg.tg.parts.length) return sendPart();
    if (msg.tg.saveHistory) set('history.' + msg.tg.chatId, { until: now + 86400000, account: msg.tg.account,
      messages: [...msg.tg.history, { role: 'user', content: msg.tg.question }, { role: 'assistant', content: msg.tg.answer.slice(0, 4000) }].slice(-12) });
    return commit();
  }
  return safe('Unexpected Telegram bridge state.');
}

// Independent HTTP branch: typing failures must never interrupt AI/reply processing.
export function typingRequest(env, flow, now = Date.now()) {
  const store = env.get('TELEGRAM_CONTEXT_STORE') || undefined;
  const state = flow.get('tgRuhana.typing', store);
  const lock = flow.get('tgRuhana.lock', store);
  if (!state) return null;
  if (state.until <= now || lock?.id !== state.id || lock.until <= now || String(env.get('TELEGRAM_RUHANA_ENABLED')).toLowerCase() !== 'true') {
    flow.set('tgRuhana.typing', null, store); return null;
  }
  const token = String(env.get('TELEGRAM_BOT_TOKEN') || '');
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return null;
  return { method: 'POST', url: `https://api.telegram.org/bot${token}/sendChatAction`,
    headers: { 'Content-Type': 'application/json' }, requestTimeout: 3000,
    payload: JSON.stringify({ chat_id: state.chatId, action: 'typing' }) };
}

const tab = 'rx_telegram_ruhana_tab';
export const nodes = [{ id: tab, type: 'tab', label: 'Telegram - Ruhana AI', disabled: false, env: [], info: 'Read telegram-ruhana.README.md. Enable explicitly via TELEGRAM_RUHANA_ENABLED=true. Map private chat IDs to existing users. Requires existing AI endpoint and MongoDB client. One poller per bot.' }];
const fn = (id, name, func, outputs, wires, x, y) => nodes.push({ id, z: tab, type: 'function', name, func, outputs, noerr: 0, initialize: '', finalize: '', libs: [], wires, x, y });
nodes.push({ id: 'rx_tgra_poll', z: tab, type: 'inject', name: 'Poll Telegram every 5 seconds', props: [{ p: 'payload' }], payload: '', payloadType: 'date', repeat: '5', crontab: '', once: true, onceDelay: 3, x: 200, y: 120, wires: [['rx_tgra_step']] });
fn('rx_tgra_step', 'Telegram / Ruhana state machine', `try { return (${bridgeStep.toString()})(msg, env, flow); } catch { node.error('Telegram bridge failed. Check configuration.', msg); return; }`, 4, [['rx_tgra_tg_http'], ['rx_tgra_typing_start'], ['rx_tgra_users'], ['rx_tgra_debug']], 520, 120);
for (const [id, name, y] of [['rx_tgra_tg_http', 'Telegram Bot API', 100], ['rx_tgra_ai_http', 'Existing Ruhana AI endpoint', 180]])
  nodes.push({ id, z: tab, type: 'http request', name, method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '', insecureHTTPParser: false, authType: '', senderr: false, headers: [], x: 880, y, wires: [[id === 'rx_tgra_ai_http' ? 'rx_tgra_typing_stop' : 'rx_tgra_step']] });
fn('rx_tgra_typing_start', 'Start typing + request AI', `const store = env.get('TELEGRAM_CONTEXT_STORE') || undefined;\nflow.set('tgRuhana.typing', { id: msg.tg.id, chatId: msg.tg.chatId, until: Date.now() + 255000 }, store);\nreturn [msg, (${typingRequest.toString()})(env, flow)];`, 2, [['rx_tgra_ai_http'], ['rx_tgra_typing_http']], 630, 500);
fn('rx_tgra_typing_stop', 'Stop typing on AI completion', `const store = env.get('TELEGRAM_CONTEXT_STORE') || undefined;\nif (flow.get('tgRuhana.typing', store)?.id === msg.tg?.id) flow.set('tgRuhana.typing', null, store);\nreturn msg;`, 1, [['rx_tgra_step']], 950, 500);
nodes.push({ id: 'rx_tgra_typing_tick', z: tab, type: 'inject', name: 'Refresh typing every 4 seconds', props: [{ p: 'payload' }], payload: '', payloadType: 'date', repeat: '4', crontab: '', once: false, onceDelay: 0.1, x: 230, y: 600, wires: [['rx_tgra_typing_refresh']] });
fn('rx_tgra_typing_refresh', 'Typing only while AI is pending', `return (${typingRequest.toString()})(env, flow);`, 1, [['rx_tgra_typing_http']], 560, 600);
nodes.push({ id: 'rx_tgra_typing_http', z: tab, type: 'http request', name: 'Telegram typing (best effort)', method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '', insecureHTTPParser: false, authType: '', senderr: false, headers: [], x: 880, y: 600, wires: [[]] });
nodes.push({ id: 'rx_tgra_typing_catch', z: tab, type: 'catch', name: 'Ignore typing network errors', scope: ['rx_tgra_typing_http'], uncaught: false, x: 240, y: 680, wires: [[]] });
const main = nodes.find(n => n.id === 'rx_tgra_step'); main.wires[2] = ['rx_tgra_db_router'];
const operations = ['users.findOne', 'telegram.findOne', 'telegram.updateOne'];
nodes.push({ id: 'rx_tgra_db_router', z: tab, type: 'switch', name: 'Registration or account query', property: 'tgDb', propertyType: 'msg', rules: operations.map(v => ({ t: 'eq', v, vt: 'str' })), checkall: 'true', outputs: 3, wires: [['rx_tgra_users'], ['rx_tgra_registration'], ['rx_tgra_register']], x: 820, y: 260 });
for (const [i, id] of ['rx_tgra_users', 'rx_tgra_registration', 'rx_tgra_register'].entries()) nodes.push({ id, z: tab, type: 'mongodb4', name: ['Verify mapped Ruhanex user', 'Read Telegram approval', 'Register Telegram sender'][i], clientNode: '8120871193b8f276', mode: 'collection', collection: i === 0 ? 'ruhanex_users' : 'ruhanex_telegram_users', operation: i === 2 ? 'updateOne' : 'findOne', output: 'toArray', maxTimeMS: '15000', handleDocId: false, x: 1150, y: 260 + i * 60, wires: [['rx_tgra_step']] });
nodes.push({ id: 'rx_tgra_debug', z: tab, type: 'debug', name: 'Telegram bridge safe status', active: false, tosidebar: true, console: false, tostatus: false, complete: 'payload', targetType: 'msg', x: 880, y: 340, wires: [] });
nodes.push({ id: 'rx_tgra_catch', z: tab, type: 'catch', name: 'Bridge request errors', scope: ['rx_tgra_step', 'rx_tgra_tg_http', 'rx_tgra_ai_http', 'rx_tgra_users', 'rx_tgra_registration', 'rx_tgra_register', 'rx_tgra_typing_start', 'rx_tgra_typing_stop'], uncaught: false, x: 220, y: 400, wires: [['rx_tgra_error']] });
fn('rx_tgra_error', 'Release lock and sanitize error', `const store = env.get('TELEGRAM_CONTEXT_STORE') || undefined;\nconst lock = flow.get('tgRuhana.lock', store);\nif (lock?.id === msg.tg?.id) { flow.set('tgRuhana.lock', null, store); flow.set('tgRuhana.typing', null, store); }\nreturn {payload:{ok:false,description:'Telegram/Ruhana request failed. Check configuration and connectivity. No update was acknowledged; a retry may occur.'}};`, 1, [['rx_tgra_debug']], 530, 400);
nodes.push({ id: 'rx_tgra_note', z: tab, type: 'comment', name: 'SET ENV + Mongo client; see telegram-ruhana.README.md', info: nodes[0].info, x: 370, y: 50, wires: [] });
nodes[0].info = 'MongoDB Telegram registration/approval. Configure bot token, internal AI token/URL and TELEGRAM_RUHANA_ENABLED=true. Approve users in Admin My Profile. Manual TELEGRAM_RUHANA_USERS mapping is no longer used.';
nodes.push({ id: 'rx_tgra_alarm_link', z: tab, type: 'link in', name: 'Telegram alarm to approved user', links: [], x: 180, y: 800, wires: [['rx_tgra_alarm_start']] });
fn('rx_tgra_alarm_start', 'Start approved Telegram alarm', 'delete msg.req; delete msg.res; delete msg.tgAlarm; return msg;', 1, [['rx_tgra_alarm_step']], 450, 800);
fn('rx_tgra_alarm_step', 'Check approval and send alarm', `try { return (${telegramAlarmStep.toString()})(msg, env); } catch { node.error('Telegram alarm failed.', msg); return; }`, 3, [['rx_tgra_alarm_router'], ['rx_tgra_alarm_http'], ['rx_tgra_debug']], 740, 800);
const alarmOps = ['telegram.find', 'users.findOne', 'telegram.findOne'];
nodes.push({ id: 'rx_tgra_alarm_router', z: tab, type: 'switch', name: 'Alarm database operation', property: 'tgAlarmDb', propertyType: 'msg', rules: alarmOps.map(v => ({ t: 'eq', v, vt: 'str' })), checkall: 'true', outputs: 3, wires: alarmOps.map((_, i) => [i === 2 ? 'rx_tgra_alarm_delay' : `rx_tgra_alarm_db_${i}`]), x: 1020, y: 800 });
alarmOps.forEach((op, i) => nodes.push({ id: `rx_tgra_alarm_db_${i}`, z: tab, type: 'mongodb4', name: 'Alarm ' + op, clientNode: '8120871193b8f276', mode: 'collection', collection: i === 1 ? 'ruhanex_users' : 'ruhanex_telegram_users', operation: op.split('.')[1], output: 'toArray', maxTimeMS: '15000', handleDocId: false, x: 1250, y: 780 + i * 60, wires: [['rx_tgra_alarm_step']] }));
nodes.push({ id: 'rx_tgra_alarm_delay', z: tab, type: 'delay', name: 'Pace Telegram alarms before approval recheck', pauseType: 'rate', timeout: '1', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second', randomFirst: '1', randomLast: '5', randomUnits: 'seconds', drop: false, allowrate: false, outputs: 1, x: 740, y: 920, wires: [['rx_tgra_alarm_db_2']] });
nodes.push({ id: 'rx_tgra_alarm_http', z: tab, type: 'http request', name: 'Send approved Telegram alarm', method: 'use', ret: 'obj', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '', insecureHTTPParser: false, authType: '', senderr: false, headers: [], x: 1020, y: 920, wires: [['rx_tgra_alarm_step']] });
nodes.push({ id: 'rx_tgra_alarm_catch', z: tab, type: 'catch', name: 'Safe alarm errors', scope: ['rx_tgra_alarm_step', 'rx_tgra_alarm_http', ...alarmOps.map((_, i) => `rx_tgra_alarm_db_${i}`)], uncaught: false, x: 240, y: 1020, wires: [['rx_tgra_alarm_error']] });
fn('rx_tgra_alarm_error', 'Sanitize alarm errors', "return {payload:{ok:false,description:'Telegram alarm request failed. Check configuration and connectivity.'}};", 1, [['rx_tgra_debug']], 560, 1020);
fs.writeFileSync(new URL('./telegram-ruhana.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log(`Generated ${nodes.length} Telegram/Ruhana nodes (no credentials).`);
