import axios from "axios";
import { API_BASE_URL } from "./constants";

const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 20000, headers: { "X-Ruhanex-Request": "1" } });
async function request(method, path, body) {
  const { data } = await api.request({ method, url: `/api/auth${path}`, data: body });
  if (data?.success !== true) throw new Error(data?.error || "Authentication request failed.");
  return data;
}
export const loginUser = (username, password) => request("post", "/login", { username, password });
export const getSession = () => request("get", "/me");
export const logoutUser = () => request("post", "/logout");
export const changePassword = (currentPassword, newPassword) => request("post", "/password", { currentPassword, newPassword });
export const getUsers = () => request("get", "/users");
export const createUser = (values) => request("post", "/users", values);
