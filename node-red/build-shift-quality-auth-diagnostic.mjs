import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=JSON.parse(fs.readFileSync('C:/Users/Yasitha/.codex/attachments/952109b4-3b14-43eb-945a-709c9a48897d/Pasted text.txt','utf8'));
const validator=source.find(n=>n.id==='2dea94c9a14a3688');
const original="if(!headers['x-ruhanex-user']||!['Admin','Manager','Engineer','Line Supervisor','JE'].includes(headers['x-ruhanex-role']))return fail(401,'Sign in to view production quality.');";
assert(validator.func.includes(original));
validator.func=validator.func.replace(original,`if(!headers['x-ruhanex-user']||!['Admin','Manager','Engineer','Line Supervisor','JE'].includes(headers['x-ruhanex-role'])) {
    node.warn({message:'Shift quality identity rejected',validator:'2dea94c9a14a3688',userHeaderPresent:Boolean(headers['x-ruhanex-user']),roleHeaderPresent:Boolean(headers['x-ruhanex-role']),engineerRoleExact:headers['x-ruhanex-role']==='Engineer',roleAllowed:['Admin','Manager','Engineer','Line Supervisor','JE'].includes(headers['x-ruhanex-role'])});
    return fail(401,'Sign in to view production quality.');
  }`);
const logs=[];
const run=headers=>new Function('msg','global','node',validator.func)({req:{headers,query:{line:'invalid'}}},{get:()=>null},{warn:entry=>logs.push(entry)})[1];
assert.equal(run({'x-ruhanex-user':'test','x-ruhanex-role':'Engineer'}).statusCode,400);
assert.equal(logs.length,0);
assert.equal(run({}).statusCode,401);assert.equal(logs[0].userHeaderPresent,false);
assert.equal(run({'x-ruhanex-user':'test','x-ruhanex-role':'engineer'}).statusCode,401);assert.equal(logs[1].roleAllowed,false);
const ids=new Set(source.map(n=>n.id));
for(const n of source){for(const out of n.wires||[])for(const id of out)assert(ids.has(id));if(n.type==='function')new Function('msg','global','node',n.func);}
fs.writeFileSync(new URL('./shift-quality-auth-diagnostic.patch.flow.json',import.meta.url),JSON.stringify([validator],null,2)+'\n');
console.log('PASS: Engineer accepted, missing identity rejected, incorrect role rejected; flow wires and syntax valid.');
