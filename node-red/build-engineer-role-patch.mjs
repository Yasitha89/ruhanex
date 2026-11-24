import fs from 'node:fs';
const directory=new URL('./',import.meta.url);
const patches=new Map();
for(const filename of fs.readdirSync(directory).filter(name=>name.endsWith('.flow.json')&&!name.startsWith('engineer-role'))){
  const path=new URL(filename,directory);
  const nodes=JSON.parse(fs.readFileSync(path,'utf8').replace(/^\uFEFF/,''));
  let changed=false;
  for(const n of nodes){
    if(n.type!=='function')continue;
    const original=n.func;
    if(n.func.includes('async function authStep')){
      n.func=n.func.replace(/const roles = \['Admin', 'Manager', 'Line Supervisor'\];/g,"const roles = ['Admin', 'Manager', 'Engineer', 'Line Supervisor'];");
      if(!n.func.includes("account.role === 'Engineer'"))n.func=n.func.replace("      if (account.role === 'Line Supervisor')", "      if (account.role === 'Engineer') allowed = read && (production || ['/api/devices', '/api/getEnergyOverview', '/api/getEnergyMeterData', '/api/getLiveEnergyData', '/api/getHistoricalElectricityData', '/api/getHistoricalEnergyUsage', '/api/getHistoricalEnergyData', '/api/getTemperatureData', '/api/getTemperatureGatewayStatus', '/api/getHistoricalTemperatureData'].includes(path));\n      if (account.role === 'Line Supervisor')");
    }
    if(/Sign in to view (production quality|quality)/.test(n.func)){
      n.func=n.func.replace(/(['"]Admin['"]\s*,\s*['"]Manager['"])(\s*,\s*['"](?:Supervisor|Line Supervisor)['"])/g,"$1,'Engineer'$2");
    }
    if(n.func!==original){
      new Function('msg','global','flow','context','node','env','Buffer','RED',n.func);
      patches.set(n.id,n);changed=true;
    }
    if(n.func.includes('Engineer')&&(n.func.includes('async function authStep')||/Sign in to view (production quality|quality)/.test(n.func)))patches.set(n.id,n);
  }
  if(changed)fs.writeFileSync(path,JSON.stringify(nodes,null,2)+'\n');
}
// Prefer the auth flow with push extensions when both exports use the same IDs.
const extended=new URL('./user-auth-vapid.flow.json',directory);
if(fs.existsSync(extended))for(const n of JSON.parse(fs.readFileSync(extended,'utf8')))if(n.type==='function'&&n.func.includes('async function authStep'))patches.set(n.id,n);
fs.writeFileSync(new URL('./engineer-role-access.patch.flow.json',directory),JSON.stringify([...patches.values()],null,2)+'\n');
console.log(`Generated ${patches.size} auth/quality replacement nodes, preserving existing flow IDs.`);
