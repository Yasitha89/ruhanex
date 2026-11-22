return (function queryStockGap(msg) {
  const f = msg.stockGap;
  f.previous = (Array.isArray(msg.payload) ? msg.payload : [])[0] || null;
  if (f.previous && String(f.previous._id) >= f.id) { msg.payload = { skipped: true, reason: 'Target already saved or older than latest snapshot', snapshotId: f.id }; return [null, msg]; }
  f.from = f.previous ? Date.parse(f.previous.shiftEnd) : f.start;
  const step = 8 * 3600000;
  if (!Number.isFinite(f.from) || f.from > f.start || (f.end - f.from) % step !== 0) throw Error('Previous snapshot end is not a valid preceding shift boundary.');
  if (f.end - f.from > 93 * 86400000) throw Error('Snapshot gap exceeds 93 days; recover in smaller chronological batches.');
  const ids = JSON.stringify(Object.keys(f.roles));
  msg.query = `from(bucket:"RCLH")
 |> range(start:time(v:${JSON.stringify(new Date(f.from).toISOString())}),stop:time(v:${JSON.stringify(new Date(f.end).toISOString())}))
 |> filter(fn:(r)=>r._measurement=="tile_events" and r._field=="count_delta")
 |> filter(fn:(r)=>contains(value:r.device,set:${ids}))
 |> filter(fn:(r)=>r._value>0)
 |> map(fn:(r)=>({r with tileSize:if exists r.tileSize then r.tileSize else "unknown"}))
 |> group(columns:["device","tileSize"])
 |> aggregateWindow(every:8h,offset:30m,fn:sum,createEmpty:false)
 |> keep(columns:["device","tileSize","_time","_value"])`;
  return [msg, null];
})(msg);