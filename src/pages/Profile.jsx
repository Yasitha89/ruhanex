import { useState } from "react";
import { Alert, Button, Card, Descriptions, Form, Input, Typography, message } from "antd";
import { changePassword } from "../api/authApi";
import { useAuth } from "../services/authContext";

export default function Profile() {
  const { user, clearSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async ({ currentPassword, newPassword }) => {
    setBusy(true); setError("");
    try { await changePassword(currentPassword, newPassword); message.success("Password changed. Please sign in with your new password."); clearSession(); }
    catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setBusy(false); }
  };
  return (
    <Card title="My Profile" style={{ maxWidth: 720 }}>
      <Descriptions column={1} items={[
        { key: "name", label: "Name", children: user.displayName },
        { key: "username", label: "Username", children: user.username },
        { key: "role", label: "Level", children: user.role },
      ]} />
      <Typography.Title level={4}>Change Password</Typography.Title>
      {user.mustChangePassword && <Alert type="info" title="Change your initial password to continue." style={{ marginBottom: 16 }} />}
      {error && <Alert type="error" title={error} style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={save} disabled={busy}>
        <Form.Item name="currentPassword" label="Current Password" rules={[{ required: true }]}><Input.Password autoComplete="current-password" maxLength={128} /></Form.Item>
        <Form.Item name="newPassword" label="New Password" rules={[{ required: true }, { min: 4, max: 128, message: "Use 4–128 characters." }]}><Input.Password autoComplete="new-password" maxLength={128} /></Form.Item>
        <Form.Item name="confirmPassword" label="Confirm New Password" dependencies={["newPassword"]} rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, value) => value === getFieldValue("newPassword") ? Promise.resolve() : Promise.reject(new Error("Passwords do not match.")) })]}><Input.Password autoComplete="new-password" maxLength={128} /></Form.Item>
        <Button type="primary" htmlType="submit" loading={busy}>Change Password</Button>
      </Form>
    </Card>
  );
}
