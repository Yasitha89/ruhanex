import { validateRatedSpeeds, validateTilesPerBox } from './ratedLineSpeeds.js';
const PRODUCTION_FIELDS = ["tileSize", "designCode", "lineSpeed", "plannedDowntime"];
const DETECTION_FIELDS = ["stopDelayMs", "maxPulseGapMs", "requiredRunTimeMs"];

// The existing endpoint accepts a complete settings payload. Only apply fields
// editable in this section, keeping the other section's latest server values.
export function buildLineSettingsPayload(line, current, values, administration) {
  const editable = administration ? DETECTION_FIELDS : PRODUCTION_FIELDS;
  const payload = { line };
  for (const field of [...PRODUCTION_FIELDS, ...DETECTION_FIELDS]) {
    const value = editable.includes(field) ? values[field] : current[field];
    if (field === "designCode") {
      payload[field] = String(value || "").trim();
    } else if (field === "tileSize") {
      if (typeof value !== "string" || !value.trim()) throw new Error("The current tile size is missing. Reload line settings.");
      payload[field] = value.trim();
    } else {
      if (value == null || value === "" || !Number.isFinite(Number(value))) throw new Error(`The current ${field} value is missing or invalid. Reload line settings.`);
      payload[field] = Number(value);
    }
  }
  const speeds = validateRatedSpeeds(line, administration ? current.savedSpeeds : (values.savedSpeeds ?? current.savedSpeeds));
  if (speeds !== undefined) payload.savedSpeeds = speeds;
  const boxes = validateTilesPerBox(line, administration ? current.savedTilesPerBox ?? {} : values.savedTilesPerBox ?? current.savedTilesPerBox ?? {});
  if (boxes !== undefined) payload.savedTilesPerBox = boxes;
  if (boxes !== undefined) {
    const active = administration ? current.TilesPerBox : values.TilesPerBox;
    const value = active === undefined ? current.TilesPerBox ?? boxes[payload.tileSize] ?? null : active;
    if (value !== null && (!Number.isSafeInteger(value) || value < 1)) throw new Error('Tiles per box must be a positive whole number.');
    payload.TilesPerBox = value;
  }
  return payload;
}
