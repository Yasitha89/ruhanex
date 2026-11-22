import fs from 'node:fs';
import assert from 'node:assert/strict';
const file=process.argv[2];if(!file)throw Error('Pass the original three-node export path.');
const source=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const ids=['955d480a43e4ce3a','cbd957204cb12b6c','6182707e19555fb2'];
const stages=ids.map(id=>source.find(n=>n.id===id));assert(stages.every(n=>n?.type==='function'));
for(const n of stages){assert(!n.initialize&&!n.finalize&&!n.libs?.length);assert(!/\bcontext\s*\.|node\.(send|done)\s*\(|\bawait\b|setTimeout\s*\(/.test(n.func),'Manual review required for async/node-local state.');}
assert.equal(stages[0].outputs,1);assert.equal(stages[1].outputs,1);assert.equal(stages[2].outputs,2);
assert.deepEqual(stages[0].wires,[[ids[1]]]);assert.deepEqual(stages[1].wires,[[ids[2]]]);
const body=`// Original calculations are scoped separately to preserve their early returns and local variables.
let stageMessage = msg;
${stages.map((n,i)=>`// Stage ${i+1}: ${n.name}
${i<2?'stageMessage =':'return'} (function(msg) {\n${n.func}\n})(stageMessage);
${i<2?'if (stageMessage == null) return null;':''}`).join('\n')}`;
const combined={...stages[0],name:'Calculate code-wise production + prepare quality',func:body,outputs:2,wires:structuredClone(stages[2].wires),outputLabels:['Read design grade categories','Attach quality / continue shift save']};
fs.writeFileSync(new URL('./combined-codewise-production-quality.flow.json',import.meta.url),JSON.stringify([combined],null,2)+'\n');
console.log('Generated one combined Function; first node ID retained, final two output connections preserved.');
