import fs from 'node:fs';
import { validateDesignGradeSlots } from '../src/utils/designGradeSlots.js';
import { KEDA_TILE_SIZES, validateTilesPerBox } from '../src/utils/ratedLineSpeeds.js';
import { RATED_SPEED_TILE_SIZES, GLAZE_TILE_SIZES, KILN_TILE_SIZES, kilnRatedSpeed, pressRatedSpeed, validateRatedSpeeds, ratedSpeedFor } from '../src/utils/ratedLineSpeeds.js';

export function routeSpeeds(msg, global) {
  if (!['saveSpeeds', 'saveTilesPerBox', 'saveDesignGrades'].includes(msg.payload?.settingsAction)) return [msg, null, null];
  const fail = (statusCode, error) => { msg.statusCode = statusCode; msg.payload = { success: false, error }; return [null, null, msg]; };
  if (!['Admin', 'Manager'].includes(msg.req?.headers?.['x-ruhanex-role'])) return fail(403, 'Only Admin and Manager can save rated speeds.');
  if (global.get('settingsReady') !== true) return fail(503, 'Wait for line configuration to load.');
  const b = msg.payload;
  if (b.settingsAction === 'saveDesignGrades') {
    if (!KEDA_TILE_SIZES[b.line]) return fail(400, 'Grade assignments are available only for Keda lines.');
    if (!b.designGrades) return fail(400, 'Design grade slots are required.');
    try { msg.speedSave = { line: b.line, action: 'saveDesignGrades', designGrades: validateDesignGradeSlots(b.designGrades) }; }
    catch (e) { return fail(400, e.message); }
    msg.payload = [{ _id: 'designGrades' }]; return [null, msg, null];
  }
  if (b.settingsAction === 'saveTilesPerBox') {
    if (!KEDA_TILE_SIZES[b.line]) return fail(400, 'Tiles per box is available only for Keda lines.');
    if (!b.savedTilesPerBox || typeof b.savedTilesPerBox !== 'object' || Array.isArray(b.savedTilesPerBox)) return fail(400, 'savedTilesPerBox must be an object.');
    try { msg.speedSave = { line: b.line, action: 'saveTilesPerBox', savedTilesPerBox: validateTilesPerBox(b.line, b.savedTilesPerBox) }; }
    catch (e) { return fail(400, e.message); }
    msg.payload = [{ _id: 'lineSettings' }]; return [null, msg, null];
  }
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
  if (s.action === 'saveDesignGrades' && !s.catalogueChecked) {
    if (!doc || !Array.isArray(doc.grades)) { msg.statusCode = 400; msg.payload = { success: false, error: 'Create the Design Grades catalogue in Admin settings first.' }; return [null, msg]; }
    try { s.designGrades = validateDesignGradeSlots(s.designGrades, doc.grades.map(g => g.grade)); }
    catch (e) { msg.statusCode = 400; msg.payload = { success: false, error: e.message }; return [null, msg]; }
    s.catalogueChecked = true; msg.payload = [{ _id: 'lineSettings' }]; return [null, null, msg];
  }
  const current = doc?.settings?.[s.line];
  if (!current) { msg.statusCode = 404; msg.payload = { success: false, error: 'Line settings do not exist.' }; return [null, msg]; }
  const path = `settings.${s.line}`;
  const updatedAt = new Date().toISOString();
  const speed = ratedSpeedFor(s.line, current.tileSize, s.savedSpeeds);
  s.patch = s.action === 'saveDesignGrades' ? { designGrades: s.designGrades, updatedAt } : s.action === 'saveTilesPerBox' ? { savedTilesPerBox: s.savedTilesPerBox, updatedAt } : { savedSpeeds: s.savedSpeeds, updatedAt, ...(speed !== undefined ? { lineSpeed: speed } : {}) };
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
    if (KEDA_TILE_SIZES[msg.savedLine]) {
      if (current.designGrades !== undefined) msg.savedSettings.designGrades = validateDesignGradeSlots(current.designGrades);
      else delete msg.savedSettings.designGrades;
      // Presets are edited only by saveTilesPerBox; ordinary saves cannot overwrite them.
      const presets = validateTilesPerBox(msg.savedLine, current.savedTilesPerBox ?? {});
      msg.savedSettings.savedTilesPerBox = presets;
      const body = msg.req?.body || {};
      let active = Object.hasOwn(body, 'TilesPerBox') ? body.TilesPerBox : current.TilesPerBox ?? presets[msg.savedSettings.tileSize] ?? null;
      if (msg.savedSettings.tileSize !== current.tileSize && presets[msg.savedSettings.tileSize] !== undefined) active = presets[msg.savedSettings.tileSize];
      if (active !== null && (!Number.isSafeInteger(active) || active < 1)) throw new Error('TilesPerBox must be a positive whole number or null.');
      msg.savedSettings.TilesPerBox = active;
    }
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

const prelude = `${validateDesignGradeSlots}\nconst KEDA_TILE_SIZES=${JSON.stringify(KEDA_TILE_SIZES)};\n${validateTilesPerBox}\nconst RATED_SPEED_TILE_SIZES=${JSON.stringify(RATED_SPEED_TILE_SIZES)};\nconst GLAZE_TILE_SIZES=${JSON.stringify(GLAZE_TILE_SIZES)};\nconst KILN_TILE_SIZES=${JSON.stringify(KILN_TILE_SIZES)};\n${kilnRatedSpeed}\n${pressRatedSpeed}\n${validateRatedSpeeds}\n${ratedSpeedFor}\n`;
const sub = 'rx_saved_speeds_router', keep = 'rx_saved_speeds_preserve';
const fn = (id,z,name,func,outputs,wires,x,y) => ({id,type:'function',z,name,func,outputs,wires,x,y});
export const nodes = [
  { id:sub,type:'subflow',name:'Keda: save speeds action',category:'Ruhanex',color:'#C0DEED',info:'Insert after existing POST /api/line-setting authorization/detection guard and BEFORE its validator. Output 1: normal settings request -> existing validator. Output 2: speeds response -> HTTP response. Select existing Mongo client inside this subflow. No new HTTP route.',in:[{x:40,y:80,wires:[{id:'rx_sp_route'}]}],out:[{x:900,y:40,wires:[{id:'rx_sp_route',port:0}]},{x:900,y:180,wires:[{id:'rx_sp_route',port:2},{id:'rx_sp_write_prepare',port:1},{id:'rx_sp_done',port:0},{id:'rx_sp_failure',port:0}]}],env:[] },
  fn('rx_sp_route',sub,'Route saveSpeeds / validate',prelude+`return (${routeSpeeds})(msg,global);`,3,[[],['rx_sp_read'],[]],220,80),
  {id:'rx_sp_read',type:'mongodb4',z:sub,name:'Read ruhanex_config',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'findOne',output:'toArray',maxTimeMS:'0',handleDocId:false,x:460,y:80,wires:[['rx_sp_write_prepare']]},
  fn('rx_sp_write_prepare',sub,'Update line presets or grade assignments',prelude+`return (${prepareSpeedWrite})(msg);`,3,[['rx_sp_write'],[],['rx_sp_read']],700,80),
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

// Keep the existing directly wired export in sync without copying connection credentials.
if (!process.argv[2]) {
  const target = new URL('./keda-line-settings-save.patch.flow.json', import.meta.url);
  if (fs.existsSync(target)) {
    const wired = JSON.parse(fs.readFileSync(target, 'utf8'));
    const replacements = new Map(nodes.map(n => [n.id, n]));
    for (let i = 0; i < wired.length; i++) {
      const n = wired[i];
      if (replacements.has(n.id)) { wired[i] = replacements.get(n.id); continue; }
      if (n.type === 'function' && n.func.includes('function preserveSpeeds(')) {
        const start = n.func.indexOf('function preserveSpeeds(');
        const end = n.func.indexOf('\n}', start) + 2;
        if (end <= start) throw new Error('Cannot find embedded preserveSpeeds function.');
        n.func = n.func.slice(0, start) + preserveSpeeds.toString() + n.func.slice(end);
        if (!n.func.includes('function validateDesignGradeSlots(')) n.func = validateDesignGradeSlots.toString() + '\n' + n.func;
        if (!n.func.includes('const KEDA_TILE_SIZES=')) n.func = `const KEDA_TILE_SIZES=${JSON.stringify(KEDA_TILE_SIZES)};\n${validateTilesPerBox}\n` + n.func;
      }
    }
    fs.writeFileSync(target, JSON.stringify(wired, null, 2) + '\n');
  }
}
