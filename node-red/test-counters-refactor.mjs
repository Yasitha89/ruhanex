import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {trimUnusedHelpers,refactorFlow} from './refactor-counters-export.mjs';

const sample='function unused(){return 99;} function a(){return b();} function b(){return 2;} return a();';
assert.deepEqual(trimUnusedHelpers(sample).removed,['unused']);
assert.deepEqual(trimUnusedHelpers('function a(){return b();} function b(){return a();} return 1;').removed,['a','b']);
assert.deepEqual(trimUnusedHelpers('function a(){return 2;} function inner(){function a(){return 3;}return a();}return inner();').removed,['a']);
assert(trimUnusedHelpers('function hidden(){return 1;}return eval("hidden()");').skipped);
assert.equal(trimUnusedHelpers('function a(){return 1;}function a(){return 2;}return a();').removed.length,0);

const sourcePath=process.argv[2];
if(!sourcePath)throw Error('Pass the original supplied export path.');
const original=JSON.parse(fs.readFileSync(sourcePath,'utf8').replace(/^\uFEFF/,''));
const {nodes,report}=refactorFlow(original);
const exported=JSON.parse(fs.readFileSync(new URL('./counters-refactored.flow.json',import.meta.url)));
assert.deepEqual(exported,nodes);
for(const n of nodes.filter(n=>n.type==='function'))new vm.Script(`(async function(msg,node,flow,global,context,env,RED){${n.func}\n})`);
assert(report.charactersAfter<report.charactersBefore);
const safe=value=>JSON.parse(JSON.stringify(value??null));
const fixed=Date.parse('2026-11-21T09:00:00Z');
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}}
const maths=Object.create(Math);maths.random=()=>0.123;
const stats={device:'RX-CNT-1004',lineName:'Keda 2',shift:'06-14',shiftDate:'2026-11-21',shiftStart:'2026-11-21T06:00:00+05:30',shiftEnd:'2026-11-21T14:00:00+05:30',availability:75,performance:80,codeWiseProduction:[]};
const catalogue=[{grade:'First',category:'1'}];
const target={line:'Keda 2',device:'RX-CNT-1004',sensor:'RX-QLT-4000',shift:'06-14',shiftDate:'2026-11-21',from:stats.shiftStart,to:stats.shiftEnd,availability:75,performance:80,status:'pending'};
const message={_msgid:'refactor-test',req:{query:{line:'Keda 2',date:'2026-11-21',shift:'06-14'},headers:{}},payload:[],directQualityTarget:target,directQualityGrades:catalogue,directQualityProduction:{_id:'test-shift',lineStats:stats},directQualityOriginalUpdate:[{'lineStats.device':'RX-CNT-1004'},{$set:{'lineStats.codeWiseProduction':[]}}]};
const globals={devicesReady:true,settingsReady:true,devices:{'RX-QLT-4000':{enabled:true,line:'Keda 2'}},counterConfig:{'RX-CNT-1004':{enabled:true,line:'Keda 2',lineSpeed:16}},lineSettings:{'Keda 2':{tileSize:'80x80',lineSpeed:16}}};
async function execute(code,input){
 const calls=[],f=new Map(),g=new Map(Object.entries(structuredClone(globals))),c=new Map();
 const store=m=>({get:k=>m.get(k),set:(k,v)=>m.set(k,v)});
 const log=name=>(...args)=>calls.push([name,...args]);
 const sandbox={Date:FixedDate,Math:maths,Buffer,Intl,JSON,Promise,Number,Array,Map,Set,Object,String,Boolean,Error,RegExp,
   node:{send:log('send'),error:log('error'),warn:log('warn'),status:log('status'),done:log('done')},flow:store(f),global:store(g),context:store(c),env:{get:()=>undefined},RED:{util:{cloneMessage:structuredClone}},msg:structuredClone(input)};
 let result,error;
 try{result=await vm.runInNewContext(`(async function(){${code}\n})()`,sandbox,{timeout:1000});}catch(e){error={name:e.name,message:e.message};}
 return safe({result,error,calls,flow:[...f],global:[...g],context:[...c],msg:sandbox.msg});
}
let comparisons=0;
for(const changed of report.changes){
 const before=original.find(n=>n.id===changed.id).func,after=nodes.find(n=>n.id===changed.id).func;
 for(const payload of [[],{lineStats:stats},{grades:catalogue},[{_id:'test-shift',lineStats:stats}]]){
   const input={...message,payload};
   assert.deepEqual(await execute(after,input),await execute(before,input),`Behaviour changed in ${changed.name}`);comparisons++;
 }
}
console.log(`Refactor verified: ${nodes.filter(n=>n.type==='function').length} Function bodies compile; active AST/wiring preserved; ${comparisons} before/after execution comparisons passed.`);
