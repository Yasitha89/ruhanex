import { useCallback, useEffect, useState } from "react";
import { PRODUCTION_LINES, TILE_SIZE_OPTIONS } from "../utils/constants";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Tabs,
  Typography,
  message,
} from "antd";
import { SaveOutlined } from "@ant-design/icons";

import {
  getDesignCodes,
  getLineSettings,
  saveLineSettings,
} from "../api/settingsApi";
import "./Settings.css";

const { Title, Text } = Typography;

const LINE_NAMES = PRODUCTION_LINES;

const DEFAULT_SETTINGS = {
  tileSize: "60x30",
  designCode: "",
  lineSpeed: 30,
  plannedDowntime: 30,
  stopDelayMs: 60000,
  maxPulseGapMs: 10000,
  requiredRunTimeMs: 60000,
};

function LineSettingsForm({ line }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [designOptions, setDesignOptions] = useState([]);
  const [designSearching, setDesignSearching] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getLineSettings(line);
      if (result?.success === false) {
        throw new Error(result.error || `Unable to retrieve ${line} settings.`);
      }

      const settings = result?.settings || result?.data || DEFAULT_SETTINGS;
      form.setFieldsValue({ ...DEFAULT_SETTINGS, ...settings });
      setUpdatedAt(settings.updatedAt || result?.updatedAt || null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unable to load settings.";
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [form, line]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const searchDesignCodes = useCallback(
    async (searchText = "") => {
      const tileSize = form.getFieldValue("tileSize");

      if (!tileSize) {
        setDesignOptions([]);
        return;
      }

      setDesignSearching(true);

      try {
        const result = await getDesignCodes({
          tileSize,
          search: searchText,
        });

        const rows = Array.isArray(result?.designCodes)
          ? result.designCodes
          : [];

        setDesignOptions(
          rows
            .map((item) => {
              const code =
                typeof item === "string"
                  ? item
                  : String(item?.designCode || "");

              return {
                value: code,
                label: code,
              };
            })
            .filter((item) => item.value),
        );
      } catch (err) {
        console.error("Unable to search design codes:", err);
        setDesignOptions([]);
      } finally {
        setDesignSearching(false);
      }
    },
    [form],
  );

  const handleTileSizeChange = () => {
    // A design belongs to a tile size. Clear the previous selection
    // whenever the size changes, then load designs for the new size.
    form.setFieldValue("designCode", "");
    setDesignOptions([]);
    searchDesignCodes("");
  };

  const handleSave = async (values) => {
    setSaving(true);
    setError("");

    try {
      const payload = {
        line,
        tileSize: values.tileSize,
        designCode: String(values.designCode || "").trim(),
        lineSpeed: Number(values.lineSpeed),
        plannedDowntime: Number(values.plannedDowntime),
        stopDelayMs: Number(values.stopDelayMs),
        maxPulseGapMs: Number(values.maxPulseGapMs),
        requiredRunTimeMs: Number(values.requiredRunTimeMs),
      };

      const result = await saveLineSettings(payload);
      if (result?.success === false) {
        throw new Error(result.error || `Unable to save ${line} settings.`);
      }

      setUpdatedAt(
        result?.settings?.updatedAt ||
          result?.updatedAt ||
          new Date().toISOString(),
      );
      message.success(`${line} settings saved successfully`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unable to save settings.";
      setError(errorMessage);
      message.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Spin spinning={loading}>
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

      <Form
        form={form}
        className="line-settings-form"
        layout="horizontal"
        labelAlign="left"
        colon={false}
        labelCol={{ xs: { span: 24 }, sm: { span: 8 }, md: { span: 7 } }}
        wrapperCol={{ xs: { span: 24 }, sm: { span: 16 }, md: { span: 12 } }}
        initialValues={DEFAULT_SETTINGS}
        onFinish={handleSave}
      >
        <Form.Item
          label="Tile Size"
          name="tileSize"
          rules={[{ required: true, message: "Please select the tile size" }]}
        >
          <Select
            className="left-aligned-select"
            options={TILE_SIZE_OPTIONS}
            onChange={handleTileSizeChange}
          />
        </Form.Item>

        <Form.Item
          label="Design Code"
          name="designCode"
          extra="Design code of the current production."
          rules={[
            {
              max: 100,
              message: "Design code must be 100 characters or fewer",
            },
          ]}
        >
          <AutoComplete
            options={designOptions}
            onSearch={searchDesignCodes}
            onFocus={() =>
              searchDesignCodes(form.getFieldValue("designCode") || "")
            }
            placeholder="Type to search design code"
            allowClear
            maxLength={100}
            notFoundContent={
              designSearching ? (
                <Spin size="small" />
              ) : (
                "No matching design code"
              )
            }
            filterOption={false}
          />
        </Form.Item>

        <Form.Item
          label="Rated Line Speed"
          name="lineSpeed"
          rules={[
            { required: true },
            {
              type: "number",
              min: 1,
              message: "Line speed must be greater than zero",
            },
          ]}
        >
          <InputNumber
            className="left-aligned-number"
            min={0.1}
            step={0.1}
            precision={2}
            style={{ width: "100%" }}
            addonAfter="Tiles/min"
          />
        </Form.Item>

        <Form.Item
          label="Planned Downtime"
          name="plannedDowntime"
          extra="Standard planned downtime allocated for one shift."
          rules={[{ required: true }, { type: "number", min: 0, max: 480 }]}
        >
          <InputNumber
            className="left-aligned-number"
            min={0}
            max={480}
            precision={0}
            style={{ width: "100%" }}
            addonAfter="Minutes"
          />
        </Form.Item>

        <Divider orientation="left">Downtime Detection</Divider>

        <Form.Item
          label="Stop Delay"
          name="stopDelayMs"
          extra="No-pulse duration before the line is declared stopped."
          rules={[{ required: true }, { type: "number", min: 1000 }]}
        >
          <InputNumber
            className="left-aligned-number"
            min={1000}
            step={1000}
            precision={0}
            style={{ width: "100%" }}
            addonAfter="ms"
          />
        </Form.Item>

        <Form.Item
          label="Maximum Pulse Gap"
          name="maxPulseGapMs"
          extra="Maximum allowed gap between pulses while validating continuous running."
          rules={[{ required: true }, { type: "number", min: 100 }]}
        >
          <InputNumber
            className="left-aligned-number"
            min={100}
            step={1000}
            precision={0}
            style={{ width: "100%" }}
            addonAfter="ms"
          />
        </Form.Item>

        <Form.Item
          label="Required Run Time"
          name="requiredRunTimeMs"
          extra="Continuous valid running duration required before changing status back to Running."
          rules={[{ required: true }, { type: "number", min: 1000 }]}
        >
          <InputNumber
            className="left-aligned-number"
            min={1000}
            step={1000}
            precision={0}
            style={{ width: "100%" }}
            addonAfter="ms"
          />
        </Form.Item>

        <Divider style={{ margin: "28px 0 20px" }} />

        <Form.Item wrapperCol={{ span: 24 }} style={{ marginBottom: 0 }}>
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
              Save {line}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Spin>
  );
}

export default function Settings() {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Settings
        </Title>
        <Text type="secondary">
          Configure production-line operating and downtime-detection parameters.
        </Text>
      </div>

      <Card>
        <Tabs
          defaultActiveKey="Keda 1"
          type="card"
          destroyInactiveTabPane={false}
          items={LINE_NAMES.map((line) => ({
            key: line,
            label: line,
            children: <LineSettingsForm line={line} />,
          }))}
        />
      </Card>
    </div>
  );
}
