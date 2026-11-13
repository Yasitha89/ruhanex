import assert from 'node:assert/strict';
import { routeSpeeds, prepareSpeedWrite, finishSpeedWrite, preserveSpeeds, nodes } from './build-keda-saved-speeds-flow.mjs';
import { KILN_TILE_SIZES, kilnRatedSpeed, validateRatedSpeeds, ratedSpeedFor } from '../src/utils/ratedLineSpeeds.js';
import { buildLineSettingsPayload } from '../src/utils/lineSettings.js';
const old = {tileSize:'60x30',designCode:'1YKM.SM',lineSpeed:28.5,plannedDowntime:30,stopDelayMs:60000,maxPulseGapMs:10000,requiredRunTimeMs:60000,productionRunId:'existing-run'};
const store = {settingsReady:true,lineSettings:{'Keda 1':structuredClone(old),'Keda 3':{lineSpeed:99}}};
const global = {get:k=>store[k],set:(k,v)=>{store[k]=v;}};
const msg = {req:{headers:{'x-ruhanex-role':'Manager'}},payload:{line:'Keda 1',settingsAction:'saveSpeeds',savedSpeeds:{'40x40':40,'60x30':28.5,'60x60':18}}};
assert.equal(routeSpeeds(msg,global)[1],msg);
msg.payload={_id:'lineSettings',settings:{'Keda 1':old}};
assert.equal(prepareSpeedWrite(msg)[0],msg);
const update=msg.payload[1].$set;
assert.equal(update['settings.Keda 1.savedSpeeds']['60x60'],18);
assert.equal(update['settings.Keda 1.lineSpeed'],28.5);
assert.equal(update['settings.Keda 1.designCode'],undefined);
assert.equal(msg.payload[2].upsert,false);
msg.payload={acknowledged:true,matchedCount:1};
finishSpeedWrite(msg,global);
assert.equal(msg.payload.success,true);
assert.equal(store.lineSettings['Keda 1'].productionRunId,'existing-run');
assert.equal(store.lineSettings['Keda 3'].lineSpeed,99);
const ordinary={savedLine:'Keda 1',savedSettings:{...old,tileSize:'60x60'}};
preserveSpeeds(ordinary,global);
assert.equal(ordinary.savedSettings.lineSpeed,18);
assert.deepEqual(ordinary.savedSettings.savedSpeeds,store.lineSettings['Keda 1'].savedSpeeds);
assert.throws(()=>validateRatedSpeeds('Keda 1',{'80x80':12}),/Unsupported/);
assert.throws(()=>validateRatedSpeeds('Keda 2',{'80x80':-1}),/positive/);
assert.equal(ratedSpeedFor('Keda 3','90x45',{'90x45':12}),12);
const payload=buildLineSettingsPayload('Keda 1',store.lineSettings['Keda 1'],{...old,savedSpeeds:{'60x60':18}},false);
assert.deepEqual(payload.savedSpeeds,{'60x60':18});
const denied={req:{headers:{'x-ruhanex-role':'Line Supervisor'}},payload:{line:'Keda 1',settingsAction:'saveSpeeds',savedSpeeds:{}}};
assert.equal(routeSpeeds(denied,global)[2].statusCode,403);
for(const n of nodes.filter(n=>n.type==='function'))new Function('msg','global',n.func);
console.log('PASS: savedSpeeds persistence, active speed, metadata preservation, auto-selection, payload and validation.');

// Glaze presets store press inputs, with derived speed computed on the server.
for (const line of ['Glaze Line 1', 'Glaze Line 2', 'Glaze Line 3']) {
  const otherSize = line === 'Glaze Line 3' ? '80x80' : '60x30';
  store.lineSettings[line] = {...old,tileSize:'60x60'};
  const glaze = { req:{headers:{'x-ruhanex-role':'Manager'}}, payload:{line,settingsAction:'saveSpeeds',savedSpeeds:{
    '60x60':{pressCyclesPerMinute:10.5,tilesPerPress:4,lineSpeed:999},
    [otherSize]:{pressCyclesPerMinute:7,tilesPerPress:2},
  }}};
  assert.equal(routeSpeeds(glaze,global)[1],glaze);
  assert.equal(glaze.speedSave.savedSpeeds['60x60'].lineSpeed,42);
  glaze.payload={settings:{[line]:store.lineSettings[line]}};
  prepareSpeedWrite(glaze);
  assert.equal(glaze.payload[1].$set[`settings.${line}.lineSpeed`],42);
  assert.equal(glaze.payload[1].$set[`settings.${line}.savedSpeeds`]['60x60'].tilesPerPress,4);
  glaze.payload={acknowledged:true,matchedCount:1};
  finishSpeedWrite(glaze,global);
  assert.equal(glaze.payload.settings.savedSpeeds['60x60'].pressCyclesPerMinute,10.5);
  const changed={savedLine:line,savedSettings:{...old,tileSize:otherSize}};
  preserveSpeeds(changed,global);
  assert.equal(changed.savedSettings.lineSpeed,14);
  const manual={savedLine:line,savedSettings:{...old,tileSize:'60x60',lineSpeed:50}};
  preserveSpeeds(manual,global);
  assert.equal(manual.savedSettings.lineSpeed,50);
  assert.equal(buildLineSettingsPayload(line,store.lineSettings[line],manual.savedSettings,false).savedSpeeds[otherSize].lineSpeed,14);
}
for(const value of [ {pressCyclesPerMinute:10}, {pressCyclesPerMinute:10,tilesPerPress:1.5}, {pressCyclesPerMinute:0,tilesPerPress:4}, 40 ]) {
  assert.throws(()=>validateRatedSpeeds('Glaze Line 1',{'60x60':value}));
}
assert.deepEqual(validateRatedSpeeds('Glaze Line 1',{'60x60':{pressCyclesPerMinute:null,tilesPerPress:null}}),{});
for (const [line,size] of [['Glaze Line 1','80x80'],['Glaze Line 2','90x45'],['Glaze Line 3','40x40']]) {
  assert.throws(()=>validateRatedSpeeds(line,{[size]:{pressCyclesPerMinute:10,tilesPerPress:2}}),/Unsupported/);
}
console.log('PASS: all glaze lines, press multiplication, server-derived speed, persistence, selection and invalid inputs.');

const expectedSpeed = 6090 / 0.36 / 1440;
assert.equal(kilnRatedSpeed('60x60',6090),expectedSpeed);
assert.ok(Math.abs(kilnRatedSpeed('60x30',6090) - 2 * expectedSpeed) < 1e-12);
assert.equal(kilnRatedSpeed('60x60',0),undefined);
assert.equal(kilnRatedSpeed('60x60',-1),undefined);
assert.equal(kilnRatedSpeed('invalid',6090),undefined);
assert.equal(kilnRatedSpeed('60x60','6090'),undefined);
for (const line of Object.keys(KILN_TILE_SIZES)) {
  store.lineSettings[line]={...old,tileSize:'60x60'};
  const kiln={req:{headers:{'x-ruhanex-role':'Manager'}},payload:{line,settingsAction:'saveSpeeds',savedSpeeds:{
    '60x60':{standardDailyOutputSqm:6090,lineSpeed:999},
  }}};
  assert.equal(routeSpeeds(kiln,global)[1],kiln);
  assert.deepEqual(kiln.speedSave.savedSpeeds['60x60'],{standardDailyOutputSqm:6090,lineSpeed:expectedSpeed});
  kiln.payload={settings:{[line]:store.lineSettings[line]}};
  prepareSpeedWrite(kiln);
  assert.equal(kiln.payload[1].$set[`settings.${line}.kilnLengthMeters`],undefined);
  assert.equal(kiln.payload[1].$set[`settings.${line}.lineSpeed`],expectedSpeed);
  kiln.payload={acknowledged:true,matchedCount:1};
  finishSpeedWrite(kiln,global);
  assert.equal(store.lineSettings[line].savedSpeeds['60x60'].standardDailyOutputSqm,6090);
  assert.equal(store.lineSettings[line].productionRunId,'existing-run');
  const changed={savedLine:line,savedSettings:{...old,tileSize:'60x60'}};
  store.lineSettings[line].tileSize='40x40';
  preserveSpeeds(changed,global);
  assert.equal(changed.savedSettings.lineSpeed,expectedSpeed);
  const payload=buildLineSettingsPayload(line,store.lineSettings[line],{...old,tileSize:'60x60'},false);
  assert.equal(payload.kilnLengthMeters,undefined);
  assert.equal(payload.savedSpeeds['60x60'].lineSpeed,expectedSpeed);
}
assert.deepEqual(validateRatedSpeeds('Kiln 1',{'60x60':{standardDailyOutputSqm:null}}),{});
assert.throws(()=>validateRatedSpeeds('Kiln 1',{'60x60':{cycleMinutes:60,tilesPerRow:4,tileLengthCm:60}}),/Re-save/);
assert.throws(()=>validateRatedSpeeds('Kiln 3',{'120x80':{standardDailyOutputSqm:6090}}),/Unsupported/);
console.log('PASS: all kiln lines, 24-hour area conversion, full precision, persistence, selection, legacy detection and invalid inputs.');
