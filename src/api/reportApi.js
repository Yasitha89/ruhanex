import axios from "axios";

const api = axios.create({
  baseURL: "http://34.235.63.22:1880",
});

export const getHistoricalData = async (line, fromDate, toDate) => {
  const response = await api.get("/api/history", {
    params: {
      line,
      fromDate,
      toDate,
    },
  });

  const sortedProductionData = (response.data.production || [])
    .filter((d) => d.time && d.value !== undefined)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  console.log("Sorted Production:", sortedProductionData);
  const sortedDowntimeData = (response.data.downtime || [])
    .filter((d) => d.time && d.value !== undefined)
    .sort((a, b) => new Date(a.time) - new Date(b.time));
  console.log("Sorted downtime:", sortedDowntimeData);
  return {
    production: sortedProductionData,
    downtime: sortedDowntimeData,
  };

  //return response.data;
};
