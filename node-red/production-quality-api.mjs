import {calculateLiveQuality,qualityShiftQuery} from './live-quality.mjs';

export function prepareQualityApi(msg,global,now) {
  const fail=(status,error)=>{msg.statusCode=status;msg.payload={success:false,error};return [null,msg];};
  const headers=msg.req?.headers||{};
  if(!headers['x-ruhanex-user']||!['Admin','Manager','Line Supervisor','JE'].includes(headers['x-ruhanex-role']))return fail(401,'Sign in to view production quality.');
  const q=msg.req?.query||{},line=q.line;
  if(typeof line!=='string'||!/^Keda [123]$/.test(line))return fail(400,'Choose Keda 1, Keda 2 or Keda 3.');
  const local=new Date(now+330*60000),hour=local.getUTCHours();
  const currentShift=hour>=6&&hour<14?'06-14':hour>=14&&hour<22?'14-22':'22-06';
  if(hour<6)local.setUTCDate(local.getUTCDate()-1);
  const suppliedDate=q.date??q.shiftDate;
  if((suppliedDate!=null)!==(q.shift!=null))return fail(400,'Provide both date and shift, or omit both for the current shift.');
  const date=suppliedDate??local.toISOString().slice(0,10),shift=q.shift??currentShift;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||!['06-14','14-22','22-06'].includes(shift))return fail(400,'Invalid shift date or shift.');
  const next=new Date(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const from=`${date}T${shift.slice(0,2)}:00:00+05:30`,to=`${shift==='22-06'?next.toISOString().slice(0,10):date}T${shift.slice(3)}:00:00+05:30`;
  if(Date.parse(from)>now)return fail(400,'The requested shift has not started.');
  const category=q.category==null?null:String(q.category);
  if(category!==null&&!['1','2','3'].includes(category))return fail(400,'Category must be 1, 2 or 3.');
  const historical=Date.parse(to)<=now;
  if(historical) {
    if(q.device!=null&&(typeof q.device!=='string'||!/^RX-QLT-[A-Za-z0-9_-]+$/.test(q.device)))return fail(400,'Invalid quality sensor ID.');
    msg.qualityApi={line,device:q.device||null,shift,shiftDate:date,from,to,calculatedTo:new Date(Date.parse(to)).toISOString(),category:category===null?null:Number(category),timestamp:now,historical:true};
    msg.payload=[{'lineStats.lineName':line,'lineStats.shiftDate':date,'lineStats.shift':shift,...(q.device?{'lineStats.qualitySensorDevice':q.device}:{})},{limit:2}];
    return [msg,null];
  }
  const devices=global.get('devices');
  if(global.get('devicesReady')!==true||!devices)return fail(503,'Device configuration is not ready.');
  let candidates=Object.entries(devices).filter(([id,d])=>id.startsWith('RX-QLT-')&&d?.line===line&&(historical||d.enabled===true));
  if(q.device!=null) {
    if(typeof q.device!=='string'||!candidates.some(([id])=>id===q.device))return fail(400,'Quality sensor must be registered to the selected line.');
    candidates=candidates.filter(([id])=>id===q.device);
  }
  if(candidates.length>1)return fail(409,'Several quality sensors match this line; provide a device ID.');
  const meta={line,device:candidates[0]?.[0]||null,shift,shiftDate:date,from,to,calculatedTo:new Date(Math.min(now+1,Date.parse(to))).toISOString(),category:category===null?null:Number(category),timestamp:now,historical};
  msg.qualityApi=meta;
  if(!meta.device){msg.payload=qualityChartData([],[],meta);msg.statusCode=200;return [null,msg];}
  msg.payload=[{_id:'designGrades'}];return [msg,null];
}

export function qualityApiQuery(msg) {
  const catalogue=Array.isArray(msg.payload)?msg.payload[0]:msg.payload;
  if(!Array.isArray(catalogue?.grades))throw Error('Design grade catalogue is unavailable.');
  msg.qualityApiGrades=catalogue.grades;
  const m=msg.qualityApi;
  msg.query=qualityShiftQuery(m.device,m.from,m.calculatedTo,'RCLH',m.line);
  delete msg.payload;return msg;
}

export function qualityChartData(rows,grades,meta) {
  const totals=calculateLiveQuality(rows,grades);
  const definitions=new Map(grades.map(g=>[String(g.grade||'').trim().toLowerCase(),g]));
  const productMap=new Map();
  for(const row of rows) {
    if(typeof row.design_code!=='string'||!row.design_code||typeof row.tile_size!=='string'||!row.tile_size)throw Error('Saved quality design/size metadata is missing.');
    const key=JSON.stringify([row.design_code,row.tile_size]);
    if(!productMap.has(key))productMap.set(key,{designCode:row.design_code,tileSize:row.tile_size,totalBoxes:0,totalTiles:0,categories:new Map()});
    const product=productMap.get(key),map=JSON.parse(row.design_grades_json),factor=Number(row.tiles_per_box);
    for(let grade=0;grade<16;grade++) {
      const boxes=Number(row[`grade_${grade}_delta`]),tiles=boxes*factor;
      product.totalBoxes+=boxes;product.totalTiles+=tiles;
      if(!tiles||grade===0)continue;
      const name=map[String(grade)]||null,definition=definitions.get(String(name||'').trim().toLowerCase());
      const category=Number(definition?.category);
      if(![1,2,3].includes(category))continue;
      if(!product.categories.has(category))product.categories.set(category,{boxes:0,tiles:0,grades:new Map()});
      const c=product.categories.get(category),gradeKey=JSON.stringify([grade,name]);
      if(!c.grades.has(gradeKey))c.grades.set(gradeKey,{gradeNumber:grade,grade:name,description:definition?.description||'',category,boxes:0,tiles:0});
      const detail=c.grades.get(gradeKey);detail.boxes+=boxes;detail.tiles+=tiles;c.boxes+=boxes;c.tiles+=tiles;
    }
  }
  return qualityChartResponse(totals,productMap,meta);
}

export function qualityChartResponse(totals,productMap,meta) {
  const percent=(n,d)=>d>0?Math.round(n/d*10000)/100:null;
  const categories=[{category:1,key:'first',name:'First quality',boxes:totals.firstBoxes,tiles:totals.firstTiles},
    {category:2,key:'normalDamage',name:'Normal damages',boxes:totals.normalDamageBoxes,tiles:totals.normalDamageTiles},
    {category:3,key:'cutDamage',name:'Cut damages',boxes:totals.cutDamageBoxes,tiles:totals.cutDamageTiles}].map(c=>{
      const designs=[...productMap.values()].filter(p=>p.categories.has(c.category)).map(p=>{
        const item=p.categories.get(c.category);
        return {designCode:p.designCode,tileSize:p.tileSize,totalDesignBoxes:p.totalBoxes,totalDesignTiles:p.totalTiles,
          boxes:item.boxes,tiles:item.tiles,percentageOfDesign:percent(item.tiles,p.totalTiles),percentageOfCategory:percent(item.tiles,c.tiles),
          grades:[...item.grades.values()].map(g=>({...g,percentageOfDesign:percent(g.tiles,p.totalTiles),percentageOfCategory:percent(g.tiles,c.tiles)})).sort((a,b)=>a.gradeNumber-b.gradeNumber)};
      }).sort((a,b)=>a.designCode.localeCompare(b.designCode)||a.tileSize.localeCompare(b.tileSize));
      return {...c,percentage:percent(c.tiles,totals.totalTiles),designs};
    });
  const data=totals.totalTiles>0?categories.map(c=>({id:c.key,category:c.category,name:c.name,value:c.tiles,boxes:c.boxes,percentage:c.percentage})):[];
  const remainder=totals.undetectedTiles+totals.unclassifiedTiles;
  if(remainder>0)data.push({id:'other',category:null,name:'Undetected / unclassified',value:remainder,boxes:totals.undetectedBoxes+totals.unclassifiedBoxes,percentage:percent(remainder,totals.totalTiles)});
  return {success:true,line:meta.line,device:meta.device,shift:meta.shift,shiftDate:meta.shiftDate,shiftFromTime:meta.from,shiftToTime:meta.to,calculatedTo:meta.calculatedTo,timestamp:meta.timestamp,
    qualityAvailable:totals.qualityAvailable,status:!meta.device?'no-quality-sensor':totals.qualityAvailable?'available':'no-tracked-quality-data',
    firstQuality:totals.firstQuality,normalDamageQuality:totals.normalDamageQuality,cutDamageQuality:totals.cutDamageQuality,
    totalQualityBoxes:totals.totalBoxes,totalQualityTiles:totals.totalTiles,undetectedTiles:totals.undetectedTiles,unclassifiedTiles:totals.unclassifiedTiles,
    pie:{valueUnit:'tiles',percentageBasis:'all-quality-counted-tiles',hasRemainder:remainder>0,data},categories,
    selectedCategory:meta.category,drilldown:meta.category===null?null:categories.find(c=>c.category===meta.category),
    gradeBreakdownAvailable:true,designBreakdownComplete:true,
    historical:meta.historical===true,dataSource:meta.historical?'mongodb':'influxdb',source:meta.historical?'shifts':'quality_events',categorySource:meta.historical?'saved-shift-summary':'current-designGrades-catalogue',coverage:'tracked-deltas-only'};
}

export function historicalQualityChart(msg) {
  if(!Array.isArray(msg.payload))throw Error('Historical quality lookup must return an array.');
  const meta=msg.qualityApi,docs=msg.payload;
  if(docs.length>1){msg.statusCode=409;msg.payload={success:false,error:'Several saved shift summaries match. Provide a quality device ID or resolve duplicate shift summaries.'};return msg;}
  const doc=docs[0],s=doc?.lineStats;
  const empty=status=>{msg.statusCode=200;msg.payload=qualityChartData([],[],meta);msg.payload.status=status;return msg;};
  if(!s)return empty('historical-shift-not-saved');
  if(s.lineName!==meta.line||s.shift!==meta.shift||s.shiftDate!==meta.shiftDate||(meta.device&&s.qualitySensorDevice!==meta.device))throw Error('Saved production shift identity does not match request.');
  if(s.qualityStatus==='pending')return empty('historical-quality-pending');
  if(s.qualityAssumed===true){empty('historical-quality-assumed');msg.payload.assumedQuality=s.quality??100;return msg;}
  const totals=s.qualitySummary;
  if(!totals||!Number.isSafeInteger(totals.totalTiles))return empty('historical-quality-details-unavailable');
  const savedMeta={...meta,device:s.qualitySensorDevice||null};
  if(Array.isArray(totals.gradeSegments)) {
    if(!Array.isArray(s.qualityCatalogueSnapshot))throw Error('Saved grade catalogue is missing.');
    const rows=totals.gradeSegments.map(segment=>{
      if(!Array.isArray(segment.gradeBoxes)||segment.gradeBoxes.length!==16)throw Error('Invalid saved grade segment.');
      return {design_code:segment.designCode,tile_size:segment.tileSize,tiles_per_box:segment.tilesPerBox,
        design_grades_json:JSON.stringify(segment.designGrades),...Object.fromEntries(segment.gradeBoxes.map((n,i)=>[`grade_${i}_delta`,n]))};
    });
    msg.payload=qualityChartData(rows,s.qualityCatalogueSnapshot,savedMeta);
    if(msg.payload.totalQualityTiles!==totals.totalTiles||msg.payload.totalQualityBoxes!==totals.totalBoxes)throw Error('Saved shift quality segments do not match totals.');
    msg.payload.gradeBreakdownAvailable=true;
  } else {
    // Older shift summaries have category/design totals but no individual grade counters.
    const products=new Map();
    for(const entry of s.codeWiseProduction||[]) {
      const q=entry.qualityDetails;if(entry.qualityAvailable!==true||!q?.totalTiles)continue;
      const key=JSON.stringify([entry.designCode,entry.tileSize]);
      if(!products.has(key))products.set(key,{designCode:entry.designCode,tileSize:entry.tileSize,totalBoxes:0,totalTiles:0,categories:new Map()});
      const p=products.get(key);p.totalBoxes+=q.totalBoxes;p.totalTiles+=q.totalTiles;
      for(const[category,label]of [[1,'first'],[2,'normalDamage'],[3,'cutDamage']]) {
        if(!q[label+'Tiles'])continue;
        if(!p.categories.has(category))p.categories.set(category,{boxes:0,tiles:0,grades:new Map()});
        const c=p.categories.get(category);c.boxes+=q[label+'Boxes'];c.tiles+=q[label+'Tiles'];
      }
    }
    msg.payload=qualityChartResponse(totals,products,savedMeta);
    msg.payload.gradeBreakdownAvailable=false;
    msg.payload.designBreakdownComplete=[...products.values()].reduce((n,p)=>n+p.totalTiles,0)===totals.totalTiles;
  }
  msg.payload.shiftDocumentId=String(doc._id);msg.payload.savedAt=s.qualityUpdatedAt||s.updatedAt||null;
  msg.payload.coverage=totals.coverage||'tracked-deltas-only';msg.statusCode=200;
  return msg;
}
