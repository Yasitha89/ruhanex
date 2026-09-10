import axios from "axios";

const api = axios.create({
  baseURL: "https://ruhanex.chikirisoft.com/api",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

function getErrorMessage(error, fallback) {
  return (
    error.response?.data?.error ||
    error.response?.data?.message ||
    error.message ||
    fallback
  );
}

export async function getLineSettings(line) {
  try {
    const response = await api.get("/api/line-setting", {
      params: line ? { line } : undefined,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to load line settings."));
  }
}

export async function saveLineSettings(settings) {
  try {
    const response = await api.post("/api/line-setting", settings);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save line settings."));
  }
}

export default api;
