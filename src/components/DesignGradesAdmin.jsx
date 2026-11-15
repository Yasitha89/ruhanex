import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space, Table, message } from 'antd';
import { getDesignGrades, saveDesignGrade } from '../api/designGradesApi';

export default function DesignGradesAdmin() {
  const [grades, setGrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const load = useCallback(async signal => {
    setLoading(true);
    try { const rows = await getDesignGrades(signal); if (!signal?.aborted) { setGrades(rows); setError(''); } }
    catch (err) { if (!signal?.aborted) setError(err.response?.data?.error || err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load]);
  const edit = record => { setEditing(record); form.resetFields(); if (record) form.setFieldsValue(record); setOpen(true); };
  const save = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      await saveDesignGrade({ grade: values.grade.trim(), description: values.description.trim(), category: (values.category || '').trim() }, editing?.grade);
      setOpen(false); message.success('Design grade saved.'); await load();
    } catch (err) { if (!err.errorFields) message.error(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  };
  return <>
    <Space wrap style={{ marginBottom: 16 }}>
      <Button type="primary" onClick={() => edit(null)}>Add design grade</Button>
      <Button onClick={() => load()} loading={loading}>Refresh</Button>
    </Space>
    {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
    <Table rowKey="grade" loading={loading} dataSource={grades} pagination={{ pageSize: 10 }} scroll={{ x: 500 }} columns={[
      { title: 'Grade', dataIndex: 'grade' },
      { title: 'Category', dataIndex: 'category', render: value => value || 'Uncategorized' },
      { title: 'Description', dataIndex: 'description', render: text => <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span> },
      { title: 'Action', key: 'action', render: (_, r) => <Button onClick={() => edit(r)}>Edit</Button> },
    ]} />
    <Modal title={editing ? 'Edit Design Grade' : 'Add Design Grade'} open={open} onOk={save} okText="Save" confirmLoading={saving}
      onCancel={() => { if (!saving) setOpen(false); }} closable={!saving} maskClosable={!saving} cancelButtonProps={{ disabled: saving }}>
      <Form form={form} layout="vertical" disabled={saving}>
        <Form.Item name="grade" label="Grade" rules={[{ required: true, whitespace: true }, { max: 80 }]}>
          <Input maxLength={80} disabled={Boolean(editing) || saving} placeholder="Enter grade" />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ required: true, whitespace: true }, { max: 500 }]}>
          <Input.TextArea maxLength={500} rows={3} showCount placeholder="Describe this grade" />
        </Form.Item>
        <Form.Item name="category" label="Category" extra="Used to group grades for future filtering." rules={[{ max: 100 }]}>
          <Input maxLength={100} placeholder="Enter category (optional)" />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
