import React from "react";
import { Button, Grid } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { useBreakpoint } = Grid;

export default function HeaderBar() {
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.sm;

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        height: "100%",
      }}
    >
      <Button
        icon={<LogoutOutlined />}
        danger
        onClick={logout}
      >
        {!isMobile && "Logout"}
      </Button>
    </div>
  );
}
