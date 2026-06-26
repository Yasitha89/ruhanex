import dayjs from "dayjs";

export function getShiftTimeRange(selectedDate, shift) {
  const baseDate = dayjs(selectedDate);

  let fromTime, toTime;

  switch (shift) {
    case "06-14":
      fromTime = baseDate.hour(6).minute(0).second(0);
      toTime = baseDate.hour(14).minute(0).second(0);
      break;

    case "14-22":
      fromTime = baseDate.hour(14).minute(0).second(0);
      toTime = baseDate.hour(22).minute(0).second(0);
      break;

    case "22-06":
      fromTime = baseDate.hour(22).minute(0).second(0);
      toTime = baseDate.add(1, "day").hour(6).minute(0).second(0);
      break;

    case "all":
      fromTime = baseDate.hour(6).minute(0).second(0);
      toTime = baseDate.add(1, "day").hour(6).minute(0).second(0);
      break;

    default:
      fromTime = baseDate.startOf("day");
      toTime = baseDate.endOf("day");
  }

  return {
    fromTime: fromTime.toISOString(),
    toTime: toTime.toISOString()
  };
}