export const ROLE_LABELS = { Admin: "Admin", Manager: "Manager", JE: "JE" };
const productionPaths = ["/dashboard", "/keda1", "/keda2", "/keda3", "/kiln1", "/kiln2", "/gl1", "/gl3"];
const managerPaths = ["/settings", "/historical_data", "/historical_data_energy", "/energyoverview", "/energydashboard", "/energy_live"];
const adminPaths = ["/device_administration", "/line_administration", "/production_master_data", "/users"];
export function canAccessPage(role, path) {
  return Boolean(ROLE_LABELS[role]) && (path === "/profile" || productionPaths.includes(path)
    || (["Admin", "Manager"].includes(role) && managerPaths.includes(path)) || (role === "Admin" && adminPaths.includes(path)));
}
