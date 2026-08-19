import { useMemo } from "react";
import { Empty, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import { formatColomboApiTime } from "../utils/energyTime";

function getAxisLabel(timestamp, interval, view) {
  if (interval === "1mo")
    return formatColomboApiTime(timestamp, view === "Total" ? "MMM YY" : "MMM");
  if (interval === "1d") return formatColomboApiTime(timestamp, "DD");
  return formatColomboApiTime(timestamp, "HH:mm");
}

function getTooltipLabel(timestamp, interval) {
  if (interval === "1mo") return formatColomboApiTime(timestamp, "MMMM YYYY");
  if (interval === "1d") return formatColomboApiTime(timestamp, "DD MMMM YYYY");
  return formatColomboApiTime(timestamp, "DD MMMM YYYY, HH:mm");
}

function getXAxisName(interval, view) {
  if (interval === "1mo") return view === "Total" ? "Month / Year" : "Month";
  if (interval === "1d") return "Date";
  return "Time (Sri Lanka)";
}

export default function EnergyOverviewUsageChart({
  chartRef,
  data = [],
  interval = "1d",
  view = "Month",
  loading = false,
}) {
  const option = useMemo(
    () => ({
      animationDuration: 650,
      animationEasing: "cubicOut",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.96)",
        borderWidth: 0,
        padding: [11, 13],
        textStyle: { color: "#fff", fontSize: 12 },
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: "rgba(22,119,255,0.07)" },
        },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : null;
          const record = data[item?.dataIndex];
          if (!record) return "";

          return [
            `<div style="font-weight:600;font-size:13px;margin-bottom:5px">${getTooltipLabel(
              record.intervalStart,
              interval,
            )}</div>`,
            `<div style="opacity:.78;margin-bottom:2px">Energy consumption</div>`,
            `<div style="font-size:16px;font-weight:700">${Number(
              record.energyUsageKwh || 0,
            ).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} kWh</div>`,
          ].join("");
        },
      },
      grid: {
        top: 34,
        left: 76,
        right: 34,
        bottom: data.length > 45 ? 86 : 72,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        name: getXAxisName(interval, view),
        nameLocation: "middle",
        nameGap: data.length > 45 ? 58 : 44,
        nameTextStyle: {
          color: "#667085",
          fontSize: 12,
          fontWeight: 500,
        },
        data: data.map((record) =>
          getAxisLabel(record.intervalStart, interval, view),
        ),
        axisTick: { alignWithLabel: true, lineStyle: { color: "#d0d5dd" } },
        axisLine: { lineStyle: { color: "#d0d5dd" } },
        axisLabel: {
          color: "#667085",
          fontSize: 11,
          hideOverlap: true,
          interval: data.length > 40 ? 2 : 0,
          margin: 12,
        },
      },
      yAxis: {
        type: "value",
        name: "Energy Consumption (kWh)",
        min: 0,
        nameLocation: "middle",
        nameGap: 58,
        nameRotate: 90,
        nameTextStyle: {
          color: "#667085",
          fontSize: 12,
          fontWeight: 500,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitNumber: 5,
        splitLine: {
          lineStyle: { color: "#eaecf0", type: "dashed" },
        },
        axisLabel: {
          color: "#667085",
          fontSize: 11,
          formatter: (value) => Number(value).toLocaleString("en-US"),
        },
      },
      dataZoom:
        data.length > 45
          ? [
              { type: "inside", start: 0, end: 100 },
              {
                type: "slider",
                height: 18,
                bottom: 8,
                borderColor: "transparent",
                backgroundColor: "#f2f4f7",
                fillerColor: "rgba(22,119,255,0.14)",
                handleStyle: { color: "#1677ff", borderColor: "#1677ff" },
                moveHandleStyle: { color: "#98a2b3" },
                dataBackground: {
                  lineStyle: { color: "#b2ddff" },
                  areaStyle: { color: "#e6f4ff" },
                },
                selectedDataBackground: {
                  lineStyle: { color: "#1677ff" },
                  areaStyle: { color: "#91caff" },
                },
              },
            ]
          : [],
      series: [
        {
          name: "Energy consumption",
          type: "bar",
          barMaxWidth: 30,
          barMinWidth: 7,
          showBackground: true,
          backgroundStyle: {
            color: "rgba(148,163,184,0.07)",
            borderRadius: [6, 6, 0, 0],
          },
          itemStyle: {
            borderRadius: [6, 6, 1, 1],
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#1677ff" },
                { offset: 1, color: "#69b1ff" },
              ],
            },
          },
          emphasis: {
            focus: "series",
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(22,119,255,0.22)",
            },
          },
          data: data.map((record) => Math.max(0, Number(record.energyUsageKwh) || 0)),
        },
      ],
    }),
    [data, interval, view],
  );

  if (loading) {
    return (
      <div className="energy-main-chart-state">
        <div className="energy-chart-loading-content">
          <Spin size="large" />
          <span>Loading energy data...</span>
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="energy-main-chart-state">
        <Empty description="No energy data for the selected period" />
      </div>
    );
  }

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      notMerge
      lazyUpdate
      style={{ height: 450, width: "100%" }}
    />
  );
}
