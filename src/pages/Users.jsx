import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, Modal, Popconfirm, Select, Table, Tag, message } from "antd";
import { createUser, deleteUser, getUsers } from "../api/authApi";
import { useAuth } from "../services/authContext";

export default function Users() {
  const { user } = useAuth();
  const [deleting, setDeleting] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await getUsers(); setUsers(result.users); setError(""); }
    catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      await createUser(values); setOpen(false); form.resetFields(); message.success("User created. Share the initial password privately."); await load();
    } catch (err) { if (!err.errorFields) message.error(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  };
  const remove = async (username) => {
    setDeleting(username);
    try { await deleteUser(username); message.success("User deleted."); await load(); }
    catch (err) { message.error(err.response?.data?.error || err.message); }
    finally { setDeleting(""); }
  };
  return <Card title="User Administration" extra={<Button type="primary" onClick={() => { form.resetFields(); setOpen(true); }}>Create User</Button>}>
    {error && <Alert type="error" title={error} action={<Button onClick={load}>Retry</Button>} />}
    <Table rowKey="username" loading={loading} dataSource={users} scroll={{ x: 600 }} columns={[
      { title: "Name", dataIndex: "displayName" }, { title: "Username", dataIndex: "username" },
      { title: "Level", dataIndex: "role", render: (role) => <Tag>{role}</Tag> },
      { title: "Actions", key: "actions", render: (_, record) => <Popconfirm title={`Delete ${record.username}?`} description="This removes the account and ends its access." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(record.username)} disabled={Boolean(deleting) || record.username === user.username}><Button danger size="small" loading={deleting === record.username} disabled={Boolean(deleting) || record.username === user.username}>Delete</Button></Popconfirm> },
      { title: "Password", dataIndex: "mustChangePassword", render: (required) => required ? "Initial password — change required" : "Changed by user" },
    ]} />
    <Modal open={open} title="Create User" onOk={save} okText="Create User" confirmLoading={saving} onCancel={() => { if (!saving) setOpen(false); }} closable={!saving} maskClosable={!saving} cancelButtonProps={{ disabled: saving }} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ role: "Line Supervisor" }} disabled={saving}>
        <Form.Item name="displayName" label="Name" rules={[{ required: true, whitespace: true }, { max: 100 }]}><Input maxLength={100} /></Form.Item>
        <Form.Item name="username" label="Username" normalize={(value) => value.toLowerCase()} rules={[{ required: true }, { pattern: /^[a-z0-9][a-z0-9._-]{2,49}$/, message: "Use 3–50 letters, numbers, dots, underscores or hyphens." }]}><Input autoComplete="off" maxLength={50} /></Form.Item>
        <Form.Item name="role" label="Level" rules={[{ required: true }]}><Select options={["Manager", "Admin", "Line Supervisor"].map((value) => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="password" label="Initial Password" extra="The user must change this password on first login." rules={[{ required: true }, { min: 4, max: 128 }]}><Input.Password autoComplete="new-password" maxLength={128} /></Form.Item>
      </Form>
    </Modal>
  </Card>;
}
