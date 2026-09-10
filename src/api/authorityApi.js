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

export async function verifyAuthorityPassword(authorityLevel, password) {
  try {
    const response = await api.post("/api/authority/verify", {
      authorityLevel,
      password,
    });
    return response.data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, "Unable to verify authority password."),
    );
  }
}

export async function saveAuthorityPassword({
  authorityLevel,
  newPassword,
  currentPassword,
}) {
  try {
    const response = await api.post("/api/authority/password", {
      authorityLevel,
      newPassword,
      ...(currentPassword ? { currentPassword } : {}),
    });
    return response.data;
  } catch (error) {
    throw new Error(
      getErrorMessage(error, "Unable to save authority password."),
    );
  }
}
