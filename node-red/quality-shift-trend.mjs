import { stockPeriod } from './periodic-stock.mjs';
import { qualityShiftQuery, calculateLiveQuality } from './live-quality.mjs';

export function trendEvent(payload) {
  if(!Array.isArray(payload)||payload.length!==2)throw Error('Trend requires the successfully saved [fields,tags] quality point.');
  const [f,t]=payload;
  const integer=value=>{const n=Number(typeof value==='string'?value.replace(/i$/,''):value);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid quality trend integer.');return n;};
  const delta=Array.from({length:16},(_,i)=>integer(f[`grade_${i}_delta`]));
  const time=integer(f.time);
  if(!time||!/^RX-QLT-/.test(t.device||'')||!/^Keda [123]$/.test(t.line||''))throw Error('Invalid trend source device, line or timestamp.');
  const factor=integer(f.tiles_per_box);
  if(!factor)throw Error('Invalid trend tiles per box.');
  const assignments=JSON.parse(f.design_grades_json);
  if(!assignments||typeof assignments!=='object'||Array.isArray(assignments))throw Error('Invalid trend grade assignments.');
  return {device:t.device,line:t.line,tenant:t.tenant||'',site:t.site||'',time,delta,factor,assignments,
    designCode:String(f.design_code||''),tileSize:String(f.tile_size||''),productionRunId:String(f.production_run_id||''),
    bootId:String(f.boot_id||''),sequence:integer(f.sequence),boxDelta:delta.reduce((a,b)=>a+b,0)};
}

export function trendBucketKey(row) {
  return JSON.stringify([row.device,row.design_code,row.tile_size,Number(row.tiles_per_box),JSON.parse(row.design_grades_json)]);
}

export function trendCandidate(event, existing, restoredRows, grades) {
  const period=stockPeriod(event.time);
  const key=period.id;
  const rows=restoredRows===null?JSON.parse(JSON.stringify(existing.rows)):JSON.parse(JSON.stringify(restoredRows));
  if(restoredRows===null){
    const row={device:event.device,design_code:event.designCode,tile_size:event.tileSize,tiles_per_box:event.factor,design_grades_json:JSON.stringify(event.assignments)};
    let bucket=rows.find(r=>trendBucketKey(r)===trendBucketKey(row));
    if(!bucket){bucket={...row,...Object.fromEntries(Array.from({length:16},(_,i)=>[`grade_${i}_delta`,0]))};rows.push(bucket);}
    for(let grade=0;grade<16;grade++)bucket[`grade_${grade}_delta`]=Number(bucket[`grade_${grade}_delta`])+event.delta[grade];
  }
  const q=calculateLiveQuality(rows,grades);
  if(q.totalBoxes<event.boxDelta)throw Error('Restored shift quality does not include the committed event yet.');
  const fields={time:event.time,schema:'1i',total_boxes:`${q.totalBoxes}i`,total_tiles:`${q.totalTiles}i`,first_tiles:`${q.firstTiles}i`,
    normal_damage_tiles:`${q.normalDamageTiles}i`,cut_damage_tiles:`${q.cutDamageTiles}i`,undetected_tiles:`${q.undetectedTiles}i`,unclassified_tiles:`${q.unclassifiedTiles}i`,
    first_boxes:`${q.firstBoxes}i`,normal_damage_boxes:`${q.normalDamageBoxes}i`,cut_damage_boxes:`${q.cutDamageBoxes}i`,
    quality_available:q.qualityAvailable,classification_complete:q.classificationComplete,box_delta:`${event.boxDelta}i`,
    design_code:event.designCode,tile_size:event.tileSize,tiles_per_box:`${event.factor}i`,production_run_id:event.productionRunId,
    boot_id:event.bootId,sequence:`${event.sequence}i`,calculated_at_ms:`${Date.now()}i`};
  // Missing percentages are omitted, never written as null/zero measured quality.
  if(q.qualityAvailable)Object.assign(fields,{quality:q.firstQuality,first_quality:q.firstQuality,normal_damage_quality:q.normalDamageQuality,
    cut_damage_quality:q.cutDamageQuality,undetected_percent:q.undetectedPercent,unclassified_percent:q.unclassifiedPercent});
  return {state:{period:key,time:event.time,line:event.line,rows},payload:[fields,{device:event.device,line:event.line,shift:period.shift,shiftDate:period.shiftDate,tenant:event.tenant,site:event.site}]};
}

export function qualityTrendStep(msg, context, node, now=Date.now()) {
  const queue=context.get('queue')||[],states=context.get('states')||{};
  let job=context.get('job');
  const action=msg.qualityTrendAction||'tick';
  if(action==='event'){
    const event=trendEvent(msg.payload);
    if(!event.boxDelta)return null;
    if(states[event.device]?.time>=event.time||job?.event.device===event.device&&job.event.time===event.time||queue.some(e=>e.device===event.device&&e.time===event.time))return null;
    if(queue.length>=5000)throw Error('Quality trend queue full; source quality_events remain saved. Replay missing events after recovery.');
    queue.push(event);context.set('queue',queue);
  }
  if(['catalogue','restored','saved','failed'].includes(action)){
    if(!job||job.attempt!==msg.qualityTrendAttempt)return null;
    if(action==='failed'){
      job.busy=false;job.retryAt=now+15000;context.set('job',job);
      node.status({fill:'yellow',shape:'ring',text:'trend retry in 15s'});
      return [null,null,null,{payload:{saved:false,message:'Quality trend failed; queued for retry.',phase:msg.error?.source?.name||null}}];
    }
    if(action==='saved'){
      states[job.event.device]=job.candidate.state;context.set('states',states);context.set('job',null);job=null;
    }else{
      if(action==='catalogue'){
        const catalogue=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
        if(!Array.isArray(catalogue?.grades))throw Error('Missing designGrades catalogue for trend.');
        job.grades=catalogue.grades;
        const state=states[job.event.device],period=stockPeriod(job.event.time);
        if(!state||state.period!==period.id||state.line!==job.event.line){
          context.set('job',job);
          return [null,{qualityTrendAttempt:job.attempt,query:qualityShiftQuery(job.event.device,new Date(period.start).toISOString(),new Date(job.event.time+1).toISOString(),'RCLH',job.event.line)},null,null];
        }
        job.candidate=trendCandidate(job.event,state,null,job.grades);
      }else{
        if(!Array.isArray(msg.payload))throw Error('Invalid quality trend restore result.');
        job.candidate=trendCandidate(job.event,null,msg.payload,job.grades);
      }
      context.set('job',job);
      return [null,null,{payload:job.candidate.payload,qualityTrendAttempt:job.attempt},null];
    }
  }
  if(job?.busy&&now-job.started<120000)return null;
  if(job&&job.retryAt>now)return null;
  if(!job){
    while(queue.length&&states[queue[0].device]?.time>=queue[0].time)queue.shift();
    if(!queue.length){context.set('queue',queue);return null;}
    job={event:queue.shift()};context.set('queue',queue);
  }
  job.attempt=String(now)+':'+Math.random();job.started=now;job.busy=true;
  context.set('job',job);
  node.status({fill:'blue',shape:'dot',text:'trend '+job.event.device});
  // Retry the identical calculated point if the write outcome was uncertain.
  if(job.candidate)return [null,null,{payload:job.candidate.payload,qualityTrendAttempt:job.attempt},null];
  return [{payload:[{_id:'designGrades'}],qualityTrendAttempt:job.attempt},null,null,null];
}
