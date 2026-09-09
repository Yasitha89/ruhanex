import { useMemo } from "react";
import { Empty, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import { formatColomboApiTime } from "../utils/energyTime";
import { getEnergyMeterKey, getEnergyMeters } from "../utils/energyMeter";
import "./DashboardCharts.css";

const DEVICE_COLORS = [
  "#1677ff",
  "#52c41a",
  "#fa8c16",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#faad14",
  "#2f54eb",
];

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getBucketKey(timestamp, interval) {
  if (!timestamp) return "";

  if (interval === "1y") {
    return formatColomboApiTime(timestamp, "YYYY");
  }

  if (interval === "1mo") {
    return formatColomboApiTime(timestamp, "YYYY-MM");
  }

  if (interval === "1d") {
    return formatColomboApiTime(timestamp, "YYYY-MM-DD");
  }

  if (interval === "6h") {
    const day = formatColomboApiTime(timestamp, "YYYY-MM-DD");
    const hour = Number(formatColomboApiTime(timestamp, "HH"));
    const bucketHour = Math.floor((Number.isFinite(hour) ? hour : 0) / 6) * 6;
    return `${day} ${String(bucketHour).padStart(2, "0")}:00`;
  }

  return formatColomboApiTime(timestamp, "YYYY-MM-DD HH");
}

function getAxisLabel(timestamp, interval) {
  if (interval === "1y") {
    return formatColomboApiTime(timestamp, "YYYY");
  }

  if (interval === "1mo") {
    return formatColomboApiTime(timestamp, "MMM YY");
  }

  if (interval === "1d") {
    return formatColomboApiTime(timestamp, "DD MMM");
  }

  return formatColomboApiTime(timestamp, "DD MMM HH:mm");
}

function getTooltipLabel(timestamp, interval) {
  if (interval === "1y") {
    return formatColomboApiTime(timestamp, "YYYY");
  }

  if (interval === "1mo") {
    return formatColomboApiTime(timestamp, "MMMM YYYY");
  }

  if (interval === "1d") {
    return formatColomboApiTime(timestamp, "DD MMMM YYYY");
  }

  return formatColomboApiTime(timestamp, "DD MMMM YYYY, HH:mm");
}

function buildStackedData(data, interval) {
  const grouped = new Map();

  for (const record of data || []) {
    if (!record?.intervalStart) continue;

    const meterKey = getEnergyMeterKey(record);

    const bucketKey = getBucketKey(record.intervalStart, interval);
    if (!bucketKey) continue;

    const value = Math.max(0, Number(record.energyUsageKwh) || 0);

    if (!grouped.has(bucketKey)) {
      grouped.set(bucketKey, {
        bucketKey,
        intervalStart: record.intervalStart,
        intervalEnd: record.intervalEnd,
        devices: {},
        total: 0,
      });
    }

    const bucket = grouped.get(bucketKey);

    bucket.devices[meterKey] =
      Number(bucket.devices[meterKey] || 0) + value;

    bucket.total += value;

    const currentEnd = new Date(bucket.intervalEnd || 0).getTime();
    const newEnd = new Date(record.intervalEnd || 0).getTime();

    if (Number.isFinite(newEnd) && newEnd > currentEnd) {
      bucket.intervalEnd = record.intervalEnd;
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) =>
      new Date(a.intervalStart).getTime() -
      new Date(b.intervalStart).getTime(),
  );
}

export default function EnergyUsageChart({
  data = [],
  loading = false,
  interval = "1h",
}) {
  const meters = useMemo(() => getEnergyMeters(data), [data]);

  const chartData = useMemo(
    () => buildStackedData(data, interval),
    [data, interval],
  );

  const option = useMemo(() => {
    const series = meters.map((meter, index) => ({
      name: meter.label,
      type: "bar",
      stack: "total-energy",
      barMaxWidth: 36,
      itemStyle: {
        color: DEVICE_COLORS[index % DEVICE_COLORS.length],
      },
      emphasis: {
        focus: "series",
      },
      data: chartData.map((bucket) =>
        Math.max(0, Number(bucket.devices?.[meter.key]) || 0),
      ),
    }));

    return {
      animationDuration: 500,
      animationEasing: "cubicOut",

      title: {
        text: "Energy Usage by Device",
        left: "center",
      },

      legend: {
        type: "scroll",
        top: 34,
        left: 20,
        right: 20,
        data: meters.map((meter) => meter.label),
      },

      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params) => {
          if (!Array.isArray(params) || !params.length) return "";

          const dataIndex = params[0]?.dataIndex;
          const bucket = chartData[dataIndex];
          if (!bucket) return "";

          const lines = [
            `<div style="font-weight:600;margin-bottom:5px">${getTooltipLabel(
              bucket.intervalStart,
              interval,
            )}</div>`,
          ];

          for (const item of params) {
            lines.push(
              `${item.marker} ${item.seriesName}: <strong>${formatNumber(
                item.value,
              )} kWh</strong>`,
            );
          }

          lines.push(
            `<div style="border-top:1px solid rgba(255,255,255,.22);margin-top:6px;padding-top:6px"><strong>Total: ${formatNumber(
              bucket.total,
            )} kWh</strong></div>`,
          );

          return lines.join("<br/>");
        },
      },

      grid: {
        top: meters.length > 1 ? 90 : 72,
        left: 74,
        right: 28,
        bottom: chartData.length > 30 ? 92 : 72,
        containLabel: true,
      },

      toolbox: {
        right: 20,
        feature: {
          dataZoom: { yAxisIndex: "none" },
          restore: {},
          saveAsImage: { name: "Energy_Usage_By_Device" },
        },
      },

      xAxis: {
        type: "category",
        data: chartData.map((bucket) =>
          getAxisLabel(bucket.intervalStart, interval),
        ),
        axisTick: { alignWithLabel: true },
        axisLabel: {
          rotate: chartData.length > 10 ? 45 : 0,
          hideOverlap: true,
        },
      },

      yAxis: {
        type: "value",
        name: "Energy (kWh)",
        min: 0,
        nameLocation: "middle",
        nameGap: 55,
        splitLine: {
          lineStyle: { type: "dashed" },
        },
        axisLabel: {
          formatter: (value) => Number(value).toLocaleString("en-US"),
        },
      },

      dataZoom:
        chartData.length > 30
          ? [
              { type: "inside", start: 0, end: 100 },
              { type: "slider", bottom: 18, height: 18 },
            ]
          : [],

      series,
    };
  }, [chartData, meters, interval]);

  if (loading) {
    return (
      <div
        style={{
          height: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div
        style={{
          height: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Empty description="No energy usage data" />
      </div>
    );
  }

  return (
    <div
      className="responsive-dashboard-chart responsive-dashboard-chart--history"
      style={{ marginTop: 24 }}
    >
      <ReactECharts
        className="responsive-dashboard-chart__canvas"
        option={option}
        notMerge
        lazyUpdate
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
