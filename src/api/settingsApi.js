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

export async function getLineSettings(line) {
  try {
    const response = await api.get("/api/line-setting", {
      params: line ? { line } : undefined,
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to load line settings."));
  }
}

export async function saveLineSettings(settings) {
  try {
    const response = await api.post("/api/line-setting", settings);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save line settings."));
  }
}

export async function getDesignCodes({ tileSize, search = "" }) {
  try {
    const response = await api.get("/api/design-codes", {
      params: { tileSize, search },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to load design codes."));
  }
}

export async function getMachines({ line, search = "" }) {
  try {
    const response = await api.get("/api/production/machines", {
      params: { line, search },
    });
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to load machines."));
  }
}

export async function saveMachine(machine) {
  try {
    const response = await api.post("/api/production/machines", machine);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save machine."));
  }
}

export async function saveDesignCode(designCode) {
  try {
    const response = await api.post("/api/design-codes", designCode);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error, "Unable to save design code."));
  }
}

// Add these exports to your existing src/api/settingsApi.js.
// They use the same `api` axios instance already used by getDesignCodes/getMachines.

export const updateLineDesignCode = async ({ line, tileSize, designCode }) => {
  const response = await api.post("/api/line-design-code", {
    line,
    tileSize,
    designCode,
  });
  return response.data;
};

export const updateDesignCode = async ({
  oldTileSize,
  oldDesignCode,
  tileSize,
  designCode,
  description,
  active = true,
}) => {
  const response = await api.put("/api/design-codes", {
    oldTileSize,
    oldDesignCode,
    tileSize,
    designCode,
    description,
    active,
  });
  return response.data;
};

export const deleteDesignCode = async ({ tileSize, designCode }) => {
  const response = await api.delete("/api/design-codes", {
    data: { tileSize, designCode },
  });
  return response.data;
};

export const updateMachine = async ({
  oldLine,
  oldMachineName,
  line,
  machineCode,
  machineName,
  active = true,
}) => {
  const response = await api.put("/api/machines", {
    oldLine,
    oldMachineName,
    line,
    machineCode,
    machineName,
    active,
  });
  return response.data;
};

export const deleteMachine = async ({ line, machineName }) => {
  const response = await api.delete("/api/machines", {
    data: { line, machineName },
  });
  return response.data;
};

export default api;
