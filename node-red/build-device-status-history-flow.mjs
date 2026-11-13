import fs from 'node:fs';

export function logStatus(msg, flow, global, node, now) {
  if (msg.statusHistoryRestore === true) {
    const states = {};
    if (!Array.isArray(msg.payload)) throw Error('Invalid device status restore response.');
    for (const row of msg.payload) {
      const state = JSON.parse(row._value);
      if (!state.device || !['Online','Offline','Unknown'].includes(state.status) || !Number.isFinite(state.changedAt) || !Number.isFinite(state.observedAt)) throw Error('Invalid stored status history.');
      states[state.device] = state;
    }
    flow.set('deviceStatusHistoryStates', states);
    flow.set('deviceStatusHistoryReady', true);
    const pending = flow.get('deviceStatusHistoryPending') || [];
    flow.set('deviceStatusHistoryPending', []);
    return [pending.length ? pending : null, null];
  }
  if (!flow.get('deviceStatusHistoryReady')) {
    const pending = flow.get('deviceStatusHistoryPending') || [];
    if (pending.length >= 1000) { node.error('Device status history queue full; restore the Influx connection.'); return null; }
    pending.push({ payload: msg.payload, retain: msg.retain, statusReceivedAt: msg.statusReceivedAt || now });
    flow.set('deviceStatusHistoryPending', pending);
    return null;
  }
  const p = msg.payload || {};
  if (!/^RX-CNT-[A-Za-z0-9_-]+$/.test(String(p.device || '')) || !['Online','Offline','Unknown'].includes(p.sensorStatus)) return null;
  const config = global.get('counterConfig') || {};
  const cfg = config[p.device];
  if (!cfg) return null;
  const states = flow.get('deviceStatusHistoryStates') || {};
  const previous = states[p.device];
  if (previous?.status === p.sensorStatus) return null;
  const receivedAt = Number(msg.statusReceivedAt || p.lastSeen || now);
  const timestamp = Math.max(receivedAt, Number(previous?.observedAt || 0) + 1);
  const retained = msg.retain === true;
  const eventType = !previous ? 'initial_observation' : retained ? 'retained_observation' : 'status_change';
  const state = { device:p.device, status:p.sensorStatus, changedAt:timestamp, observedAt:timestamp, retained, eventType };
  const fields = {
    status:state.status, previous_status:previous?.status || 'Unknown',
    event_type:eventType, retained,
    // Observed time between records, not necessarily the physical outage length.
    previous_observation_duration_ms:previous ? Math.max(0,timestamp-previous.changedAt) : 0,
    previous_observation_available:Boolean(previous),
    live_transition_observation:Boolean(previous) && !retained,
    state_json:JSON.stringify(state),
  };
  states[p.device]=state;
  flow.set('deviceStatusHistoryStates',states);
  return [null, { payload:[{
    measurement:'device_status_events',
    tags:{device:p.device,line:String(cfg.line || p.device),source:'mqtt_status'},
    fields, timestamp,
  }] }];
}

const z='e5489573e203f3d0';
export const nodes = [
  {id:'rx_status_history_start',type:'inject',z,name:'Restore status log baseline on deploy',props:[],once:true,onceDelay:2,repeat:'',x:350,y:2100,wires:[['rx_status_history_query']]},
  {id:'rx_status_history_query',type:'function',z,name:'Restore last status per device',outputs:1,
    initialize:"flow.set('deviceStatusHistoryReady',false);flow.set('deviceStatusHistoryPending',[]);",
    func:`msg.query='from(bucket:"communication_monitoring") |> range(start:1970-01-01T00:00:00Z) |> filter(fn:(r)=>r._measurement=="device_status_events" and r._field=="state_json" and r.source=="mqtt_status") |> group(columns:["device"]) |> last()';return msg;`,x:650,y:2100,wires:[['rx_status_history_read']]},
  {id:'rx_status_history_read',type:'influxdb in',z,name:'Read communication history baseline',influxdb:'eef122fda5340dac',query:'',rawOutput:false,org:'Ruhanex',x:970,y:2100,wires:[['rx_status_history_restored']]},
  {id:'rx_status_history_restored',type:'function',z,name:'Release queued status messages',outputs:1,func:'msg.statusHistoryRestore=true;return msg;',x:1290,y:2100,wires:[['rx_status_history_log']]},
  {id:'rx_status_history_log',type:'function',z,name:'Log device status CHANGES only',outputs:2,
    func:`try{return (${logStatus})(msg,flow,global,node,Date.now());}catch(e){node.error(e.message,msg);return null;}`,
    x:660,y:2200,wires:[['rx_status_history_log'],['rx_status_history_write']]},
  {id:'rx_status_history_write',type:'influxdb batch',z,name:'Write device_status_events',influxdb:'eef122fda5340dac',precision:'',retentionPolicy:'',database:'database',precisionV18FluxV20:'ms',retentionPolicyV18Flux:'',org:'Ruhanex',bucket:'communication_monitoring',x:1010,y:2200,wires:[]},
  {id:'rx_status_history_write_catch',type:'catch',z,name:'Status log write error',scope:['rx_status_history_write'],uncaught:false,x:370,y:2300,wires:[['rx_status_history_retry_check']]},
  {id:'rx_status_history_retry_check',type:'function',z,name:'Retry same timestamp, up to 5 times',outputs:2,func:"msg.statusLogRetries=Number(msg.statusLogRetries||0)+1;if(msg.statusLogRetries<=5){delete msg.error;return [msg,null];}return [null,{payload:{error:'Device status log write failed after retries; event not confirmed saved.'}}];",x:710,y:2300,wires:[['rx_status_history_retry_delay'],['rx_status_history_debug']]},
  {id:'rx_status_history_retry_delay',type:'delay',z,name:'Retry status log after 10 seconds',pauseType:'delay',timeout:'10',timeoutUnits:'seconds',rate:'1',nbRateUnits:'1',rateUnits:'second',drop:false,x:1070,y:2300,wires:[['rx_status_history_write']]},
  {id:'rx_status_history_restore_catch',type:'catch',z,name:'Status restore / logger error',scope:['rx_status_history_read','rx_status_history_log'],uncaught:false,x:390,y:2380,wires:[['rx_status_history_safe_error']]},
  {id:'rx_status_history_safe_error',type:'function',z,name:'Safe status history error',outputs:1,func:"return {payload:{error:msg.error?.source?.id==='rx_status_history_read'?'Cannot restore device status history. Check bucket/token, then click restore inject.':'Invalid device status history; check logger configuration.'}};",x:730,y:2380,wires:[['rx_status_history_debug']]},
  {id:'rx_status_history_debug',type:'debug',z,name:'Device status history errors',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:1110,y:2380,wires:[]},
];
if (process.argv[2]) {
  const source=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const original=source.find(n=>n.id==='e7854d62c23ddcbf'&&n.type==='function');
  if(!original)throw Error('Expected Update Sensor Status function was not found.');
  const updated={...original,wires:original.wires.map(w=>[...w])};
  if(!updated.wires[0].includes('rx_status_history_log'))updated.wires[0].push('rx_status_history_log');
  fs.writeFileSync(new URL('./device-status-history.patch.flow.json',import.meta.url),JSON.stringify([updated,...nodes],null,2)+'\n');
  console.log('Generated device-status-history.patch.flow.json');
}
