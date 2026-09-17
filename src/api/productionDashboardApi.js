import axios from "axios";

const api = axios.create({
  baseURL: "https://ruhanex.chikirisoft.com/api",
});

export const getProductionLiveSummary = async (line) => {
  const response = await api.get("/api/production/live-summary", {
    params: { line },
  });

  return response.data;
};

export const getProductionMonthlySummary = async (line, month) => {
  const response = await api.get("/api/production/monthly-summary", {
    params: { line, month },
  });

  return response.data;
};

export const getProductionShiftCountSeries = async ({
  line,
  date,
  shift,
  after,
}) => {
  const params = { line, date, shift };

  if (after) {
    params.after = after;
  }

  const response = await api.get("/api/production/shift-count-series", {
    params,
  });

  return response.data;
};

export const getProductionShiftStoppages = async ({ line, date, shift }) => {
  const response = await api.get("/api/production/shift-stoppages", {
    params: { line, date, shift },
  });

  return response.data;
};

export const getProductionShiftSummary = async ({ line, date, shift }) => {
  const response = await api.get("/api/production/shift-summary", {
    params: { line, date, shift },
  });

  return response.data;
};

export const updateProductionDowntimeReason = async ({
  id,
  date,
  shift,
  line,
  stopStart_ts,
  reason,
  machine,
  downtimeType,
  plannedCategory,
  downtimeCode,
}) => {
  const response = await api.post("/api/update-downtime-reason", {
    id,
    date,
    shift,
    line,
    stopStart_ts,
    reason,
    machine,
    downtimeType,
    plannedCategory,
    downtimeCode,
  });

  return response.data;
};

export const getProductionMachines = async ({ line, search = "" }) => {
  const response = await api.get("/api/production/machines", {
    params: {
      line,
      search,
    },
  });

  return response.data;
};
