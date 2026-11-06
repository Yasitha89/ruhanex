import { Menu } from "antd";
import {
  DashboardOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../services/authContext";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const filterMenu = (items) => items.filter((item) => {
    if (["Line Supervisor", "JE"].includes(user.role)) return ["dashboard", "production", "keda1", "keda2", "keda3", "kiln1", "kiln2", "gl1", "gl3"].includes(item.key);
    return user.role === "Admin" || !["administration", "users", "process"].includes(item.key);
  }).map((item) => ({ ...item, ...(item.children ? { children: filterMenu(item.children) } : {}) }));

  const selectedKey = (() => {
    switch (location.pathname) {
      case "/keda1":
        return "keda1";
      case "/keda2":
        return "keda2";
      case "/kiln2":
        return "kiln2";
      case "/kiln1":
        return "kiln1";
      case "/keda3":
        return "keda3";
      case "/gl1":
        return "gl1";
      case "/gl3":
        return "gl3";
      case "/energyoverview":
        return "energy_overview";
      case "/energydashboard":
        return "energy_meter";
      case "/energy_live":
        return "energy_live";
      case "/historical_data":
        return "production_history";
      case "/production_breakdown":
        return "production_breakdown";
      case "/process/milling/temperature":
        return "milling";
      case "/historical_data_energy":
        return "energy_history";
      case "/settings":
        return "settings";
      case "/device_administration":
        return "device_administration";
      case "/line_administration":
        return "line_administration";
      case "/production_master_data":
        return "production_master_data";
      case "/users":
        return "users";
      case "/dashboard":
      default:
        return "dashboard";
    }
  })();

  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      defaultOpenKeys={["production", "energy", "reports", "settings_group", "administration"]}
      items={filterMenu([
        {
          key: "dashboard",
          icon: <DashboardOutlined />,
          label: "Overview",
          onClick: () => navigate("/dashboard"),
        },

        {
          key: "production",
          icon: <AppstoreOutlined />,
          label: "Production",
          children: [
            {
              key: "keda1",
              label: "Keda 1",
              onClick: () => navigate("/keda1"),
            },
            {
              key: "keda2",
              label: "Keda 2",
              onClick: () => navigate("/keda2"),
            },
            {
              key: "keda3",
              label: "Keda 3",
              onClick: () => navigate("/keda3"),
            },
            {
              key: "gl1",
              label: "Glaze Line 1",
              onClick: () => navigate("/gl1"),
            },
            {
              key: "gl3",
              label: "Glaze Line 3",
              onClick: () => navigate("/gl3"),
            },
            {
              key: "kiln1",
              label: "Kiln 1",
              onClick: () => navigate("/kiln1"),
            },
            {
              key: "kiln2",
              label: "Kiln 2",
              onClick: () => navigate("/kiln2"),
            },
          ],
        },

        {
          key: "process",
          icon: <AppstoreOutlined />,
          label: "Process",
          children: [{ key: "milling", label: "Milling", onClick: () => navigate("/process/milling/temperature") }],
        },
        {
          key: "energy",
          icon: <ThunderboltOutlined />,
          label: "Energy",
          children: [
            {
              key: "energy_overview",
              label: "Overview",
              onClick: () => navigate("/energyoverview"),
            },
            {
              key: "energy_meter",
              label: "Meters",
              onClick: () => navigate("/energydashboard"),
            },
            {
              key: "energy_live",
              // icon: <LineChartOutlined />,
              label: "Live Monitor",
              onClick: () => navigate("/energy_live"),
            },
          ],
        },

        {
          key: "reports",
          icon: <BarChartOutlined />,
          label: "Reports",
          children: [
            {
              key: "production_history",
              label: "Shifts Report",
              onClick: () => navigate("/historical_data"),
            },
            {
              key: "production_breakdown",
              label: "Production Report",
              onClick: () => navigate("/production_breakdown"),
            },
            {
              key: "energy_history",
              label: "Energy Report",
              onClick: () => navigate("/historical_data_energy"),
            },
          ],
        },

        {
          key: "settings_group",
          icon: <SettingOutlined />,
          label: "Settings",
          children: [
            {
              key: "administration",
              label: "Admin",
              children: [
                {
                  key: "device_administration",
                  label: "Device Administration",
                  onClick: () => navigate("/device_administration"),
                },
                {
                  key: "line_administration",
                  label: "Line Settings",
                  onClick: () => navigate("/line_administration"),
                },
                {
                  key: "production_master_data",
                  label: "Master Data",
                  onClick: () => navigate("/production_master_data"),
                },
                { key: "users", label: "Users", onClick: () => navigate("/users") },
              ],
            },
            {
              key: "settings",
              label: "Line Settings",
              onClick: () => navigate("/settings"),
            },
          ],
        },
      ])}
    />
  );
}
