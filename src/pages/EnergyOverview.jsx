import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Tabs,
  Typography,
  message,
} from "antd";
import {
  DownloadOutlined,
  LeftOutlined,
  PictureOutlined,
  ReloadOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { getEnergyData, getHistoricalEnergyUsage } from "../api/energyApi";
import EnergyPowerGauge from "../components/EnergyPowerGauge";
import EnergyOverviewMiniChart from "../components/EnergyOverviewMiniChart";
import EnergyOverviewUsageChart from "../components/EnergyOverviewUsageChart";
import {
  asColomboCalendarTime,
  colomboNow,
  formatColomboApiTime,
  toApiIso,
} from "../utils/energyTime";
import "./EnergyOverview.css";

const { Title, Text } = Typography;

const PANEL = "ATS1";

const ENERGY_SOURCES = {
  ceb: {
    key: "ceb",
    label: "",
    deviceIds: [1, 3],
    description: "Power and energy supplied by CEB",
  },
  generator: {
    key: "generator",
    label: "",
    deviceIds: [2],
    description: "Power and energy supplied by Generators",
  },
};

const VIEW_OPTIONS = ["Day", "Week", "Month", "Year", "Total"];

const SUMMARY_PERIODS = [
  { key: "today", title: "Today", interval: "1h" },
  { key: "7d", title: "Last 7 Days", interval: "1d" },
  { key: "month", title: "This Month", interval: "1d" },
  { key: "year", title: "This Year", interval: "1mo" },
  { key: "3y", title: "Last 3 Years", interval: "1y" },
];

function getSummaryRequest(period, referenceTime = colomboNow()) {
  const now = asColomboCalendarTime(referenceTime);

  if (period.key === "today") {
    return {
      fromTime: toApiIso(now.startOf("day")),
      toTime: toApiIso(now),
      interval: period.interval,
    };
  }

  if (period.key === "7d") {
    return {
      // Include today plus the previous six Sri Lankan calendar days.
      fromTime: toApiIso(now.startOf("day").subtract(6, "day")),
      toTime: toApiIso(now),
      interval: period.interval,
    };
  }

  if (period.key === "month") {
    return {
      fromTime: toApiIso(now.startOf("month")),
      toTime: toApiIso(now),
      interval: period.interval,
    };
  }

  if (period.key === "year") {
    return {
      fromTime: toApiIso(now.startOf("year")),
      toTime: toApiIso(now),
      interval: period.interval,
    };
  }

  return {
    fromTime: toApiIso(now.startOf("month").subtract(35, "month")),
    toTime: toApiIso(now),
    interval: period.interval,
  };
}

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  label: colomboNow().month(index).format("MMMM"),
}));

const currentYear = colomboNow().year();
const yearOptions = Array.from({ length: 8 }, (_, index) => ({
  value: currentYear - 5 + index,
  label: String(currentYear - 5 + index),
}));

function toFiniteNumber(value) {
  // Do not treat null, undefined or an empty string as zero.
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeEnergyUsageRecord(record, index) {
  const firstEnergy = toFiniteNumber(
    record.firstEnergyKwh ?? record.first_energy_kwh ?? record.first_kwh,
  );
  const lastEnergy = toFiniteNumber(
    record.lastEnergyKwh ?? record.last_energy_kwh ?? record.last_kwh,
  );
  const returnedUsage = toFiniteNumber(
    record.energyUsageKwh ?? record.energy_usage_kwh ?? record.usage_kwh,
  );

  // The Node-RED endpoint already calculates interval consumption correctly.
  // Use that value first. Only derive the difference as a fallback when both
  // cumulative readings are genuinely available.
  const fallbackUsage =
    firstEnergy !== null && lastEnergy !== null
      ? Math.max(0, lastEnergy - firstEnergy)
      : 0;

  return {
    key:
      record._id ||
      record.id ||
      `${record.intervalStart || record.interval_start || record._start}-${index}`,
    panel: record.panel,
    device_id: Number(record.device_id),
    intervalStart:
      record.intervalStart || record.interval_start || record._start,
    intervalEnd: record.intervalEnd || record.interval_end || record._stop,
    firstEnergyKwh: firstEnergy,
    lastEnergyKwh: lastEnergy,
    energyUsageKwh:
      returnedUsage !== null ? Math.max(0, returnedUsage) : fallbackUsage,
  };
}

function extractUsageRecords(result) {
  const raw = Array.isArray(result)
    ? result
    : result?.data || result?.records || [];

  return raw
    .map(normalizeEnergyUsageRecord)
    .filter((record) => record.intervalStart)
    .sort(
      (a, b) =>
        new Date(a.intervalStart).getTime() -
        new Date(b.intervalStart).getTime(),
    );
}

function getViewRequest(view, anchor) {
  const selected = asColomboCalendarTime(anchor);

  if (view === "Day") {
    return {
      fromTime: toApiIso(selected.startOf("day")),
      toTime: toApiIso(selected.endOf("day")),
      interval: "1h",
      caption: selected.format("DD MMMM YYYY"),
    };
  }

  if (view === "Week") {
    const start = selected.startOf("week");
    const end = selected.endOf("week");
    return {
      fromTime: toApiIso(start),
      toTime: toApiIso(end),
      interval: "1d",
      caption: `${start.format("DD MMM")} – ${end.format("DD MMM YYYY")}`,
    };
  }

  if (view === "Month") {
    return {
      fromTime: toApiIso(selected.startOf("month")),
      toTime: toApiIso(selected.endOf("month")),
      interval: "1d",
      caption: selected.format("MMMM YYYY"),
    };
  }

  if (view === "Year") {
    return {
      fromTime: toApiIso(selected.startOf("year")),
      toTime: toApiIso(selected.endOf("year")),
      interval: "1y",
      caption: selected.format("YYYY"),
    };
  }

  const end = colomboNow().endOf("day");
  const start = end.subtract(3, "year").startOf("month");
  return {
    fromTime: toApiIso(start),
    toTime: toApiIso(end),
    interval: "1y",
    caption: `Last 3 Years`,
  };
}

function moveAnchor(view, anchor, direction) {
  const selected = asColomboCalendarTime(anchor);
  if (view === "Day") return selected.add(direction, "day");
  if (view === "Week") return selected.add(direction, "week");
  if (view === "Month") return selected.add(direction, "month");
  if (view === "Year") return selected.add(direction, "year");
  return selected;
}

export default function EnergyOverview() {
  const [activeSourceKey, setActiveSourceKey] = useState("ceb");
  const activeSource = ENERGY_SOURCES[activeSourceKey];
  const activeDeviceIds = activeSource.deviceIds;
  const activeDeviceLabel =
    activeDeviceIds.length > 1
      ? `Devices ${activeDeviceIds.join(" + ")}`
      : `Device ${activeDeviceIds[0]}`;

  const [liveData, setLiveData] = useState(null);
  const [liveError, setLiveError] = useState("");
  const [liveLoading, setLiveLoading] = useState(true);

  const [summaryData, setSummaryData] = useState({});
  const [summaryLoading, setSummaryLoading] = useState(() =>
    Object.fromEntries(SUMMARY_PERIODS.map((period) => [period.key, true])),
  );
  const [summaryErrors, setSummaryErrors] = useState({});

  const [view, setView] = useState("Month");
  const [anchorDate, setAnchorDate] = useState(colomboNow());
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState("");
  const chartRef = useRef(null);

  const viewRequest = useMemo(
    () => getViewRequest(view, anchorDate),
    [anchorDate, view],
  );

  const loadLiveData = useCallback(async () => {
    setLiveLoading(true);
    setLiveError("");

    try {
      const results = await Promise.all(
        activeDeviceIds.map((deviceId) =>
          getEnergyData({ panel: PANEL, deviceId }),
        ),
      );

      const activeKw = results.reduce(
        (sum, item) =>
          sum + Number(item?.power?.active_kw ?? item?.power_active_kw ?? 0),
        0,
      );

      const allOnline = results.every((item) => {
        const status = String(item?.status || "").toUpperCase();
        return item && !["OFFLINE", "ERROR", "FAULT"].includes(status);
      });

      setLiveData({
        power: { active_kw: activeKw },
        status: allOnline ? "OK" : "OFFLINE",
      });
    } catch (error) {
      setLiveData(null);
      setLiveError(
        error?.message ||
          `Unable to load ${activeSource.label.toLowerCase()} live power data.`,
      );
    } finally {
      setLiveLoading(false);
    }
  }, [activeDeviceIds, activeSource.label]);

  const loadSummaryPeriod = useCallback(
    async (period, referenceTime) => {
      setSummaryLoading((current) => ({ ...current, [period.key]: true }));
      setSummaryErrors((current) => ({ ...current, [period.key]: "" }));

      try {
        const request = getSummaryRequest(
          period,
          referenceTime || colomboNow(),
        );
        const result = await getHistoricalEnergyUsage({
          deviceIds: activeDeviceIds,
          fromTime: request.fromTime,
          toTime: request.toTime,
          interval: request.interval,
        });

        setSummaryData((current) => ({
          ...current,
          [period.key]: extractUsageRecords(result),
        }));
      } catch (error) {
        setSummaryData((current) => ({ ...current, [period.key]: [] }));
        setSummaryErrors((current) => ({
          ...current,
          [period.key]:
            error?.response?.data?.message ||
            error?.message ||
            `Unable to load ${period.title} energy data.`,
        }));
      } finally {
        setSummaryLoading((current) => ({ ...current, [period.key]: false }));
      }
    },
    [activeDeviceIds],
  );

  const loadSummaryData = useCallback(() => {
    const end = colomboNow();
    SUMMARY_PERIODS.forEach((period) => {
      loadSummaryPeriod(period, end);
    });
  }, [loadSummaryPeriod]);

  const loadMainChart = useCallback(async () => {
    setChartLoading(true);
    setChartError("");

    try {
      const result = await getHistoricalEnergyUsage({
        deviceIds: activeDeviceIds,
        fromTime: viewRequest.fromTime,
        toTime: viewRequest.toTime,
        interval: viewRequest.interval,
      });

      setChartData(extractUsageRecords(result));
    } catch (error) {
      setChartData([]);
      setChartError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to load energy usage data.",
      );
    } finally {
      setChartLoading(false);
    }
  }, [activeDeviceIds, viewRequest]);

  useEffect(() => {
    const initialTimer = window.setTimeout(loadLiveData, 0);
    const refreshTimer = window.setInterval(loadLiveData, 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadLiveData]);

  useEffect(() => {
    setSummaryLoading(
      Object.fromEntries(SUMMARY_PERIODS.map((period) => [period.key, true])),
    );
    setChartLoading(true);
    setLiveLoading(true);
  }, [activeSourceKey]);

  useEffect(() => {
    const initialTimer = window.setTimeout(loadSummaryData, 0);
    const refreshTimer = window.setInterval(loadSummaryData, 300000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadSummaryData]);

  useEffect(() => {
    const timer = window.setTimeout(loadMainChart, 0);
    return () => window.clearTimeout(timer);
  }, [loadMainChart]);

  const activePower = Number(
    liveData?.power?.active_kw ?? liveData?.power_active_kw ?? 0,
  );

  const liveStatus = String(liveData?.status || "").toUpperCase();
  const isLive =
    Boolean(liveData) &&
    !liveError &&
    !["OFFLINE", "ERROR", "FAULT"].includes(liveStatus);

  const gaugeMax = 2500;

  const refreshAll = () => {
    setLiveLoading(true);
    loadLiveData();
    loadSummaryData();
    loadMainChart();
  };

  const getExportBaseName = () => {
    const safeCaption = String(viewRequest.caption || view)
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return `Energy_${activeSource.label}_${view}_${safeCaption || "Data"}`;
  };

  const exportChartDataToExcel = async () => {
    if (!chartData.length) {
      message.warning("There is no chart data to export.");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Ruhanex Industrial IoT Platform";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("Energy Usage");
      worksheet.views = [{ state: "frozen", ySplit: 4 }];

      worksheet.mergeCells("A1:H1");
      worksheet.getCell("A1").value = `Energy Usage - ${activeSource.label}`;
      worksheet.getCell("A1").font = { bold: true, size: 16 };
      worksheet.getCell("A1").alignment = { horizontal: "center" };

      worksheet.mergeCells("A2:H2");
      worksheet.getCell("A2").value =
        `${view}: ${viewRequest.caption} | Time zone: Asia/Colombo (UTC+05:30) | Aggregation: ${viewRequest.interval}`;
      worksheet.getCell("A2").alignment = { horizontal: "center" };

      worksheet.getRow(4).values = [
        "No.",
        "Panel",
        "Device ID",
        "Interval Start (Sri Lanka)",
        "Interval End (Sri Lanka)",
        "First Energy (kWh)",
        "Last Energy (kWh)",
        "Energy Usage (kWh)",
      ];

      const headerRow = worksheet.getRow(4);
      headerRow.font = { bold: true };
      headerRow.alignment = { horizontal: "center", vertical: "middle" };

      chartData.forEach((record, index) => {
        worksheet.addRow([
          index + 1,
          record.panel || "Combined",
          record.device_id || activeDeviceLabel,
          formatColomboApiTime(record.intervalStart, "DD/MM/YYYY HH:mm:ss"),
          formatColomboApiTime(record.intervalEnd, "DD/MM/YYYY HH:mm:ss"),
          Number(record.firstEnergyKwh || 0),
          Number(record.lastEnergyKwh || 0),
          Number(record.energyUsageKwh || 0),
        ]);
      });

      worksheet.columns = [
        { width: 8 },
        { width: 12 },
        { width: 12 },
        { width: 25 },
        { width: 25 },
        { width: 20 },
        { width: 20 },
        { width: 20 },
      ];

      worksheet.getColumn(6).numFmt = "#,##0.00";
      worksheet.getColumn(7).numFmt = "#,##0.00";
      worksheet.getColumn(8).numFmt = "#,##0.00";

      const totalRow = worksheet.addRow([
        "",
        "",
        "",
        "",
        "",
        "",
        "Total",
        chartData.reduce(
          (sum, record) =>
            sum + Math.max(0, Number(record.energyUsageKwh) || 0),
          0,
        ),
      ]);
      totalRow.font = { bold: true };
      totalRow.getCell(8).numFmt = "#,##0.00";

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${getExportBaseName()}.xlsx`,
      );
    } catch (error) {
      console.error("Energy Excel export failed:", error);
      message.error("Unable to export the chart data to Excel.");
    }
  };

  const saveChartAsImage = () => {
    if (!chartData.length) {
      message.warning("There is no chart to save.");
      return;
    }

    try {
      const chartInstance = chartRef.current?.getEchartsInstance?.();
      if (!chartInstance) {
        message.error("Chart is not ready yet.");
        return;
      }

      const dataUrl = chartInstance.getDataURL({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${getExportBaseName()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Energy chart image export failed:", error);
      message.error("Unable to save the chart image.");
    }
  };

  const handleViewChange = (nextView) => {
    setView(nextView);
    if (nextView !== "Total") setAnchorDate(colomboNow());
  };

  const renderPeriodControls = () => {
    if (view === "Total") {
      return <Text strong>{viewRequest.caption}</Text>;
    }

    return (
      <Space wrap size="small" className="energy-period-controls">
        <Button
          type="text"
          icon={<LeftOutlined />}
          onClick={() => setAnchorDate((value) => moveAnchor(view, value, -1))}
        />

        {view === "Day" && (
          <DatePicker
            allowClear={false}
            value={anchorDate}
            onChange={(value) =>
              value && setAnchorDate(asColomboCalendarTime(value))
            }
          />
        )}

        {view === "Week" && (
          <DatePicker
            picker="week"
            allowClear={false}
            value={anchorDate}
            onChange={(value) =>
              value && setAnchorDate(asColomboCalendarTime(value))
            }
          />
        )}

        {view === "Month" && (
          <>
            <Select
              style={{ width: 130 }}
              value={anchorDate.month()}
              options={monthOptions}
              onChange={(month) =>
                setAnchorDate((value) =>
                  asColomboCalendarTime(value).month(month),
                )
              }
            />
            <Select
              style={{ width: 100 }}
              value={anchorDate.year()}
              options={yearOptions}
              onChange={(year) =>
                setAnchorDate((value) =>
                  asColomboCalendarTime(value).year(year),
                )
              }
            />
          </>
        )}

        {view === "Year" && (
          <Select
            style={{ width: 110 }}
            value={anchorDate.year()}
            options={yearOptions}
            onChange={(year) =>
              setAnchorDate((value) => asColomboCalendarTime(value).year(year))
            }
          />
        )}

        <Button
          type="text"
          icon={<RightOutlined />}
          onClick={() => setAnchorDate((value) => moveAnchor(view, value, 1))}
        />
      </Space>
    );
  };

  const sourceDashboardContent = (
    <>
      {liveError && (
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message={`${activeSource.label} live power unavailable`}
          description={liveError}
        />
      )}

      <Card className="energy-overview-top-card" bordered={false}>
        <Row gutter={[0, 22]} align="stretch">
          <Col xs={24} lg={7} xl={6} className="energy-current-power-column">
            <EnergyPowerGauge
              value={activePower}
              max={gaugeMax}
              loading={liveLoading}
            />
            <div className="energy-live-caption">{activeSource.label}</div>
          </Col>

          <Col xs={24} lg={17} xl={18}>
            <div className="energy-section-heading energy-overview-heading">
              Overview
            </div>

            <div className="energy-mini-grid">
              {SUMMARY_PERIODS.map((period) => (
                <EnergyOverviewMiniChart
                  key={`${activeSourceKey}-${period.key}`}
                  title={period.title}
                  interval={period.interval}
                  data={summaryData[period.key] || []}
                  loading={Boolean(summaryLoading[period.key])}
                  error={summaryErrors[period.key] || ""}
                  forceUnit={
                    period.key === "today" ||
                    period.key === "7d" ||
                    period.key === "month"
                      ? "kWh"
                      : undefined
                  }
                />
              ))}
            </div>
          </Col>
        </Row>
      </Card>

      <Card className="energy-main-card" bordered={false}>
        <div className="energy-view-tabs">
          <Segmented
            block
            value={view}
            options={VIEW_OPTIONS}
            onChange={handleViewChange}
          />
        </div>

        <div className="energy-chart-toolbar">
          <div className="energy-toolbar-left">
            <Text type="secondary">Aggregation: {viewRequest.interval}</Text>
          </div>

          <div className="energy-toolbar-center">{renderPeriodControls()}</div>

          <div className="energy-toolbar-actions">
            <Space wrap size="small">
              <Button
                icon={<DownloadOutlined />}
                onClick={exportChartDataToExcel}
                disabled={chartLoading || !chartData.length}
              >
                Excel
              </Button>

              <Button
                icon={<PictureOutlined />}
                onClick={saveChartAsImage}
                disabled={chartLoading || !chartData.length}
              >
                Save Image
              </Button>
            </Space>
          </div>
        </div>

        <div className="energy-chart-caption">{viewRequest.caption}</div>

        {chartError && (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="Unable to load energy chart"
            description={chartError}
          />
        )}

        <EnergyOverviewUsageChart
          chartRef={chartRef}
          data={chartData}
          interval={viewRequest.interval}
          view={view}
          loading={chartLoading}
        />
      </Card>
    </>
  );

  return (
    <div className="energy-overview-page">
      <div className="energy-overview-header">
        <div>
          <Title level={2} style={{ margin: 0 }}>
            Energy and Power
          </Title>
          <Text type="secondary">{activeSource.description}</Text>
        </div>

        <Space>
          <Tag color={isLive ? "success" : "default"}>
            {isLive ? "● Live" : "● Offline"}
          </Tag>

          <Button icon={<ReloadOutlined />} onClick={refreshAll}>
            Refresh
          </Button>
        </Space>
      </div>

      <Tabs
        className="energy-source-tabs"
        type="card"
        activeKey={activeSourceKey}
        destroyOnHidden={false}
        onChange={(key) => {
          setActiveSourceKey(key);

          // Clear the previous source's data when changing tabs so values from
          // CEB are never briefly displayed in Generator (or vice versa).
          setLiveData(null);
          setLiveError("");
          setLiveLoading(true);
          setSummaryData({});
          setSummaryErrors({});
          setChartData([]);
          setChartError("");
        }}
        items={[
          {
            key: "ceb",
            label: "CEB",
            children: activeSourceKey === "ceb" ? sourceDashboardContent : null,
          },
          {
            key: "generator",
            label: "Generator",
            children:
              activeSourceKey === "generator" ? sourceDashboardContent : null,
          },
        ]}
      />
    </div>
  );
}
