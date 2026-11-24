import fs from 'node:fs';
import assert from 'node:assert/strict';
import {directQualityFields} from './shift-end-codewise-quality.mjs';
const load=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url),'utf8'));
const nodes=[];
for(const [file,ids] of [
  ['./shift-end-codewise-quality.complete.flow.json',['rx_dq_initial','rx_dq_attach','rx_dq_final_error']],
  ['./quality-recheck-reporting.complete.flow.json',['35557f6ffa4bdda4']],
]){
  for(const id of ids){
    const node=load(file).find(n=>n.id===id);assert(node, id);
    const pattern=/function directQualityFields\(target,rows,grades,now\) \{[\s\S]*?\n\}\n(?=function directCodeWiseQuality)/;
    assert(pattern.test(node.func),id+' quality helper missing');
    node.func=node.func.replace(pattern,()=>directQualityFields.toString()+'\n');
    new Function('msg','global','flow','context','node','RED',node.func);
    nodes.push(node);
  }
}
fs.writeFileSync(new URL('./shift-end-output-totals.patch.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated shift-end writer and deployed-ID recheck patch.');
