export const PRODUCTION_LINES = [
  "Keda 1",
  "Keda 2",
  "Keda 3",
  "Glaze Line 1",
  "Glaze Line 2",
  "Glaze Line 3",
  "Kiln 1",
  "Kiln 2",
  "Kiln 3",
];

export const TILE_SIZE_OPTIONS = [
  { value: "30x30", label: "30 × 30 cm" },
  { value: "40x40", label: "40 × 40 cm" },
  { value: "60x30", label: "60 × 30 cm" },
  { value: "60x60", label: "60 × 60 cm" },
  { value: "80x80", label: "80 × 80 cm" },
  { value: "120x60", label: "120 × 60 cm" },
];

export const PRODUCTION_LINE_OPTIONS = PRODUCTION_LINES.map((line) => ({
  value: line,
  label: line,
}));
