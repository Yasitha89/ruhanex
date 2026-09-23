const req = msg.monthReq || {};
const id = String(req.rid || "");
if (!id) return null;
let pending = context.get("monthlyPending") || {};
const now = Date.now();
for (const k of Object.keys(pending)) {
  if (now - Number(pending[k].created || 0) > 60000) delete pending[k];
}
if (!pending[id])
  pending[id] = {
    created: now,
    req,
    h: false,
    c: false,
    history: [],
    current: [],
    error: "",
  };
const e = pending[id];
if (msg.topic === "history") {
  e.h = true;
  e.history = Array.isArray(msg.payload) ? msg.payload : [];
} else if (msg.topic === "current") {
  e.c = true;
  e.current = Array.isArray(msg.payload) ? msg.payload : [];
} else if (msg.topic === "history_error") {
  e.h = true;
  e.error = String(msg.error?.message || "MongoDB monthly query failed");
} else if (msg.topic === "current_error") {
  e.c = true;
  e.error = String(msg.error?.message || "Current shift runtime data failed");
} else return null;
pending[id] = e;
context.set("monthlyPending", pending);
if (!e.h || !e.c) return null;
delete pending[id];
context.set("monthlyPending", pending);
if (e.error) {
  msg.statusCode = 500;
  msg.payload = { success: false, error: e.error };
  return msg;
}
function round(v, n = 2) {
  const f = 10 ** n;
  return Math.round((Number(v || 0) + Number.EPSILON) * f) / f;
}
function size(v) {
  const s = String(v || "").trim();
  return s || "Unknown";
}
function area(s, c) {
  const d = String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("x")
    .map(Number);
  return d.length === 2 && d.every((x) => Number.isFinite(x) && x > 0)
    ? ((d[0] * d[1]) / 10000) * Number(c || 0)
    : 0;
}
const r = e.req;
const dedupe = new Map();
for (const doc of e.history) {
  const x = doc?.lineStats || {};
  const date = String(x.shiftDate || ""),
    shift = String(x.shift || "");
  if (!date || !shift) continue;
  if (r.include && date === r.currentDate && shift === r.currentShift) continue;
  const key = `${x.device || r.device}|${date}|${shift}`;
  const t = new Date(x.updatedAt || 0).getTime() || 0;
  const old = dedupe.get(key);
  if (!old || t >= old.t) {
    const s = size(x.tileSize),
      prod = Number(x.production || 0),
      count = Number(x.tileCount || 0);
    dedupe.set(key, {
      t,
      shiftDate: date,
      shift,
      production: prod,
      tileCount: count,
      live: false,
      sizes: [{ size: s, production: prod, tileCount: count, live: false }],
    });
  }
}
const shifts = [...dedupe.values()].map(({ t, ...x }) => x);
if (r.include) {
  const map = new Map();
  for (const row of e.current) {
    const s = size(row.tileSize || r.fallbackTileSize);
    const count = Math.max(0, Number(row._value || 0));
    const x = map.get(s) || {
      size: s,
      tileCount: 0,
      production: 0,
      live: true,
    };
    x.tileCount += count;
    x.production += area(s, count);
    map.set(s, x);
  }
  if (!map.size) {
    const s = size(r.fallbackTileSize);
    map.set(s, { size: s, tileCount: 0, production: 0, live: true });
  }
  const sizes = [...map.values()].map((x) => ({
    ...x,
    production: round(x.production),
  }));
  shifts.push({
    shiftDate: r.currentDate,
    shift: r.currentShift,
    production: round(sizes.reduce((a, x) => a + x.production, 0)),
    tileCount: sizes.reduce((a, x) => a + x.tileCount, 0),
    live: true,
    sizes,
  });
}
const dayMap = new Map(),
  sizeMap = new Map();
for (const s of shifts) {
  if (!dayMap.has(s.shiftDate))
    dayMap.set(s.shiftDate, {
      date: s.shiftDate,
      totalProduction: 0,
      shifts: [],
    });
  const d = dayMap.get(s.shiftDate);
  d.totalProduction += Number(s.production || 0);
  d.shifts.push(s);
  for (const z of s.sizes || []) {
    const key = size(z.size);
    const x = sizeMap.get(key) || {
      size: key,
      production: 0,
      currentShiftProduction: 0,
    };
    x.production += Number(z.production || 0);
    if (s.live) x.currentShiftProduction += Number(z.production || 0);
    sizeMap.set(key, x);
  }
}
const days = [...dayMap.values()]
  .sort((a, b) => a.date.localeCompare(b.date))
  .map((d) => ({
    ...d,
    totalProduction: round(d.totalProduction),
    shifts: d.shifts.sort(
      (a, b) =>
        (({ "06-14": 0, "14-22": 1, "22-06": 2 })[a.shift] ?? 9) -
        ({ "06-14": 0, "14-22": 1, "22-06": 2 }[b.shift] ?? 9),
    ),
  }));
const total = round(days.reduce((a, d) => a + d.totalProduction, 0));
const sizeTotals = [...sizeMap.values()]
  .map((x) => ({
    ...x,
    production: round(x.production),
    currentShiftProduction: round(x.currentShiftProduction),
    percentage: total > 0 ? round((x.production / total) * 100, 1) : 0,
  }))
  .sort((a, b) => b.production - a.production);
msg.headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
msg.payload = {
  success: true,
  line: r.line,
  month: r.month,
  currentShift: r.include
    ? { shiftDate: r.currentDate, shift: r.currentShift }
    : null,
  totalProduction: total,
  days,
  sizeTotals,
};
return msg;
