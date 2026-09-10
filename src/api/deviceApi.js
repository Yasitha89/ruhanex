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

export async function getDevices() {
  try {
    const response = await api.get("/api/devices");
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to load devices."));
  }
}

export async function createDevice(device) {
  try {
    const response = await api.post("/api/devices", device);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to create device."));
  }
}

export async function updateDevice(deviceKey, device) {
  try {
    const response = await api.put(`/api/devices/${encodeURIComponent(deviceKey)}`, device);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to update device."));
  }
}

export async function deleteDevice(deviceKey) {
  try {
    const response = await api.delete(`/api/devices/${encodeURIComponent(deviceKey)}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to delete device."));
  }
}
