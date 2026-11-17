// Self-contained so the same implementation can run in a Node-RED Function.
export function qualitySnapshot(msg, devices, lineSettings, now) {
  const match = /^RX-QLT\/([A-Za-z0-9_-]+)\/telemetry$/.exec(msg.topic || '');
  if (!match) throw Error('Invalid quality telemetry topic.');
  const id = `RX-QLT-${match[1]}`;
  const p = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
  const uint = n => Number.isSafeInteger(n) && n >= 0 && n <= 4294967295;
  if (!p || p.device !== id) throw Error('Payload device must match MQTT topic.');
  const cfg = devices?.[id];
  if (!cfg || cfg.enabled !== true) throw Error(`Quality device ${id} is not registered and enabled.`);
  if (!/^Keda [123]$/.test(cfg.line || '')) throw Error('Quality sensor must be assigned to a Keda line.');
  const settings = lineSettings?.[cfg.line];
  if (!settings || !settings.designCode || !settings.tileSize) throw Error('Current line design code / size is unavailable.');
  if (!Number.isSafeInteger(settings.TilesPerBox) || settings.TilesPerBox <= 0) throw Error('Current TilesPerBox must be a positive integer.');
  if (!Array.isArray(p.grade_counts) || p.grade_counts.length !== 16 || !p.grade_counts.every(uint)) throw Error('grade_counts must contain 16 uint32 box counters.');
  if (!Number.isInteger(p.grade) || p.grade < 0 || p.grade > 15 || !uint(p.grade_count) || p.grade_count !== p.grade_counts[p.grade]) throw Error('grade_count must match the firmware grade (0–15) array position.');
  const hasTotal = Object.prototype.hasOwnProperty.call(p, 'total_count');
  const hasCount = Object.prototype.hasOwnProperty.call(p, 'count');
  if (hasTotal && hasCount && p.total_count !== p.count) throw Error('count and total_count must match when both are provided.');
  const totalCount = hasTotal ? p.total_count : p.count;
  if (!uint(totalCount)) throw Error('A numeric uint32 count or total_count is required.');
  if (p.grade_counts.reduce((a, b) => a + b, 0) !== totalCount) throw Error('count / total_count must equal the sum of grade_counts.');
  if (!uint(p.boot_id) || !uint(p.sequence) || !uint(p.dropped_events)) throw Error('boot_id, sequence and dropped_events must be uint32 values.');
  const assignments = {};
  for (let slot = 1; slot <= 16; slot++) {
    const value = settings.designGrades?.[String(slot)];
    if (value != null && typeof value !== 'string') throw Error('Invalid line designGrades assignment.');
    assignments[slot] = value || null;
  }
  const local = new Date(now + 330 * 60000);
  const hour = local.getUTCHours();
  const shift = hour >= 6 && hour < 14 ? 'A' : hour >= 14 && hour < 22 ? 'B' : 'C';
  if (hour < 6) local.setUTCDate(local.getUTCDate() - 1);
  return {
    schema: 3, receivedAt: now, device: id, line: cfg.line,
    tenantId: cfg.tenantId || '', siteId: cfg.siteId || '',
    shift, shiftDate: local.toISOString().slice(0, 10),
    designCode: String(settings.designCode), tileSize: String(settings.tileSize),
    tilesPerBox: settings.TilesPerBox, designGrades: assignments,
    productionRunId: String(settings.productionRunId || ''),
    totalCount, firmwareGrade: p.grade, gradeCount: p.grade_count,
    gradeCounts: [...p.grade_counts], bootId: String(p.boot_id),
    sequence: p.sequence, droppedEvents: p.dropped_events,
  };
}

export function qualityInfluxPayload(s) {
  const fields = {
    time:s.receivedAt, total_count:`${s.totalCount}i`, grade:`${s.firmwareGrade}i`, grade_count:`${s.gradeCount}i`,
    sequence:`${s.sequence}i`, dropped_events:`${s.droppedEvents}i`, boot_id:s.bootId,
    tiles_per_box:`${s.tilesPerBox}i`, design_code:s.designCode, tile_size:s.tileSize,
    production_run_id:s.productionRunId, shift:s.shift, shift_date:s.shiftDate,
    grade_counts_json:JSON.stringify(s.gradeCounts), design_grades_json:JSON.stringify(s.designGrades),
    received_at_ms:`${s.receivedAt}i`, schema:'3i', undetected_boxes:`${s.gradeCounts[0]}i`,
  };
  for(let grade=0;grade<16;grade++) {
    fields[`grade_${grade}_boxes`]=`${s.gradeCounts[grade]}i`;
    fields[`grade_${grade}_assignment`]=grade===0?'':s.designGrades[grade]||'';
  }
  return [fields,{device:s.device,line:s.line,tenant:s.tenantId,site:s.siteId}];
}

export function qualityLineProtocol(s) {
  const tag = v => String(v).replace(/\\/g, '\\\\').replace(/([ ,=])/g, '\\$1');
  const str = v => JSON.stringify(String(v));
  const fields = [
    `total_count=${s.totalCount}i`, `grade=${s.firmwareGrade}i`, `grade_count=${s.gradeCount}i`,
    `sequence=${s.sequence}i`, `dropped_events=${s.droppedEvents}i`, `boot_id=${str(s.bootId)}`,
    `tiles_per_box=${s.tilesPerBox}i`, `design_code=${str(s.designCode)}`, `tile_size=${str(s.tileSize)}`,
    `production_run_id=${str(s.productionRunId)}`, `shift=${str(s.shift)}`, `shift_date=${str(s.shiftDate)}`,
    `grade_counts_json=${str(JSON.stringify(s.gradeCounts))}`, `design_grades_json=${str(JSON.stringify(s.designGrades))}`,
    `received_at_ms=${s.receivedAt}i`, 'schema=3i',
    `undetected_boxes=${s.gradeCounts[0]}i`,
  ];
  for (let grade = 0; grade < 16; grade++) {
    fields.push(`grade_${grade}_boxes=${s.gradeCounts[grade]}i`);
    fields.push(`grade_${grade}_assignment=${str(grade === 0 ? '' : s.designGrades[grade] || '')}`);
  }
  return `quality_events,device=${tag(s.device)},line=${tag(s.line)},tenant=${tag(s.tenantId)},site=${tag(s.siteId)} ${fields.join(',')} ${s.receivedAt}`;
}
