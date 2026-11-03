import { useState } from "react";
import { Avatar, Button, Dropdown, message } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../services/authContext";

export default function HeaderBar() {
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
  ] }}><Button type="text" aria-label="Open profile menu" disabled={busy} style={{ height: 44 }}><Avatar size={32} icon={<UserOutlined />} /></Button></Dropdown>;
}
