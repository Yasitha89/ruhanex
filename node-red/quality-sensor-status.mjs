export function parseQualityStatus(value) {
  if(Buffer.isBuffer(value))value=value.toString();
  if(typeof value==='string'){const raw=value.trim();try{value=JSON.parse(raw);}catch{value=raw;}}
  if(value&&typeof value==='object')value=value.status??value.state??value.sensorStatus;
  const text=String(value??'').trim().toLowerCase();
  if(['online','connected','1','true'].includes(text))return 'Online';
  if(['offline','disconnected','0','false'].includes(text))return 'Offline';
  return null;
}

export function qualityStatusStep(msg,flow,global,node,now) {
  const pending=flow.get('qualityPendingStatus')||{};
  if(msg.qualityStatusAction!=='tick') {
    const match=/^RX-QLT\/([A-Za-z0-9_-]+)\/status$/.exec(String(msg.topic||''));
    if(!match)return null;
    const id='RX-QLT-'+match[1],status=parseQualityStatus(msg.payload);
    if(!status){node.warn('Invalid quality sensor status for '+id);return null;}
    if(!pending[id]&&Object.keys(pending).length>=1000){node.warn('Quality status configuration buffer is full.');return null;}
    pending[id]={device:id,sensorStatus:status,observedAt:now,retained:msg.retain===true};
    flow.set('qualityPendingStatus',pending);
  }
  if(global.get('devicesReady')!==true)return null;
  const devices=global.get('devices')||{},states=flow.get('qualitySensorStatus')||{},debug=[],writes=[];
  for(const[id,event]of Object.entries(pending)) {
    delete pending[id];
    const cfg=devices[id];
    if(!cfg){node.warn('Unknown quality status device: '+id);continue;}
    if(cfg.enabled!==true)continue;
    const old=states[id]||{};
    const state={device:id,line:String(cfg.line||''),sensorStatus:event.sensorStatus,
      lastStatusSeen:event.observedAt,retained:event.retained,
      lastSeen:event.sensorStatus==='Online'&&!event.retained?event.observedAt:old.lastSeen??null};
    states[id]=state;
    const counters=flow.get('qualityCounters');
    if(counters?.[id]) {
      counters[id].sensorStatus=state.sensorStatus;counters[id].statusObservedAt=state.lastStatusSeen;
      counters[id].lastCommunicationSeen=state.lastSeen;
      flow.set('qualityCounters',counters);
    }
    debug.push({payload:{...state}});
    writes.push({payload:[{time:event.observedAt,status:state.sensorStatus,received_status:state.sensorStatus.toLowerCase(),last_seen:Number(event.observedAt),retained:event.retained},{device:id,line:state.line||id}]});
  }
  flow.set('qualitySensorStatus',states);flow.set('qualityPendingStatus',pending);
  if(debug.length)node.status({fill:debug.at(-1).payload.sensorStatus==='Online'?'green':'red',shape:'dot',text:debug.at(-1).payload.device+' '+debug.at(-1).payload.sensorStatus});
  return debug.length?[debug,writes]:null;
}
