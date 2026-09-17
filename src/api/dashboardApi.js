import axios from "axios";

// const api = axios.create({
//   baseURL: "http://34.235.63.22:1880"
// });
const api = axios.create({
  baseURL: "https://ruhanex.chikirisoft.com/api",
});

export const getShiftData = async (line, shift, fromTime, toTime) => {
  const response = await api.get("/api/shift-count", {
    params: {
      line,
      shift,
      fromTime,
      toTime,
    },
  });

  const sortedData = (response.data || [])
    .filter((d) => d.time && d.value !== undefined)
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  return sortedData;
};

export const getShiftDowntime = async (shift, fromTime, toTime) => {
  const response = await api.get("/api/shift-downtime", {
    params: {
      shift,
      fromTime,
      toTime,
    },
  });

  return [...response.data]
    .filter((d) => d.ts)
    .sort((a, b) => Number(a.ts) - Number(b.ts));
};
export const getShiftStoppages = async (shift, date_, line) => {
  // const formattedDate = new Date(date_).toISOString().split("T")[0];
  const formattedDate = date_.format("YYYY-MM-DD");
  const response = await api.get("/api/shift-downtime-new", {
    params: {
      shift,
      date: formattedDate,
      line,
    },
  });

  return response.data;
};

export const updateDowntimeReason = async ({
  id,
  date,
  shift,
  line,
  stopStart_ts,
  reason,
  machine,
}) => {
  const response = await api.post("/api/update-downtime-reason", {
    id,
    date,
    shift,
    line,
    stopStart_ts,
    reason,
    machine,
  });

  return response.data;
};

// LAST VALUE API
export const getShiftLast = async (shift) => {
  const res = await api.get("/api/shift-last", {
    params: { shift },
  });
  return res.data;
};

export const getLineSpeed = async () => {
  const res = await api.get("/api/line_speed");
  return res.data;
};

export const getLineLiveSummary = async (line = "Keda 2") => {
  const res = await api.get("/api/line-live-summary", {
    params: { line },
  });

  return res.data;
};

export const getDashboardStats = async (line, shift, fromTime, toTime) => {
  const res = await api.get("/api/getDashboardStats", {
    params: { line, shift, fromTime, toTime },
  });
  return res.data;
};

export const getOverviewLiveSummary = async (line) => {
  const res = await api.get("/api/production/live-summary", {
    params: { line },
  });
  return res.data;
};

export const getOverviewMonthlySummary = async (line, month) => {
  const res = await api.get("/api/production/monthly-summary", {
    params: { line, month },
  });
  return res.data;
};

export const getOverviewEnergyUsage = async ({
  panel = "ATS1",
  deviceIds = [1, 3],
  fromTime,
  toTime,
  interval,
}) => {
  const res = await api.get("/api/getHistoricalEnergyUsage", {
    params: {
      panel,
      device_ids: deviceIds.join(","),
      from_time: fromTime,
      to_time: toTime,
      interval,
    },
  });
  return res.data;
};

export const getOverviewDailyLineSummary = async ({ line, date }) => {
  console.log(line, date);
  const res = await api.get("/api/production/daily-line-summary", {
    params: {
      line,
      date,
    },
  });

  return res.data;
};
