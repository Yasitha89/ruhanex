import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=JSON.parse(fs.readFileSync('C:/Users/Yasitha/.codex/attachments/78c764a9-bd1e-43bf-b184-956a455033ad/Pasted text.txt','utf8').replace(/^\uFEFF/,''));
const nodes=source.filter(n=>!['global-config','mongodb4-client','influxdb'].includes(n.type));
const specs=`      get_monthly_quality: spec('/api/production/monthly-quality', { month: text('YYYY-MM in Asia/Colombo production dates.') }, 'Monthly measured quality across Keda 1, Keda 2 and Keda 3 from saved quality_reports. Returns firstQuality, normalDamageQuality, cutDamageQuality, totalTiles, totalBoxes, per-line counts, sizeWiseQuality and pie.data. Saved shifts only; does not include unsaved current-shift output. Percentages are weighted by tile counts, not averaged shift percentages. Missing/assumed quality is excluded. Size totals may cover fewer tiles: check tilesWithoutSizeBreakdown.'),
      get_shift_quality: spec('/api/production/shift-quality', { line: enumeration(['Keda 1','Keda 2','Keda 3'].filter(value => lines.includes(value)), 'Keda line for measured quality.'), date, shift }, 'Selected Keda shift quality: current shift uses live quality_events, ended shifts use saved MongoDB shift summaries. Returns category percentages and boxes/tiles, categories[].designs[].grades, design/size totals and pie data. Grades are grouped into category 1 first quality, 2 normal damages, 3 cut damages; grade 0 is undetected. Respect qualityAvailable, status, gradeBreakdownAvailable and designBreakdownComplete. No enabled sensor may mean assumed quality, not measured 100 percent. Use date and shift from the supplied current/previous shift context.'),
`;
const normalise=`    if (['get_monthly_quality', 'get_shift_quality'].includes(name)) {
      if (!data || data.success !== true) return data;
      if (!data.pie || !Array.isArray(data.pie.data)) return {success:false,error:'Invalid quality API response.'};
      if (name === 'get_monthly_quality' && data.tilesWithoutSizeBreakdown > 0) add('Some measured tiles have no saved size breakdown; size comparisons cover only allocated tiles.');
      if (name === 'get_shift_quality' && data.qualityAvailable !== true) add('No measured quality is available for this shift. Do not interpret missing quality or assumedQuality as measured first-quality yield.');
      return {...data,warnings};
    }
`;
const changed=[];
for(const n of nodes.filter(n=>n.type==='function')){
  const original=n.func;
  if(n.func.includes('function productionToolkit()')){
    assert(n.func.includes('      get_latest_temperature: spec('));
    n.func=n.func.replace('      get_latest_temperature: spec(',specs+'      get_latest_temperature: spec(');
    n.func=n.func.replace("    if (data?.success === false) return data;","    if (data?.success === false) return data;\n"+normalise);
    n.func=n.func.replace("      add('Quality is assumed 100%; availability may exceed 100% under configured planned allowance.');", "      if (data.lineStats?.qualityAssumed === true) add('Quality is explicitly assumed, not measured.');");
  }
  if(n.id==='4729824a10a95881'){
    n.func=n.func.replace("'KPI quality is assumed 100%, not measured reject quality. Availability can exceed 100% with the backend allowance model. Do not average shift percentages to obtain factory KPI; use complete denominator-weighted metrics.',", "'For measured quality use get_monthly_quality for all-Keda monthly totals and size comparisons, and get_shift_quality for current or historical Keda shift design/grade details. Category 1 is first quality, 2 normal damages, 3 cut damages; grade 0 is undetected. Quality counts are boxes and tiles, never m² unless explicitly converted using recorded sizes. Monthly quality covers saved shifts only; current shift is available through get_shift_quality. Never add overlapping total, category, line and size breakdowns. Compare monthly line quality by dividing each line firstTiles by its totalTiles. Do not average percentages across shifts, sizes or lines. Missing or assumed quality is not measured 100%; trust qualityAvailable and qualityAssumed/status. Availability can exceed 100% with the backend allowance model. Use denominator-weighted KPIs.',");
    n.func=n.func.replace('No tariffs, reject counts, verified causal sensor diagnosis or historical stock endpoint are available.', 'No tariffs, verified causal sensor diagnosis or historical stock endpoint are available. Measured damage counts are available through the quality tools.');
  }
  if(n.id==='a4aa3b199eae51cc'){
    const anchor="    msg.headers = { Accept: 'application/json' };";
    assert(n.func.includes(anchor));
    n.func=n.func.replace(anchor,anchor+`
    // Forward existing authenticated identity only; never invent a user or privileged role.
    if (['get_monthly_quality','get_shift_quality'].includes(call.name)) {
      const identity=msg.req?.headers||{};
      for(const header of ['x-ruhanex-user','x-ruhanex-role']) {
        if(typeof identity[header]==='string')msg.headers[header]=identity[header];
      }
    }`);
  }
  n.func=n.func.replaceAll('Saved shifts only; does not include unsaved current-shift output.', 'Saved shifts plus live current-shift output when its production date belongs to the requested month; current-shift saved copies are replaced to avoid double-counting.')
    .replaceAll('Monthly quality covers saved shifts only; current shift is available through get_shift_quality.', 'Monthly quality includes saved shifts plus the live active shift when it belongs to that month. Use get_shift_quality for current-shift drilldowns.');
  if(n.func!==original)changed.push(n);
  new Function('msg','env','node','flow','global','context','RED',n.func);
}
const toolkitNode=nodes.find(n=>n.id==='a4aa3b199eae51cc');
const marker='  return { tools, specs, plan, normalise, shiftContext };\n})();';
const index=toolkitNode.func.indexOf(marker);assert(index>=0);
const kit=vm.runInNewContext(toolkitNode.func.slice(0,index+marker.length)+'\nkit;');
assert.equal(kit.plan('get_monthly_quality',{month:'2026-11'},['Keda 2']).path,'/api/production/monthly-quality');
assert.equal(kit.plan('get_shift_quality',{line:'Keda 2',date:'2026-11-22',shift:'06-14'},['Keda 2']).query.line,'Keda 2');
assert.throws(()=>kit.plan('get_monthly_quality',{month:'2026-13'},['Keda 2']),/Invalid month/);
assert.throws(()=>kit.plan('get_shift_quality',{line:'Kiln 1',date:'2026-11-22',shift:'06-14'},['Kiln 1']),/Invalid line/);
assert.equal(kit.normalise('get_monthly_quality',{success:true,pie:{data:[]},tilesWithoutSizeBreakdown:20},{}).warnings.length,1);
fs.writeFileSync(new URL('./production-ai-chat.quality.patch.flow.json',import.meta.url),JSON.stringify(changed,null,2)+'\n');
fs.writeFileSync(new URL('./production-ai-chat.quality.complete.flow.json',import.meta.url),JSON.stringify(nodes,null,2)+'\n');
console.log(`Updated ${changed.length} functions; tool routing, month validation, Keda restrictions, quality result normalization and syntax checks passed.`);
