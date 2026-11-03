import axios from "axios";
import { API_BASE_URL } from "./constants";

const api = axios.create({
  withCredentials: true,
  baseURL: API_BASE_URL,
  timeout: 240000,
  headers: { "Content-Type": "application/json" },
});

export async function sendAiMessage({ message, line, history, signal }) {
  const response = await api.post("/api/ai/chat", {
    message,
    ...(line ? { line } : {}),
    history,
  }, { signal });
  if (response.data?.success !== true || typeof response.data.answer !== "string" || !response.data.answer.trim()) {
    throw new Error(response.data?.error || "The chat service did not return an answer.");
  }
  return response.data;
}
