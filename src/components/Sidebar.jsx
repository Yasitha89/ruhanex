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
      defaultSelectedKeys={["keda2"]}
      items={[
        // {
        //   key: "dashboard",
        //   icon: <DashboardOutlined />,
        //   label: "Dashboard",
        //   onClick: () => navigate("/dashboard"),
        // },
        {
          key: "keda2",
          icon: <DashboardOutlined />,
          label: "Keda 2",
          onClick: () => navigate("/keda2"),
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
