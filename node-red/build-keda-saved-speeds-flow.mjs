import fs from 'node:fs';
import { RATED_SPEED_TILE_SIZES, GLAZE_TILE_SIZES, KILN_TILE_SIZES, kilnRatedSpeed, pressRatedSpeed, validateRatedSpeeds, ratedSpeedFor } from '../src/utils/ratedLineSpeeds.js';

export function routeSpeeds(msg, global) {
  if (msg.payload?.settingsAction !== 'saveSpeeds') return [msg, null, null];
  const fail = (statusCode, error) => { msg.statusCode = statusCode; msg.payload = { success: false, error }; return [null, null, msg]; };
  if (!['Admin', 'Manager'].includes(msg.req?.headers?.['x-ruhanex-role'])) return fail(403, 'Only Admin and Manager can save rated speeds.');
  if (global.get('settingsReady') !== true) return fail(503, 'Wait for line configuration to load.');
  const b = msg.payload;
  if (!RATED_SPEED_TILE_SIZES[b.line]) return fail(400, 'Unknown production line.');
  if (!b.savedSpeeds || typeof b.savedSpeeds !== 'object' || Array.isArray(b.savedSpeeds)) return fail(400, 'savedSpeeds must be an object.');
  try { msg.speedSave = { line: b.line, savedSpeeds: validateRatedSpeeds(b.line, b.savedSpeeds) }; }
  catch (e) { return fail(400, e.message); }
  msg.payload = [{ _id: 'lineSettings' }];
  return [null, msg, null];
}

export function prepareSpeedWrite(msg) {
  const doc = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;
  const s = msg.speedSave;
  const current = doc?.settings?.[s.line];
  if (!current) { msg.statusCode = 404; msg.payload = { success: false, error: 'Line settings do not exist.' }; return [null, msg]; }
  const path = `settings.${s.line}`;
  const updatedAt = new Date().toISOString();
  const speed = ratedSpeedFor(s.line, current.tileSize, s.savedSpeeds);
  s.patch = { savedSpeeds: s.savedSpeeds, updatedAt, ...(speed !== undefined ? { lineSpeed: speed } : {}) };
  s.tileSize = current.tileSize;
  s.settings = { ...current, ...s.patch };
  const set = { updatedAt };
  for (const [key, value] of Object.entries(s.patch)) set[`${path}.${key}`] = value;
  // A concurrent tile-size change must not receive the old size's speed.
  msg.payload = [{ _id: 'lineSettings', [`${path}.tileSize`]: current.tileSize }, { $set: set }, { upsert: false }];
  return [msg, null];
}

export function finishSpeedWrite(msg, global) {
  const r = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;
  if (!r?.acknowledged || Number(r.matchedCount) !== 1) {
    msg.statusCode = r?.acknowledged ? 409 : 500;
    msg.payload = { success: false, error: 'Save not confirmed or tile size changed concurrently. Retry saving speeds.' };
    return msg;
  }
  const s = msg.speedSave, all = global.get('lineSettings') || {};
  // Do not restore an old tile size/run or overwrite unrelated runtime fields.
  const patch = { ...s.patch };
  if (all[s.line]?.tileSize !== s.tileSize) delete patch.lineSpeed;
  all[s.line] = { ...(all[s.line] || s.settings), ...patch };
  global.set('lineSettings', all);
  msg.statusCode = 200;
  msg.headers = { 'Content-Type': 'application/json' };
  msg.payload = { success: true, line: s.line, settings: s.settings };
  return msg;
}

export function preserveSpeeds(msg, global) {
  // Insert after the existing validator, before master-design lookup.
  if (!msg.savedSettings || !RATED_SPEED_TILE_SIZES[msg.savedLine]) return [msg, null];
  const current = (global.get('lineSettings') || {})[msg.savedLine] || {};
  const supplied = msg.req?.body?.savedSpeeds;
  try {
    const savedSpeeds = validateRatedSpeeds(msg.savedLine, supplied ?? current.savedSpeeds ?? {});
    msg.savedSettings.savedSpeeds = savedSpeeds;
    if (msg.savedSettings.tileSize !== current.tileSize) {
      const speed = ratedSpeedFor(msg.savedLine, msg.savedSettings.tileSize, savedSpeeds);
      if (speed !== undefined) msg.savedSettings.lineSpeed = speed;
    }
    return [msg, null];
  } catch (e) {
    msg.statusCode = 400; msg.payload = { success: false, error: e.message }; return [null, msg];
  }
}

const prelude = `const RATED_SPEED_TILE_SIZES=${JSON.stringify(RATED_SPEED_TILE_SIZES)};\nconst GLAZE_TILE_SIZES=${JSON.stringify(GLAZE_TILE_SIZES)};\nconst KILN_TILE_SIZES=${JSON.stringify(KILN_TILE_SIZES)};\n${kilnRatedSpeed}\n${pressRatedSpeed}\n${validateRatedSpeeds}\n${ratedSpeedFor}\n`;
const sub = 'rx_saved_speeds_router', keep = 'rx_saved_speeds_preserve';
const fn = (id,z,name,func,outputs,wires,x,y) => ({id,type:'function',z,name,func,outputs,wires,x,y});
export const nodes = [
  { id:sub,type:'subflow',name:'Keda: save speeds action',category:'Ruhanex',color:'#C0DEED',info:'Insert after existing POST /api/line-setting authorization/detection guard and BEFORE its validator. Output 1: normal settings request -> existing validator. Output 2: speeds response -> HTTP response. Select existing Mongo client inside this subflow. No new HTTP route.',in:[{x:40,y:80,wires:[{id:'rx_sp_route'}]}],out:[{x:900,y:40,wires:[{id:'rx_sp_route',port:0}]},{x:900,y:180,wires:[{id:'rx_sp_route',port:2},{id:'rx_sp_write_prepare',port:1},{id:'rx_sp_done',port:0},{id:'rx_sp_failure',port:0}]}],env:[] },
  fn('rx_sp_route',sub,'Route saveSpeeds / validate',prelude+`return (${routeSpeeds})(msg,global);`,3,[[],['rx_sp_read'],[]],220,80),
  {id:'rx_sp_read',type:'mongodb4',z:sub,name:'Read ruhanex_config',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'findOne',output:'toArray',maxTimeMS:'0',handleDocId:false,x:460,y:80,wires:[['rx_sp_write_prepare']]},
  fn('rx_sp_write_prepare',sub,'Update only savedSpeeds + active speed',prelude+`return (${prepareSpeedWrite})(msg);`,2,[['rx_sp_write'],[]],700,80),
  {id:'rx_sp_write',type:'mongodb4',z:sub,name:'Save settings.Keda N.savedSpeeds',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'updateOne',output:'toArray',maxTimeMS:'0',handleDocId:false,x:250,y:180,wires:[['rx_sp_done']]},
  fn('rx_sp_done',sub,'Confirm then update global lineSettings',`return (${finishSpeedWrite})(msg,global);`,1,[[]],610,180),
  {id:'rx_sp_catch',type:'catch',z:sub,name:'Speed save DB failure',scope:['rx_sp_read','rx_sp_write'],uncaught:false,x:210,y:260,wires:[['rx_sp_failure']]},
  fn('rx_sp_failure',sub,'Safe error response',"msg.statusCode=500;msg.payload={success:false,error:'Unable to save speeds to the database.'};return msg;",1,[[]],570,260),
  {id:keep,type:'subflow',name:'Keda: preserve saved speeds',category:'Ruhanex',color:'#C0DEED',info:'Insert on SUCCESS output of existing line settings validator, BEFORE master design query. Output 1 continues existing pipeline; output 2 -> HTTP response. Preserves savedSpeeds on ordinary settings saves and selects preset on size changes.',in:[{x:40,y:80,wires:[{id:'rx_sp_preserve_fn'}]}],out:[{x:530,y:60,wires:[{id:'rx_sp_preserve_fn',port:0}]},{x:530,y:120,wires:[{id:'rx_sp_preserve_fn',port:1}]}],env:[]},
  fn('rx_sp_preserve_fn',keep,'Preserve savedSpeeds + select speed',prelude+`return (${preserveSpeeds})(msg,global);`,2,[[],[]],280,80),
];
fs.writeFileSync(new URL('./keda-saved-speeds.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
// Optional: build a directly wired replacement from the user's supplied export.
// Never include database connection configuration or credentials.
if (process.argv[2]) {
  const original = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const patch = original.filter(n => !['mongodb4-client', 'global-config'].includes(n.type));
  const http = patch.find(n => n.id === 'e188e4b926011c64');
  const validator = patch.find(n => n.id === '9a4936a8388b9d61');
  if (!http || !validator || !validator.func.includes('msg.savedLine = line;')) throw Error('Unexpected source API; review before patching.');
  http.wires = [['rx_sp_router_instance']];
  validator.func = prelude + preserveSpeeds.toString() + '\n' + validator.func.replace('msg.savedLine = line;', `const checked = preserveSpeeds({...msg, savedLine:line, savedSettings:settings}, global);\nif (checked[1]) return checked;\nmsg.savedLine = line;`);
  patch.push({id:'rx_sp_router_instance',type:`subflow:${sub}`,z:http.z,name:'Save speeds or normal settings',x:1470,y:430,wires:[['9a4936a8388b9d61'],['10b3ba4ef7f5f3ae']]});
  fs.writeFileSync(new URL('./keda-line-settings-save.patch.flow.json',import.meta.url),JSON.stringify([...nodes.filter(n => n.id !== keep && n.z !== keep),...patch],null,2)+'\n');
}
console.log('Generated keda-saved-speeds.flow.json');
