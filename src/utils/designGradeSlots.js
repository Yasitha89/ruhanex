export function validateDesignGradeSlots(values = {}, allowedGrades) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Design grades must be a slot-to-grade object.');
  if (Object.keys(values).some(key => !/^(?:[1-9]|1[0-6])$/.test(key))) throw new Error('Design grade slots must be numbered 1 to 16.');
  const result = {};
  for (let slot = 1; slot <= 16; slot++) {
    const grade = values[slot];
    if (grade == null || grade === '') { result[slot] = null; continue; }
    if (typeof grade !== 'string' || !grade.trim() || grade.length > 80) throw new Error(`Invalid grade in slot ${slot}.`);
    if (allowedGrades && !allowedGrades.includes(grade)) throw new Error(`Grade in slot ${slot} is not in the saved Design Grades catalogue.`);
    result[slot] = grade;
  }
  return result;
}
