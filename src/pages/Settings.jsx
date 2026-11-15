import { useCallback, useEffect, useState } from "react";
import { PRODUCTION_LINES, TILE_SIZE_OPTIONS } from "../utils/constants";
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Divider,
  Descriptions,
  Form,
  InputNumber,
  Modal,
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
import { buildLineSettingsPayload } from "../utils/lineSettings";
import { validateDesignGradeSlots } from "../utils/designGradeSlots";
import { KEDA_TILE_SIZES, RATED_SPEED_TILE_SIZES, GLAZE_TILE_SIZES, KILN_TILE_SIZES, ratedSpeedFor, validateRatedSpeeds, validateTilesPerBox } from "../utils/ratedLineSpeeds";
import DowntimeCodesAdmin from "../components/DowntimeCodesAdmin";
import DesignGradesAdmin from "../components/DesignGradesAdmin";
import DesignGradeAssignments from "../components/DesignGradeAssignments";
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

function LineSettingsForm({ line, administration }) {
  const [form] = Form.useForm();
  const [speedForm] = Form.useForm();
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [speedSaving, setSpeedSaving] = useState(false);
  const [ratedSpeeds, setRatedSpeeds] = useState({});
  const [boxForm] = Form.useForm();
  const [boxModalOpen, setBoxModalOpen] = useState(false);
  const [boxSaving, setBoxSaving] = useState(false);
  const [boxPresets, setBoxPresets] = useState({});
  const [gradeReview, setGradeReview] = useState(null);
  const boxSizes = KEDA_TILE_SIZES[line];
  const sizes = RATED_SPEED_TILE_SIZES[line];
  const isGlaze = Boolean(GLAZE_TILE_SIZES[line]);
  const isKiln = Boolean(KILN_TILE_SIZES[line]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [designOptions, setDesignOptions] = useState([]);
  const [designSearching, setDesignSearching] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoaded(false);
    setError("");

    try {
      const result = await getLineSettings(line);
      if (result?.success === false) {
        throw new Error(result.error || `Unable to retrieve ${line} settings.`);
      }

      const settings = result?.settings || result?.data;
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
        throw new Error("Unable to load current line settings.");
      }
      form.setFieldsValue({ ...DEFAULT_SETTINGS, ...settings });
      setRatedSpeeds(settings.savedSpeeds || {});
      setBoxPresets(settings.savedTilesPerBox || {});
      form.setFieldValue('TilesPerBox', settings.TilesPerBox === undefined ? settings.savedTilesPerBox?.[settings.tileSize] : settings.TilesPerBox);
      setUpdatedAt(settings.updatedAt || result?.updatedAt || null);
      setLoaded(true);
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
    const timer = window.setTimeout(loadSettings, 0);
    return () => window.clearTimeout(timer);
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

  const handleTileSizeChange = (tileSize) => {
    if (boxSizes && boxPresets[tileSize] !== undefined) form.setFieldValue('TilesPerBox', boxPresets[tileSize]);
    if (sizes) {
      form.setFieldValue("lineSpeed", ratedSpeedFor(line, tileSize, ratedSpeeds));
    }
    // A design belongs to a tile size. Clear the previous selection
    // whenever the size changes, then load designs for the new size.
    form.setFieldValue("designCode", "");
    setDesignOptions([]);
    searchDesignCodes("");
  };

  const saveSpeedPresets = async () => {
    try {
      const values = await speedForm.validateFields();
      const speeds = validateRatedSpeeds(line, values.speeds);
      setSpeedSaving(true);
      const result = await saveLineSettings({ line, settingsAction: 'saveSpeeds', savedSpeeds: speeds });
      if (result?.success === false) throw new Error(result.error || 'Unable to save rated speeds.');
      const stored = result?.settings?.savedSpeeds;
      if (!stored || Object.keys(stored).length !== Object.keys(speeds).length ||
          Object.entries(speeds).some(([size, speed]) => JSON.stringify(validateRatedSpeeds(line, stored)?.[size]) !== JSON.stringify(speed))) {
        throw new Error('The server did not confirm the speed presets. Deploy the updated rated-speed Node-RED patch.');
      }
      setRatedSpeeds(stored);
      const selectedSpeed = ratedSpeedFor(line, form.getFieldValue('tileSize'), stored);
      if (selectedSpeed !== undefined) form.setFieldValue('lineSpeed', selectedSpeed);
      setUpdatedAt(result.settings.updatedAt || result.updatedAt || new Date().toISOString());
      setSpeedModalOpen(false);
      message.success(`${line} rated speeds saved`);
    } catch (err) {
      if (!err.errorFields) message.error(err.message || 'Unable to save rated speeds.');
    } finally {
      setSpeedSaving(false);
    }
  };

  const saveBoxPresets = async () => {
    try {
      const values = await boxForm.validateFields();
      const presets = validateTilesPerBox(line, values.boxes || {});
      setBoxSaving(true);
      const result = await saveLineSettings({ line, settingsAction: 'saveTilesPerBox', savedTilesPerBox: presets });
      const stored = result?.settings?.savedTilesPerBox;
      if (result?.success === false) throw new Error(result.error || 'Unable to save tiles per box.');
      if (!stored || JSON.stringify(validateTilesPerBox(line, stored)) !== JSON.stringify(presets)) throw new Error('The server did not confirm tiles per box. Deploy the updated Node-RED line settings patch.');
      setBoxPresets(stored);
      setUpdatedAt(result.settings.updatedAt); setBoxModalOpen(false);
      message.success(`${line} tiles per box saved`);
    } catch (err) { if (!err.errorFields) message.error(err.message || 'Unable to save tiles per box.'); }
    finally { setBoxSaving(false); }
  };

  const handleSave = async (values, reviewed = null) => {
    setSaving(true);
    setError("");

    try {
      const latest = await getLineSettings(line);
      if (latest?.success === false) {
        throw new Error(latest.error || 'Unable to retrieve current line settings.');
      }
      const current = latest?.settings || latest?.data;
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error('Unable to preserve the current line settings. Reload and try again.');
      }
      if (boxSizes && !administration) {
        const slots = validateDesignGradeSlots(current.designGrades || {});
        const changed = values.tileSize !== current.tileSize || String(values.designCode || '').trim() !== String(current.designCode || '').trim();
        const snapshot = JSON.stringify({ tileSize: current.tileSize, designCode: current.designCode, slots });
        if ((!reviewed && changed) || (reviewed && reviewed.snapshot !== snapshot)) {
          setGradeReview({ values: { ...values }, slots, snapshot });
          if (reviewed) message.warning('Line settings changed. Please review the current grade assignments again.');
          return;
        }
      }
      const boxes = current.savedTilesPerBox;
      const payload = buildLineSettingsPayload(line, current, { ...values, savedSpeeds: current.savedSpeeds, savedTilesPerBox: boxes }, administration);

      const result = await saveLineSettings(payload);
      if (result?.success === false) {
        throw new Error(result.error || `Unable to save ${line} settings.`);
      }
      if (boxSizes && !administration) {
        const stored = result?.settings?.savedTilesPerBox;
        if (!stored || JSON.stringify(validateTilesPerBox(line, stored)) !== JSON.stringify(boxes)) throw new Error('The server did not confirm tiles per box. Deploy the updated Node-RED line settings patch.');
        setBoxPresets(stored);
        form.setFieldValue('TilesPerBox', result.settings.TilesPerBox);
      }

      setUpdatedAt(
        result?.settings?.updatedAt ||
          result?.updatedAt ||
          new Date().toISOString(),
      );
      message.success(`${line} settings saved successfully`);
      setGradeReview(null);
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
          action={<Button size="small" onClick={loadSettings} disabled={loading || saving}>Reload</Button>}
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
        disabled={saving || speedSaving || boxSaving || loading || !loaded || Boolean(gradeReview)}
      >
        {!administration && <>
        <Form.Item
          label="Tile Size"
          name="tileSize"
          rules={[{ required: true, message: "Please select the tile size" }]}
        >
          <Select
            className="left-aligned-select"
            options={sizes ? sizes.map(value => ({ value, label: value })) : TILE_SIZE_OPTIONS}
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
          extra={sizes ? "Select a tile size to apply its saved speed, or enter a speed manually." : undefined}
        >
          <div className="line-rated-speed-controls">
          <Form.Item
          name="lineSpeed"
          noStyle
          rules={[
            { required: true },
            {
              type: "number",
              min: 0.01,
              message: "Line speed must be greater than zero",
            },
          ]}
        >
          <InputNumber
            className="left-aligned-number"
            min={0.1}
            step={0.1}
            precision={2}
            style={{ width: "100%", minWidth: 0, flex: 1 }}
            addonAfter="Tiles/min"
          />
          </Form.Item>
          {sizes && <Button onClick={() => {
            speedForm.resetFields();
            speedForm.setFieldsValue({ speeds: isKiln ? Object.fromEntries(sizes.map(size => [size, {
              standardDailyOutputSqm: ratedSpeeds[size]?.standardDailyOutputSqm,
            }])) : ratedSpeeds });
            setSpeedModalOpen(true);
          }}>Size speeds</Button>}
          </div>
        </Form.Item>

        {boxSizes && <Form.Item label="Tiles per Box" extra="Active packing quantity. Editing this does not change size presets. Changing size loads its preset when available; otherwise the active quantity is kept.">
          <div className="line-rated-speed-controls">
            <Form.Item name="TilesPerBox" noStyle rules={[{ type: 'integer', min: 1, message: 'Enter a positive whole number.' }]}>
              <InputNumber min={1} step={1} precision={0} placeholder="Not set" style={{ width: '100%', minWidth: 0, flex: 1 }} addonAfter="Tiles/box" />
            </Form.Item>
            <Button onClick={() => { boxForm.resetFields(); boxForm.setFieldsValue({ boxes: boxPresets }); setBoxModalOpen(true); }}>Size quantities</Button>
          </div>
        </Form.Item>}

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

        </>}

        {administration && <>
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

        </>}

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
              disabled={loading || !loaded}
            >
              Save {line}
            </Button>
          </div>
        </Form.Item>
      </Form>
      {boxSizes && !administration && <Modal title={`${line} — Confirm design grade assignments`} open={Boolean(gradeReview)}
        onOk={() => handleSave(gradeReview.values, gradeReview)} okText="Assignments are correct — save settings" confirmLoading={saving}
        onCancel={() => { if (!saving) setGradeReview(null); }} closable={!saving} maskClosable={!saving} cancelButtonProps={{ disabled: saving }}>
        <Typography.Paragraph>Tile size: <strong>{gradeReview?.values.tileSize}</strong> · Design code: <strong>{gradeReview?.values.designCode || 'Unassigned'}</strong></Typography.Paragraph>
        <Typography.Paragraph>Are these grade assignments correct for the new size and design? Cancel to update assignments before saving.</Typography.Paragraph>
        <Descriptions size="small" column={1} bordered items={Array.from({ length: 16 }, (_, i) => ({ key: String(i + 1), label: `Grade number ${i + 1}`, children: gradeReview?.slots[i + 1] || 'Unassigned' }))} />
      </Modal>}
      {boxSizes && !administration && <DesignGradeAssignments line={line} disabled={!loaded || loading || saving || speedSaving || boxSaving || Boolean(gradeReview)} />}
      {boxSizes && !administration && <Modal title={`${line} — Tiles per box by tile size`} open={boxModalOpen}
        onCancel={() => !boxSaving && setBoxModalOpen(false)} onOk={saveBoxPresets} okText="Save quantities" confirmLoading={boxSaving}
        cancelButtonProps={{ disabled: boxSaving }} closable={!boxSaving} maskClosable={!boxSaving}>
        <Typography.Paragraph type="secondary">Set the number of tiles packed in one box for each size. Leave blank when no packing quantity is configured. Other unsaved line settings are kept in the form.</Typography.Paragraph>
        <Form form={boxForm} layout="horizontal" disabled={boxSaving}>
          {boxSizes.map(size => <Form.Item key={size} label={size} name={['boxes', size]} rules={[{ type: 'integer', min: 1, message: 'Enter a positive whole number.' }]}>
            <InputNumber min={1} step={1} precision={0} addonAfter="Tiles/box" style={{ width: '100%' }} />
          </Form.Item>)}
        </Form>
      </Modal>}
      {sizes && !administration && <Modal
        title={`${line} — Rated speeds by tile size`}
        open={speedModalOpen}
        onCancel={() => !speedSaving && setSpeedModalOpen(false)}
        onOk={saveSpeedPresets}
        okText="Save speeds"
        confirmLoading={speedSaving}
        cancelButtonProps={{ disabled: speedSaving }}
        closable={!speedSaving}
        maskClosable={!speedSaving}
      >
        <Typography.Paragraph type="secondary">{isKiln
          ? 'Rated speed = standard output (m² per 24 hours) ÷ tile area (m²) ÷ 1,440 minutes. Enter full-capacity output without downtime allowances. Blank sizes have no preset.'
          : isGlaze
          ? 'Rated speed = press cycles per minute × tiles per press. Save both inputs for each size; leave both blank for no preset.'
          : 'Save a rated speed in tiles/min for each size. Blank sizes have no preset.'} Other unsaved line settings are kept in the form.</Typography.Paragraph>
        <Form form={speedForm} layout="horizontal" disabled={speedSaving}>
          {isKiln && Object.values(ratedSpeeds).some(speed => speed && typeof speed === 'object' && ('cycleMinutes' in speed || 'tilesPerRow' in speed)) &&
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Replace the old cycle-based presets with standard daily outputs. Existing presets cannot be converted automatically." />}
          {sizes.map(size => isKiln ? <div key={size} className="glaze-size-speed-row">
            <Text strong>{size}</Text>
              <Form.Item label="Standard output (m² / 24 hours)" name={['speeds', size, 'standardDailyOutputSqm']}
                style={{ marginTop: 8, marginBottom: 8 }}
                rules={[{ type: 'number', min: 0.01, message: 'Enter positive standard daily output' }]}>
                <InputNumber min={0.01} step={1} precision={2} style={{ width: '100%' }} />
              </Form.Item>
            <Form.Item noStyle shouldUpdate>
              {() => {
                const speed = ratedSpeedFor(line, size, speedForm.getFieldValue('speeds') || {});
                return <Text type="secondary">Rated speed: {speed === undefined ? '—' : speed.toLocaleString('en-US', { maximumFractionDigits: 2 })} tiles/min</Text>;
              }}
            </Form.Item>
          </div> : isGlaze ? <div key={size} className="glaze-size-speed-row">
            <Text strong>{size}</Text>
            <div className="glaze-size-speed-inputs">
              <Form.Item label="Press cycles/min" name={['speeds', size, 'pressCyclesPerMinute']}
                rules={[{ type: 'number', min: 0.01, message: 'Enter positive cycles/min' }]}>
                <InputNumber min={0.01} step={0.1} precision={2} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="Tiles per press" name={['speeds', size, 'tilesPerPress']}
                rules={[{ type: 'integer', min: 1, message: 'Enter a positive whole number' }]}>
                <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
            <Form.Item noStyle shouldUpdate>
              {() => <Text type="secondary">Rated speed: {ratedSpeedFor(line, size, speedForm.getFieldValue('speeds') || {}) ?? '—'} tiles/min</Text>}
            </Form.Item>
          </div> : <Form.Item key={size} label={size} name={['speeds', size]}
            rules={[{ type: 'number', min: 0.01, message: 'Enter a positive speed' }]}>
            <InputNumber min={0.01} step={0.1} precision={2} addonAfter="Tiles/min" style={{ width: '100%' }} />
          </Form.Item>)}
        </Form>
      </Modal>}
    </Spin>
  );
}

export default function Settings({ administration = false }) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          {administration ? "Line Settings — Administration" : "Line Settings"}
        </Title>
        <Text type="secondary">
          {administration
            ? "Configure downtime detection and manage downtime codes assigned to production lines."
            : "Configure production size, design, rated speed and planned downtime."}
        </Text>
      </div>

      <Card>
        <Tabs
          defaultActiveKey="Keda 1"
          type="card"
          destroyInactiveTabPane={false}
          items={[...LINE_NAMES.map((line) => ({
            key: line,
            label: line,
            children: <LineSettingsForm key={`${administration ? "admin" : "production"}-${line}`} line={line} administration={administration} />,
          })), ...(administration ? [
            { key: "downtime_codes", label: "Downtime Codes", children: <DowntimeCodesAdmin /> },
            { key: "design_grades", label: "Design Grades", children: <DesignGradesAdmin /> },
          ] : [])]}
        />
      </Card>
    </div>
  );
}
