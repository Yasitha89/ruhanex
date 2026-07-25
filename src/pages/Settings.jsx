import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  InputNumber,
  Select,
  Spin,
  Tabs,
  Typography,
  message,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";

import { getLineSettings, saveLineSettings } from "../api/settingsApi";

import "./Settings.css";

const { Title, Text } = Typography;

export default function Settings() {
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const loadCurrentSettings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getLineSettings();

      if (!result?.success) {
        throw new Error(result?.error || "Unable to retrieve line settings.");
      }

      if (!result?.settings) {
        throw new Error("No settings were returned by the server.");
      }

      const settings = result.settings;

      form.setFieldsValue({
        tileSize: settings.tileSize,
        lineSpeed: Number(settings.lineSpeed) || 0,
        plannedDowntime: Number(settings.plannedDowntime) || 0,
      });

      setUpdatedAt(settings.updatedAt || null);
    } catch (err) {
      console.error("Failed to load settings:", err);

      const errorMessage =
        err instanceof Error ? err.message : "Unable to load settings.";

      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    loadCurrentSettings();
  }, [loadCurrentSettings]);

  const handleSave = async (values) => {
    setSaving(true);
    setError("");

    try {
      const payload = {
        line: "Keda 1",
        tileSize: values.tileSize,
        lineSpeed: Number(values.lineSpeed),
        plannedDowntime: Number(values.plannedDowntime),
      };

      const result = await saveLineSettings(payload);

      if (!result?.success) {
        throw new Error(result?.error || "Unable to save line settings.");
      }

      setUpdatedAt(result?.settings?.updatedAt || new Date().toISOString());

      message.success("Keda 1 settings saved successfully");
    } catch (err) {
      console.error("Failed to save settings:", err);

      const errorMessage =
        err instanceof Error ? err.message : "Unable to save settings.";

      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const keda1Settings = (
    <Spin spinning={loading}>
      <Form
        form={form}
        className="line-settings-form"
        layout="horizontal"
        labelAlign="left"
        colon={false}
        labelCol={{
          xs: { span: 24 },
          sm: { span: 8 },
          md: { span: 7 },
        }}
        wrapperCol={{
          xs: { span: 24 },
          sm: { span: 16 },
          md: { span: 12 },
        }}
        initialValues={{
          tileSize: "60x30",
          lineSpeed: 0,
          plannedDowntime: 0,
        }}
        onFinish={handleSave}
      >
        <Form.Item
          label="Tile Size"
          name="tileSize"
          rules={[
            {
              required: true,
              message: "Please select the tile size",
            },
          ]}
        >
          <Select
            className="left-aligned-select"
            style={{ width: "100%" }}
            placeholder="Select tile size"
            options={[
              { value: "30x30", label: "30 × 30 cm" },
              { value: "40x40", label: "40 × 40 cm" },
              { value: "60x30", label: "60 × 30 cm" },
              { value: "60x60", label: "60 × 60 cm" },
              { value: "80x80", label: "80 × 80 cm" },
              { value: "120x60", label: "120 × 60 cm" },
            ]}
          />
        </Form.Item>

        <Form.Item
          label="Rated Line Speed"
          name="lineSpeed"
          rules={[
            {
              required: true,
              message: "Please enter the rated line speed",
            },
            {
              type: "number",
              min: 1,
              message: "Line speed must be greater than zero",
            },
          ]}
        >
          <InputNumber
            className="left-aligned-number"
            min={1}
            precision={0}
            style={{ width: "100%" }}
            placeholder="Enter rated line speed"
            addonAfter="Tiles/min"
          />
        </Form.Item>

        <Form.Item
          label="Standard Planned Downtime"
          name="plannedDowntime"
          extra="Standard planned downtime allocated for one shift."
          rules={[
            {
              required: true,
              message: "Please enter the planned downtime",
            },
            {
              type: "number",
              min: 0,
              max: 480,
              message: "Planned downtime must be between 0 and 480 minutes",
            },
          ]}
        >
          <InputNumber
            className="left-aligned-number"
            min={0}
            max={480}
            precision={0}
            style={{ width: "100%" }}
            placeholder="Enter planned downtime"
            addonAfter="Minutes"
          />
        </Form.Item>

        <Divider style={{ margin: "28px 0 20px" }} />

        <Form.Item
          wrapperCol={{
            span: 24,
          }}
          style={{
            marginBottom: 0,
          }}
        >
          <div className="settings-actions">
            {updatedAt && (
              <Text type="secondary" className="settings-updated-time">
                Last updated: {new Date(updatedAt).toLocaleString()}
              </Text>
            )}

            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
            >
              Save Settings
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Spin>
  );

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Settings
        </Title>

        <Text type="secondary">
          Configure production-line operating parameters.
        </Text>
      </div>

      {error && (
        <Alert
          type="error"
          message={error}
          showIcon
          closable
          style={{ marginBottom: 16 }}
          onClose={() => setError("")}
        />
      )}

      <Card>
        <Tabs
          defaultActiveKey="keda1"
          type="card"
          items={[
            {
              key: "keda1",
              label: "Keda 1",
              children: keda1Settings,
            },
          ]}
        />
      </Card>
    </div>
  );
}
