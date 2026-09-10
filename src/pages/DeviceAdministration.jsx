import { useCallback, useEffect, useState } from "react";
import { PRODUCTION_LINE_OPTIONS } from "../utils/constants";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

import {
  createDevice,
  deleteDevice,
  getDevices,
  updateDevice,
} from "../api/deviceApi";
import "./DeviceAdministration.css";

const { Title, Text } = Typography;

const DEVICE_TYPES = [
  { value: "counter", label: "Counter" },
  { value: "energy_gateway", label: "Energy Gateway" },
];

const DEFAULT_DEVICE = {
  tenantId: "Rocell",
  siteId: "RCLH",
  enabled: true,
  deviceType: "counter",
  shortId: "",
  deviceLabel: "",
  location: "",
  line: "",
  machine: "",
  displayTopic: "",
  slaves: [],
};

function normalizeDevices(result) {
  const payload = result?.devices ?? result?.data ?? result ?? {};

  if (Array.isArray(payload)) {
    return payload.map((item) => ({
      ...item,
      key: item.key || item.deviceId || item._id,
    }));
  }

  return Object.entries(payload || {}).map(([key, value]) => ({
    ...value,
    key,
    deviceId: value?.deviceId || key,
  }));
}

export default function DeviceAdministration() {
  const [form] = Form.useForm();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getDevices();
      setDevices(normalizeDevices(result));
    } catch (err) {
      const text =
        err instanceof Error ? err.message : "Unable to load devices.";
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const openCreate = () => {
    setEditingKey(null);
    form.setFieldsValue(DEFAULT_DEVICE);
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditingKey(record.key);
    form.setFieldsValue({
      ...DEFAULT_DEVICE,
      ...record,
      slaves: Array.isArray(record.slaves) ? record.slaves : [],
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const shortId = String(values.shortId || "").trim();
      const prefix =
        values.deviceType === "energy_gateway" ? "RX-ENM" : "RX-CNT";
      const deviceKey = editingKey || `${prefix}-${shortId}`;

      const payload = {
        tenantId: values.tenantId,
        siteId: values.siteId,
        enabled: Boolean(values.enabled),
        shortId,
        deviceType: values.deviceType,
        deviceLabel: values.deviceLabel || "",
      };

      if (values.deviceType === "counter") {
        Object.assign(payload, {
          line: values.line || "",
          machine: values.machine || "",
          displayTopic: values.displayTopic || "",
        });
      } else {
        Object.assign(payload, {
          location: values.location || "",
          slaves: (values.slaves || []).map((slave, index) => ({
            meterId:
              slave.meterId ||
              `${deviceKey}-M${String(index + 1).padStart(2, "0")}`,
            slaveId: Number(slave.slaveId),
            enabled: slave.enabled !== false,
            panelId: slave.panelId || "",
            panelLabel: slave.panelLabel || "",
            deviceLabel: slave.deviceLabel || "",
          })),
        });
      }

      const result = editingKey
        ? await updateDevice(editingKey, { key: deviceKey, ...payload })
        : await createDevice({ key: deviceKey, ...payload });

      if (result?.success === false) {
        throw new Error(result.error || "Unable to save device.");
      }

      message.success(editingKey ? "Device updated" : "Device added");
      setModalOpen(false);
      form.resetFields();
      await loadDevices();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(
        err instanceof Error ? err.message : "Unable to save device.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (key) => {
    try {
      const result = await deleteDevice(key);
      if (result?.success === false) {
        throw new Error(result.error || "Unable to delete device.");
      }
      message.success("Device deleted");
      await loadDevices();
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Unable to delete device.",
      );
    }
  };

  const columns = [
    { title: "Device ID", dataIndex: "key", key: "key", width: 160 },
    {
      title: "Label",
      dataIndex: "deviceLabel",
      key: "deviceLabel",
      width: 190,
    },
    {
      title: "Type",
      dataIndex: "deviceType",
      key: "deviceType",
      width: 140,
      render: (value) =>
        value === "energy_gateway" ? "Energy Gateway" : "Counter",
    },
    { title: "Tenant", dataIndex: "tenantId", key: "tenantId", width: 110 },
    { title: "Site", dataIndex: "siteId", key: "siteId", width: 100 },
    {
      title: "Assignment",
      key: "assignment",
      render: (_, record) =>
        record.deviceType === "energy_gateway"
          ? record.location || "-"
          : record.line || "-",
    },
    {
      title: "Status",
      dataIndex: "enabled",
      key: "enabled",
      width: 95,
      align: "center",
      render: (enabled) => (
        <Tag color={enabled ? "success" : "default"}>
          {enabled ? "Enabled" : "Disabled"}
        </Tag>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 125,
      fixed: "right",
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => openEdit(record)}
          />
          <Popconfirm
            title="Delete device?"
            description={`Delete ${record.key}?`}
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.key)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const deviceType = Form.useWatch("deviceType", form);

  return (
    <div className="device-admin-page">
      <div className="device-admin-header">
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Device Administration
          </Title>
          <Text type="secondary">
            Add, edit and remove Ruhanex counters and energy gateways.
          </Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadDevices}
            loading={loading}
          >
            Refresh
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Device
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        <Table
          rowKey="key"
          columns={columns}
          dataSource={devices}
          loading={loading}
          scroll={{ x: 1050 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
        />
      </Card>

      <Modal
        title={editingKey ? "Edit Device" : "Add Device"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        width={860}
        okText={editingKey ? "Save Changes" : "Add Device"}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={DEFAULT_DEVICE}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="tenantId"
                label="Tenant ID"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="siteId"
                label="Site ID"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="enabled" label="Enabled" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="deviceType"
                label="Device Type"
                rules={[{ required: true }]}
              >
                <Select options={DEVICE_TYPES} disabled={Boolean(editingKey)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="shortId"
                label="Short ID"
                rules={[
                  { required: true, message: "Enter the numeric short ID" },
                  {
                    pattern: /^\d+$/,
                    message: "Short ID must contain numbers only",
                  },
                ]}
              >
                <Input
                  placeholder={
                    deviceType === "energy_gateway" ? "2000" : "1002"
                  }
                  disabled={Boolean(editingKey)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="deviceLabel" label="Device Label">
                <Input placeholder="Keda 3 Tile Counter" />
              </Form.Item>
            </Col>
          </Row>

          {deviceType === "counter" ? (
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item
                  name="line"
                  label="Line"
                  rules={[{ required: true }]}
                >
                  <Select options={PRODUCTION_LINE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="machine" label="Machine">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="displayTopic" label="Display Topic">
                  <Input placeholder="display/line3/shiftCount" />
                </Form.Item>
              </Col>
            </Row>
          ) : (
            <>
              <Form.Item name="location" label="Location">
                <Input placeholder="Power Room" />
              </Form.Item>
              <Divider orientation="left">Modbus Energy Meters</Divider>
              <Form.List name="slaves">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...rest }) => (
                      <Card
                        key={key}
                        size="small"
                        className="device-slave-card"
                      >
                        <Row gutter={12} align="middle">
                          <Col xs={24} md={4}>
                            <Form.Item
                              {...rest}
                              name={[name, "slaveId"]}
                              label="Slave ID"
                              rules={[{ required: true }]}
                            >
                              <InputNumber
                                min={1}
                                max={247}
                                style={{ width: "100%" }}
                              />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={5}>
                            <Form.Item
                              {...rest}
                              name={[name, "panelId"]}
                              label="Panel ID"
                              rules={[{ required: true }]}
                            >
                              <Input placeholder="ATS" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={5}>
                            <Form.Item
                              {...rest}
                              name={[name, "panelLabel"]}
                              label="Panel Label"
                            >
                              <Input placeholder="ATS Panel" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} md={6}>
                            <Form.Item
                              {...rest}
                              name={[name, "deviceLabel"]}
                              label="Meter Label"
                              rules={[{ required: true }]}
                            >
                              <Input placeholder="ATS CEB" />
                            </Form.Item>
                          </Col>
                          <Col xs={12} md={2}>
                            <Form.Item
                              {...rest}
                              name={[name, "enabled"]}
                              label="On"
                              valuePropName="checked"
                              initialValue
                            >
                              <Switch />
                            </Form.Item>
                          </Col>
                          <Col xs={12} md={2} className="device-slave-remove">
                            <Button
                              danger
                              type="text"
                              icon={<DeleteOutlined />}
                              onClick={() => remove(name)}
                            />
                          </Col>
                        </Row>
                      </Card>
                    ))}
                    <Button
                      type="dashed"
                      block
                      icon={<PlusOutlined />}
                      onClick={() => add({ enabled: true })}
                    >
                      Add Energy Meter
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
