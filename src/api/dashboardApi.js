import axios from "axios";

const api = axios.create({
  baseURL: "http://34.235.63.22:1880"
});

export const getShiftData = async (
  shift,
  hours
) => {

  const response = await api.get(
    "/api/shift-count",
    {
      params: {
        shift,
        hours
      }
    }
  );

  return response.data;
};

// LAST VALUE API
export const getShiftLast = async (shift) => {
  const res = await api.get("/api/shift-last", {
    params: { shift }
  });
  return res.data;
};