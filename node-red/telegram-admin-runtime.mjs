// Embedded in the authenticated users flow. Never trusts client role/user headers.
export function telegramAdminStep(msg, crypto, helpers, start) {
  const { db, finish, fail } = helpers;
  const state = msg.auth;
  if (start) {
    if (state.user.role !== 'Admin') return fail(403, 'Administrator access required.');
    if (state.action === 'telegramList') return db('telegram.find', [{}, { sort: { firstSeenAt: -1 }, limit: 500,
      projection: { _id: 1, chatId: 1, telegramUsername: 1, firstName: 1, lastName: 1, firstSeenAt: 1, lastSeenAt: 1,
        approved: 1, ruhanexUsername: 1, approvedBy: 1, approvedAt: 1, updatedAt: 1 } }], 'telegramListed');
    const chatId = String(msg.req?.params?.chatId || '');
    if (!/^[1-9]\d{0,19}$/.test(chatId)) return fail(400, 'Invalid private Telegram chat ID.');
    state.telegramChatId = chatId;
    if (state.action === 'telegramRevoke') return db('telegram.updateOne', [{ _id: chatId }, { $set: {
      approved: false, approvalRevision: crypto.randomBytes(16).toString('hex'), revokedBy: state.user._id,
      revokedAt: new Date(), updatedAt: new Date() } }], 'telegramSaved');
    if (state.action !== 'telegramAssign') return fail(404, 'Unknown Telegram operation.');
    const username = state.body.ruhanexUsername;
    if (typeof username !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) return fail(400, 'Select a Ruhanex username.');
    state.telegramUsername = username;
    return db('users.findOne', [{ _id: username }], 'telegramAccount');
  }
  if (state.stage === 'telegramAccount') {
    const target = msg.payload;
    if (!target || target.enabled !== true || target.mustChangePassword === true || !['Admin', 'Manager', 'Line Supervisor', 'JE'].includes(target.role))
      return fail(400, 'Select an enabled account that has changed its initial password.');
    return db('telegram.updateOne', [{ _id: state.telegramChatId }, { $set: {
      ruhanexUsername: target._id, ruhanexAccountGeneration: target.accountGeneration ?? null, approved: true,
      approvalRevision: crypto.randomBytes(16).toString('hex'), approvedBy: state.user._id, approvedAt: new Date(), updatedAt: new Date(),
    } }], 'telegramSaved');
  }
  if (state.stage === 'telegramListed') return Array.isArray(msg.payload) ? finish(200, { success: true, users: msg.payload }) : fail(500, 'Unable to list Telegram registrations.');
  if (state.stage === 'telegramSaved') {
    if (msg.payload?.acknowledged !== true) return fail(500, 'Unable to save Telegram access.');
    return msg.payload.matchedCount === 1 ? finish(200, { success: true }) : fail(404, 'Telegram registration not found. Ask the user to send /start first.');
  }
  return fail(500, 'Invalid Telegram administration state.');
}
