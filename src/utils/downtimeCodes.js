export const DOWNTIME_TYPES = [
  { value: "unplanned", label: "Unplanned" },
  { value: "planned", label: "Planned" },
];

export const PLANNED_CATEGORIES = [
  { value: "standard", label: "Standard Planned" },
  { value: "additional", label: "Additional Planned" },
];

// Code records are stored in MongoDB and loaded through downtimeCodesApi.js.
// Retained for legacy components; callers must supply database records.
export function getDowntimeCodes(type, plannedCategory, records = []) {
  return records.filter((item) => item.type === type &&
    (type !== 'planned' || item.plannedCategory === plannedCategory));
}
