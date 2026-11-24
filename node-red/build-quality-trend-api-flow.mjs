import fs from 'node:fs';
import {prepareQualityTrendApi,qualityTrendApiResponse} from './quality-trend-api.mjs';
const z='rx_quality_trend_api_tab';
const nodes=[{id:z,type:'tab',label:'Quality shift trend API'},
{id:'rx_qtapi_http',type:'http in',z,name:'GET selected-shift quality trend',method:'get',url:'/api/production/quality-trend',x:250,y:180,wires:[['rx_qtapi_prepare']]},
{id:'rx_qtapi_prepare',type:'function',z,name:'Validate shift / query trend',func:`return (${prepareQualityTrendApi.toString()})(msg);`,outputs:2,x:570,y:180,wires:[['rx_qtapi_read'],['rx_qtapi_out']]},
{id:'rx_qtapi_read',type:'influxdb in',z,name:'Read quality_shift_trend',influxdb:'eef122fda5340dac',query:'',rawOutput:false,org:'Ruhanex',x:910,y:180,wires:[['rx_qtapi_build']]},
{id:'rx_qtapi_build',type:'function',z,name:'Format quality line-chart points',func:`return (${qualityTrendApiResponse.toString()})(msg);`,outputs:1,x:1230,y:180,wires:[['rx_qtapi_out']]},
{id:'rx_qtapi_out',type:'http response',z,name:'Return quality trend',statusCode:'',headers:{},x:1560,y:180,wires:[]},
{id:'rx_qtapi_catch',type:'catch',z,name:'Quality trend API errors',scope:['rx_qtapi_prepare','rx_qtapi_read','rx_qtapi_build'],uncaught:false,x:570,y:300,wires:[['rx_qtapi_error']]},
{id:'rx_qtapi_error',type:'function',z,name:'Trend unavailable',func:`msg.statusCode=503;msg.payload={success:false,error:'Quality trend is temporarily unavailable.'};return msg;`,outputs:1,x:1030,y:300,wires:[['rx_qtapi_out']]}];
fs.writeFileSync(new URL('./quality-trend-api.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated selected-shift quality trend API.');
