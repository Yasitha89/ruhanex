import { useState } from 'react';
import { Alert, Button, Form, Modal, Select, Spin, Typography, message } from 'antd';
import { getDesignGrades } from '../api/designGradesApi';
import { getLineSettings, saveLineSettings } from '../api/settingsApi';
import { validateDesignGradeSlots } from '../utils/designGradeSlots';

export default function DesignGradeAssignments({ line, disabled }) {
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [grades, setGrades] = useState([]);
  const show = async () => {
    setOpen(true); setLoading(true); setError(''); form.resetFields();
    try {
      const [catalogue, settings] = await Promise.all([getDesignGrades(), getLineSettings(line)]);
      if (settings?.success === false) throw new Error(settings.error || 'Unable to load line settings.');
      const current = settings?.settings || settings?.data;
      if (!current) throw new Error('Current line settings are unavailable.');
      setGrades(catalogue);
      form.setFieldsValue({ slots: validateDesignGradeSlots(current.designGrades || {}) });
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setLoading(false); }
  };
  const save = async () => {
    try {
      const { slots } = await form.validateFields();
      const designGrades = validateDesignGradeSlots(slots, grades.map(g => g.grade));
      setSaving(true);
      const result = await saveLineSettings({ line, settingsAction: 'saveDesignGrades', designGrades });
      if (result?.success === false) throw new Error(result.error || 'Unable to save grade assignments.');
      if (!result?.settings?.designGrades || JSON.stringify(validateDesignGradeSlots(result.settings.designGrades)) !== JSON.stringify(designGrades))
        throw new Error('The server did not confirm the grade assignments. Deploy the updated line-settings Node-RED patch.');
      setOpen(false); message.success(`${line} design grade assignments saved.`);
    } catch (err) { if (!err.errorFields) message.error(err.response?.data?.error || err.message); }
    finally { setSaving(false); }
  };
  return <div style={{ marginTop: 20 }}>
    <Typography.Text style={{ marginRight: 16 }}>Design codes</Typography.Text>
    <Button onClick={show} disabled={disabled}>Assign design grades</Button>
    <Modal title={`${line} — Assign design grades`} width={720} open={open} onOk={save} okText="Save assignments"
      confirmLoading={saving} okButtonProps={{ disabled: loading || Boolean(error) || !grades.length }} onCancel={() => { if (!loading && !saving) setOpen(false); }}
      cancelButtonProps={{ disabled: loading || saving }} closable={!loading && !saving} maskClosable={!loading && !saving}>
      <Typography.Paragraph>Define which design grade each grade number, 1–16, represents. Grades come from the saved Design Grades catalogue. Leave unused numbers unassigned.</Typography.Paragraph>
      {error && <Alert type="error" title={error} action={<Button onClick={show}>Retry</Button>} style={{ marginBottom: 12 }} />}
      {!loading && !error && !grades.length && <Alert type="info" title="Ask an Admin to create Design Grades before assigning slots." style={{ marginBottom: 12 }} />}
      <Spin spinning={loading}>
        <Form form={form} layout="horizontal" labelAlign="left" labelCol={{ flex: '140px' }} wrapperCol={{ flex: 'auto' }}
          disabled={loading || saving || Boolean(error)}>
            {Array.from({ length: 16 }, (_, i) => String(i + 1)).map(slot => <Form.Item key={slot} name={['slots', slot]} label={`Grade number ${slot}`} style={{ marginBottom: 12 }}>
              <Select allowClear showSearch optionFilterProp="label" placeholder="Unassigned" options={grades.map(g => ({ value: g.grade, label: `${g.grade} — ${g.description}` }))} />
            </Form.Item>)}
        </Form>
      </Spin>
    </Modal>
  </div>;
}
