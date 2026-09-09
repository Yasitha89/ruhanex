import axios from "axios";

// const api = axios.create({
//   baseURL: "http://34.235.63.22:1880"
// });
const api = axios.create({
  baseURL: "https://ruhanex.chikirisoft.com/api",
});

export const getEnergyMeterData = async ({ panel, deviceId }) => {
  try {
    const response = await api.get("/api/getEnergyMeterData", {
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
  meters,
  fromTime,
  toTime,
  interval,
}) => {
  const hasMeters = Array.isArray(meters) && meters.length > 0;
  const hasMultipleDeviceIds = Array.isArray(deviceIds) && deviceIds.length > 0;

  const params = {
    from_time: fromTime,
    to_time: toTime,
    interval,
  };

  /*
   * Supported request modes
   * -----------------------
   *
   * 1. Single meter (existing API)
   *    panel=ATS1&device_id=1
   *
   * 2. Multiple meters from the same panel (existing combined API)
   *    panel=ATS1&device_ids=1,3
   *
   * 3. Multiple meters from multiple panels (future multi-panel API)
   *    meters=ATS1:1,MSB:1,GEN:2
   *
   * The panel + device_id pair is the meter's technical identity.
   * Device labels returned by the backend should only be used for display.
   */
  if (hasMeters) {
    params.meters = meters
      .map((meter) => {
        const meterPanel = meter?.panel;
        const meterDeviceId = meter?.deviceId ?? meter?.device_id;

        if (meterPanel == null || meterDeviceId == null) {
          return null;
        }

        return `${meterPanel}:${meterDeviceId}`;
      })
      .filter(Boolean)
      .join(",");

    if (!params.meters) {
      throw new Error(
        "At least one valid meter with panel and deviceId is required.",
      );
    }
  } else if (hasMultipleDeviceIds) {
    // Backward-compatible multi-device request for one panel.
    params.panel = panel;
    params.device_ids = deviceIds.join(",");
  } else {
    // Backward-compatible single-meter request.
    params.panel = panel;
    params.device_id = deviceId;
  }

  const response = await api.get("/api/getHistoricalEnergyUsage", { params });

  return response.data;
};
