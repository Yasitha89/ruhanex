import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = JSON.parse(fs.readFileSync('C:/Users/Yasitha/.codex/attachments/5cffc258-1cd2-4a27-8b30-0dad77d6b58b/Pasted text.txt','utf8').replace(/^\uFEFF/,''));
const apiTab='rx_production_api_tab', runtimeTab='e5489573e203f3d0';
const nodes=source.filter(n=>!['mongodb4-client','influxdb','global-config'].includes(n.type)).map(n=>structuredClone(n));
const runtimeIds=new Set(nodes.filter(n=>n.type==='function'&&/\bflow\s*\./.test(n.func)).map(n=>n.id));
for(const n of nodes)n.z=runtimeIds.has(n.id)?runtimeTab:apiTab;
// Catch nodes are tab-scoped: split their scopes without changing error handlers.
for(const original of [...nodes].filter(n=>n.type==='catch')){
  const scope=original.scope||[];
  const runtimeScope=scope.filter(id=>runtimeIds.has(id));
  original.scope=scope.filter(id=>!runtimeIds.has(id));
  if(runtimeScope.length)nodes.push({...structuredClone(original),id:`rx_api_catch_${original.id}`,z:runtimeTab,scope:runtimeScope,name:`Runtime: ${original.name}`});
  if(scope.length&&!original.scope.length)original.d=true;
}
const duplicate=nodes.find(n=>n.id==='rx_qapi_http');
if(duplicate)duplicate.d=true;
const map=new Map(nodes.map(n=>[n.id,n]));
const bridges=[];
let serial=0;
for(const n of nodes){
  n.wires=(n.wires||[]).map(targets=>targets.map(targetId=>{
    const target=map.get(targetId);
    if(!target||target.z===n.z)return targetId;
    const index=++serial,out=`rx_api_bridge_out_${index}`,input=`rx_api_bridge_in_${index}`;
    bridges.push({id:out,type:'link out',z:n.z,name:`To ${target.name||targetId}`,mode:'link',links:[input],x:(n.x||300)+160,y:n.y||200,wires:[]});
    bridges.push({id:input,type:'link in',z:target.z,name:`From ${n.name||n.id}`,links:[out],x:(target.x||600)-160,y:target.y||200,wires:[[targetId]]});
    return out;
  }));
}
const output=[{id:apiTab,type:'tab',label:'Production APIs',info:'Runtime-dependent functions remain on Counters and are connected using link nodes. Import by replacing existing node IDs. See separated-production-apis.README.md.'},...nodes,...bridges];
const ids=new Set(output.map(n=>n.id));
const outputMap=new Map(output.map(n=>[n.id,n]));
function destination(id){
  const n=outputMap.get(id);
  return n?.type==='link out'?outputMap.get(n.links[0]).wires[0][0]:id;
}
for(const n of nodes.filter(n=>source.some(s=>s.id===n.id))){
  assert.deepEqual(n.wires.map(targets=>targets.map(destination)),source.find(s=>s.id===n.id).wires||[]);
  if(n.type==='function')new Function('msg','flow','global','context','node',n.func);
}
const external=[...new Set(output.flatMap(n=>(n.wires||[]).flat()).filter(id=>!ids.has(id)))];
// Original function bodies and node-local context are retained verbatim.
for(const n of nodes.filter(n=>n.type==='function'))assert.equal(n.func,source.find(s=>s.id===n.id).func);
for(const n of output.filter(n=>n.type==='catch'))assert(n.scope.every(id=>map.get(id)?.z===n.z));
const report={runtimeFunctions:nodes.filter(n=>runtimeIds.has(n.id)).map(n=>({id:n.id,name:n.name})),crossTabConnections:serial,externalWireTargets:external,disabledDuplicateEndpoint:'rx_qapi_http'};
fs.writeFileSync(new URL('./separated-production-apis.complete.flow.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(new URL('./separated-production-apis.report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
