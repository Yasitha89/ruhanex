import fs from 'node:fs';
import assert from 'node:assert/strict';
const path=process.argv[2];if(!path)throw Error('Pass current Telegram downtime sender export.');
const original=JSON.parse(fs.readFileSync(path,'utf8').replace(/^\uFEFF/,''));
const nodes=structuredClone(original.filter(n=>n.z));
const main=nodes.find(n=>n.id==='d8687f0fb9d3963a');assert(main?.type==='function');
let code=main.func;
function replace(before,after){assert(code.includes(before),'Expected current sender snippet: '+before.slice(0,60));code=code.replace(before,after);}
replace("const store = env.get('DOWNTIME_ALERT_CONTEXT_STORE') || undefined;",`const trace = (reason, details={}) => {
      if(String(env.get('DOWNTIME_ALERT_DEBUG')).toLowerCase()!=='true')return;
      node.send([null,null,{payload:{diagnostic:true,reason,device:msg.dt?.device?.device||null,stage:msg.dt?.stage||'start',...details}}]);
    };
    trace('message-entered',{hasSnapshot:Array.isArray(msg.downtimeSnapshot?.devices),deviceCount:Array.isArray(msg.downtimeSnapshot?.devices)?msg.downtimeSnapshot.devices.length:null});
    const store = env.get('DOWNTIME_ALERT_CONTEXT_STORE') || undefined;`);
replace("const db = (operation, args, stage) => { s.stage = stage;", "const db = (operation, args, stage) => { s.stage = stage;trace('database-request',{operation,nextStage:stage});");
replace("if (!msg.dt) {", "const newPoll = !msg.dt;\n    if (newPoll) {");
replace("if (lock() && lock().id !== s.id) return null;", `const currentLock=lock();
    if(currentLock&&currentLock.id!==s.id&&currentLock.until>now){trace('different-poll-owns-lock');return null;}
    if(!newPoll&&(!currentLock||currentLock.id!==s.id)){trace('stale-poll-callback-ignored');return null;}
    if(newPoll&&currentLock&&currentLock.until<=now)trace('expired-poll-lock-replaced');`);
replace("if (String(env.get('DOWNTIME_ALERT_ENABLED')).toLowerCase() !== 'true') return null;","if (String(env.get('DOWNTIME_ALERT_ENABLED')).toLowerCase() !== 'true') {trace('alerts-disabled');return null;}");
replace("if (lock()?.until > now) return null;","if (lock()?.until > now) {trace('poll-lock-active',{remainingSeconds:Math.ceil((lock().until-now)/1000)});return null;}");
replace("flow.set('aiLatestDowntimeSnapshot', msg.downtimeSnapshot);","trace('startup-checks-passed',{snapshotAgeMs:now-msg.downtimeSnapshot.at});flow.set('aiLatestDowntimeSnapshot', msg.downtimeSnapshot);");
replace("setLock({ id: s.id, until: now + 300000 });","setLock({ id: s.id, until: now + 300000 });trace('poll-lock-acquired');");
replace("if (!s.episode || s.episode.incomplete || s.episode.start > s.at) return next();","if (!s.episode || s.episode.incomplete || s.episode.start > s.at) {trace('no-complete-valid-stoppage-chain');return next();}");
replace("if (s.device.status === 'Stopped' && s.episode.end !== null) return next();","if (s.device.status === 'Stopped' && s.episode.end !== null) {trace('runtime-stopped-but-latest-db-stop-closed');return next();}");
replace("if (Number(row.stopStart_ts) < shiftStart) return next();","if (Number(row.stopStart_ts) < shiftStart) {trace('open-stoppage-not-split-at-current-shift',{stopStart:Number(row.stopStart_ts),shiftStart});return next();}");
replace("if (!changed && !firstAlertRequired && ((noTiles && !kiln) || (!due && !timer))) return next();","if (!changed && !firstAlertRequired && ((noTiles && !kiln) || (!due && !timer))) {trace('no-alert-trigger-due',{elapsedMinutes,nextReviewAt:saved?.nextReviewAt||null});return next();}");
replace("const draftRetry = () => {",`const draftRetry = () => {
      trace('message-draft-unavailable',{openaiKeyConfigured:Boolean(env.get('OPENAI_API_KEY')),modelConfigured:Boolean(env.get('OPENAI_MODEL')),httpStatus:Number(msg.statusCode||0),responseStatus:typeof msg.payload?.status==='string'?msg.payload.status:null,errorCode:typeof msg.payload?.error?.code==='string'?msg.payload.error.code:null});`);
replace("if (noTiles && !kiln) return recordDecision('suppress', 'low', null);","if (noTiles && !kiln) {trace('suppressed-by-configured-reason');return recordDecision('suppress', 'low', null);}");
replace("if (!apiKey || !model) return fallback();","if (!apiKey || !model) {trace('assessment-using-fallback',{openaiKeyConfigured:Boolean(apiKey),modelConfigured:Boolean(model)});return fallback();}");
replace('assessment.send = decision === "send";','assessment.send = decision === "send";trace(\'assessment-decision\',{decision,severity,reviewAfterMinutes:minutes});');
replace("if (!Array.isArray(msg.payload) || msg.payload.length > 500)","trace('approved-registration-count',{count:Array.isArray(msg.payload)?msg.payload.length:null});\n      if (!Array.isArray(msg.payload) || msg.payload.length > 500)");
replace("(user.accountGeneration ?? null) !== s.target.ruhanexAccountGeneration) return checkpoint();","(user.accountGeneration ?? null) !== s.target.ruhanexAccountGeneration) {trace('recipient-not-eligible',{role:user?.role||null,enabled:user?.enabled===true,mustChangePassword:user?.mustChangePassword===true,accountGenerationMatches:(user?.accountGeneration??null)===s.target.ruhanexAccountGeneration});return checkpoint();}");
replace("if (s.stage === 'sent') {","if (s.stage === 'sent') {\n      trace('telegram-response',{httpStatus:Number(msg.statusCode||0),ok:msg.payload?.ok===true,errorCode:msg.payload?.error_code||null});");
function failureDetails(error,msg,env) {
  let message=String(error?.message||'Unknown Function error');
  for(const key of ['TELEGRAM_BOT_TOKEN','OPENAI_API_KEY']){const secret=env.get(key);if(typeof secret==='string'&&secret)message=message.split(secret).join('[redacted]');}
  message=message.replace(/https?:\/\/\S+/g,'[URL redacted]').slice(0,240);
  return {diagnostic:true,reason:'function-exception',stage:msg.dt?.stage||'start',device:msg.dt?.device?.device||null,errorName:String(error?.name||'Error'),message};
}
replace("} catch { node.error('Downtime alert failed.', msg); return; }",` } catch (error) {const details=(${failureDetails.toString()})(error,msg,env);node.error('Downtime alert failed.',msg);return [null,null,{payload:details}];}`);
main.func=code;
main.outputs=4;
main.outputLabels=['MongoDB operations','Telegram HTTP','Safe diagnostic Debug','OpenAI HTTP'];
const z=main.z;
const flags=[
 {id:'rx_dt_diag_inject',type:'inject',z,name:'CHECK downtime alert configuration (safe)',props:[],once:false,repeat:'',x:260,y:1160,wires:[['rx_dt_diag_flags']]},
 {id:'rx_dt_diag_flags',type:'function',z,name:'Safe flags — no tokens or chat IDs',outputs:1,x:680,y:1160,wires:[['a56a99b1549f1bdc']],func:`let lock=null,storeValid=true;try{lock=flow.get('telegramDowntimeAlertLock',env.get('DOWNTIME_ALERT_CONTEXT_STORE')||undefined);}catch{storeValid=false;}
   return {payload:{alertsEnabled:String(env.get('DOWNTIME_ALERT_ENABLED')).toLowerCase()==='true',telegramTokenConfigured:Boolean(env.get('TELEGRAM_BOT_TOKEN')),openaiKeyConfigured:Boolean(env.get('OPENAI_API_KEY')),openaiModelConfigured:Boolean(env.get('OPENAI_MODEL')),debugEnabled:String(env.get('DOWNTIME_ALERT_DEBUG')).toLowerCase()==='true',contextStoreValid:storeValid,lockRemainingSeconds:Math.max(0,Math.ceil(((lock?.until||0)-Date.now())/1000)),lastSnapshotAgeSeconds:flow.get('aiLatestDowntimeSnapshot')?Math.round((Date.now()-flow.get('aiLatestDowntimeSnapshot').at)/1000):null,allowedRecipientRoles:['Admin']}};`},
];
nodes.push(...flags);
const checks=structuredClone(flags);
checks[0].id='rx_dt_check_config_in';checks[0].wires=[['rx_dt_check_config_flags']];
checks[1].id='rx_dt_check_config_flags';checks[1].wires=[['rx_dt_check_config_debug']];
checks.push({id:'rx_dt_check_config_debug',z,type:'debug',name:'Downtime configuration check result',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:1100,y:1160,wires:[]});
fs.writeFileSync(new URL('./telegram-downtime-configuration-check.flow.json',import.meta.url),JSON.stringify(checks,null,2)+'\n');
fs.writeFileSync(new URL('./telegram-downtime-diagnostics.patch.flow.json',import.meta.url),JSON.stringify([main,...flags],null,2)+'\n');
fs.writeFileSync(new URL('./telegram-downtime-diagnostics.complete.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated diagnostic sender patch and complete flow; thresholds, AI policy and Admin-only recipient gate unchanged.');
