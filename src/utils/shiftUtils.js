import dayjs from "dayjs";

export function getShiftTimeRange(selectedDate, shift) {
  const baseDate = dayjs(selectedDate);

  let fromTime, toTime;

  switch (shift) {
    case "06-14":
      fromTime = baseDate.hour(6).minute(0).second(0).millisecond(0);
      toTime = baseDate.hour(14).minute(5).second(0).millisecond(0);;
      break;

    case "14-22":
      fromTime = baseDate.hour(14).minute(0).second(0).millisecond(0);;
      toTime = baseDate.hour(22).minute(5).second(0).millisecond(0);;
      break;

    case "22-06":
      fromTime = baseDate.hour(22).minute(0).second(0).millisecond(0);;
      toTime = baseDate.add(1, "day").hour(6).minute(5).second(0).millisecond(0);;
      break;

    case "all":
      fromTime = baseDate.hour(6).minute(0).second(0).millisecond(0);;
      toTime = baseDate.add(1, "day").hour(6).minute(5).second(0).millisecond(0);;
      break;

    default:
      fromTime = baseDate.startOf("day");
      toTime = baseDate.endOf("day");
  }

  return {
    fromTime: fromTime.toISOString(),
    toTime: toTime.toISOString(),
  };
}

export function getCurrentShiftTimeRange(date = new Date()) {
  const now = new Date(date);

  const hour = now.getHours();

  let from = new Date(now);
  let to = new Date(now);
  let shift="";
 

  // SHIFT 06:00 - 14:00
  if (hour >= 6 && hour < 14) {
    from.setHours(6, 0, 0, 0);
    to.setHours(14, 0, 0, 0);
    shift="06-14";
  }

  // SHIFT 14:00 - 22:00
  else if (hour >= 14 && hour < 22) {
    from.setHours(14, 0, 0, 0);
    to.setHours(22, 0, 0, 0);
    shift="14-22";
  }

  // SHIFT 22:00 - 06:00 (cross-day shift)
  else {
    from.setHours(22, 0, 0, 0);

    // if it's after midnight (00–05), from should be yesterday 22:00
    if (hour < 6) {
      from.setDate(from.getDate() - 1);
    }

    to.setHours(6, 0, 0, 0);

    // if it's evening (22–23), to is next day 06:00
    if (hour >= 22) {
      to.setDate(to.getDate() + 1);
    }
     shift="22-06";
  }

  return {
    currentShiftFromTime: from.toISOString(),
    currentShiftToTime: to.toISOString(),
    currentShift:shift
  };
}