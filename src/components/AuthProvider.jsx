import { useEffect, useState } from "react";
import { getSession, loginUser, logoutUser } from "../api/authApi";
import { AuthContext } from "../services/authContext";

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    localStorage.removeItem("token");
    getSession().then((data) => { if (active) { setUser(data.user); setError(""); } }, (err) => {
      if (active) { setUser(null); setError(err.response?.status === 401 ? "" : "Unable to connect to the login service."); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);
  const login = async (username, password) => { const data = await loginUser(username, password); setUser(data.user); setError(""); return data.user; };
  const logout = async () => { await logoutUser(); setUser(null); };
  const retry = () => { setLoading(true); setRevision((value) => value + 1); };
  return <AuthContext.Provider value={{ user, loading, error, login, logout, clearSession: () => setUser(null), retry }}>{children}</AuthContext.Provider>;
}
