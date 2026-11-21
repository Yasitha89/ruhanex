import fs from 'node:fs';
import {parseQualityStatus,qualityStatusStep} from './quality-sensor-status.mjs';
const z='e5489573e203f3d0';
const nodes=[
 {id:'rx_qlt_status_in',z,type:'mqtt in',name:'ALL Quality Sensor Status',topic:'RX-QLT/+/status',qos:'1',datatype:'utf8',broker:'rx_qlt_status_broker',inputs:0,nl:false,rap:true,rh:0,x:240,y:120,wires:[['rx_qlt_status_update']]},
 {id:'rx_qlt_status_update',z,type:'function',name:'Update Quality Sensor Status (separate context)',outputs:2,x:680,y:120,wires:[['rx_qlt_status_debug'],['rx_qlt_status_write']],func:parseQualityStatus.toString()+'\n'+qualityStatusStep.toString()+"\ntry{return qualityStatusStep(msg,flow,global,node,Date.now());}catch(e){node.error(e.message);return null;}"},
 {id:'rx_qlt_status_tick',z,type:'inject',name:'Release quality status after config loads',props:[{p:'qualityStatusAction',v:'tick',vt:'str'}],repeat:'5',once:true,onceDelay:1,x:260,y:220,wires:[['rx_qlt_status_update']]},
 {id:'rx_qlt_status_debug',z,type:'debug',name:'Quality sensor status',active:true,tosidebar:true,console:false,complete:'payload',targetType:'msg',x:1120,y:100,wires:[]},
 {id:'rx_qlt_status_write',z,type:'influxdb out',name:'Save quality status history (optional)',influxdb:'eef122fda5340dac',measurement:'device_status_debug',precision:'',retentionPolicy:'',database:'database',precisionV18FluxV20:'ms',retentionPolicyV18Flux:'',org:'Ruhanex',bucket:'RCLH',x:1150,y:180,wires:[]},
 {id:'rx_qlt_status_catch',z,type:'catch',name:'Quality status history write failed',scope:['rx_qlt_status_write'],uncaught:false,x:270,y:320,wires:[['rx_qlt_status_error']]},
 {id:'rx_qlt_status_error',z,type:'function',name:'Safe status-history error',outputs:1,x:700,y:320,wires:[['rx_qlt_status_debug']],func:"return {payload:{saved:false,message:'Quality status history write failed; runtime status remains available.'}};"},
 {id:'rx_qlt_status_broker',type:'mqtt-broker',name:'QUALITY STATUS — SELECT EXISTING MQTT BROKER',broker:'',port:'1883',clientid:'',autoConnect:true,usetls:false,protocolVersion:'4',keepalive:'60',cleansession:true,autoUnsubscribe:true},
];
fs.writeFileSync(new URL('./quality-sensor-status.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log('Generated quality-sensor-status.flow.json');
