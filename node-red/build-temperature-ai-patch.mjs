import fs from 'node:fs';
import { productionToolkit } from './production-ai-toolkit.mjs';

const input = process.argv[2] || new URL('./production-ai-chat.flow.json', import.meta.url);
const nodes = JSON.parse(fs.readFileSync(input, 'utf8')).filter(n => !['global-config', 'influxdb', 'mongodb4-client'].includes(n.type));
const tools = ['get_latest_temperature', 'get_temperature_history', 'get_live_temperature_series', 'get_temperature_status'];
let patched = 0;
for (const n of nodes) {
  if (n.type !== 'function' || !n.func.startsWith('const kit = (')) continue;
  const marker = '\n})();'; const end = n.func.indexOf(marker);
  if (end < 0) throw new Error('Unsupported toolkit wrapper in ' + n.name);
  n.func = `const kit = (${productionToolkit.toString()})();` + n.func.slice(end + marker.length);
  if (n.name === 'Authenticate + tools') {
    n.func = n.func.replace('instructions: [', `instructions: [\n      'Authoritative factory clock for this request: ' + JSON.stringify(kit.shiftContext(Date.now())),\n      'Use this factory clock for current/this and previous/last completed shifts. Asia/Colombo schedule: 06:00-14:00, 14:00-22:00, 22:00-next-day 06:00; start inclusive, end exclusive. shiftDate is the local date the shift started, so before 06:00 the current night shift belongs to yesterday. Never derive current shift from UTC, old conversation messages or the latest saved document. For current-shift time-series queries use now as the upper bound, not the future shift end. Do not substitute an older shift if current data is missing.',`);
    n.func = n.func.replace('instructions: [', `instructions: [\n      ${JSON.stringify('Spray Dryer 2 temperature tools are available: controller 3=inside temperature; 4=output temperature. PV is measured temperature, SV is set point, delta is recorded PV minus SV, all in Celsius. Latest searches the last 30 minutes, so check timestamp/STALE and gateway status before claiming a live value. For historical/shift questions use exact Asia/Colombo time boundaries; recent charts use the live series tool. Returned series are window means, not instantaneous readings: never sum temperatures, call extrema instantaneous peaks, or fill missing samples with zero. Ask before assuming any other dryer/controller mapping. Do not rescale API Celsius readings; firmware scaling is already corrected by the supplied ingestion flow. Only state numerical results after retrieving tools. Current communication status cannot prove historical availability or diagnose a physical sensor/heater fault.')} ,`);
    const filterAt = n.func.lastIndexOf('tools: kit.tools(lines).filter');
    if (filterAt < 0) throw new Error('Missing account-role tool guard.');
    n.func = n.func.slice(0, filterAt) + n.func.slice(filterAt).replace("'get_current_energy',", tools.map(name => JSON.stringify(name)).join(', ') + ", 'get_current_energy',");
  }
  new Function('msg', 'env', n.func);
  patched++;
}
if (patched !== 3) throw new Error('Expected three toolkit-bearing Functions; found ' + patched);
fs.writeFileSync(new URL('./production-ai-chat.temperature.patch.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log('Patched temperature tools into existing AI flow, preserving supplied node IDs/wiring and other instructions.');
