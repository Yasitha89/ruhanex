import fs from 'node:fs';
import assert from 'node:assert/strict';
import {stockPeriod} from './periodic-stock.mjs';
import {qualityShiftQuery,calculateLiveQuality} from './live-quality.mjs';
import {trendEvent,trendBucketKey,trendCandidate,qualityTrendStep} from './quality-shift-trend.mjs';
import {buildQualitySnapshotQuery,finishQualitySnapshot} from './live-quality-snapshot.mjs';
const read=id=>JSON.parse(fs.readFileSync(`C:/Users/Yasitha/.codex/attachments/${id}/Pasted text.txt`,'utf8').replace(/^\uFEFF/,''));
const save=(name,nodes)=>fs.writeFileSync(new URL(name,import.meta.url),JSON.stringify(nodes,null,2)+'\n');
const trend=read('56f82c24-783f-4e29-b7ba-b0dab3a02ebc').filter(n=>n.z);
const engine=trend.find(n=>n.id==='d83b73010139a186');assert(engine);
engine.func=[stockPeriod,qualityShiftQuery,calculateLiveQuality,trendEvent,trendBucketKey,trendCandidate].map(f=>f.toString()).join('\n')+`\nreturn (${qualityTrendStep.toString()})(msg,context,node);`;
save('./quality-trend-output-sqm.patch.flow.json',[engine]);
save('./quality-trend-output-sqm.complete.flow.json',trend);
const live=(process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''))
  : read('0a4c9904-319e-403c-a57c-ad6822d0997a')).filter(n=>n.z);
const begin=live.find(n=>n.id==='8f13d6516455d19b');
begin.wires[0]=['318e89cb4b787dcf'];
const query=live.find(n=>n.id==='318e89cb4b787dcf');query.name='Live quality: latest current-shift trend snapshot';query.func=`${buildQualitySnapshotQuery.toString()}\nreturn buildQualitySnapshotQuery(msg);`;
const finish=live.find(n=>n.id==='ade9f36f8940b434');finish.name='Live quality: snapshot KPI / cumulative output';finish.func=`${finishQualitySnapshot.toString()}\nreturn finishQualitySnapshot(msg);`;
const influx=live.find(n=>n.id==='a9b0f4fa1ee8881f');influx.name='Read latest quality_shift_trend snapshot';
save('./live-summary-quality-snapshot.patch.flow.json',[begin,query,influx,finish]);
save('./live-summary-quality-snapshot.complete.flow.json',live);
for(const n of [...trend,...live].filter(n=>n.type==='function'))new Function('msg','flow','global','context','node','RED',n.func);
console.log('Generated attached-ID-preserving trend and live-summary patches + complete flows.');
