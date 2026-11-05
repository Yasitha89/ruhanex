import { useState } from "react";
import { Avatar, Button, Dropdown, message, theme } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../services/authContext";

export default function HeaderBar() {
  const { token } = theme.useToken();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try { await logout(); navigate("/", { replace: true }); }
    catch { message.error("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  };
  return <Dropdown trigger={["click"]} menu={{ items: [
    { key: "identity", label: user.displayName + " · " + user.role, disabled: true },
    { key: "profile", icon: <UserOutlined />, label: "My Profile / Change Password", onClick: () => navigate("/profile") },
    { type: "divider" }, { key: "logout", icon: <LogoutOutlined />, label: "Logout", danger: true, onClick: signOut },
  ] }}><Button type="text" aria-label="Open profile menu" disabled={busy} style={{ width: 44, height: 44, padding: 0, borderRadius: "50%" }}><Avatar size={42} style={{ backgroundColor: token.colorPrimaryActive, color: token.colorTextLightSolid }} icon={<UserOutlined />} /></Button></Dropdown>;
}
