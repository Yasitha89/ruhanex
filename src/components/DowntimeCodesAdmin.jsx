import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import { EditOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { getDowntimeCodeRecords, saveDowntimeCodeRecord } from "../api/downtimeCodesApi";
import { PRODUCTION_LINE_OPTIONS } from "../utils/constants";
import { DOWNTIME_TYPES, PLANNED_CATEGORIES } from "../utils/downtimeCodes";

export default function DowntimeCodesAdmin() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const type = Form.useWatch("type", form);
  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const codes = await getDowntimeCodeRecords({ signal });
      if (signal?.aborted) return;
      setRows(codes);
      setError("");
    } catch (err) {
      if (!signal?.aborted) setError(err.response?.data?.error || err.message || "Unable to load downtime codes.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  const showEditor = (record) => {
    setEditing(record || null);
    form.resetFields();
    form.setFieldsValue(record ? { ...record, lines: [...record.lines] } : { type: "unplanned", lines: [] });
    setOpen(true);
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await saveDowntimeCodeRecord({
        value: values.value.trim(), label: values.label.trim(), type: values.type,
        plannedCategory: values.type === "planned" ? values.plannedCategory : null,
        lines: values.lines,
      }, editing?.value);
      message.success("Downtime code saved.");
      setOpen(false);
      await load();
    } catch (err) {
      if (!err.errorFields) message.error(err.response?.data?.error || err.message || "Unable to save downtime code.");
    } finally { setSaving(false); }
  };
  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor(null)}>Add downtime code</Button>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>Refresh</Button>
      </Space>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Table rowKey="value" dataSource={rows} loading={loading} scroll={{ x: 850 }} pagination={{ pageSize: 10 }} columns={[
        { title: "Code", dataIndex: "value" },
        { title: "Label", dataIndex: "label" },
        { title: "Type", dataIndex: "type", render: (value) => value === "planned" ? "Planned" : "Unplanned" },
        { title: "Category", dataIndex: "plannedCategory", render: (value) => PLANNED_CATEGORIES.find((item) => item.value === value)?.label || "—" },
        { title: "Assigned Lines", dataIndex: "lines", render: (lines) => (Array.isArray(lines) ? lines : []).map((line) => <Tag key={line}>{line}</Tag>) },
        { title: "Action", key: "action", render: (_, record) => <Button icon={<EditOutlined />} onClick={() => showEditor(record)}>Edit</Button> },
      ]} />
      <Modal title={editing ? "Edit Downtime Code" : "Add Downtime Code"} open={open} onOk={save} okText="Save" confirmLoading={saving}
        onCancel={() => { if (!saving) setOpen(false); }} cancelButtonProps={{ disabled: saving }} maskClosable={!saving} closable={!saving} keyboard={!saving} destroyOnHidden>
        <Form form={form} layout="vertical" disabled={saving}>
          <Form.Item name="value" label="Code" normalize={(value) => value.toUpperCase()} extra={editing ? "The code identifier cannot be changed; historical records keep this value." : "Example: SHIFT_END"}
            rules={[{ required: true }, { pattern: /^[A-Z][A-Z0-9_]{0,79}$/, message: "Use uppercase letters, numbers and underscores; start with a letter." }]}>
            <Input disabled={Boolean(editing) || saving} maxLength={80} />
          </Form.Item>
          <Form.Item name="label" label="Label" rules={[{ required: true, whitespace: true }]}><Input maxLength={200} placeholder="SHIFT_END - Shift End / Handover" /></Form.Item>
          <Form.Item name="type" label="Downtime Type" rules={[{ required: true }]}><Select options={DOWNTIME_TYPES} onChange={() => form.setFieldValue("plannedCategory", undefined)} /></Form.Item>
          {type === "planned" && <Form.Item name="plannedCategory" label="Planned Category" rules={[{ required: true, message: "Select the planned category" }]}><Select options={PLANNED_CATEGORIES} /></Form.Item>}
          <Form.Item name="lines" label="Assigned Lines" rules={[{ required: true, type: "array", min: 1, message: "Select at least one production line" }]}>
            <Select mode="multiple" options={PRODUCTION_LINE_OPTIONS} placeholder="Select one or more lines" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
