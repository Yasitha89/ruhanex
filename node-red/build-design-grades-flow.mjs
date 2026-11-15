import fs from 'node:fs';

export function designGradesStep(msg) {
  const finish = (status, data) => { msg.statusCode = status; msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }; msg.payload = data; delete msg.designGradeState; return [null, msg]; };
  const fail = (status, error) => finish(status, { success: false, error });
  const db = (operation, payload, stage) => { msg.designGradeDb = operation; msg.payload = payload; msg.designGradeState.stage = stage; return [msg, null]; };
  if (!msg.designGradeState) {
    const action = msg.designGradeAction;
    const role = msg.req?.headers?.['x-ruhanex-role'];
    if (role !== 'Admin' && !(action === 'read' && role === 'Manager')) return fail(403, 'Administrator access required to edit grades; Manager access is required to read them.');
    msg.designGradeState = { action };
    if (action === 'read') return db('findOne', [{ _id: 'designGrades' }], 'read');
    const b = msg.payload;
    if (!b || typeof b.grade !== 'string' || !b.grade.trim() || b.grade.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(b.grade)) return fail(400, 'Grade is required, at most 80 characters without control characters.');
    if (typeof b.description !== 'string' || !b.description.trim() || b.description.trim().length > 500) return fail(400, 'Description is required, at most 500 characters.');
    if (b.category !== undefined && (typeof b.category !== 'string' || b.category.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(b.category))) return fail(400, 'Category must be text, at most 100 characters without control characters.');
    const record = { grade: b.grade.trim(), gradeKey: b.grade.trim().toLowerCase(), description: b.description.trim(), updatedAt: new Date().toISOString() };
    if (b.category !== undefined || action === 'create') record.category = (b.category || '').trim();
    msg.designGradeState.record = record;
    if (action === 'update') {
      if (msg.req?.params?.grade !== record.grade) return fail(400, 'The grade identifier cannot be renamed.');
      return db('updateOne', [{ _id: 'designGrades', 'grades.gradeKey': record.gradeKey }, { $set: {
        'grades.$.description': record.description, 'grades.$.updatedAt': record.updatedAt, updatedAt: record.updatedAt,
        ...(record.category !== undefined ? { 'grades.$.category': record.category } : {}),
      } }], 'updated');
    }
    if (action !== 'create') return fail(400, 'Unknown operation.');
    return db('updateOne', [{ _id: 'designGrades' }, { $setOnInsert: { grades: [], createdAt: record.updatedAt } }, { upsert: true }], 'initialized');
  }
  const state = msg.designGradeState;
  if (state.stage === 'read') {
    if (msg.payload && !Array.isArray(msg.payload.grades)) return fail(500, 'Invalid saved design grades.');
    const grades = (msg.payload?.grades || []).map(({ grade, description, category }) => ({ grade, description, category: category || '' })).sort((a, b) => a.grade.localeCompare(b.grade));
    return finish(200, { success: true, grades });
  }
  if (msg.payload?.acknowledged !== true) return fail(500, 'Database did not confirm the write.');
  if (state.stage === 'initialized') {
    return db('updateOne', [{ _id: 'designGrades', 'grades.gradeKey': { $ne: state.record.gradeKey } }, {
      $push: { grades: { ...state.record, createdAt: state.record.updatedAt } }, $set: { updatedAt: state.record.updatedAt },
    }], 'created');
  }
  if (msg.payload.matchedCount !== 1) return fail(state.stage === 'created' ? 409 : 404, state.stage === 'created' ? 'This grade already exists. Edit its description instead.' : 'Grade not found. Refresh the list.');
  return finish(state.stage === 'created' ? 201 : 200, { success: true, grade: { grade: state.record.grade, description: state.record.description, ...(state.record.category !== undefined ? { category: state.record.category } : {}) } });
}

const tab = 'rx_design_grades_tab';
export const nodes = [{ id: tab, type: 'tab', label: 'Design Grades API', disabled: false, info: 'Admin-only API via authenticated Nginx gateway. MongoDB ruhanex_config document _id designGrades. Reuse existing Mongo client. See design-grades.README.md.' }];
for (const [i, [action, method, url]] of [['read', 'get', '/api/design-grades'], ['create', 'post', '/api/design-grades'], ['update', 'put', '/api/design-grades/:grade']].entries()) {
  nodes.push({ id: `rx_dg_${action}_http`, z: tab, type: 'http in', name: `${method.toUpperCase()} ${url}`, method, url, upload: false, swaggerDoc: '', x: 200, y: 120 + i * 80, wires: [[`rx_dg_${action}`]] });
  nodes.push({ id: `rx_dg_${action}`, z: tab, type: 'function', name: action + ' design grades', func: `msg.designGradeAction='${action}'; return (${designGradesStep.toString()})(msg);`, outputs: 2, x: 510, y: 120 + i * 80, wires: [['rx_dg_router'], ['rx_dg_response']] });
}
nodes.push({ id: 'rx_dg_advance', z: tab, type: 'function', name: 'Advance grade save', func: `return (${designGradesStep.toString()})(msg);`, outputs: 2, x: 1090, y: 300, wires: [['rx_dg_router'], ['rx_dg_response']] });
nodes.push({ id: 'rx_dg_router', z: tab, type: 'switch', name: 'Grade database operation', property: 'designGradeDb', propertyType: 'msg', rules: ['findOne', 'updateOne'].map(v => ({ t: 'eq', v, vt: 'str' })), checkall: 'true', outputs: 2, x: 770, y: 160, wires: [['rx_dg_findOne'], ['rx_dg_updateOne']] });
for (const [i, operation] of ['findOne', 'updateOne'].entries()) nodes.push({ id: `rx_dg_${operation}`, z: tab, type: 'mongodb4', name: operation + ' ruhanex_config.designGrades', clientNode: '8120871193b8f276', mode: 'collection', collection: 'ruhanex_config', operation, output: 'toArray', handleDocId: false, maxTimeMS: '15000', x: 1090, y: 120 + i * 80, wires: [['rx_dg_advance']] });
nodes.push({ id: 'rx_dg_response', z: tab, type: 'http response', name: 'Design grades JSON', statusCode: '', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, x: 1100, y: 420, wires: [] });
nodes.push({ id: 'rx_dg_catch', z: tab, type: 'catch', name: 'Grade API errors', scope: nodes.filter(n => ['function', 'mongodb4'].includes(n.type)).map(n => n.id), uncaught: false, x: 210, y: 420, wires: [['rx_dg_error']] });
nodes.push({ id: 'rx_dg_error', z: tab, type: 'function', name: 'Safe grade error', func: "msg.statusCode=500; msg.payload={success:false,error:'Unable to process design grades. Please retry.'}; delete msg.error; delete msg.designGradeState; return msg;", outputs: 1, x: 520, y: 420, wires: [['rx_dg_response']] });
fs.writeFileSync(new URL('./design-grades.flow.json', import.meta.url), JSON.stringify(nodes, null, 2) + '\n');
console.log(`Generated ${nodes.length} design-grade API nodes.`);
