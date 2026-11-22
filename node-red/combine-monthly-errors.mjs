import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const path=new URL('./separated-production-apis.complete.flow.json',import.meta.url);
const nodes=JSON.parse(fs.readFileSync(path,'utf8'));
const merged=nodes.find(n=>n.id==='f0f75dfb0c3ff8bb');
merged.name='Mark Monthly Database Error';
merged.func=`const sourceId = msg.error?.source?.id;
if (sourceId === 'abce9f01edcc9491') {
  msg.topic = 'history_error';
} else if (sourceId === '03258b898cb4babe') {
  msg.topic = 'codewise_error';
} else {
  node.error('Unexpected monthly error source', msg);
  return null;
}
return msg;`;
const catches=nodes.filter(n=>['c308aeccc97e3a4b','5a340fc6835428fd'].includes(n.id));
for(const n of catches)n.wires=[[merged.id]];
const removed=new Set(['2a29a57268fc51ef']);
const old=nodes.find(n=>removed.has(n.id));
for(const id of (old?.wires||[]).flat()){
  const bridge=nodes.find(n=>n.id===id);
  if(bridge?.type==='link out'){
    removed.add(id);
    for(const target of bridge.links||[])removed.add(target);
  }
}
for(const [id,topic] of [['abce9f01edcc9491','history_error'],['03258b898cb4babe','codewise_error']]){
  const msg={error:{source:{id}},monthReq:{rid:'test'}};
  const result=vm.runInNewContext(`(function(msg){${merged.func}})(msg)`,{msg,node:{error(){}}});
  assert.equal(result.topic,topic);assert.equal(result,msg);
}
fs.writeFileSync(path,JSON.stringify(nodes.filter(n=>!removed.has(n.id)),null,2)+'\n');
fs.writeFileSync(new URL('./combined-monthly-error.patch.flow.json',import.meta.url),JSON.stringify([...catches,merged],null,2)+'\n');
console.log('Combined monthly handlers; both error routes verified.');
