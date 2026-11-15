export const KEDA_TILE_SIZES = {
  'Keda 1': ['40x40', '60x30', '60x60'],
  'Keda 2': ['60x60', '90x45', '80x80', '120x60', '120x80', '100x100'],
  'Keda 3': ['60x30', '60x60', '90x45'],
};

export function validateTilesPerBox(line, values = {}) {
  const sizes = KEDA_TILE_SIZES[line];
  if (!sizes) return undefined;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Tiles per box must be specified by tile size.');
  const result = {};
  for (const [size, count] of Object.entries(values)) {
    if (!sizes.includes(size)) throw new Error(`Unsupported tile size ${size} for ${line}.`);
    if (count == null || count === '') continue;
    if (!Number.isSafeInteger(count) || count < 1) throw new Error(`Enter a positive whole number of tiles per box for ${size}.`);
    result[size] = count;
  }
  return result;
}

export const GLAZE_TILE_SIZES = {
  'Glaze Line 1': ['60x30', '60x60', '90x45', '120x60', '40x40'],
  'Glaze Line 2': ['40x40', '60x30', '60x60'],
  'Glaze Line 3': ['60x60', '90x45', '120x60', '120x80', '80x80', '100x100'],
};
export const KILN_TILE_SIZES = {
  'Kiln 1': ['40x40', '60x30', '60x60', '90x45', '120x60'],
  'Kiln 2': ['60x60', '90x45', '120x60', '120x80', '80x80', '100x100'],
  'Kiln 3': ['40x40', '60x30', '60x60'],
};
export const RATED_SPEED_TILE_SIZES = { ...KEDA_TILE_SIZES, ...GLAZE_TILE_SIZES, ...KILN_TILE_SIZES };

export function kilnRatedSpeed(size, standardDailyOutputSqm) {
  const dimensions = String(size).split('x').map(Number);
  if (dimensions.length !== 2 || !dimensions.every(v => Number.isFinite(v) && v > 0) ||
      typeof standardDailyOutputSqm !== 'number' || !Number.isFinite(standardDailyOutputSqm) || standardDailyOutputSqm <= 0) return undefined;
  const tileAreaSqm = dimensions[0] * dimensions[1] / 10000;
  const speed = standardDailyOutputSqm / tileAreaSqm / 1440;
  return Number.isFinite(speed) && speed > 0 ? speed : undefined;
}

export function pressRatedSpeed(pressCyclesPerMinute, tilesPerPress) {
  if (typeof pressCyclesPerMinute !== 'number' || !Number.isFinite(pressCyclesPerMinute) || pressCyclesPerMinute <= 0 ||
      !Number.isSafeInteger(tilesPerPress) || tilesPerPress <= 0) return undefined;
  const speed = Math.round(pressCyclesPerMinute * tilesPerPress * 100) / 100;
  return Number.isFinite(speed) && speed > 0 ? speed : undefined;
}

export function validateRatedSpeeds(line, speeds = {}) {
  const sizes = RATED_SPEED_TILE_SIZES[line];
  if (!sizes) return undefined;
  const result = {};
  for (const [size, speed] of Object.entries(speeds)) {
    if (!sizes.includes(size)) throw new Error(`Unsupported tile size ${size} for ${line}.`);
    if (speed == null || speed === '') continue;
    if (KILN_TILE_SIZES[line]) {
      if (typeof speed !== 'object' || Array.isArray(speed)) throw new Error(`Enter standard output for ${size}.`);
      const { standardDailyOutputSqm } = speed;
      if (standardDailyOutputSqm == null || standardDailyOutputSqm === '') {
        if ('cycleMinutes' in speed || 'tilesPerRow' in speed) throw new Error(`Re-save ${line} size speeds with standard output in m² per 24 hours; the old cycle-based preset for ${size} cannot be converted automatically.`);
        continue;
      }
      const lineSpeed = kilnRatedSpeed(size, standardDailyOutputSqm);
      if (lineSpeed === undefined) throw new Error(`Enter positive standard output in m² per 24 hours for ${size}.`);
      result[size] = { standardDailyOutputSqm, lineSpeed };
      continue;
    }
    if (GLAZE_TILE_SIZES[line]) {
      if (typeof speed !== 'object' || Array.isArray(speed)) throw new Error(`Enter press cycles/min and tiles per press for ${size}.`);
      const { pressCyclesPerMinute, tilesPerPress } = speed;
      if ((pressCyclesPerMinute == null || pressCyclesPerMinute === '') && (tilesPerPress == null || tilesPerPress === '')) continue;
      const lineSpeed = pressRatedSpeed(pressCyclesPerMinute, tilesPerPress);
      if (lineSpeed === undefined) throw new Error(`Enter positive press cycles/min and a positive whole number of tiles per press for ${size}.`);
      result[size] = { pressCyclesPerMinute, tilesPerPress, lineSpeed };
      continue;
    }
    if (typeof speed !== 'number' || !Number.isFinite(speed) || speed <= 0) throw new Error(`Enter a positive rated speed for ${size}.`);
    result[size] = speed;
  }
  return result;
}

export function ratedSpeedFor(line, size, speeds = {}) {
  if (!RATED_SPEED_TILE_SIZES[line]?.includes(size)) return undefined;
  const speed = speeds[size];
  if (KILN_TILE_SIZES[line]) return kilnRatedSpeed(size, speed?.standardDailyOutputSqm);
  if (GLAZE_TILE_SIZES[line]) return pressRatedSpeed(speed?.pressCyclesPerMinute, speed?.tilesPerPress);
  return typeof speed === 'number' && Number.isFinite(speed) && speed > 0 ? speed : undefined;
}
