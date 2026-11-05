import fs from 'node:fs';
const seed = JSON.parse(fs.readFileSync(new URL('./design-codes.product-range.seed.json', import.meta.url), 'utf8'));
export function prepareImport(msg, records) {
  const seen = new Set();
  const now = new Date();
  const operations = records.map(row => {
    if (!row.tileSize || typeof row.designCode !== 'string' || !row.designCode.trim() || row.designCode.length > 100 || typeof row.description !== 'string') throw Error('Invalid catalogue row.');
    const key = `${row.tileSize}|${row.designCode.trim().toLowerCase()}`;
    if (seen.has(key)) throw Error('Duplicate catalogue size/code pair.');
    seen.add(key);
    const escaped = row.designCode.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { updateOne: {
      filter: { tileSize: row.tileSize, designCode: { $regex: '^' + escaped + '$', $options: 'i' } },
      update: { $setOnInsert: { tileSize: row.tileSize, designCode: row.designCode.trim(), description: row.description.trim(), active: true, createdAt: now, updatedAt: now } },
      upsert: true,
    } };
  });
  msg.importCount = operations.length;
  msg.payload = [operations, { ordered: false, maxTimeMS: 60000 }];
  return msg;
}
export function reportImport(msg) {
  const result = Array.isArray(msg.payload) ? msg.payload[0] : msg.payload;
  const added = result?.upsertedCount;
  const matched = result?.matchedCount;
  const modified = result?.modifiedCount;
  // BulkWriteResult does not necessarily have InsertOneResult's acknowledged field.
  const validCounts = [added, matched, modified].every(n => Number.isInteger(n) && n >= 0);
  if (!result || result.acknowledged === false || result.ok === 0 || !validCounts || !Number.isInteger(msg.importCount) || added + matched !== msg.importCount) throw Error('MongoDB bulk result did not confirm all requested rows.');
  msg.payload = { success: true, sourceRows: msg.importCount, added, existingMatches: matched, modified,
    message: 'Existing records were preserved. Refresh Master Data to view imported codes.' };
  return msg;
}
const tab = 'rx_design_catalogue_import';
export const nodes = [
  { id: tab, type: 'tab', label: 'Import product range design codes', info: '347 codes from the supplied 1 November 2026 product range. Manual inject only. Adds missing size/code pairs; existing records are unchanged. See design-codes-import.README.md.' },
  { id: 'rx_design_import_inject', z: tab, type: 'inject', name: 'MANUAL: import 347 design codes', props: [{ p: 'payload' }], payload: '', payloadType: 'date', once: false, repeat: '', crontab: '', x: 230, y: 160, wires: [['rx_design_import_prepare']] },
  { id: 'rx_design_import_prepare', z: tab, type: 'function', name: 'Prepare missing-code upserts', func: `return (${prepareImport.toString()})(msg,${JSON.stringify(seed)});`, outputs: 1, x: 530, y: 160, wires: [['rx_design_import_mongo']] },
  { id: 'rx_design_import_mongo', z: tab, type: 'mongodb4', name: 'Bulk upsert design_codes', clientNode: '8120871193b8f276', mode: 'collection', collection: 'design_codes', operation: 'bulkWrite', output: 'toArray', maxTimeMS: '0', handleDocId: false, x: 830, y: 160, wires: [['rx_design_import_result']] },
  { id: 'rx_design_import_result', z: tab, type: 'function', name: 'Report import result', func: `return (${reportImport.toString()})(msg);`, outputs: 1, x: 1090, y: 160, wires: [['rx_design_import_debug']] },
  { id: 'rx_design_import_debug', z: tab, type: 'debug', name: 'Design-code import result', active: true, tosidebar: true, complete: 'payload', targetType: 'msg', x: 1370, y: 160, wires: [] },
  { id: 'rx_design_import_catch', z: tab, type: 'catch', name: 'Import failed or partially completed', scope: ['rx_design_import_prepare', 'rx_design_import_mongo', 'rx_design_import_result'], uncaught: false, x: 260, y: 280, wires: [['rx_design_import_error']] },
  { id: 'rx_design_import_error', z: tab, type: 'function', name: 'Report failure', func: `msg.payload={success:false,failedNode:msg.error?.source?.name||'Unknown',error:'Import failed or partially completed. Inspect the Mongo node error in the editor, correct the issue, and retry; existing codes are preserved.'};delete msg.error;return msg;`, outputs: 1, x: 650, y: 280, wires: [['rx_design_import_debug']] },
];
fs.writeFileSync(new URL('./design-codes-import.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log(`Generated import flow for ${seed.length} design codes.`);
