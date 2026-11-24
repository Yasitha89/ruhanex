function qualityPeriod(timestamp) {
  const d=new Date(timestamp+330*60000),h=d.getUTCHours();
  const shift=h>=6&&h<14?'06-14':h>=14&&h<22?'14-22':'22-06';
  if(h<6)d.setUTCDate(d.getUTCDate()-1);
  return {shift,shiftDate:d.toISOString().slice(0,10)};
}
function decodeQualityPoint(payload) {
  if(!Array.isArray(payload)||payload.length!==2)throw Error('Expected existing validated quality [fields,tags] payload.');
  const [f,t]=payload;
  const numeric=v=>typeof v==='string'&&/^\d+i$/.test(v)?Number(v.slice(0,-1)):v;
  const raw=JSON.parse(f.grade_counts_json);
  const total=numeric(f.total_count),sequence=numeric(f.sequence),time=Number(f.time);
  if(!/^RX-QLT-/.test(t?.device||'')||!Number.isSafeInteger(time)||time<0||!Array.isArray(raw)||raw.length!==16||!raw.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=4294967295)||raw.reduce((a,b)=>a+b,0)!==total||!Number.isSafeInteger(sequence)||sequence<0||!/^\d+$/.test(String(f.boot_id)))throw Error('Invalid quality restore input.');
  return {device:t.device,line:t.line,raw,total,sequence,boot:String(f.boot_id),time};
}
function nextQualityState(previous,point,period,maxDelta=10000) {
  const zeros=()=>Array(16).fill(0);
  const s=previous?JSON.parse(JSON.stringify(previous)):null;
  let delta=zeros(),eventType='initial_sync';
  if(s) {
    if(s.bootId===point.boot) {
      if(point.sequence<s.sequence)return null;
      if(point.sequence===s.sequence) {
        if(JSON.stringify(point.raw)!==JSON.stringify(s.previousRaw))throw Error('Same quality sequence has different counts.');
        return null;
      }
      delta=point.raw.map((n,i)=>n-s.previousRaw[i]);
      if(delta.some(n=>n<0))throw Error('Quality counter rollback without a new boot ID; baseline unchanged.');
      eventType=delta.some(n=>n>0)?'count':'heartbeat';
    } else {
      if(s.retiredBoots.includes(point.boot))return null;
      if(s.retiredBoots.length>=128)throw Error('Quality reboot history full; review before commissioning a new device identity.');
      s.retiredBoots.push(s.bootId);delta=[...point.raw];eventType='new_boot';
    }
  }
  if(delta.reduce((a,b)=>a+b,0)>maxDelta)throw Error('Quality box delta exceeds QUALITY_MAX_BOX_DELTA; baseline unchanged.');
  const state=s||{version:1,device:point.device,deviceCount:0,deviceGrades:zeros(),shiftCount:0,shiftGrades:zeros(),retiredBoots:[],baselineOnly:true,seed:'first_snapshot'};
  const changedPeriod=state.shift!==period.shift||state.shiftDate!==period.shiftDate||state.line!==point.line;
  if(changedPeriod){state.shiftCount=0;state.shiftGrades=zeros();state.baselineOnly=!s;}
  state.deviceCount+=delta.reduce((a,b)=>a+b,0);
  state.shiftCount+=delta.reduce((a,b)=>a+b,0);
  state.deviceGrades=state.deviceGrades.map((n,i)=>n+delta[i]);
  state.shiftGrades=state.shiftGrades.map((n,i)=>n+delta[i]);
  if(!Number.isSafeInteger(state.deviceCount)||!Number.isSafeInteger(state.shiftCount))throw Error('Quality total exceeds safe integer range.');
  Object.assign(state,{...period,line:point.line,bootId:point.boot,sequence:point.sequence,previousRaw:[...point.raw],lastSeen:point.time,lastEventType:eventType});
  return {state,delta,eventType};
}
function restoredQualityStates(rows) {
  if(!Array.isArray(rows))throw Error('Quality restore did not return an array.');
  const result={};
  for(const row of rows) {
    if(!/^RX-QLT-/.test(row.device||'')||result[row.device])throw Error('Invalid or duplicate restored quality device.');
    let s;
    if(row.quality_state_json) {
      s=JSON.parse(row.quality_state_json);
      const valid=a=>Array.isArray(a)&&a.length===16&&a.every(n=>Number.isSafeInteger(n)&&n>=0);
      if(s.version!==1||s.device!==row.device||!valid(s.previousRaw)||!valid(s.deviceGrades)||!valid(s.shiftGrades)||!Number.isSafeInteger(s.sequence)||s.sequence<0||!Number.isSafeInteger(s.deviceCount)||s.deviceCount<0||!Number.isSafeInteger(s.shiftCount)||s.shiftCount<0||!Number.isSafeInteger(s.lastSeen)||!Array.isArray(s.retiredBoots)||!/^\d+$/.test(s.bootId)||s.deviceGrades.reduce((a,b)=>a+b,0)!==s.deviceCount||s.shiftGrades.reduce((a,b)=>a+b,0)!==s.shiftCount)throw Error('Invalid quality checkpoint; restore gate remains closed.');
    } else {
      // Legacy points contain raw counters only, not accumulated lifetime/shift totals.
      const raw=JSON.parse(row.grade_counts_json);
      if(!Array.isArray(raw)||raw.length!==16||!raw.every(n=>Number.isSafeInteger(n)&&n>=0)||!/^\d+$/.test(String(row.boot_id))||!Number.isSafeInteger(Number(row.sequence)))throw Error('Invalid legacy quality baseline.');
      const time=Date.parse(row._time);
      if(!Number.isFinite(time))throw Error('Invalid legacy quality timestamp.');
      s={version:1,device:row.device,line:row.line,bootId:String(row.boot_id),sequence:Number(row.sequence),previousRaw:raw,
        deviceCount:0,deviceGrades:Array(16).fill(0),shiftCount:0,shiftGrades:Array(16).fill(0),
        ...qualityPeriod(time),lastSeen:time,retiredBoots:[],baselineOnly:true,seed:'legacy_baseline'};
    }
    result[row.device]=s;
  }
  return result;
}
function qualityCurrentShiftView(states,now) {
  const current=qualityPeriod(now),view=JSON.parse(JSON.stringify(states));
  for(const state of Object.values(view)) {
    if(state.shift!==current.shift||state.shiftDate!==current.shiftDate) {
      state.shift=current.shift;state.shiftDate=current.shiftDate;
      state.shiftCount=0;state.shiftGrades=Array(16).fill(0);
      state.baselineOnly=false;state.shiftViewReset=true;
    } else state.shiftViewReset=false;
  }
  return view;
}
function qualityRestoreEngine(msg,flow,global,node,env) {
  let states=flow.get('qualityCommittedStates')||{};
  // Publish the current shift even if no telemetry arrives or a previous-shift write is pending.
  // Keep committed/checkpoint baselines unchanged so buffered old readings remain correctly counted.
  if(flow.get('qualityRestoreReady')===true)flow.set('qualityCounters',qualityCurrentShiftView(states,Date.now()));
  const action=msg.qualityAction;
  const enabled=id=>global.get('devices')?.[id]?.enabled===true;
  const queue=flow.get('qualityRestoreQueue')||[];
  if(!action) {
    const payload=JSON.parse(JSON.stringify(msg.payload));
    const p=decodeQualityPoint(payload);
    if(!enabled(p.device))return null;
    if(queue.length>=5000)throw Error('Quality restore queue full; reading was not accepted.');
    queue.push(payload);flow.set('qualityRestoreQueue',queue);
  }
  if(action==='restored') {
    if(msg.qualityEpoch!==flow.get('qualityRestoreEpoch'))return null;
    states=restoredQualityStates(msg.payload);
    flow.set('qualityCommittedStates',states);flow.set('qualityCounters',qualityCurrentShiftView(states,Date.now()));flow.set('qualityRestoreBusy',false);flow.set('qualityRestoreReady',true);
  }
  if(action==='restore_failed') {
    if(msg.qualityEpoch!==flow.get('qualityRestoreEpoch'))return null;
    flow.set('qualityRestoreBusy',false);node.warn('Quality restore failed; telemetry remains buffered.');return null;
  }
  let candidate=flow.get('qualityWriteCandidate');
  if(action==='saved'||action==='write_failed') {
    if(!candidate||msg.qualityWriteId!==candidate.id)return null;
    flow.set('qualityWriteBusy',false);
    if(action==='write_failed'){node.warn('Quality write failed; same point/checkpoint will retry.');return null;}
    states[candidate.device]=candidate.state;
    flow.set('qualityCommittedStates',states);flow.set('qualityCounters',qualityCurrentShiftView(states,Date.now()));flow.set('qualityWriteCandidate',null);
    queue.shift();flow.set('qualityRestoreQueue',queue);
    node.send([null,null,{payload:{saved:true,device:candidate.device,deviceCount:candidate.state.deviceCount,shiftCount:candidate.state.shiftCount,eventType:candidate.state.lastEventType}}]);
    candidate=null;
  }
  if(flow.get('qualityRestoreReady')!==true) {
    if(flow.get('qualityRestoreBusy'))return null;
    if(global.get('devicesReady')!==true||global.get('settingsReady')!==true){node.status({fill:'yellow',shape:'ring',text:'quality: waiting for configuration'});return null;}
    flow.set('qualityRestoreBusy',true);
    const bucket=JSON.stringify(env.get('QUALITY_RESTORE_BUCKET')||'RCLH');
    // Normalize _value BEFORE regrouping: sequence is integer, while JSON/boot fields are strings.
    // Without this, Flux cannot merge the heterogeneous tables for pivot.
    const query=`from(bucket:${bucket}) |> range(start:1970-01-01T00:00:00Z) |> filter(fn:(r)=>r._measurement=="quality_events" and (r._field=="quality_state_json" or r._field=="grade_counts_json" or r._field=="boot_id" or r._field=="sequence")) |> toString() |> group(columns:["device","_field"]) |> last() |> group(columns:["device"]) |> pivot(rowKey:["_time"],columnKey:["_field"],valueColumn:"_value") |> sort(columns:["_time"]) |> last(column:"grade_counts_json")`;
    return [null,{query,qualityEpoch:flow.get('qualityRestoreEpoch')},null];
  }
  if(flow.get('qualityWriteBusy'))return null;
  if(!candidate) {
    while(queue.length) {
      const payload=queue[0],p=decodeQualityPoint(payload);
      if(!enabled(p.device)){queue.shift();continue;}
      const period=qualityPeriod(p.time);
      const max=Number(env.get('QUALITY_MAX_BOX_DELTA')||10000);
      if(!Number.isSafeInteger(max)||max<1)throw Error('QUALITY_MAX_BOX_DELTA must be a positive integer.');
      let next;
      try{next=nextQualityState(states[p.device],p,period,max);}catch(e){queue.shift();flow.set('qualityRestoreQueue',queue);node.warn(e.message);continue;}
      if(!next){queue.shift();continue;}
      const time=Math.max(p.time,(states[p.device]?.lastSeen||0)+1);
      next.state.lastSeen=time;payload[0].time=time;
      Object.assign(payload[0],{
        device_count:`${next.state.deviceCount}i`,shift_count:`${next.state.shiftCount}i`,
        box_delta:`${next.delta.reduce((a,b)=>a+b,0)}i`,event_type:next.eventType,
        quality_shift:period.shift,quality_shift_date:period.shiftDate,
        quality_state_json:JSON.stringify(next.state),
      });
      for(let grade=0;grade<16;grade++)Object.assign(payload[0],{
        [`grade_${grade}_delta`]:`${next.delta[grade]}i`,
        [`grade_${grade}_device_count`]:`${next.state.deviceGrades[grade]}i`,
        [`grade_${grade}_shift_count`]:`${next.state.shiftGrades[grade]}i`,
      });
      candidate={id:flow.get('qualityRestoreEpoch')+':'+time+':'+p.device,device:p.device,state:next.state,payload};
      flow.set('qualityWriteCandidate',candidate);break;
    }
    flow.set('qualityRestoreQueue',queue);
  }
  if(!candidate){node.status({fill:'green',shape:'dot',text:'quality restored / ready'});return null;}
  flow.set('qualityWriteBusy',true);
  node.status({fill:'blue',shape:'dot',text:'quality: saving '+candidate.device});
  return [{payload:JSON.parse(JSON.stringify(candidate.payload)),qualityWriteId:candidate.id},null,null];
}
try{return qualityRestoreEngine(msg,flow,global,node,env);}catch(e){node.error(e.message);return null;}