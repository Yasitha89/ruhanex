import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export const ENERGY_TIME_ZONE = "Asia/Colombo";

/** Current date/time represented explicitly in Sri Lankan time. */
export function colomboNow() {
  return dayjs().tz(ENERGY_TIME_ZONE);
}

/**
 * Convert a Day.js/date-like value to Asia/Colombo while preserving the
 * selected calendar date/time. This is useful for Ant Design DatePicker
 * values, because a browser may itself be running in another timezone.
 */
export function asColomboCalendarTime(value) {
  if (!value) return colomboNow();

  const source = dayjs(value);
  return dayjs.tz(source.format("YYYY-MM-DD HH:mm:ss.SSS"), ENERGY_TIME_ZONE);
}

/** Parse an API ISO timestamp and display it in Sri Lankan local time. */
export function apiTimeToColombo(value) {
  return dayjs(value).tz(ENERGY_TIME_ZONE);
}

/** Convert a Sri Lankan Day.js boundary to the UTC ISO string expected by the API. */
export function toApiIso(value) {
  return asColomboCalendarTime(value).toISOString();
}

export function formatColomboApiTime(value, format) {
  if (!value) return "";
  return apiTimeToColombo(value).format(format);
}
