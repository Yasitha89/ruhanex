import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as espree from 'espree';
import * as eslintScope from 'eslint-scope';

const parse=code=>espree.parse(code,{ecmaVersion:2022,sourceType:'script',range:true,loc:true,ecmaFeatures:{globalReturn:true}});
const stripMeta=value=>{
  if(Array.isArray(value))return value.map(stripMeta);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['range','loc','start','end'].includes(k)).map(([k,v])=>[k,stripMeta(v)]));
  return value;
};

export function trimUnusedHelpers(code) {
  // Preserve nodes that could discover helpers by name rather than lexical references.
  if(/\beval\s*\(|\bFunction\s*\(|\bwith\s*\(|arguments\s*\.\s*callee/.test(code))return {code,removed:[],skipped:'dynamic code/introspection'};
  const ast=parse(code);
  const declarations=ast.body.filter(n=>n.type==='FunctionDeclaration'&&n.id);
  if(!declarations.length)return {code,removed:[]};
  const manager=eslintScope.analyze(ast,{ecmaVersion:2022,sourceType:'script',optimistic:false,ignoreEval:false,nodejsScope:true});
  const candidates=new Map();
  for(const decl of declarations) {
    const binding=manager.scopes.flatMap(s=>s.variables).find(v=>v.defs.some(d=>d.type==='FunctionName'&&d.node===decl));
    if(binding?.defs.length===1)candidates.set(decl,{name:decl.id.name,binding});
  }
  const live=new Set(),dependencies=new Map();
  for(const [decl,{binding}] of candidates) {
    for(const reference of binding.references) {
      const position=reference.identifier.range[0];
      const owner=declarations.find(n=>n.range[0]<=position&&position<n.range[1]);
      if(!owner||!candidates.has(owner))live.add(decl);
      else {
        if(!dependencies.has(owner))dependencies.set(owner,new Set());
        dependencies.get(owner).add(decl);
      }
    }
  }
  for(let size=-1;size!==live.size;){size=live.size;for(const owner of [...live])for(const dep of dependencies.get(owner)||[])live.add(dep);}
  const removed=[...candidates.keys()].filter(n=>!live.has(n));
  let result=code;
  for(const decl of [...removed].sort((a,b)=>b.range[0]-a.range[0]))result=result.slice(0,decl.range[0])+result.slice(decl.range[1]);
  const expected={...ast,body:ast.body.filter(n=>!removed.includes(n))};
  assert.deepEqual(stripMeta(parse(result)),stripMeta(expected),'Refactor must only remove unreachable top-level helper declarations.');
  new vm.Script(`(async function(msg,node,flow,global,context,env,RED){${result}\n})`);
  return {code:result,removed:removed.map(n=>n.id.name)};
}

export function refactorFlow(original) {
  // Keep connection credentials/configuration in the deployed runtime, not in this review artifact.
  const source=original.filter(n=>n.type==='tab'||n.z);
  const nodes=structuredClone(source),changes=[],skips=[];
  for(const n of nodes.filter(n=>n.type==='function')) {
    const before=n.func||'';
    try {
      const result=trimUnusedHelpers(before);
      n.func=result.code;
      if(result.removed.length)changes.push({id:n.id,name:n.name,beforeCharacters:before.length,afterCharacters:n.func.length,removedHelpers:result.removed});
      if(result.skipped)skips.push({id:n.id,name:n.name,reason:result.skipped});
    }catch(error){n.func=before;skips.push({id:n.id,name:n.name,reason:'Preserved unchanged: '+error.message.slice(0,150)});}
  }
  for(let i=0;i<nodes.length;i++)assert.deepEqual({...nodes[i],func:undefined},{...source[i],func:undefined},'Node properties/wiring must remain identical.');
  const ids=new Set(nodes.map(n=>n.id));assert.equal(ids.size,nodes.length,'Source contains duplicate node IDs.');
  const routes=new Map();
  for(const n of nodes.filter(n=>n.type==='http in')) {
    const key=(n.method||'get').toUpperCase()+' '+n.url;
    if(!routes.has(key))routes.set(key,[]);routes.get(key).push({id:n.id,disabled:n.d===true,name:n.name});
  }
  const byCode=new Map();for(const n of source.filter(n=>n.type==='function')){if(!byCode.has(n.func))byCode.set(n.func,[]);byCode.get(n.func).push({id:n.id,name:n.name});}
  const report={sourceNodeCount:original.length,exportedNodeCount:nodes.length,functionNodes:source.filter(n=>n.type==='function').length,
    changedFunctions:changes.length,charactersBefore:source.filter(n=>n.type==='function').reduce((s,n)=>s+(n.func||'').length,0),charactersAfter:nodes.filter(n=>n.type==='function').reduce((s,n)=>s+(n.func||'').length,0),
    changes,skips,duplicateRoutes:[...routes].filter(([,list])=>list.length>1).map(([route,copies])=>({route,copies})),
    identicalFunctions:[...byCode.values()].filter(list=>list.length>1),
    omittedConfigNodes:original.filter(n=>!source.includes(n)).map(n=>({id:n.id,type:n.type})),
    externalWireTargets:[...new Set(nodes.flatMap(n=>(n.wires||[]).flat()).filter(id=>!ids.has(id)))]};
  return {nodes,report};
}

if(process.argv[2]){
 const original=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
 const {nodes,report}=refactorFlow(original);
 fs.writeFileSync(new URL('./counters-refactored.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
 fs.writeFileSync(new URL('./counters-refactor.report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({functionNodes:report.functionNodes,changedFunctions:report.changedFunctions,charactersBefore:report.charactersBefore,charactersAfter:report.charactersAfter,savedPercent:Math.round((1-report.charactersAfter/report.charactersBefore)*10000)/100,skips:report.skips.length,duplicateRoutes:report.duplicateRoutes}));
}
