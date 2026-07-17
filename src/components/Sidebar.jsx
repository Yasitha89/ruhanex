import React from "react";
import { Menu } from "antd";
import {
  DashboardOutlined,
  LineChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

export default function Sidebar() {
  const navigate = useNavigate();

  return (
    <Menu
      theme="dark"
      mode="inline"
      defaultSelectedKeys={["dashboard"]}
      items={[
        {
          key: "dashboard",
          icon: <DashboardOutlined />,
          label: "Dashboard",
          onClick: () => navigate("/dashboard"),
        },
        {
          key: "keda1",
          icon: <DashboardOutlined />,
          label: "Keda 1",
          onClick: () => navigate("/keda1"),
        },
        {
          key: "historical_data",
          icon: <LineChartOutlined />,
          label: "Historical Data",
          onClick: () => navigate("/historical_data"),
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
