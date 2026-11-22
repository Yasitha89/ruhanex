const next=(function startStock(msg, global, kind) {
  const t = msg.codeWiseTarget || {};
  const result = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;
  if (!t.shiftDate || !['06-14', '14-22', '22-06'].includes(t.shift)) throw Error('Missing target shift/date.');
  if (!msg.manualStock && (!result?.acknowledged || Number(result.matchedCount) !== 1)) throw Error('Code-wise shift write was not confirmed.');
  const start = Date.parse(`${t.shiftDate}T${t.shift === '06-14' ? '06' : t.shift === '14-22' ? '14' : '22'}:00:00+05:30`);
  const end = start + 8 * 3600000;
  if (!Number.isFinite(start) || end > Date.now()) throw Error('Target shift is invalid or not completed.');
  const cfg = global.get('counterConfig') || {};
  const overrides = global.get(kind === 'floor' ? 'floorStockDeviceRoles' : 'carStockDeviceRoles') || {};
  const positive = kind === 'floor' ? 'kiln' : 'glaze';
  const negative = kind === 'floor' ? 'keda' : 'kiln';
  const roles = {};
  for (const [id, c] of Object.entries(cfg)) {
    if (c?.enabled !== true) continue;
    let role = String(overrides[id] || '').toLowerCase();
    if (![positive, negative].includes(role)) {
      const line = String(c.line || id);
      role = /kiln|firing/i.test(line) ? 'kiln' : /keda|sorting/i.test(line) ? 'keda' : /glaze|glazing/i.test(line) ? 'glaze' : '';
    }
    if ([positive, negative].includes(role)) roles[id] = role;
  }
  if (![positive, negative].every(role => Object.values(roles).includes(role))) throw Error('Configure enabled source and destination counters.');
  if (!msg.manualStock && !roles[t.device]) return null;
  msg.stockGap = { kind, positive, negative, roles, start, end, id: `${t.shiftDate}|${t.shift}`, shiftDate: t.shiftDate, shift: t.shift };
  msg.payload = [{}, { sort: { _id: -1 }, limit: 1 }];
  return msg;
})(msg,global,'floor'); return next ? [next,null] : [null,msg];