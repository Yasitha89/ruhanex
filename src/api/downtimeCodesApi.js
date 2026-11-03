import axios from "axios";
import { API_BASE_URL } from "./constants";

const api = axios.create({
  withCredentials: true, baseURL: API_BASE_URL, timeout: 15000 });

export async function getDowntimeCodeRecords({ line, type, plannedCategory, signal } = {}) {
  const { data } = await api.get("/api/downtime-codes", {
    params: { line, type, plannedCategory: type === "planned" ? plannedCategory : undefined },
    signal,
  });
  if (data?.success !== true || !Array.isArray(data.downtimeCodes)) throw new Error(data?.error || "Unable to load downtime codes.");
  return data.downtimeCodes;
}

export async function saveDowntimeCodeRecord(record, existingValue) {
  const { data } = existingValue
    ? await api.put(`/api/downtime-codes/${encodeURIComponent(existingValue)}`, record)
    : await api.post("/api/downtime-codes", record);
  if (data?.success !== true) throw new Error(data?.error || "Unable to save downtime code.");
  return data.downtimeCode;
}
