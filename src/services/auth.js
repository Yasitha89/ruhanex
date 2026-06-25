export const login = (username, password) => {
  if (username === "admin" && password === "admin") {
    localStorage.setItem("token", "demo-token");
    return true;
  }
  return false;
};

export const logout = () => {
  localStorage.removeItem("token");
};

export const isAuthenticated = () => {
  return !!localStorage.getItem("token");
};