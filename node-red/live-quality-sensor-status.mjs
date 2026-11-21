export function attachQualitySensorStatus(response,flow,global) {
  if(response?.success!==true)return response;
  const registry=global.get('devices');
  const ready=global.get('devicesReady')===true&&registry&&typeof registry==='object';
  const matches=ready?Object.entries(registry).filter(([id,cfg])=>id.startsWith('RX-QLT-')&&cfg?.enabled===true&&cfg.line===response.line):[];
  const [device]=matches.length===1?matches[0]:[];
  const state=device?(flow.get('qualitySensorStatus')||{})[device]:null;
  const status=['Online','Offline'].includes(state?.sensorStatus)?state.sensorStatus:'Unknown';
  const timestamp=n=>typeof n==='number'&&Number.isFinite(n)&&n>0?n:null;
  Object.assign(response,{
    qualitySensorConfigured:ready?matches.length===1:null,
    qualitySensorConfigStatus:!ready?'configuration-not-ready':matches.length===0?'not-configured':matches.length>1?'multiple-sensors':'configured',
    qualitySensorDevice:device||null,
    qualitySensorStatus:status,
    qualitySensorLastSeen:timestamp(state?.lastSeen),
    qualitySensorStatusObservedAt:timestamp(state?.lastStatusSeen),
    qualitySensorStatusRetained:state?.retained===true,
  });
  response.qualitySensor={
    device:response.qualitySensorDevice,
    sensorStatus:status,
    lastSeen:response.qualitySensorLastSeen,
    statusObservedAt:response.qualitySensorStatusObservedAt,
    retained:response.qualitySensorStatusRetained,
    configured:response.qualitySensorConfigured,
    configStatus:response.qualitySensorConfigStatus,
  };
  return response;
}
