import React, { useState } from "react";
import { Button, Drawer, Grid, Layout } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import HeaderBar from "../components/HeaderBar";
import "./MainLayout.css";

const { Header, Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screens = useBreakpoint();
  const location = useLocation();

  const isMobile = !screens.md;

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <Layout className="app-shell">
      <Header className="app-header">
        <div className="app-header-brand">
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              className="app-mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
            />
          )}

          <img
            src="/rocell.png"
            alt="Company Logo"
            className="app-header-logo"
          />

          <span className="app-header-title">
            Royal Ceramics Lanka PLC - Horana
          </span>
        </div>

        <div className="app-header-spacer" />
        <HeaderBar />
      </Header>

      <Layout className="app-body">
        {!isMobile && (
          <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            width={220}
            className="app-sidebar"
          >
            <Sidebar />
          </Sider>
        )}

        <Content className="app-content">
          <div className="app-content-inner">
            <Outlet />
          </div>
        </Content>
      </Layout>

      <Drawer
        title="Navigation"
        placement="left"
        width={280}
        open={isMobile && mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        styles={{ body: { padding: 0, background: "#001529" } }}
      >
        <Sidebar />
      </Drawer>
    </Layout>
  );
}
