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
  return payload;
}
