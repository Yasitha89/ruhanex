import axios from "axios";

const api = axios.create({
  baseURL: "https://ruhanex.chikirisoft.com/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

export async function getLineSettings() {
  try {
    const response = await api.get("/api/line-setting");
    return response.data;
  } catch (error) {
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Unable to load line settings.";

    throw new Error(errorMessage);
  }
}

export async function saveLineSettings(settings) {
  try {
    const response = await api.post("/api/line-setting", settings);
    return response.data;
  } catch (error) {
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Unable to save line settings.";

    throw new Error(errorMessage);
  }
}

export default api;
