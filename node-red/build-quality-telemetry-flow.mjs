import fs from 'node:fs';
import {qualitySnapshot,qualityInfluxPayload} from './quality-telemetry.mjs';
const z='rx_quality_v2';
const nodes=[
  {id:z,type:'tab',label:'Quality telemetry — step 1',disabled:false,info:'See quality-telemetry.README.md. Existing Influx config; raw box snapshots only.'},
  {id:'qv2_mqtt',z,type:'mqtt in',name:'Quality box telemetry',topic:'RX-QLT/+/telemetry',qos:'1',datatype:'utf8',broker:'qv2_broker',inputs:0,x:180,y:100,wires:[['qv2_capture']]},
  {id:'qv2_capture',z,type:'function',name:'Validate + capture registered line settings',outputs:1,x:550,y:100,wires:[['qv2_write']],func:`${qualitySnapshot.toString()}\n${qualityInfluxPayload.toString()}\ntry {
    const previous=flow.get('qualityV2Clock')||0;
    const snapshot=qualitySnapshot(msg,global.get('devices'),global.get('lineSettings'),Math.max(Date.now(),previous+1));
    flow.set('qualityV2Clock',snapshot.receivedAt);
    return {payload:qualityInfluxPayload(snapshot)};
  } catch(e) {node.error(e.message);return null;}`},
  {id:'qv2_write',z,type:'influxdb out',influxdb:'eef122fda5340dac',name:'Save quality box snapshots',measurement:'quality_events',precision:'',retentionPolicy:'',database:'database',precisionV18FluxV20:'ms',retentionPolicyV18Flux:'',org:'Ruhanex',bucket:'RCLH',x:940,y:100,wires:[]},
  {id:'qv2_catch_write',z,type:'catch',name:'Quality Influx write errors',scope:['qv2_write'],uncaught:false,x:230,y:220,wires:[['qv2_error']]},
  {id:'qv2_error',z,type:'function',name:'Safe error details',outputs:1,x:550,y:220,wires:[['qv2_debug']],func:"return {payload:{saved:false,message:msg.error?.message||'Quality Influx write failed'}};"},
  {id:'qv2_debug',z,type:'debug',name:'Quality write errors',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:930,y:220,wires:[]},
  {id:'qv2_broker',type:'mqtt-broker',name:'QUALITY — SELECT EXISTING BROKER',broker:'',port:'1883',clientid:'',autoConnect:true,usetls:false,protocolVersion:'4',keepalive:'60',cleansession:true,autoUnsubscribe:true},
];
fs.writeFileSync(new URL('./quality-telemetry.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated quality-telemetry.flow.json');
