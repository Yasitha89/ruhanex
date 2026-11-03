export { loginUser as login, logoutUser as logout } from "../api/authApi";
import { getSession } from "../api/authApi";
export async function isAuthenticated() {
  try { const session = await getSession(); return Boolean(session.user); } catch { return false; }
}
