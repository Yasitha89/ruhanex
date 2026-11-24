function applyLiveQuality(response,details) {
  response.qualityDetails=details;
  response.qualityAvailable=details.qualityAvailable===true;
  response.totalQualityTiles=details.qualityAvailable?details.totalTiles:null;
  response.firstQuality=details.qualityAvailable?details.firstQuality:null;
  response.normalDamageQuality=details.qualityAvailable?details.normalDamageQuality:null;
  response.cutDamageQuality=details.qualityAvailable?details.cutDamageQuality:null;
  response.quality=response.firstQuality;
  response.ole=response.quality===null?null:Math.round(Number(response.availability)*Number(response.performance)*response.quality/100)/100;
  return response;
}
msg.payload=applyLiveQuality(msg.liveQualityResponse,{qualityAvailable:false,status:'quality-calculation-error'});delete msg.liveQualityGrades;delete msg.liveQualityResponse;node.warn('Live quality calculation failed; production summary returned with quality unavailable.');return msg;