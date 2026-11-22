import { stockPeriod } from './periodic-stock.mjs';
import { qualityShiftQuery, calculateLiveQuality } from './live-quality.mjs';
import { qualityReportDocument } from './quality-report-storage.mjs';

export function prepareOverviewLiveQuality(msg, global) {
  const meta=msg.monthlyQuality;
  if(!Array.isArray(msg.payload))throw Error('Invalid saved quality response.');
  const period=stockPeriod(meta.at);
  msg.monthlySavedQuality=msg.payload;
  meta.currentShift={shift:period.shift,shiftDate:period.shiftDate,from:new Date(period.start).toISOString(),to:new Date(Math.min(meta.at+1,period.end)).toISOString()};
  meta.includeCurrentShift=period.shiftDate.slice(0,7)===meta.month;
  if(!meta.includeCurrentShift)return [null,msg];
  const registry=global.get('devices');
  if(global.get('devicesReady')!==true||!registry)throw Error('Quality device registry is not ready for current-shift totals.');
  meta.liveSensors=[];
  for(const line of ['Keda 1','Keda 2','Keda 3']){
    const matches=Object.entries(registry).filter(([id,c])=>id.startsWith('RX-QLT-')&&c?.enabled===true&&c.line===line);
    if(matches.length>1)throw Error('Multiple enabled quality sensors for '+line);
    if(matches.length)meta.liveSensors.push({device:matches[0][0],line});
  }
  // Remove active-shift reports even when a sensor is now disabled: live data is authoritative.
  msg.monthlySavedQuality=msg.monthlySavedQuality.filter(r=>r.shiftDate!==period.shiftDate||r.shift!==period.shift);
  if(!meta.liveSensors.length){msg.payload=msg.monthlySavedQuality;meta.currentShiftIncluded=true;return [null,msg];}
  msg.payload=[{_id:'designGrades'}];return [msg,null];
}

export function buildOverviewLiveQuery(msg) {
  const catalogue=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  if(!Array.isArray(catalogue?.grades))throw Error('Design grade catalogue unavailable for live quality.');
  msg.monthlyLiveGrades=catalogue.grades;
  const meta=msg.monthlyQuality, shift=meta.currentShift;
  const queries=meta.liveSensors.map(s=>qualityShiftQuery(s.device,shift.from,shift.to,'RCLH',s.line));
  msg.query=queries.length===1?queries[0]:`union(tables:[${queries.join(',')}])`;
  delete msg.payload;return msg;
}

export function mergeOverviewLiveQuality(msg) {
  if(!Array.isArray(msg.payload))throw Error('Invalid live quality query result.');
  const meta=msg.monthlyQuality, shift=meta.currentShift;
  const reports=meta.liveSensors.map(sensor=>{
    const rows=msg.payload.filter(r=>r.device===sensor.device);
    const qualitySummary=calculateLiveQuality(rows,msg.monthlyLiveGrades);
    qualitySummary.gradeSegments=rows.map(r=>({designCode:r.design_code,tileSize:r.tile_size,tilesPerBox:Number(r.tiles_per_box),designGrades:JSON.parse(r.design_grades_json),gradeBoxes:Array.from({length:16},(_,i)=>Number(r[`grade_${i}_delta`]))}));
    return qualityReportDocument({_id:'live:'+sensor.device,lineStats:{lineName:sensor.line,device:null,qualitySensorDevice:sensor.device,shiftDate:shift.shiftDate,shift:shift.shift,
      shiftStart:shift.from,shiftEnd:shift.to,qualityUpdatedAt:new Date(meta.at).toISOString(),qualitySummary,qualityCatalogueSnapshot:msg.monthlyLiveGrades,
      qualityAvailable:qualitySummary.qualityAvailable,qualityAssumed:false,qualityStatus:qualitySummary.qualityAvailable?'measured':'no-tracked-quality-data',
      quality:qualitySummary.firstQuality,firstQuality:qualitySummary.firstQuality,normalDamageQuality:qualitySummary.normalDamageQuality,cutDamageQuality:qualitySummary.cutDamageQuality}},meta.at);
  });
  msg.payload=[...msg.monthlySavedQuality,...reports];
  meta.currentShiftIncluded=true;meta.liveReportCount=reports.filter(r=>r.qualityAvailable).length;
  delete msg.monthlySavedQuality;delete msg.monthlyLiveGrades;
  return msg;
}
