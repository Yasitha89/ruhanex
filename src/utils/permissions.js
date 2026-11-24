export const ROLE_LABELS = { Admin: "Admin", Manager: "Manager", Engineer: "Engineer", "Line Supervisor": "Line Supervisor", JE: "Line Supervisor" };
export const canEditProduction = role => ["Admin", "Manager", "Line Supervisor", "JE"].includes(role);
const engineerPaths = ["/process/milling/temperature", "/energyoverview", "/energydashboard", "/energy_live"];
export function canExportProduction(role) {
  return ["Admin", "Manager"].includes(role);
}
const productionPaths = ["/dashboard", "/keda1", "/keda2", "/keda3", "/kiln1", "/kiln2", "/gl1", "/gl3"];
const managerPaths = ["/settings", "/historical_data", "/production_breakdown", "/historical_data_energy", "/energyoverview", "/energydashboard", "/energy_live", "/process/milling/temperature"];
const adminPaths = ["/device_administration", "/line_administration", "/production_master_data", "/users"];
export function canAccessPage(role, path) {
  return Boolean(ROLE_LABELS[role]) && (path === "/profile" || productionPaths.includes(path)
    || (role === "Engineer" && engineerPaths.includes(path))
    || (["Admin", "Manager"].includes(role) && managerPaths.includes(path)) || (role === "Admin" && adminPaths.includes(path)));
}
