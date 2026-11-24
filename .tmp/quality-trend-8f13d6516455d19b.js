function applyLiveQuality(response, details) {
  response.qualityDetails = details;
  response.qualityAvailable = details.qualityAvailable === true;
  response.qualityAssumed = details.qualityAssumed === true;
  response.totalQualityTiles = details.qualityAvailable ? details.totalTiles : null;
  response.firstQuality = response.qualityAssumed ? 100 : details.qualityAvailable ? details.firstQuality : null;
  response.normalDamageQuality = details.qualityAvailable ? details.normalDamageQuality : null;
  response.cutDamageQuality = details.qualityAvailable ? details.cutDamageQuality : null;
  response.quality = response.firstQuality;
  response.ole = response.quality === null ? null : Math.round(Number(response.availability) * Number(response.performance) * response.quality / 100) / 100;
  return response;
}
function beginLiveQuality(msg, global) {
  const response = msg.payload;
  if (response?.success !== true) return [null, msg];
  msg.liveQualityResponse = response;
  if (!/^Keda [123]$/.test(response.line || '')) return [null, msg];
  const devices = global.get('devices');
  if (!devices || typeof devices !== 'object' || Array.isArray(devices)) {
    msg.payload = applyLiveQuality(response, { qualityAvailable: false, status: 'device-registry-unavailable' });
    return [null, msg];
  }
  const matches = Object.entries(devices).filter(([id, d]) => id.startsWith('RX-QLT-') && d?.enabled === true && d.line === response.line);
  if (matches.length === 0) {
    msg.payload = applyLiveQuality(response, { qualityAvailable: false, qualityAssumed: true, status: 'no-enabled-quality-sensor', assumedQuality: 100 });
    return [null, msg];
  }
  if (matches.length !== 1) {
    msg.payload = applyLiveQuality(response, { qualityAvailable: false, status: 'multiple-quality-sensors' });
    return [null, msg];
  }
  msg.liveQualityDevice = matches[0][0];
  msg.payload = [{ _id: 'designGrades' }]; msg.collection = 'ruhanex_config'; msg.operation = 'findOne';
  return [msg, null];
}
return beginLiveQuality(msg, global);