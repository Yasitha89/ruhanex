return (function prepareMonthlyQuality(msg, now = Date.now()) {
  const headers = msg.req?.headers || {};
  if (!headers['x-ruhanex-user'] || !['Admin','Manager','Supervisor','Line Supervisor','JE'].includes(headers['x-ruhanex-role'])) {
    msg.statusCode=401;msg.payload={success:false,error:'Sign in to view quality.'};return [null,msg];
  }
  const month=msg.req?.query?.month || new Date(now+330*60000).toISOString().slice(0,7);
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    msg.statusCode=400;msg.payload={success:false,error:'month must be YYYY-MM.'};return [null,msg];
  }
  const [year,number]=month.split('-').map(Number);
  const next=new Date(Date.UTC(year,number,1)).toISOString().slice(0,10);
  msg.monthlyQuality={month,at:now};
  msg.payload=[{line:{$in:['Keda 1','Keda 2','Keda 3']},shiftDate:{$gte:month+'-01',$lt:next}},
    {limit:3001,projection:{line:1,shiftDate:1,shift:1,qualityAvailable:1,qualityAssumed:1,totalTiles:1,totalBoxes:1,firstTiles:1,normalDamageTiles:1,cutDamageTiles:1,undetectedTiles:1,unclassifiedTiles:1,sourceQualityUpdatedAt:1,designs:1}}];
  return [msg,null];
})(msg);