return (function monthlyQualityResponse(msg) {
  if(!Array.isArray(msg.payload)||msg.payload.length>3000)throw Error('Invalid monthly quality report query result.');
  const fields=['totalTiles','totalBoxes','firstTiles','normalDamageTiles','cutDamageTiles','undetectedTiles','unclassifiedTiles'];
  const blank=()=>Object.fromEntries(fields.map(k=>[k,0]));
  const totals=blank(),lines=new Map(['Keda 1','Keda 2','Keda 3'].map(line=>[line,{line,...blank(),reportCount:0}]));
  const seen=new Set();let measuredReports=0,excludedReports=0,asOf=null;
  const sizes=new Map();let tilesWithoutSizeBreakdown=0;
  for(const report of msg.payload) {
    if(!lines.has(report.line))throw Error('Unexpected quality report line.');
    const key=JSON.stringify([report.line,report.shiftDate,report.shift]);
    if(seen.has(key))throw Error('Duplicate line/shift quality reports.');seen.add(key);
    if(report.qualityAvailable!==true||report.qualityAssumed===true){excludedReports++;continue;}
    if(fields.some(k=>!Number.isSafeInteger(report[k])||report[k]<0))throw Error('Invalid quality report totals.');
    if(report.firstTiles+report.normalDamageTiles+report.cutDamageTiles+report.undetectedTiles+report.unclassifiedTiles!==report.totalTiles)throw Error('Quality category counts disagree with total tiles.');
    for(const field of fields){totals[field]+=report[field];lines.get(report.line)[field]+=report[field];}
    const allocated=blank();
    for(const design of report.designs || []) {
      const tileSize=String(design.tileSize || '').trim().toLowerCase().replace(/\s+/g,'').replace(/Ã—/g,'x');
      if(!/^\d+(?:\.\d+)?x\d+(?:\.\d+)?$/.test(tileSize)||!tileSize.split('x').every(v=>Number(v)>0))throw Error('Invalid quality design tile size.');
      if(fields.some(k=>!Number.isSafeInteger(design[k])||design[k]<0))throw Error('Invalid size quality totals.');
      if(design.firstTiles+design.normalDamageTiles+design.cutDamageTiles+design.undetectedTiles+design.unclassifiedTiles!==design.totalTiles)throw Error('Size quality categories disagree with total.');
      if(!sizes.has(tileSize))sizes.set(tileSize,{tileSize,...blank()});
      for(const field of fields){sizes.get(tileSize)[field]+=design[field];allocated[field]+=design[field];}
    }
    if(fields.some(k=>allocated[k]>report[k]))throw Error('Design quality totals exceed shift totals.');
    tilesWithoutSizeBreakdown+=report.totalTiles-allocated.totalTiles;
    measuredReports++;lines.get(report.line).reportCount++;
    const time=Date.parse(report.sourceQualityUpdatedAt);
    if(Number.isFinite(time)&&(!asOf||time>Date.parse(asOf)))asOf=new Date(time).toISOString();
  }
  if(fields.some(k=>!Number.isSafeInteger(totals[k])))throw Error('Monthly quality totals exceed integer range.');
  const pct=n=>totals.totalTiles>0?Math.round(n/totals.totalTiles*10000)/100:null;
  const data=totals.totalTiles>0?[
    {name:'First quality',key:'first',value:totals.firstTiles,percentage:pct(totals.firstTiles)},
    {name:'Normal damages',key:'normalDamage',value:totals.normalDamageTiles,percentage:pct(totals.normalDamageTiles)},
    {name:'Cut damages',key:'cutDamage',value:totals.cutDamageTiles,percentage:pct(totals.cutDamageTiles)}
  ]:[];
  const remainder=totals.undetectedTiles+totals.unclassifiedTiles;
  if(remainder)data.push({name:'Undetected / unclassified',key:'other',value:remainder,percentage:pct(remainder)});
  msg.statusCode=200;msg.headers={'Content-Type':'application/json','Cache-Control':'no-store'};
  const sizeWiseQuality=[...sizes.values()].sort((a,b)=>a.tileSize.localeCompare(b.tileSize,undefined,{numeric:true})).map(size=>{
    const percent=n=>size.totalTiles>0?Math.round(n/size.totalTiles*10000)/100:null;
    return {...size,firstQuality:percent(size.firstTiles),normalDamageQuality:percent(size.normalDamageTiles),cutDamageQuality:percent(size.cutDamageTiles),otherQuality:percent(size.undetectedTiles+size.unclassifiedTiles)};
  });
  msg.payload={success:true,month:msg.monthlyQuality.month,source:'quality_reports',coverage:'saved-shifts-only',...totals,
    firstQuality:pct(totals.firstTiles),normalDamageQuality:pct(totals.normalDamageTiles),cutDamageQuality:pct(totals.cutDamageTiles),
    measuredReports,excludedReports,asOf,lines:[...lines.values()],sizeWiseQuality,tilesWithoutSizeBreakdown,pie:{data,valueUnit:'tiles'}};
  return msg;
})(msg);