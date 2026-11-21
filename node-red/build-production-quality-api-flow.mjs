import fs from 'node:fs';
import {qualityShiftQuery,calculateLiveQuality} from './live-quality.mjs';
import {prepareQualityApi,qualityApiQuery,qualityChartData,qualityChartResponse,historicalQualityChart} from './production-quality-api.mjs';
const z='rx_quality_chart_api_tab',response='rx_qapi_response';
const fn=(id,name,func,wires,x,y)=>({id,z,type:'function',name,func,outputs:wires.length,wires,x,y});
const base=[calculateLiveQuality,qualityChartResponse,qualityChartData].map(f=>f.toString()).join('\n');
const nodes=[
 {id:z,type:'tab',label:'Production quality pie API',disabled:false,info:'GET /api/production/shift-quality. See production-quality-api.README.md. No writes.'},
 {id:'rx_qapi_http',z,type:'http in',name:'GET selected-shift quality chart + drilldown',url:'/api/production/shift-quality',method:'get',upload:false,swaggerDoc:'',x:250,y:120,wires:[['rx_qapi_prepare']]},
 fn('rx_qapi_prepare','Validate session identity / Keda / shift',base+'\n'+prepareQualityApi.toString()+'\nreturn prepareQualityApi(msg,global,Date.now());',[['rx_qapi_route'],[response]],700,120),
 fn('rx_qapi_route','Current shift → Influx / previous shift → Mongo',"return msg.qualityApi.historical?[null,msg]:[msg,null];",[['rx_qapi_catalogue'],['rx_qapi_history']],700,190),
 {id:'rx_qapi_history',z,type:'mongodb4',name:'Read selected production shift summary',clientNode:'8120871193b8f276',mode:'collection',collection:'shifts',operation:'find',output:'toArray',maxTimeMS:'15000',handleDocId:false,x:1150,y:600,wires:[['rx_qapi_history_result']]},
 fn('rx_qapi_history_result','Saved historical category / design / grade chart',base+'\n'+historicalQualityChart.toString()+'\nreturn historicalQualityChart(msg);',[[response]],1540,600),
 {id:'rx_qapi_catalogue',z,type:'mongodb4',name:'Read design grade categories',clientNode:'8120871193b8f276',mode:'collection',collection:'ruhanex_config',operation:'findOne',output:'toArray',maxTimeMS:'15000',handleDocId:false,x:1150,y:120,wires:[['rx_qapi_query']]},
 fn('rx_qapi_query','Query quality_events using saved metadata',qualityShiftQuery.toString()+'\n'+qualityApiQuery.toString()+'\nreturn qualityApiQuery(msg);',[['rx_qapi_influx']],700,240),
 {id:'rx_qapi_influx',z,type:'influxdb in',name:'Quality shift deltas grouped by design / size',influxdb:'eef122fda5340dac',query:'',rawOutput:false,precision:'',retentionPolicy:'',org:'Ruhanex',x:1150,y:240,wires:[['rx_qapi_result']]},
 fn('rx_qapi_result','Three categories + design/grade drilldowns',base+"\nmsg.payload=qualityChartData(msg.payload,msg.qualityApiGrades,msg.qualityApi);msg.statusCode=200;delete msg.qualityApiGrades;return msg;",[[response]],700,360),
 fn(response,'JSON response / no browser caching',"msg.headers={'Content-Type':'application/json','Cache-Control':'no-store'};return msg;",[['rx_qapi_out']],1150,360),
 {id:'rx_qapi_out',z,type:'http response',name:'Return quality chart data',statusCode:'',headers:{},x:1490,y:360,wires:[]},
 {id:'rx_qapi_catch',z,type:'catch',name:'Quality chart API errors',scope:['rx_qapi_prepare','rx_qapi_catalogue','rx_qapi_query','rx_qapi_influx','rx_qapi_result','rx_qapi_route','rx_qapi_history','rx_qapi_history_result'],uncaught:false,x:300,y:480,wires:[['rx_qapi_error']]},
 fn('rx_qapi_error','Safe quality API error',"node.warn('Quality chart API failed at '+(msg.error?.source?.name||'unknown node'));msg.statusCode=503;msg.payload={success:false,error:'Quality data is temporarily unavailable. Please retry.'};delete msg.qualityApiGrades;return msg;",[[response]],760,480),
];
fs.writeFileSync(new URL('./production-quality-api.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated production-quality-api.flow.json');
