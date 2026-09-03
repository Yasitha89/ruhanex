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
  deviceIds,
  fromTime,
  toTime,
  interval,
}) => {
  const hasMultipleDeviceIds = Array.isArray(deviceIds) && deviceIds.length > 0;

  const params = {
    from_time: fromTime,
    to_time: toTime,
    interval,
  };

  // Backward compatible with the existing single-meter API while also
  // supporting the combined-meter Node-RED flow:
  //   device_ids=1,3
  // The combined flow intentionally does not require a panel filter so that
  // meters can be summed even if they use different panel tags later.
  if (hasMultipleDeviceIds) {
    params.device_ids = deviceIds.join(",");
  } else {
    params.panel = panel;
    params.device_id = deviceId;
  }

  const response = await api.get("/api/getHistoricalEnergyUsage", { params });

  return response.data;
};
