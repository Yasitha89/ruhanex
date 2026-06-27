import axios from "axios";

const api = axios.create({
  baseURL: "http://34.235.63.22:1880"
});

export const getShiftData = async (
  shift,
  hours,
  fromTime,
  toTime
) => {

  const response = await api.get(
    "/api/shift-count",
    {
      params: {
        shift,
        hours,
        fromTime,
        toTime
      }
    }
  );

  const sortedData = (response.data || [])
    .filter(d => d.time && d.value !== undefined)
    .sort((a, b) => new Date(a.time) - new Date(b.time));

  return sortedData;

};

// LAST VALUE API
export const getShiftLast = async (shift) => {
  const res = await api.get("/api/shift-last", {
    params: { shift }
  });
  return res.data;
};