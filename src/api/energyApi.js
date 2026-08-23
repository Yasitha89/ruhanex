import axios from "axios";

// const api = axios.create({
//   baseURL: "http://34.235.63.22:1880"
// });
const api = axios.create({
  baseURL: "https://ruhanex.chikirisoft.com/api",
});

export const getEnergyData = async ({ panel, deviceId }) => {
  try {
    const response = await api.get("/api/getEnergyData", {
      params: {
        panel,
        device_id: deviceId,
      },
    });

    /*
     * Supports both response formats:
     *
     * 1. Raw data:
     * {
     *   device: "PM2220",
     *   ...
     * }
     *
     * 2. Wrapped data:
     * {
     *   success: true,
     *   data: {
     *     device: "PM2220",
     *     ...
     *   }
     * }
     */
    return response.data?.data ?? response.data;
  } catch (error) {
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      error.message ||
      "Unable to retrieve energy data.";

    throw new Error(errorMessage, { cause: error });
  }
};

/**
 * Get current, voltage, power, PF and frequency history.
 * The frontend supplies a validated aggregation interval based on
 * the selected date/time range.
 */
export const getHistoricalElectricityData = async ({
  panel,
  deviceId,
  fromTime,
  toTime,
  interval,
}) => {
  const response = await api.get("/api/getHistoricalElectricityData", {
    params: {
      panel,
      device_id: deviceId,
      from_time: fromTime,
      to_time: toTime,
      interval,
    },
  });

  return response.data;
};

/**
 * Get cumulative kWh readings grouped by the selected interval.
 *
 * interval:
 * "1h" | "6h" | "1d" | "1mo"
 */
export const getHistoricalEnergyUsage = async ({
  panel,
  deviceId,
  fromTime,
  toTime,
  interval,
}) => {
  const response = await api.get("/api/getHistoricalEnergyUsage", {
    params: {
      panel,
      device_id: deviceId,
      from_time: fromTime,
      to_time: toTime,
      interval,
    },
  });

  return response.data;
};
