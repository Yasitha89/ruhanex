import React, { useState } from "react";
import { Layout } from "antd";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import HeaderBar from "../components/HeaderBar";

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {/* HEADER (FULL WIDTH) */}
      <Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          width: "100%",
          background: "#001529", // SAME as sider
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          color: "#fff",
        }}
      >
        {/* LOGO */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src="/rocell.png"
            alt="Company Logo"
            style={{ height: 35, width: 35, objectFit: "contain" }}
          />
          <span style={{ fontWeight: 600 }}>Royal Ceramics Lanka PLC - Horana</span>
        </div>

        <div style={{ flex: 1 }} />

        <HeaderBar />
      </Header>

      {/* BODY */}
      <Layout>
        {/* SIDEBAR with built-in collapse trigger */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          width={220}
          style={{
            height: "100vh",
          }}
        >
          <div
            style={{
              color: "white",
              textAlign: "center",
              padding: 16,
              fontWeight: "bold",
            }}
          >
         
          </div>

          <Sidebar />
        </Sider>

        {/* CONTENT */}
        <Content
          style={{
            padding: 16,
            background: "#f5f5f5",
            minHeight: "calc(100vh - 64px)",
            overflowX: "hidden",
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
