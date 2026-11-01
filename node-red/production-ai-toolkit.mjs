// Self-contained so the generator can embed this code in core Function nodes.
export function productionToolkit() {
  const shifts = ['06-14', '14-22', '22-06'];
  const metrics = ['current_l1_a', 'current_l2_a', 'current_l3_a', 'current_avg_a', 'voltage_l1_l2_v', 'voltage_l2_l3_v', 'voltage_l3_l1_v', 'voltage_ll_avg_v', 'voltage_l1_n_v', 'voltage_l2_n_v', 'voltage_l3_n_v', 'voltage_ln_avg_v', 'active_power_kw', 'reactive_power_kvar', 'apparent_power_kva', 'power_factor', 'frequency_hz'];
  const spec = (path, properties, description, query = {}) => ({ path, properties, description, query });
  const text = (description) => ({ type: 'string', description });
  const enumeration = (values, description) => ({ type: 'string', enum: values, description });
  function specs(lines) {
    const line = enumeration(lines, 'Production line. One line per request; never use a fallback device.');
    const date = text('Sri Lankan production date YYYY-MM-DD; production day starts at 06:00.');
    const shift = enumeration(shifts, 'Production shift. 22-06 ends on the next calendar day.');
    const device = enumeration(['1', '2', '3', '4', '5'], 'ATS1 meter: 1 ATS CEB, 2 ATS Generator, 3 MSB CEB, 4 MSB Generator, 5 ATS KEDA 2 (CEB).');
    const times = { fromTime: text('Inclusive ISO timestamp with Z or explicit UTC offset. Interpret user dates in Asia/Colombo.'), toTime: text('Exclusive ISO timestamp with Z or explicit UTC offset.') };
    return {
      get_monthly_production: spec('/api/production/monthly-summary', { line, month: text('YYYY-MM; any available historical month.') }, 'Monthly m² total, daily/shift breakdown, size totals and unique design-code totals. Prefer this for monthly, size or design comparisons. Current shift is included for the current production month. Do not sum totalProduction and its breakdowns again. Missing days mean missing records, not proven zero. The top-level run timeline is NOT returned by this deployed handler.'),
      get_daily_production: spec('/api/production/daily-line-summary', { line, date }, 'Current production-day overview only. The exported handler mixes current runtime with saved shifts; use get_historical_shifts for past dates. Not authoritative historical live status.'),
      get_shift_summary: spec('/api/production/shift-summary', { line, date, shift }, 'Detailed saved/current shift KPI, m² production, tiles, target, timing, downtime and code-wise production/timeline when available. lineStats:null means missing data. Quality is assumed 100%, not a measured reject rate.'),
      get_shift_downtime: spec('/api/production/shift-stoppages', { line, date, shift }, 'Detailed stop events and classified summary: machine, reason, planned/unplanned, standard allowance/excess, additional planned, open stops and maximum duration. Prefer for root-cause evidence. Event duration and KPI allowance are different; do not double count.'),
      get_floor_stocks: spec('/api/production/floor-stock', {}, 'Current floor stock: opening + kiln output - Keda output, per size in tiles and m². Includes snapshot, live interval, warnings and zero-clamping. No historical stock API.'),
      get_car_stocks: spec('/api/production/car-stock', {}, 'Current car stock: opening + glaze output - kiln output, per size in tiles and m². Includes snapshot, live interval, warnings and zero-clamping. No historical stock API.'),
      get_live_production: spec('/api/production/live-summary', { line }, 'Current shift production, target, speed, availability, performance, OLE, downtime classifications and sensor/run status. Backend telemetry lookback is only 60 seconds; old/no telemetry can understate production. Confirm with shift-summary for full-shift evidence.'),
      get_historical_shifts: spec('/api/getShiftsStats', { line, fromDate: date, toDate: date }, 'Completed saved shift records over an inclusive date range in ONE request, with deterministic deduplicated totals, daily totals, weighted KPI and design/size rollups. Prefer over repeated daily/shift calls. Excludes live shift unless saved. Missing dates are not zero. Detailed rows retained when the response fits.'),
      get_shift_count_series: spec('/api/production/shift-count-series', { line, date, shift }, 'Timestamped cumulative shift_count samples and tile size. Do NOT sum samples. Not a true per-code run timeline; query shift-summary for runs.'),
      get_line_settings: spec('/api/line-setting', { line }, 'READ ONLY current configuration: size, design, rated speed, planned allowance and timing settings/run IDs when available. Defaults can be synthesized by the backend; not proof a line was historically configured this way.'),
      get_design_codes: spec('/api/design-codes', { tileSize: text('Tile size e.g. 60x60; empty string lists all sizes.'), search: text('Case-insensitive design-code PREFIX; empty string lists active codes.') }, 'Active design master catalogue only, up to 50 records; not production quantities. May be limited; narrow the search.'),
      get_machines: spec('/api/production/machines', { line, search: text('Machine-name/code search; empty string lists active machines.') }, 'Active machine master records for a line, up to 50. A registered machine is not evidence it caused downtime.'),
      get_device_inventory: spec('/api/devices', {}, 'Sanitized device inventory: line, enabled state, type and energy meter labels. Network addresses and credentials are removed. Configuration, not live status.'),
      get_current_energy: spec('/api/getEnergyMeterData', { deviceId: device }, 'Latest ATS1 meter currents, voltages, kW/kvar/kVA, power factor, frequency and cumulative meter kWh. Cumulative kWh is NOT period consumption. Check status, device_status and timestamp; missing telemetry may be synthesized as zeros.', { deviceId: 'device_id' }),
      get_energy_usage: spec('/api/getHistoricalEnergyUsage', { source: enumeration(['ceb', 'generator', 'all'], 'CEB meters 1,3,5; generator meters 2,4; all five meters. Never add all to its subsets.'), ...times, interval: enumeration(['1h', '6h', '1d', '1mo', '1y'], 'Bucket size; use 1d for a month, 1mo for a year. kWh is summed per meter per bucket.') }, 'Actual period energy consumption in kWh from increment history, including per-meter rows and interval totals. Supports multi-meter device_ids, not meters. Use this instead of integrating kW samples. No tariffs/cost data is provided.'),
      get_electricity_history: spec('/api/getHistoricalElectricityData', { deviceId: device, ...times, interval: enumeration(['1m', '5m', '15m', '1h', '6h', '1d'], 'Mean sample window; pick coarser windows for longer periods.') }, 'Historical averaged electrical measurements for one ATS1 meter: currents, voltages, active/reactive/apparent power, PF, frequency. Peak of averaged samples is not an instantaneous peak. Maximum 5000 expected sample buckets; choose coarser interval.', { deviceId: 'device_id', fromTime: 'from_time', toTime: 'to_time' }),
      get_live_energy_series: spec('/api/getLiveEnergyData', { source: enumeration(['ceb', 'generator', 'all'], 'CEB 1,3,5; generators 2,4; all five ATS1 meters.'), metric: enumeration(metrics, 'Electrical measurement to inspect.'), range: enumeration(['1m', '5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h'], 'Recent rolling time window.') }, 'Recent per-meter electrical time-series. Values are window means; units depend on metric, never kWh. Do not combine PF or voltage by summing.'),
    };
  }
  function tools(lines) {
    return Object.entries(specs(lines)).map(([name, item]) => ({
      type: 'function', name, description: item.description, strict: true,
      parameters: { type: 'object', properties: item.properties, required: Object.keys(item.properties), additionalProperties: false },
    }));
  }
  function plan(name, args, lines) {
    const routes = specs(lines);
    if (!Object.hasOwn(routes, name) || !args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Unknown tool or invalid arguments.');
    const route = routes[name];
    const keys = Object.keys(route.properties);
    if (Object.keys(args).length !== keys.length || keys.some((key) => typeof args[key] !== 'string')) throw new Error('Unexpected or missing arguments.');
    for (const key of keys) {
      const value = args[key];
      const property = route.properties[key];
      if (property.enum && !property.enum.includes(value)) throw new Error(`Invalid ${key}.`);
      if (value.length > 200 || (!value.trim() && !['search', 'tileSize'].includes(key))) throw new Error(`Invalid ${key}.`);
      if (['date', 'fromDate', 'toDate'].includes(key) && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`Invalid ${key}.`);
      if (key === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('Invalid month.');
      if (['fromTime', 'toTime'].includes(key) && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error(`Invalid ${key}; use an ISO timestamp with timezone.`);
    }
    if (args.fromDate && (args.fromDate > args.toDate || Date.parse(args.toDate) - Date.parse(args.fromDate) > 3660 * 86400000)) throw new Error('Invalid date range; request at most ten years per call.');
    const duration = args.fromTime ? Date.parse(args.toTime) - Date.parse(args.fromTime) : 0;
    if (args.fromTime && (duration <= 0 || duration > 3660 * 86400000)) throw new Error('Invalid time range; request at most ten years per call.');
    const windows = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '6h': 21600000, '1d': 86400000, '1mo': 28 * 86400000, '1y': 365 * 86400000 };
    if (args.interval && duration / windows[args.interval] > 5000) throw new Error('Too many sample buckets. Use a coarser interval.');
    const query = {};
    for (const key of keys) query[route.query[key] || key] = args[key];
    const ids = args.source === 'ceb' ? [1, 3, 5] : args.source === 'generator' ? [2, 4] : [1, 2, 3, 4, 5];
    if (name === 'get_energy_usage') {
      delete query.source; delete query.fromTime; delete query.toTime;
      Object.assign(query, { panel: 'ATS1', device_ids: ids.join(','), from_time: args.fromTime, to_time: args.toTime });
    }
    if (name === 'get_live_energy_series') {
      delete query.source; query.meters = ids.map((id) => `ATS1:${id}`).join(',');
    }
    if (['get_current_energy', 'get_electricity_history'].includes(name)) query.panel = 'ATS1';
    // The supplied daily handler combines runtime even for a historical date.
    // Route past-day questions through saved records instead.
    if (name === 'get_daily_production') {
      const today = new Date(Date.now() + 330 * 60000 - 6 * 3600000).toISOString().slice(0, 10);
      if (args.date !== today) throw new Error('Daily overview is reliable only for the current production day. Use get_historical_shifts with fromDate=toDate for a historical date.');
    }
    return { path: route.path, query };
  }
  function normalise(name, data, args) {
    const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
    const pick = (item, keys) => Object.fromEntries(keys.filter((key) => item?.[key] !== undefined).map((key) => [key, item[key]]));
    const warnings = Array.isArray(data?.warnings) ? [...data.warnings] : [];
    const add = (note) => { if (!warnings.includes(note)) warnings.push(note); };
    if (data?.success === false) return data;
    if (name === 'get_device_inventory') {
      const source = data?.devices;
      if (!source || typeof source !== 'object') return { success: false, error: 'Invalid device inventory.' };
      const devices = Object.entries(source).map(([key, device]) => ({
        key, ...pick(device, ['deviceId', 'deviceType', 'line', 'lineName', 'shortId', 'enabled', 'tileSize', 'deviceLabel']),
        slaves: (Array.isArray(device?.slaves) ? device.slaves : []).map((slave) => pick(slave, ['slaveId', 'panelId', 'deviceLabel', 'panelLabel', 'enabled'])),
      }));
      return { success: true, devices, updatedAt: data.updatedAt, warnings: ['Device configuration is not live status. Network and credential fields were removed.'] };
    }
    if (name === 'get_line_settings') {
      return { success: true, line: data.line, settings: pick(data.settings, ['tileSize', 'designCode', 'lineSpeed', 'plannedDowntime', 'stopDelayMs', 'maxPulseGapMs', 'requiredRunTimeMs', 'productionRunId', 'productionRunStartTime', 'updatedAt']), warnings: ['The backend merges defaults into settings; configuration is current, not historical evidence.'] };
    }
    if (name === 'get_historical_shifts') {
      if (!Array.isArray(data)) return { success: false, error: 'Expected an array of saved shift documents.' };
      const dedup = new Map();
      let ignored = 0;
      for (const doc of data) {
        const row = doc?.lineStats;
        if (!row || row.shiftDate < args.fromDate || row.shiftDate > args.toDate || !shifts.includes(row.shift) || String(row.lineName || row.line || '').toLowerCase().replace(/\s/g, '') !== args.line.toLowerCase().replace(/\s/g, '')) { ignored++; continue; }
        const key = `${row.device || args.line}|${row.shiftDate}|${row.shift}`;
        const old = dedup.get(key);
        if (!old || (Date.parse(row.updatedAt) || 0) >= (Date.parse(old.updatedAt) || 0)) dedup.set(key, row);
      }
      const rows = [...dedup.values()].sort((a, b) => a.shiftDate.localeCompare(b.shiftDate) || shifts.indexOf(a.shift) - shifts.indexOf(b.shift));
      const fields = ['production', 'tileCount', 'targetProduction', 'targetTiles', 'totalDowntimeMinutes', 'plannedDowntimeMinutes', 'unplannedDowntimeMinutes', 'plannedProductionMinutes', 'actualOperatingMinutes', 'completedStops'];
      const sum = (records, field) => {
        const values = records.map((row) => numeric(row[field])).filter((value) => value !== null);
        return { value: values.length ? +values.reduce((a, b) => a + b, 0).toFixed(4) : null, availableRecords: values.length };
      };
      const totals = Object.fromEntries(fields.map((field) => [field, sum(rows, field)]));
      const dayKeys = [...new Set(rows.map((row) => row.shiftDate))];
      const days = dayKeys.map((date) => {
        const group = rows.filter((row) => row.shiftDate === date);
        return { date, recordedShifts: group.map((row) => row.shift), production: sum(group, 'production'), tileCount: sum(group, 'tileCount'), totalDowntimeMinutes: sum(group, 'totalDowntimeMinutes') };
      });
      const codeMap = new Map();
      for (const row of rows) for (const code of Array.isArray(row.codeWiseProduction) ? row.codeWiseProduction : []) {
        const key = JSON.stringify([code.tileSize, code.designCode]);
        const group = codeMap.get(key) || { tileSize: code.tileSize, designCode: code.designCode, production: 0, tileCount: 0, records: 0 };
        const production = numeric(code.production); const count = numeric(code.tileCount);
        if (production === null || count === null) continue;
        group.production += production; group.tileCount += count; group.records++;
        codeMap.set(key, group);
      }
      const ratio = (a, b) => rows.length && rows.every((row) => numeric(row[a]) !== null && numeric(row[b]) !== null) && totals[b].value > 0 ? +(100 * totals[a].value / totals[b].value).toFixed(2) : null;
      add('Saved shifts only; the current unsaved shift is not included. Missing records do not prove zero production.');
      add('Availability can exceed 100% under the backend planned-allowance model. Quality is assumed 100%, not measured.');
      if (ignored) add(`${ignored} invalid/out-of-scope records were excluded.`);
      if (data.length > rows.length + ignored) add('Duplicate shift records were deduplicated by device/date/shift, keeping latest updatedAt.');
      const recordFields = ['device', 'lineName', 'shift', 'shiftDate', 'shiftStart', 'shiftEnd', 'updatedAt', 'status', 'productionUnit', 'ole', 'availability', 'performance', 'quality', 'tileSize', 'designCode', 'ratedLineSpeed', 'configuredPlannedDowntime', 'recordedStandardDowntimeMinutes', 'standardPlannedDowntimeMinutes', 'standardExcessDowntimeMinutes', 'additionalPlannedDowntimeMinutes', 'openStop', 'maximumDowntimeMinutes', 'productionRunId', 'productionRunStartTime', 'codeWiseProduction', 'codeWiseProductionTimeline', ...fields];
      return { success: true, line: args.line, fromDate: args.fromDate, toDate: args.toDate, returnedDocuments: data.length, uniqueRecordedShifts: rows.length, totals, weightedAvailabilityPercent: ratio('actualOperatingMinutes', 'plannedProductionMinutes'), weightedPerformancePercent: ratio('tileCount', 'targetTiles'), days, codeWiseProduction: [...codeMap.values()], records: rows.map((row) => pick(row, recordFields)), warnings };
    }
    if (name === 'get_shift_downtime' && Array.isArray(data.stoppages)) {
      const groups = new Map();
      for (const stop of data.stoppages) {
        const reason = String(stop.reason || 'Unassigned');
        const machine = String(stop.machine || 'Unassigned');
        const type = String(stop.downtimeType || 'Unclassified');
        const key = JSON.stringify([machine, reason, type]);
        const entry = groups.get(key) || { machine, reason, downtimeType: type, events: 0, durationMinutes: 0, knownDurationEvents: 0 };
        const duration = numeric(stop.durationMinutes);
        entry.events++; if (duration !== null) { entry.durationMinutes += duration; entry.knownDurationEvents++; }
        groups.set(key, entry);
      }
      add('Reason-group durations are observed event minutes, not planned-allowance-adjusted KPI loss. Unassigned reasons do not establish a cause.');
      return { ...data, reasonMachineTotals: [...groups.values()].sort((a, b) => b.durationMinutes - a.durationMinutes), warnings };
    }
    if (name === 'get_energy_usage' && Array.isArray(data.data)) {
      const byMeter = new Map(); const byInterval = new Map();
      for (const row of data.data) {
        const value = numeric(row.energyUsageKwh); if (value === null) continue;
        const key = `${row.panel}:${row.device_id}`;
        const meter = byMeter.get(key) || { panel: row.panel, device_id: row.device_id, device_label: row.device_label, energyUsageKwh: 0 };
        meter.energyUsageKwh += value; byMeter.set(key, meter);
        const interval = byInterval.get(row.intervalStart) || { intervalStart: row.intervalStart, intervalEnd: row.intervalEnd, energyUsageKwh: 0, metersWithData: [] };
        interval.energyUsageKwh += value; interval.metersWithData.push(row.device_id); byInterval.set(row.intervalStart, interval);
      }
      return { ...data, source: args.source, byMeter: [...byMeter.values()], byInterval: [...byInterval.values()], warnings };
    }
    if (name === 'get_electricity_history' && Array.isArray(data.data)) {
      const measurements = {};
      for (const category of ['current', 'voltage', 'power']) for (const row of data.data) for (const [field, value] of Object.entries(row[category] || {})) {
        const v = numeric(value); if (v === null) continue;
        const key = `${category}.${field}`;
        const s = measurements[key] || { samples: 0, sum: 0, min: v, max: v, peakAt: row.timestamp };
        s.samples++; s.sum += v; s.min = Math.min(s.min, v); if (v > s.max) { s.max = v; s.peakAt = row.timestamp; }
        measurements[key] = s;
      }
      for (const s of Object.values(measurements)) { s.mean = s.sum / s.samples; delete s.sum; }
      add('These are unweighted statistics of returned window means, not instantaneous peaks or energy consumption. No tariff or contracted capacity is provided.');
      return { ...data, measurements, warnings };
    }
    if (name === 'get_live_energy_series' && Array.isArray(data.data)) {
      const groups = new Map();
      for (const row of data.data) {
        const value = numeric(row[args.metric]); if (value === null) continue;
        const key = `${row.panel}:${row.device_id}`;
        const group = groups.get(key) || { panel: row.panel, device_id: row.device_id, device_label: row.device_label, samples: 0, sum: 0, min: value, max: value, peakAt: row.timestamp };
        group.samples++; group.sum += value; group.min = Math.min(group.min, value);
        if (value > group.max) { group.max = value; group.peakAt = row.timestamp; }
        if (!group.latestAt || Date.parse(row.timestamp) > Date.parse(group.latestAt)) { group.latest = value; group.latestAt = row.timestamp; }
        groups.set(key, group);
      }
      for (const group of groups.values()) { group.mean = group.sum / group.samples; delete group.sum; }
      add('Statistics describe sampled window means by meter, not instantaneous extrema. Gaps are not confirmed outages.');
      return { ...data, meterStatistics: [...groups.values()], warnings };
    }
    if (name === 'get_shift_count_series' && Array.isArray(data.points)) {
      const points = data.points.filter((row) => numeric(row.value) !== null && Number.isFinite(Date.parse(row.time))).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
      const decreases = points.filter((point, index) => index && Number(point.value) < Number(points[index - 1].value)).length;
      add('Values are cumulative shift counts. Never sum them or treat a flat/missing interval as a confirmed mechanical stop. Decreases can reflect resets/corrections.');
      return { ...data, seriesSummary: { samples: points.length, first: points[0] || null, last: points.at(-1) || null, observedCountDecreases: decreases }, warnings };
    }
    if (name === 'get_monthly_production') {
      add('A missing day/shift means no saved record was returned, not verified zero production. Total, days, sizes and code totals overlap; do not add them together.');
      if (!data.codeWiseProductionTimeline) add('This handler does not return a top-level run timeline. Use shift-summary codeWiseProductionTimeline to verify A→B→A changeovers.');
    }
    if (name === 'get_shift_summary') {
      if (data.lineStats === null) add('No saved shift summary was found; production is unknown, not zero.');
      add('Quality is assumed 100%; availability may exceed 100% under configured planned allowance.');
    }
    if (name === 'get_live_production') add('Live Influx query uses a 60-second lookback. Check lastSeen and sensor status; no recent telemetry is not proof of zero shift output.');
    if (name === 'get_current_energy') add('Latest endpoint can default missing measurements to zero and timestamp to now. Check status/device_status; cumulative active_kwh is not period usage.');
    if (['get_design_codes', 'get_machines'].includes(name)) add('Master search returns at most 50 active records and may be incomplete. It does not report production or downtime.');
    if (['get_floor_stocks', 'get_car_stocks'].includes(name) && data.stocks?.some((row) => row.clampedToZero)) add('Some raw balances are negative and displayed as zero. Report the raw balance and reconciliation need; zero-clamping does not establish a verified physical balance.');
    return Array.isArray(data) ? data : { ...data, warnings };
  }
  return { tools, specs, plan, normalise };
}
