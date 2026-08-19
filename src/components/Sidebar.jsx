import { Menu } from "antd";
import {
  SettingOutlined,
  DashboardOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = (() => {
    switch (location.pathname) {
      case "/keda1":
        return "keda1";
      case "/energyoverview":
        return "energy_overview";
      case "/energydashboard":
        return "energy_meter";
      case "/historical_data":
        return "production_history";
      case "/historical_data_energy":
        return "energy_history";
      case "/settings":
        return "settings";
      case "/dashboard":
      default:
        return "dashboard";
    }
  })();

  return (
    // <Menu
    //   theme="dark"
    //   mode="inline"
    //   defaultSelectedKeys={["dashboard"]}
    //   items={[
    //     {
    //       key: "dashboard",
    //       icon: <DashboardOutlined />,
    //       label: "Dashboard",
    //       onClick: () => navigate("/dashboard"),
    //     },
    //     {
    //       key: "keda1",
    //       icon: <DashboardOutlined />,
    //       label: "Keda 1",
    //       onClick: () => navigate("/keda1"),
    //     },
    //     {
    //       key: "energy_dashboard",
    //       icon: <DashboardOutlined />,
    //       label: "Energy",
    //       onClick: () => navigate("/energydashboard"),
    //     },
    //     {
    //       key: "historical_data",
    //       icon: <LineChartOutlined />,
    //       label: "Historical Data",
    //       onClick: () => navigate("/historical_data"),
    //     },
    //     {
    //       key: "settings",
    //       icon: <SettingOutlined />,
    //       label: "Settings",
    //       onClick: () => navigate("/settings"),
    //     },
    //     {
    //       key: "historical_data_energy",
    //       icon: <LineChartOutlined />,
    //       label: "Historical Energy Data",
    //       onClick: () => navigate("/historical_data_energy"),
    //     },
    //   ]}
    // />
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      defaultOpenKeys={["production", "energy", "reports"]}
      items={[
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
            // Future production lines
            // {
            //   key: "keda2",
            //   label: "Keda 2",
            //   onClick: () => navigate("/keda2"),
            // },
            // {
            //   key: "keda3",
            //   label: "Keda 3",
            //   onClick: () => navigate("/keda3"),
            // },
          ],
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
              label: "ATS1",
              onClick: () => navigate("/energydashboard"),
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
              label: "Production History",
              onClick: () => navigate("/historical_data"),
            },
            {
              key: "energy_history",
              label: "Energy History",
              onClick: () => navigate("/historical_data_energy"),
            },
          ],
        },

        {
          key: "settings",
          icon: <SettingOutlined />,
          label: "Settings",
          onClick: () => navigate("/settings"),
        },
      ]}
    />
  );
}
