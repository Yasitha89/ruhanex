// Internal Link In only. Recipients are approved registrations, never a supplied chat-ID list.
export function telegramAlarmStep(msg, env) {
  const done = (ok, description) => [null, null, { payload: { ok, description, accepted: msg.tgAlarm?.accepted || 0, failed: msg.tgAlarm?.failed || 0 } }];
  const db = (operation, args, stage) => { msg.tgAlarm.stage = stage; msg.tgAlarmDb = operation; msg.payload = args; delete msg.url; delete msg.headers; return [msg, null, null]; };
  const token = String(env.get('TELEGRAM_BOT_TOKEN') || '');
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return done(false, 'Configure TELEGRAM_BOT_TOKEN.');
  if (!msg.tgAlarm) {
    const text = typeof msg.payload === 'string' ? msg.payload : [msg.payload?.title, msg.payload?.body].filter(Boolean).join('\n');
    if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(msg.username || '') || !text || text.length > 4000) return done(false, 'Supply msg.username and an alarm message of at most 4000 characters.');
    msg.tgAlarm = { username: msg.username, text, accepted: 0, failed: 0 };
    return db('telegram.find', [{ approved: true, ruhanexUsername: msg.username }, { limit: 100 }], 'targets');
  }
  const state = msg.tgAlarm;
  const next = () => {
    if (!state.queue.length) return done(true, 'Approved Telegram alarm recipients processed.');
    state.target = state.queue.shift();
    return db('users.findOne', [{ _id: state.username }], 'account');
  };
  if (state.stage === 'targets') {
    if (!Array.isArray(msg.payload)) return done(false, 'Unable to read Telegram recipients.');
    state.queue = msg.payload; return next();
  }
  if (state.stage === 'account') {
    const user = msg.payload;
    if (!user || user.enabled !== true || user.mustChangePassword === true || !['Admin', 'Manager', 'Line Supervisor', 'JE'].includes(user.role) ||
      (user.accountGeneration ?? null) !== state.target.ruhanexAccountGeneration) { state.failed++; return next(); }
    return db('telegram.findOne', [{ _id: state.target._id, approved: true, ruhanexUsername: state.username,
      approvalRevision: state.target.approvalRevision }], 'approval');
  }
  if (state.stage === 'approval') {
    if (!msg.payload || !/^[1-9]\d{0,19}$/.test(msg.payload._id) || typeof msg.payload.approvalRevision !== 'string') { state.failed++; return next(); }
    msg.method = 'POST'; msg.url = `https://api.telegram.org/bot${token}/sendMessage`;
    msg.headers = { 'Content-Type': 'application/json' }; msg.requestTimeout = 15000;
    msg.payload = JSON.stringify({ chat_id: msg.payload._id, text: state.text });
    state.stage = 'sent'; return [null, msg, null];
  }
  if (state.stage === 'sent') { if (msg.statusCode === 200 && msg.payload?.ok === true) state.accepted++; else state.failed++; return next(); }
  return done(false, 'Unexpected alarm state.');
}
