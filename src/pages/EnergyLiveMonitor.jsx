import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EnergyLiveChart from "../components/EnergyLiveChart";
import { getLiveEnergyData } from "../api/energyApi";
import { getDevices } from "../api/deviceApi";
import "./EnergyLiveMonitor.css";

const { Text, Title } = Typography;

const METRICS = {
  current_l1_a: { label: "L1 Current", unit: "A", decimals: 2 },
  current_l2_a: { label: "L2 Current", unit: "A", decimals: 2 },
  current_l3_a: { label: "L3 Current", unit: "A", decimals: 2 },
  current_avg_a: { label: "Average Current", unit: "A", decimals: 2 },

  voltage_l1_l2_v: { label: "L1-L2 Voltage", unit: "V", decimals: 2 },
  voltage_l2_l3_v: { label: "L2-L3 Voltage", unit: "V", decimals: 2 },
  voltage_l3_l1_v: { label: "L3-L1 Voltage", unit: "V", decimals: 2 },
  voltage_ll_avg_v: { label: "Average Line Voltage", unit: "V", decimals: 2 },

  voltage_l1_n_v: { label: "L1-N Voltage", unit: "V", decimals: 2 },
  voltage_l2_n_v: { label: "L2-N Voltage", unit: "V", decimals: 2 },
  voltage_l3_n_v: { label: "L3-N Voltage", unit: "V", decimals: 2 },
  voltage_ln_avg_v: { label: "Average Phase Voltage", unit: "V", decimals: 2 },

  active_power_kw: { label: "Active Power", unit: "kW", decimals: 3 },
  reactive_power_kvar: {
    label: "Reactive Power",
    unit: "kvar",
    decimals: 3,
  },
  apparent_power_kva: {
    label: "Apparent Power",
    unit: "kVA",
    decimals: 3,
  },
  power_factor: { label: "Power Factor", unit: "", decimals: 3 },
  frequency_hz: { label: "Frequency", unit: "Hz", decimals: 2 },
};

const RANGE_OPTIONS = [
  { label: "Last 1 minute", value: "1m" },
  { label: "Last 5 minutes", value: "5m" },
  { label: "Last 15 minutes", value: "15m" },
  { label: "Last 30 minutes", value: "30m" },
  { label: "Last 1 hour", value: "1h" },
  { label: "Last 3 hours", value: "3h" },
  { label: "Last 6 hours", value: "6h" },
  { label: "Last 12 hours", value: "12h" },
  { label: "Last 24 hours", value: "24h" },
];

const REFRESH_OPTIONS = [
  { label: "2 seconds", value: 2 },
  { label: "5 seconds", value: 5 },
  { label: "10 seconds", value: 10 },
  { label: "30 seconds", value: 30 },
  { label: "Off", value: 0 },
];

const RANGE_MS = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
};

const FALLBACK_METERS = [
  { key: "ATS1::1", panel: "ATS1", deviceId: "1", label: "ATS Panel" },
  { key: "ATS1::2", panel: "ATS1", deviceId: "2", label: "ATS Generator" },
  { key: "ATS1::3", panel: "ATS1", deviceId: "3", label: "MSB Panel" },
  { key: "ATS1::4", panel: "ATS1", deviceId: "4", label: "MSB Generator" },
];

const STALE_AFTER_MS = 15000;

function normalizeDevices(result) {
  const payload = result?.devices ?? result?.data ?? result ?? {};

  const devices = Array.isArray(payload)
    ? payload
    : Object.entries(payload || {}).map(([key, value]) => ({
        ...value,
        key,
        deviceId: value?.deviceId || key,
      }));

  const meters = [];

  for (const device of devices) {
    if (device?.deviceType !== "energy_gateway" || device?.enabled === false) {
      continue;
    }

    for (const slave of device.slaves || []) {
      if (slave?.enabled === false) continue;

      const panel = String(slave.panelId || device.location || "").trim();

      const deviceId = String(slave.slaveId ?? "").trim();

      if (!panel || !deviceId) continue;

      meters.push({
        key: `${panel}::${deviceId}`,
        panel,
        deviceId,
        label:
          String(slave.deviceLabel || slave.panelLabel || "").trim() ||
          `${panel} Device ${deviceId}`,
      });
    }
  }

  return meters;
}

function mergeSamples(existing, incoming, range) {
  const map = new Map();

  for (const row of [...existing, ...incoming]) {
    if (!row?.timestamp) continue;

    const key = `${row.panel}::${row.device_id}::${row.timestamp}`;
    map.set(key, row);
  }

  const cutoff = Date.now() - (RANGE_MS[range] || RANGE_MS["5m"]);

  return Array.from(map.values())
    .filter((row) => {
      const time = new Date(row.timestamp).getTime();
      return Number.isFinite(time) && time >= cutoff;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
}

function getLatestByMeter(data, metric) {
  const latest = new Map();

  for (const row of data) {
    const value = Number(row?.[metric]);
    const timestampMs = new Date(row?.timestamp).getTime();

    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) {
      continue;
    }

    const key = `${row.panel}::${row.device_id}`;
    const current = latest.get(key);

    if (!current || timestampMs > current.timestampMs) {
      latest.set(key, {
        value,
        timestamp: row.timestamp,
        timestampMs,
      });
    }
  }

  return latest;
}

export default function EnergyLiveMonitor() {
  const [availableMeters, setAvailableMeters] = useState([]);
  const [selectedMeterKeys, setSelectedMeterKeys] = useState([]);

  const [metric, setMetric] = useState("active_power_kw");
  const [range, setRange] = useState("5m");
  const [refreshSeconds, setRefreshSeconds] = useState(5);
  const [liveEnabled, setLiveEnabled] = useState(true);

  const [data, setData] = useState([]);
  const [metersLoading, setMetersLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const [error, setError] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState(null);

  const lastTimestampRef = useRef(null);
  const latestRequestIdRef = useRef(0);
  const incrementalInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadMeters() {
      setMetersLoading(true);

      try {
        const result = await getDevices();
        const configuredMeters = normalizeDevices(result);

        if (!active) return;

        const finalMeters =
          configuredMeters.length > 0 ? configuredMeters : FALLBACK_METERS;

        setAvailableMeters(finalMeters);

        setSelectedMeterKeys((previous) => {
          const valid = previous.filter((key) =>
            finalMeters.some((meter) => meter.key === key),
          );

          return valid.length > 0 ? valid : [finalMeters[0].key];
        });
      } catch (err) {
        console.warn(
          "Unable to load configured energy meters; using fallback list.",
          err,
        );

        if (!active) return;

        setAvailableMeters(FALLBACK_METERS);
        setSelectedMeterKeys([FALLBACK_METERS[0].key]);
      } finally {
        if (active) {
          setMetersLoading(false);
        }
      }
    }

    loadMeters();

    return () => {
      active = false;
      latestRequestIdRef.current += 1;
    };
  }, []);

  const selectedMeters = useMemo(
    () =>
      availableMeters.filter((meter) => selectedMeterKeys.includes(meter.key)),
    [availableMeters, selectedMeterKeys],
  );

  const selectedMeterSignature = useMemo(
    () => selectedMeterKeys.join("|"),
    [selectedMeterKeys],
  );

  const metricInfo = METRICS[metric];

  const rangeLabel = useMemo(
    () =>
      RANGE_OPTIONS.find((option) => option.value === range)?.label || range,
    [range],
  );

  const loadData = useCallback(
    async ({ forceFull = false } = {}) => {
      if (metersLoading || selectedMeters.length === 0) {
        return;
      }

      if (!forceFull && incrementalInFlightRef.current) {
        return;
      }

      if (!forceFull) {
        incrementalInFlightRef.current = true;
      }

      const requestId = ++latestRequestIdRef.current;

      if (forceFull) {
        lastTimestampRef.current = null;
        setInitialLoadComplete(false);
      }

      setLoading(true);

      try {
        const after =
          !forceFull && lastTimestampRef.current
            ? lastTimestampRef.current
            : undefined;

        const result = await getLiveEnergyData({
          meters: selectedMeters,
          metric,
          range,
          after,
        });

        // Ignore a response if a newer request was started.
        if (requestId !== latestRequestIdRef.current) {
          return;
        }

        if (result?.success === false) {
          throw new Error(result.error || "Unable to load live energy data.");
        }

        const incoming = Array.isArray(result?.data) ? result.data : [];

        setData((previous) => {
          const base = forceFull ? [] : previous;
          return mergeSamples(base, incoming, range);
        });

        if (incoming.length > 0) {
          const newest = incoming.reduce((latest, row) => {
            const timestampMs = new Date(row?.timestamp).getTime();

            return Number.isFinite(timestampMs) && timestampMs > latest
              ? timestampMs
              : latest;
          }, 0);

          if (newest > 0) {
            lastTimestampRef.current = new Date(newest).toISOString();
          }
        }

        setLastRefreshAt(new Date());
        setError("");
      } catch (err) {
        if (requestId === latestRequestIdRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load live energy data.",
          );
        }
      } finally {
        if (!forceFull) {
          incrementalInFlightRef.current = false;
        }

        if (requestId === latestRequestIdRef.current) {
          setLoading(false);

          if (forceFull) {
            setInitialLoadComplete(true);
          }
        }
      }
    },
    [metersLoading, selectedMeters, metric, range],
  );

  // Full reload whenever the selected meter(s), metric or range changes.
  useEffect(() => {
    if (metersLoading || selectedMeters.length === 0) {
      return;
    }

    lastTimestampRef.current = null;
    setData([]);
    setInitialLoadComplete(false);
    setError("");

    loadData({ forceFull: true });
  }, [
    metersLoading,
    metric,
    range,
    selectedMeterSignature,
    selectedMeters.length,
    loadData,
  ]);

  // Incremental live updates only start after the first full load finishes.
  useEffect(() => {
    if (
      metersLoading ||
      !initialLoadComplete ||
      !liveEnabled ||
      refreshSeconds <= 0 ||
      selectedMeters.length === 0
    ) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      loadData({ forceFull: false });
    }, refreshSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [
    metersLoading,
    initialLoadComplete,
    liveEnabled,
    refreshSeconds,
    selectedMeters.length,
    loadData,
  ]);

  const latestByMeter = useMemo(
    () => getLatestByMeter(data, metric),
    [data, metric],
  );

  return (
    <div className="energy-live-page">
      <div className="energy-live-header">
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Live Energy Monitor
          </Title>

          <Text type="secondary">
            Live electrical trends with selectable meters and measurements
          </Text>
        </div>

        <div className="energy-live-status-row">
          <Tag
            color={liveEnabled && refreshSeconds > 0 ? "success" : "default"}
          >
            {liveEnabled && refreshSeconds > 0 ? "LIVE" : "PAUSED"}
          </Tag>

          <Switch
            checked={liveEnabled}
            checkedChildren="Live"
            unCheckedChildren="Paused"
            onChange={setLiveEnabled}
          />

          {/* <Button
            icon={
              liveEnabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />
            }
            onClick={() => setLiveEnabled((value) => !value)}
          >
            {liveEnabled ? "Pause" : "Resume"}
          </Button> */}
        </div>
      </div>

      {error ? (
        <Alert
          type="warning"
          showIcon
          message="Live energy refresh failed"
          description={error}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card className="energy-live-controls">
        <Row gutter={[16, 16]} align="bottom">
          <Col xs={24} lg={8}>
            <Text className="energy-live-control-label">Energy meters</Text>

            <Select
              mode="multiple"
              maxTagCount="responsive"
              loading={metersLoading}
              disabled={metersLoading}
              style={{ width: "100%" }}
              value={selectedMeterKeys}
              options={availableMeters.map((meter) => ({
                label: `${meter.label} (${meter.panel}:${meter.deviceId})`,
                value: meter.key,
              }))}
              onChange={(value) => {
                if (value.length > 0) {
                  setSelectedMeterKeys(value);
                }
              }}
            />
          </Col>

          <Col xs={24} sm={12} lg={5}>
            <Text className="energy-live-control-label">Measurement</Text>

            <Select
              style={{ width: "100%" }}
              value={metric}
              options={Object.entries(METRICS).map(([value, config]) => ({
                value,
                label: `${config.label}${
                  config.unit ? ` (${config.unit})` : ""
                }`,
              }))}
              onChange={setMetric}
            />
          </Col>

          <Col xs={12} sm={6} lg={4}>
            <Text className="energy-live-control-label">Time range</Text>

            <Select
              style={{ width: "100%" }}
              value={range}
              options={RANGE_OPTIONS}
              onChange={setRange}
            />
          </Col>

          <Col xs={12} sm={6} lg={4}>
            <Text className="energy-live-control-label">Auto refresh</Text>

            <Select
              style={{ width: "100%" }}
              value={refreshSeconds}
              options={REFRESH_OPTIONS}
              onChange={setRefreshSeconds}
            />
          </Col>

          <Col xs={24} lg={3}>
            <Button
              block
              icon={<ReloadOutlined />}
              loading={loading}
              disabled={metersLoading || selectedMeters.length === 0}
              onClick={() => loadData({ forceFull: true })}
            >
              Refresh
            </Button>
          </Col>
        </Row>

        <div style={{ marginTop: 12 }}>
          <Text type="secondary">
            {metersLoading
              ? "Loading meter configuration..."
              : lastRefreshAt
                ? `Last refreshed ${lastRefreshAt.toLocaleTimeString()}`
                : "Waiting for first refresh"}
          </Text>
        </div>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {selectedMeters.map((meter) => {
          const latest = latestByMeter.get(meter.key);

          const ageMs = latest ? Date.now() - latest.timestampMs : Infinity;

          const stale = ageMs > STALE_AFTER_MS;

          return (
            <Col key={meter.key} xs={24} sm={12} xl={6}>
              <Card className="energy-live-latest-card" size="small">
                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                  <Text strong className="energy-live-meter-label">
                    {meter.label}
                  </Text>

                  <Text type="secondary">
                    {meter.panel}:{meter.deviceId}
                  </Text>

                  <Title level={3} className="energy-live-latest-value">
                    {latest
                      ? latest.value.toLocaleString("en-US", {
                          minimumFractionDigits: metricInfo.decimals,
                          maximumFractionDigits: metricInfo.decimals,
                        })
                      : "-"}{" "}
                    <Text type="secondary" style={{ fontSize: 14 }}>
                      {metricInfo.unit}
                    </Text>
                  </Title>

                  <Tag color={latest && !stale ? "success" : "warning"}>
                    {latest && !stale ? "Fresh" : "Stale / No data"}
                  </Tag>

                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {latest
                      ? new Date(latest.timestamp).toLocaleString()
                      : "No sample received"}
                  </Text>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card className="energy-live-chart-card">
        <EnergyLiveChart
          data={data}
          selectedMeters={selectedMeters}
          metric={metric}
          metricConfig={metricInfo}
          loading={loading}
          initialLoadComplete={initialLoadComplete}
          rangeLabel={rangeLabel}
          paused={!liveEnabled || refreshSeconds === 0}
        />
      </Card>
    </div>
  );
}
