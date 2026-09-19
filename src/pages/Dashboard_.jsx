import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Card,
  Col,
  Row,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";

import {
  getOverviewEnergyUsage,
  getOverviewDailyLineSummary,
  getOverviewMonthlySummary,
} from "../api/dashboardApi";
import { PRODUCTION_LINES } from "../utils/constants";
import { getCurrentShiftTimeRange } from "../utils/shiftUtils";
import "./Dashboard.css";

const { Title, Text } = Typography;

const SORTED_LINES = ["Keda 1", "Keda 2", "Keda 3"];
const GREEN_LINES = ["Glaze Line 1", "Glaze Line 2", "Glaze Line 3"];

const LINE_ROUTES = {
  "Keda 1": "/keda1",
  "Glaze Line 1": "/gl1",
};

const LINE_ACCENTS = {
  "Keda 1": "#2563eb",
  "Keda 2": "#4f46e5",
  "Keda 3": "#7c3aed",
  "Glaze Line 1": "#059669",
  "Glaze Line 2": "#0d9488",
  "Glaze Line 3": "#0891b2",
};

function number(value, digits = 1) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();
  return ["running", "online", "run"].includes(status) ? "Running" : "Stopped";
}

function monthlyFor(data, line) {
  return data?.monthly?.[line] || {};
}

function liveFor(data, line) {
  return data?.live?.[line] || {};
}

function extractEnergyUsage(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.records)
        ? payload.records
        : [];

  return rows.reduce((sum, row) => {
    const direct = Number(
      row?.energyUsageKwh ?? row?.energy_usage_kwh ?? row?.usage_kwh,
    );

    if (Number.isFinite(direct)) {
      return sum + Math.max(0, direct);
    }

    const first = Number(
      row?.firstEnergyKwh ?? row?.first_energy_kwh ?? row?.first_kwh,
    );
    const last = Number(
      row?.lastEnergyKwh ?? row?.last_energy_kwh ?? row?.last_kwh,
    );

    if (Number.isFinite(first) && Number.isFinite(last)) {
      return sum + Math.max(0, last - first);
    }

    return sum;
  }, 0);
}

function colomboStartOfDayIso() {
  const now = dayjs();
  return now.startOf("day").toISOString();
}

function colomboStartOfMonthIso() {
  const now = dayjs();
  return now.startOf("month").toISOString();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const shiftInfo = getCurrentShiftTimeRange();
  const currentShift = shiftInfo.currentShift;
  const shiftDate = useMemo(() => {
    const from = new Date(shiftInfo.currentShiftFromTime);
    return dayjs(from).format("YYYY-MM-DD");
  }, [shiftInfo.currentShiftFromTime]);

  const month = dayjs().format("YYYY-MM");

  const loadLiveData = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      else setRefreshing(true);

      const lines = [...SORTED_LINES, ...GREEN_LINES];

      console.log("[Overview] Loading daily line summaries", {
        date: shiftDate,
        lines,
      });

      const results = await Promise.allSettled(
        lines.map((line) => {
          const params = {
            line,
            date: shiftDate,
          };

          console.log("[Overview] Daily summary request", params);

          return getOverviewDailyLineSummary(params);
        }),
      );

      results.forEach((result, index) => {
        const line = lines[index];

        if (result.status === "fulfilled") {
          console.log(
            `[Overview] Daily summary response - ${line}`,
            result.value,
          );
        } else {
          console.error(`[Overview] Daily summary failed - ${line}`, {
            request: {
              line,
              date: shiftDate,
            },
            error: result.reason,
            response: result.reason?.response?.data,
            status: result.reason?.response?.status,
          });
        }
      });

      setData((previous) => {
        const next = {
          ...(previous || {}),
          live: { ...(previous?.live || {}) },
          monthly: { ...(previous?.monthly || {}) },
          energy: { ...(previous?.energy || {}) },
        };

        results.forEach((result, index) => {
          const line = [...SORTED_LINES, ...GREEN_LINES][index];
          if (result.status === "fulfilled") {
            next.live[line] = result.value;
          }
        });

        return next;
      });

      const failed = results.filter((result) => result.status === "rejected");
      if (failed.length) {
        setError(
          `${failed.length} daily line summary request${failed.length > 1 ? "s" : ""} failed. Other dashboard data is still available.`,
        );
      } else {
        setError("");
      }

      setLoading(false);
      setRefreshing(false);
    },
    [shiftDate],
  );

  const loadMonthlyData = useCallback(async () => {
    const lines = [...SORTED_LINES, ...GREEN_LINES];

    console.log("[Overview] Loading monthly summaries", { month, lines });

    const results = await Promise.allSettled(
      lines.map((line) => getOverviewMonthlySummary(line, month)),
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(`[Overview] Monthly summary failed - ${lines[index]}`, {
          month,
          error: result.reason,
          response: result.reason?.response?.data,
          status: result.reason?.response?.status,
        });
      }
    });

    setData((previous) => {
      const next = {
        ...(previous || {}),
        live: { ...(previous?.live || {}) },
        monthly: { ...(previous?.monthly || {}) },
        energy: { ...(previous?.energy || {}) },
      };

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          next.monthly[lines[index]] = result.value;
        }
      });

      return next;
    });
  }, [month]);

  const loadEnergyData = useCallback(async () => {
    const nowIso = dayjs().toISOString();

    console.log("[Overview] Loading energy summaries", {
      todayFrom: colomboStartOfDayIso(),
      monthFrom: colomboStartOfMonthIso(),
      to: nowIso,
    });

    const [todayResult, monthResult] = await Promise.allSettled([
      getOverviewEnergyUsage({
        fromTime: colomboStartOfDayIso(),
        toTime: nowIso,
        interval: "1h",
      }),
      getOverviewEnergyUsage({
        fromTime: colomboStartOfMonthIso(),
        toTime: nowIso,
        interval: "1d",
      }),
    ]);

    if (todayResult.status === "rejected") {
      console.error("[Overview] Today energy request failed", {
        error: todayResult.reason,
        response: todayResult.reason?.response?.data,
        status: todayResult.reason?.response?.status,
      });
    }

    if (monthResult.status === "rejected") {
      console.error("[Overview] Monthly energy request failed", {
        error: monthResult.reason,
        response: monthResult.reason?.response?.data,
        status: monthResult.reason?.response?.status,
      });
    }

    setData((previous) => ({
      ...(previous || {}),
      live: { ...(previous?.live || {}) },
      monthly: { ...(previous?.monthly || {}) },
      energy: {
        ...(previous?.energy || {}),
        ...(todayResult.status === "fulfilled"
          ? { todayKwh: extractEnergyUsage(todayResult.value) }
          : {}),
        ...(monthResult.status === "fulfilled"
          ? { monthKwh: extractEnergyUsage(monthResult.value) }
          : {}),
      },
    }));
  }, []);

  useEffect(() => {
    loadLiveData(true);
    loadMonthlyData();
    loadEnergyData();

    // Live cards need frequent updates. Monthly/energy data do not.
    const liveTimer = window.setInterval(() => loadLiveData(false), 10000);
    const energyTimer = window.setInterval(loadEnergyData, 60000);
    const monthlyTimer = window.setInterval(loadMonthlyData, 300000);

    return () => {
      window.clearInterval(liveTimer);
      window.clearInterval(energyTimer);
      window.clearInterval(monthlyTimer);
    };
  }, [loadEnergyData, loadLiveData, loadMonthlyData]);

  const greenChart = useMemo(
    () => ({
      animationDuration: 500,
      color: ["#059669", "#0d9488", "#0891b2"],
      grid: { left: 20, right: 18, top: 42, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v) => `${number(v, 1)} m²`,
      },
      legend: { top: 4, itemWidth: 10, itemHeight: 10 },
      xAxis: {
        type: "category",
        data: GREEN_LINES.map((line) => line.replace("Glaze ", "")),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#dbe3ee" } },
      },
      yAxis: {
        type: "value",
        name: "Production (m²)",
        nameGap: 18,
        splitLine: { lineStyle: { color: "#edf2f7" } },
      },
      series: [
        {
          name: "Green Tile Production",
          type: "bar",
          barMaxWidth: 52,
          itemStyle: { borderRadius: [7, 7, 0, 0] },
          data: GREEN_LINES.map((line) =>
            Number(monthlyFor(data, line)?.totalProduction || 0),
          ),
          label: {
            show: true,
            position: "top",
            formatter: (p) => number(p.value, 0),
            fontSize: 11,
          },
        },
      ],
    }),
    [data],
  );

  const sortedChart = useMemo(
    () => ({
      animationDuration: 500,
      color: ["#2563eb", "#4f46e5", "#7c3aed"],
      grid: { left: 20, right: 18, top: 42, bottom: 28, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (v) => `${number(v, 1)} m²`,
      },
      xAxis: {
        type: "category",
        data: SORTED_LINES,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#dbe3ee" } },
      },
      yAxis: {
        type: "value",
        name: "Production (m²)",
        nameGap: 18,
        splitLine: { lineStyle: { color: "#edf2f7" } },
      },
      series: [
        {
          name: "Sorted Tile Production",
          type: "bar",
          barMaxWidth: 52,
          itemStyle: { borderRadius: [7, 7, 0, 0] },
          data: SORTED_LINES.map((line) => ({
            value: Number(monthlyFor(data, line)?.totalProduction || 0),
            itemStyle: { color: LINE_ACCENTS[line] },
          })),
          label: {
            show: true,
            position: "top",
            formatter: (p) => number(p.value, 0),
            fontSize: 11,
          },
        },
      ],
    }),
    [data],
  );

  const sortedSizeTotals = useMemo(() => {
    const totals = new Map();

    SORTED_LINES.forEach((line) => {
      (monthlyFor(data, line)?.sizeTotals || []).forEach((row) => {
        const size = String(row?.size || row?.tileSize || "").trim();
        const production = Number(row?.production || 0);
        if (!size || !Number.isFinite(production) || production <= 0) return;
        totals.set(size, (totals.get(size) || 0) + production);
      });
    });

    return [...totals.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const sizePie = useMemo(
    () => ({
      animationDuration: 500,
      tooltip: {
        trigger: "item",
        formatter: (p) =>
          `${p.name}<br/><strong>${number(p.value, 1)} m²</strong> (${number(p.percent, 1)}%)`,
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        right: 4,
        top: "middle",
        itemWidth: 10,
        itemHeight: 10,
      },
      series: [
        {
          name: "Production by Size",
          type: "pie",
          radius: ["48%", "72%"],
          center: ["38%", "52%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 5,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 700,
              formatter: "{b}\n{d}%",
            },
          },
          data: sortedSizeTotals,
        },
      ],
    }),
    [sortedSizeTotals],
  );

  const sortedTotal = SORTED_LINES.reduce(
    (sum, line) => sum + Number(monthlyFor(data, line)?.totalProduction || 0),
    0,
  );
  const greenTotal = GREEN_LINES.reduce(
    (sum, line) => sum + Number(monthlyFor(data, line)?.totalProduction || 0),
    0,
  );

  if (loading) {
    return (
      <div className="overview-dashboard">
        <Skeleton active paragraph={{ rows: 12 }} />
      </div>
    );
  }

  return (
    <div className="overview-dashboard">
      <div className="overview-hero">
        <div>
          <div className="overview-eyebrow">
            <DashboardOutlined /> Factory Overview
          </div>
          <Title level={2}>Overview</Title>
          <Text type="secondary">
            Daily production status and month-to-date factory performance
          </Text>
        </div>

        <div className="overview-context">
          <div className="overview-context-item">
            <CalendarOutlined />
            <div>
              <span>Shift Date</span>
              <strong>{dayjs(shiftDate).format("DD MMM YYYY")}</strong>
            </div>
          </div>
          <div className="overview-context-item">
            <span className="overview-shift-dot" />
            <div>
              <span>Current Shift</span>
              <strong>{currentShift}</strong>
            </div>
          </div>
          {refreshing ? <Tag color="processing">Refreshing</Tag> : null}
        </div>
      </div>

      {error ? (
        <Alert
          type="warning"
          showIcon
          message="Some overview data could not be refreshed"
          description={error}
          className="overview-alert"
        />
      ) : null}

      <div className="overview-section-heading">
        <div>
          <Title level={4}>Production Lines</Title>
          <Text type="secondary">
            Production-day totals and live line state
          </Text>
        </div>
      </div>

      <Row gutter={[10, 10]}>
        {PRODUCTION_LINES.filter((line) =>
          [...SORTED_LINES, ...GREEN_LINES].includes(line),
        ).map((line) => {
          const live = liveFor(data, line);
          const status = normalizeStatus(
            live?.shiftStatus || live?.lineStatus || live?.status,
          );
          const running = status === "Running";

          return (
            <Col xs={24} sm={12} lg={8} xl={8} key={line}>
              <Card
                className={`overview-line-card ${LINE_ROUTES[line] ? "overview-line-card-clickable" : ""}`}
                onClick={() => {
                  const route = LINE_ROUTES[line];
                  if (route) navigate(route);
                }}
                role={LINE_ROUTES[line] ? "link" : undefined}
                tabIndex={LINE_ROUTES[line] ? 0 : undefined}
                onKeyDown={(event) => {
                  if (
                    LINE_ROUTES[line] &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    navigate(LINE_ROUTES[line]);
                  }
                }}
              >
                <div
                  className="overview-line-accent"
                  style={{ background: LINE_ACCENTS[line] }}
                />
                <div className="overview-line-top">
                  <div>
                    <Text type="secondary" className="overview-line-label">
                      Production Line
                    </Text>
                    <Title level={4}>{line}</Title>
                  </div>
                  <Badge
                    status={running ? "success" : "error"}
                    text={status}
                    className="overview-line-status"
                  />
                </div>

                <div className="overview-production-value">
                  {number(live?.dailyProductionSqm, 1)}
                  <span>m²</span>
                </div>
                <div className="overview-line-meta">
                  <span>
                    Size <strong>{live?.tileSize || live?.size || "—"}</strong>
                  </span>
                  <span
                    className="overview-line-design"
                    title={live?.designCode || "—"}
                  >
                    Design <strong>{live?.designCode || "—"}</strong>
                  </span>
                </div>

                <div className="overview-line-footer">
                  <span>{number(live?.dailyTileCount, 0)} tiles</span>
                  <span>
                    Downtime{" "}
                    <strong>{number(live?.dailyDowntimeMinutes, 1)} min</strong>
                  </span>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Row gutter={[10, 10]} className="overview-energy-row">
        <Col xs={24} md={12}>
          <Card className="overview-energy-card">
            <div className="overview-energy-icon">
              <ThunderboltOutlined />
            </div>
            <div>
              <Text type="secondary">Energy Consumption Today</Text>
              <Statistic
                value={Number(data?.energy?.todayKwh || 0)}
                precision={1}
                suffix="kWh"
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card className="overview-energy-card">
            <div className="overview-energy-icon">
              <ThunderboltOutlined />
            </div>
            <div>
              <Text type="secondary">
                Energy Consumption — {dayjs().format("MMMM")}
              </Text>
              <Statistic
                value={Number(data?.energy?.monthKwh || 0)}
                precision={1}
                suffix="kWh"
              />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[10, 10]} className="overview-chart-row">
        <Col xs={24} xl={12}>
          <Card
            className="overview-chart-card"
            title="Monthly Green Tile Production"
            extra={<Text strong>{number(greenTotal, 0)} m²</Text>}
          >
            <ReactECharts option={greenChart} style={{ height: 255 }} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            className="overview-chart-card"
            title="Monthly Sorted Tile Production"
            extra={<Text strong>{number(sortedTotal, 0)} m²</Text>}
          >
            <ReactECharts option={sortedChart} style={{ height: 255 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[10, 10]} className="overview-chart-row">
        <Col xs={24} xl={10}>
          <Card
            className="overview-chart-card"
            title="Sorted Production by Tile Size"
            extra={<Text type="secondary">{dayjs().format("MMMM YYYY")}</Text>}
          >
            {sortedSizeTotals.length ? (
              <ReactECharts option={sizePie} style={{ height: 260 }} />
            ) : (
              <div className="overview-empty">No size-wise production data</div>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={14}>
          <Card className="overview-chart-card" title="Month-to-Date Snapshot">
            <div className="overview-snapshot-grid">
              <div className="overview-snapshot">
                <span>Green Tile Production</span>
                <strong>{number(greenTotal, 0)} m²</strong>
                <small>Glaze Lines 1–3</small>
              </div>
              <div className="overview-snapshot">
                <span>Sorted Tile Production</span>
                <strong>{number(sortedTotal, 0)} m²</strong>
                <small>Keda Lines 1–3</small>
              </div>
              <div className="overview-snapshot">
                <span>Lines Running</span>
                <strong>
                  {
                    [...SORTED_LINES, ...GREEN_LINES].filter(
                      (line) =>
                        normalizeStatus(
                          liveFor(data, line)?.shiftStatus ||
                            liveFor(data, line)?.lineStatus ||
                            liveFor(data, line)?.status,
                        ) === "Running",
                    ).length
                  }
                  /6
                </strong>
                <small>Current status</small>
              </div>
              <div className="overview-snapshot">
                <span>Tile Sizes Produced</span>
                <strong>{sortedSizeTotals.length}</strong>
                <small>Sorted production this month</small>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
