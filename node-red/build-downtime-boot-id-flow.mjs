import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function addBootIds(source) {
  const nodes = structuredClone(source);
  const timer = nodes.find(n => n.type === 'function' && n.name === 'ALL Lines: Downtime + Shift Change');
  if (!timer) throw new Error('Missing ALL Lines: Downtime + Shift Change Function.');
  if (timer.func.includes('bootIdAtStopStart')) throw new Error('This Function already has boot-ID tracking. Use its original export as input.');
  const marker = 'function mongoStart(';
  if (!timer.func.includes(marker) || !timer.func.includes('function mongoEnd(')) throw new Error('Unsupported downtime helper structure.');
  timer.func = timer.func.replace(marker, `// Boot identity is observed when this timer processes the event. Event timestamps\n// can be backdated, so observation times are stored separately.\nfunction sensorBootId(id) {\n    const value = counters[id]?.bootId ?? counters[id]?.boot_id;\n    if (typeof value === "string") return value.trim() || null;\n    if (typeof value === "number" && Number.isFinite(value)) return String(value);\n    return null;\n}\n\n${marker}`);
  const start = /stopStart_ts:\s*Number\(ts\),/;
  if (!start.test(timer.func)) throw new Error('Missing STOP_START timestamp.');
  timer.func = timer.func.replace(start, match => `${match}\n\n                bootIdAtStopStart: sensorBootId(id),\n                bootIdAtStopEnd: null,\n                bootIdStartObservedAt: new Date().toISOString(),\n                bootIdEndObservedAt: null,`);
  const end = /stopStop_ts:\s*Number\(ts\)/;
  if (!end.test(timer.func)) throw new Error('Missing STOP_END timestamp.');
  timer.func = timer.func.replace(end, match => `${match},\n\n                    bootIdAtStopEnd: sensorBootId(id),\n                    bootIdEndObservedAt: new Date().toISOString()`);
  new Function('msg', 'flow', 'global', 'node', timer.func);
  return nodes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node node-red/build-downtime-boot-id-flow.mjs path/to/original-function-export.json');
  const nodes = addBootIds(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  fs.writeFileSync(new URL('./downtime-boot-id.patch.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
  fs.writeFileSync(new URL('./downtime-boot-id.function.txt', import.meta.url), nodes.find(n => n.type === 'function' && n.name === 'ALL Lines: Downtime + Shift Change').func + '\n');
  console.log('Generated downtime boot-ID Function patch, preserving existing node ID and wires.');
}
