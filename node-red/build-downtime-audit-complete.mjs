import fs from 'node:fs';
import assert from 'node:assert/strict';
const sourcePath=process.argv[2];
if(!sourcePath)throw Error('Pass the original exported downtime flow JSON path.');
const original=JSON.parse(fs.readFileSync(sourcePath,'utf8').replace(/^\uFEFF/,''));
const addOn=JSON.parse(fs.readFileSync(new URL('./downtime-audit.add-on.flow.json',import.meta.url)));
// Reuse the deployed Mongo connection without exporting its configuration or secrets.
const nodes=structuredClone(original.filter(n=>n.z&&n.type!=='global-config'));
const byId=new Map(nodes.map(n=>[n.id,n]));
const connect=(id,oldTarget,newTarget)=>{
  const n=byId.get(id);
  assert(n,`Missing original node ${id}`);
  assert(n.wires?.[0]?.includes(oldTarget),`Expected original connection ${id} → ${oldTarget}`);
  n.wires[0]=n.wires[0].map(target=>target===oldTarget?newTarget:target);
};
connect('9b18ff99dc6ac9dc','1dca19134e960bb9','rx_da_prepare');
connect('1dca19134e960bb9','940c7e9bf259add4','rx_da_build');
for(const n of addOn){assert(!byId.has(n.id),`Audit node already exists: ${n.id}`);nodes.push(n);}
for(const n of original.filter(n=>n.type==='function'))assert.equal(byId.get(n.id)?.func,n.func,`Original function changed: ${n.name}`);
const ids=new Set(nodes.map(n=>n.id));
for(const n of nodes)for(const output of n.wires||[])for(const target of output)assert(ids.has(target),`Missing wire target ${target}`);
assert.equal(ids.size,nodes.length,'Duplicate IDs');
fs.writeFileSync(new URL('./downtime-audit.complete.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log(`Generated complete flow: ${nodes.length} nodes; all original function bodies unchanged; all wire targets verified. Existing Mongo configuration is referenced, not exported.`);
