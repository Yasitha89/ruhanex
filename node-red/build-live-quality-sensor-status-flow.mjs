import fs from 'node:fs';
import assert from 'node:assert/strict';
import {attachQualitySensorStatus} from './live-quality-sensor-status.mjs';
if(!process.argv[2])throw Error('Pass the supplied live-summary flow export path.');
const original=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
const nodes=structuredClone(original.filter(n=>n.z));
const merge=nodes.find(n=>n.id==='fdf765c33b6dcbfa');
assert(merge?.type==='function','Expected supplied Merge Live Influx + Mongo / Calculate KPI node.');
assert(/return msg;\s*$/.test(merge.func),'Expected final response return.');
const before=merge.func;
merge.func=merge.func.replace(/return msg;\s*$/,`${attachQualitySensorStatus.toString()}\nmsg.payload=attachQualitySensorStatus(msg.payload,flow,global);\nreturn msg;`);
for(const n of nodes){const old=original.find(x=>x.id===n.id);assert.deepEqual({...n,func:undefined},{...old,func:undefined});if(n.id!==merge.id)assert.equal(n.func,old.func);}
assert(merge.func.startsWith(before.slice(0,before.lastIndexOf('return msg;'))));
fs.writeFileSync(new URL('./production-live-quality-status.patch.flow.json',import.meta.url),JSON.stringify([merge],null,2)+'\n');
fs.writeFileSync(new URL('./production-live-quality-status.complete.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated merge-node patch and complete live-summary flow; existing wiring and other Functions preserved.');
