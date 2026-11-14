import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import { approveTelegramUser, getTelegramUsers, getUsers, revokeTelegramUser } from "../api/authApi";

export default function TelegramUserManagement() {
  const [registrations, setRegistrations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState("");
  const [form] = Form.useForm();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [telegram, users] = await Promise.all([getTelegramUsers(), getUsers()]);
      setRegistrations(telegram.users); setAccounts(users.users); setError("");
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const refresh = window.setInterval(load, 30000);
    return () => { window.clearTimeout(first); window.clearInterval(refresh); };
  }, [load]);
  const approve = async () => {
    try {
      const values = await form.validateFields(); setBusy(selected._id);
      await approveTelegramUser(selected._id, values.username);
      setSelected(null); message.success("Telegram user approved for AI replies and alarms."); await load();
    } catch (err) { if (!err.errorFields) message.error(err.response?.data?.error || err.message); }
    finally { setBusy(""); }
  };
  const revoke = async record => {
    setBusy(record._id);
    try { await revokeTelegramUser(record._id); message.success("Telegram approval revoked."); await load(); }
    catch (err) { message.error(err.response?.data?.error || err.message); }
    finally { setBusy(""); }
  };
  return <section aria-label="Telegram user administration" style={{ marginTop: 32 }}>
    <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
      <Typography.Title level={4}>Telegram users</Typography.Title>
      <Button onClick={load} disabled={Boolean(busy)} loading={loading}>Refresh</Button>
    </Space>
    <Typography.Paragraph>Users appear after sending your bot a message or /start. Verify the person and chat ID before assigning an account. Approval enables Ruhana replies and alarms with that account’s access.</Typography.Paragraph>
    {error && <Alert type="error" title={error} style={{ marginBottom: 12 }} />}
    <Table rowKey="_id" size="small" loading={loading} dataSource={registrations} scroll={{ x: 760 }} pagination={{ pageSize: 10 }} locale={{ emptyText: "No registrations yet. Ask the user to send /start to your bot." }} columns={[
      { title: "Telegram user", key: "person", render: (_, r) => <><div>{[r.firstName, r.lastName].filter(Boolean).join(" ") || "Unnamed user"}</div><Typography.Text type="secondary">{r.telegramUsername ? `@${r.telegramUsername}` : "No Telegram username"}</Typography.Text></> },
      { title: "Chat ID", dataIndex: "_id" },
      { title: "Ruhanex account", dataIndex: "ruhanexUsername", render: value => value || "Unassigned" },
      { title: "Status", key: "status", render: (_, r) => <Tag color={r.approved ? "green" : "orange"}>{r.approved ? "Approved" : "Not approved"}</Tag> },
      { title: "Last seen", dataIndex: "lastSeenAt", render: value => value ? new Date(value).toLocaleString() : "—" },
      { title: "Actions", key: "actions", render: (_, r) => <Space>
        <Button size="small" disabled={Boolean(busy)} onClick={() => { setSelected(r); form.setFieldsValue({ username: r.ruhanexUsername || undefined }); }}>{r.approved ? "Reassign" : "Assign / approve"}</Button>
        <Popconfirm title="Revoke Telegram approval?" description="Stops new AI replies and alarms for this chat." onConfirm={() => revoke(r)} disabled={Boolean(busy) || !r.approved}>
          <Button size="small" danger disabled={Boolean(busy) || !r.approved} loading={busy === r._id}>Revoke</Button>
        </Popconfirm>
      </Space> },
    ]} />
    <Modal title="Assign and approve Telegram user" open={Boolean(selected)} onCancel={() => { if (!busy) setSelected(null); }} onOk={approve} okText="Assign and approve" confirmLoading={Boolean(busy)} cancelButtonProps={{ disabled: Boolean(busy) }} closable={!busy} maskClosable={!busy}>
      <Typography.Paragraph>Chat ID: <strong>{selected?._id}</strong>. This person will receive access through the selected Ruhanex account.</Typography.Paragraph>
      <Form form={form} layout="vertical" disabled={Boolean(busy)}>
        <Form.Item name="username" label="Ruhanex user" rules={[{ required: true, message: "Select a Ruhanex user." }]}>
          <Select showSearch optionFilterProp="label" placeholder="Select user" options={accounts.filter(a => a.enabled && !a.mustChangePassword).map(a => ({ value: a.username, label: `${a.displayName} (${a.username}) — ${a.role}` }))} />
        </Form.Item>
      </Form>
    </Modal>
  </section>;
}
