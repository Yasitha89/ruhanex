import axios from "axios";

const api = axios.create({
  baseURL: "http://34.235.63.22:1880"
});

export const getShiftData = async (
  shift,
  fromTime,
  toTime
) => {

  const response = await api.get(
    "/api/shift-count",
    {
      params: {
        shift,
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

export const getShiftDowntime = async (
  shift,
  fromTime,
  toTime
) => {

  const response = await api.get(
    "/api/shift-downtime",
    {
      params: {
        shift,
        fromTime,
        toTime
      }
    }
  );

  return [...response.data]
    .filter(d => d.ts)
    .sort((a, b) => Number(a.ts) - Number(b.ts));

 
};


// LAST VALUE API
export const getShiftLast = async (shift) => {
  const res = await api.get("/api/shift-last", {
    params: { shift }
  });
  return res.data;
};

export const getLineSpeed = async () => {
  const res = await api.get("/api/line_speed");
  return res.data;
};