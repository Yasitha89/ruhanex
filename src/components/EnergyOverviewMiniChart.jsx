import { useMemo } from "react";
import { Empty, Skeleton, Tooltip as AntTooltip } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { formatColomboApiTime } from "../utils/energyTime";

function getEnergyDisplayUnit(totalKwh) {
  const total = Math.max(0, Number(totalKwh) || 0);

  if (total >= 1_000_000) {
    return { unit: "GWh", divisor: 1_000_000, decimals: 3 };
  }

  if (total >= 1_0000) {
    return { unit: "MWh", divisor: 1_000, decimals: 3 };
  }

  return { unit: "kWh", divisor: 1, decimals: 2 };
}

function convertEnergy(kwh, displayUnit) {
  return Math.max(0, Number(kwh) || 0) / displayUnit.divisor;
}

function formatConvertedEnergy(kwh, displayUnit) {
  return `${convertEnergy(kwh, displayUnit).toLocaleString("en-US", {
    maximumFractionDigits: displayUnit.decimals,
  })} ${displayUnit.unit}`;
}

function labelForInterval(timestamp, interval) {
  if (interval === "1mo") return formatColomboApiTime(timestamp, "MMM YY");
  if (interval === "1d") return formatColomboApiTime(timestamp, "DD MMM");
  return formatColomboApiTime(timestamp, "HH:mm");
}

export default function EnergyOverviewMiniChart({
  title,
  data = [],
  interval = "1h",
  loading = false,
  error = "",
}) {
  const total = useMemo(
    () =>
      data.reduce((sum, item) => {
        const value = Number(item.energyUsageKwh);
        return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
      }, 0),
    [data],
  );

  // Select the display unit once from the total for this card. Every bar,
  // tooltip value and the total then uses exactly the same unit.
  const displayUnit = useMemo(() => getEnergyDisplayUnit(total), [total]);

  const option = useMemo(
    () => ({
      animationDuration: 500,
      animationEasing: "cubicOut",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(15, 23, 42, 0.94)",
        borderWidth: 0,
        textStyle: { color: "#fff", fontSize: 12 },
        padding: [8, 10],
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: "rgba(22,119,255,0.06)" },
        },
        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : null;
          const record = data[item?.dataIndex];
          if (!record) return "";
          return `<div style="font-weight:600;margin-bottom:3px">${labelForInterval(
            record.intervalStart,
            interval,
          )}</div><div>${formatConvertedEnergy(
            record.energyUsageKwh,
            displayUnit,
          )}</div>`;
        },
      },
      grid: {
        top: 8,
        left: 2,
        right: 2,
        bottom: 2,
      },
      xAxis: {
        type: "category",
        show: false,
        boundaryGap: true,
        data: data.map((item) =>
          labelForInterval(item.intervalStart, interval),
        ),
      },
      yAxis: {
        type: "value",
        show: false,
        min: 0,
      },
      series: [
        {
          type: "bar",
          data: data.map((item) =>
            convertEnergy(item.energyUsageKwh, displayUnit),
          ),
          barMaxWidth: 12,
          itemStyle: {
            borderRadius: [5, 5, 1, 1],
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
            itemStyle: { shadowBlur: 8, shadowColor: "rgba(22,119,255,0.22)" },
          },
        },
      ],
    }),
    [data, displayUnit, interval],
  );

  if (loading) {
    return (
      <div className="energy-mini-card energy-mini-card-loading">
        <div className="energy-mini-title">{title}</div>
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      </div>
    );
  }

  return (
    <div className="energy-mini-card">
      <div className="energy-mini-card-header">
        <div className="energy-mini-title">{title}</div>
        {error ? (
          <AntTooltip title={error}>
            <WarningOutlined className="energy-mini-warning" />
          </AntTooltip>
        ) : null}
      </div>

      {data.length ? (
        <ReactECharts
          option={option}
          notMerge
          lazyUpdate
          style={{ height: 92, width: "100%" }}
        />
      ) : (
        <div className="energy-mini-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={error ? "Unavailable" : false}
          />
        </div>
      )}
      <div className="energy-mini-total">
        {formatConvertedEnergy(total, displayUnit)}
      </div>
      <div className="energy-mini-unit-label">
        Energy consumption · {displayUnit.unit}
      </div>
    </div>
  );
}
