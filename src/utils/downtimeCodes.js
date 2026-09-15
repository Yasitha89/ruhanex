export const DOWNTIME_TYPES = [
  { value: "unplanned", label: "Unplanned" },
  { value: "planned", label: "Planned" },
];

export const PLANNED_CATEGORIES = [
  { value: "standard", label: "Standard Planned" },
  { value: "additional", label: "Additional Planned" },
];

export const DOWNTIME_CODES = [
  { value: "TEA_BREAK", label: "TEA_BREAK - Tea Break", type: "planned", plannedCategory: "standard" },
  { value: "SHIFT_START", label: "SHIFT_START - Shift Start / Handover", type: "planned", plannedCategory: "standard" },
  { value: "SHIFT_END", label: "SHIFT_END - Shift End / Handover", type: "planned", plannedCategory: "standard" },
  { value: "MEAL_BREAK", label: "MEAL_BREAK - Meal Break", type: "planned", plannedCategory: "standard" },
  { value: "PM", label: "PM - Planned Maintenance", type: "planned", plannedCategory: "additional" },
  { value: "CHANGEOVER", label: "CHANGEOVER - Product / Size Change", type: "planned", plannedCategory: "additional" },
  { value: "CLEANING", label: "CLEANING - Planned Cleaning", type: "planned", plannedCategory: "additional" },
  { value: "OTHER_PLANNED", label: "OTHER_PLANNED - Other Planned Activity", type: "planned", plannedCategory: "additional" },
  { value: "BREAKDOWN", label: "BREAKDOWN - Equipment Breakdown", type: "unplanned" },
  { value: "ELECTRICAL", label: "ELECTRICAL - Electrical Fault", type: "unplanned" },
  { value: "MECHANICAL", label: "MECHANICAL - Mechanical Fault", type: "unplanned" },
  { value: "PROCESS", label: "PROCESS - Process Issue", type: "unplanned" },
  { value: "QUALITY", label: "QUALITY - Quality Issue", type: "unplanned" },
  { value: "MATERIAL", label: "MATERIAL - Material / Upstream Issue", type: "unplanned" },
  { value: "OTHER", label: "OTHER - Other", type: "unplanned" },
];

export function getDowntimeCodes(type, plannedCategory) {
  return DOWNTIME_CODES.filter((item) =>
    item.type === type && (type !== "planned" || item.plannedCategory === plannedCategory)
  );
}
