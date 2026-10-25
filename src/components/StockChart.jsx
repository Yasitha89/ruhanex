import { useEffect, useState } from "react";
import { Alert, Card, Typography } from "antd";
import ReactECharts from "echarts-for-react";

const BAR_COLORS = ["#d97706", "#ea580c", "#f59e0b"];

export default function StockChart({ loadStock, title, label, valueField, totalField, hiddenWarnings = [], colors = BAR_COLORS }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await loadStock();
        if (result?.success === false) {
          throw new Error(result.error || `Unable to load ${title.toLowerCase()}.`);
        }
        if (!Array.isArray(result?.stocks)) {
          throw new Error(`Invalid ${label.toLowerCase()} response.`);
        }
        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message || `Unable to load ${title.toLowerCase()}.`);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 300000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadStock, title, label]);

  const stocks = (data?.stocks || []).filter(
    (stock) => stock.tileSize && stock[valueField] != null && Number.isFinite(Number(stock[valueField])),
  ).sort((a, b) => String(a.tileSize).localeCompare(String(b.tileSize), undefined, { numeric: true }));
  const asOf = data?.asOf ? new Date(data.asOf) : null;
  const asOfLabel = asOf && Number.isFinite(asOf.getTime())
    ? asOf.toLocaleString("en-GB", {
      timeZone: "Asia/Colombo",
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      hour12: false,
    })
    : "";
  const option = {
    animationDuration: 500,
    color: colors,
    grid: { left: 20, right: 18, top: 72, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 })} m²`,
    },
    legend: {
      type: "scroll",
      top: 4,
      left: 8,
      right: 8,
      itemWidth: 10,
      itemHeight: 10,
    },
    xAxis: {
      type: "category",
      data: stocks.map((stock) => stock.tileSize),
      axisLabel: { hideOverlap: true },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#dbe3ee" } },
    },
    yAxis: {
      type: "value",
      name: "Floor stock (m²)",
      nameGap: 18,
      splitLine: { lineStyle: { color: "#edf2f7" } },
    },
    series: [{
      name: label,
      type: "bar",
      barMaxWidth: 25,
      itemStyle: { borderRadius: [7, 7, 0, 0] },
      data: stocks.map((stock, index) => ({
        value: Number(stock[valueField]),
        itemStyle: { color: colors[index % colors.length] },
      })),
      label: {
        show: true,
        position: "top",
        formatter: ({ value }) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 }),
        fontSize: 11,
      },
    }],
  };

  return (
    <Card
      className="overview-chart-card"
      title={title}
      extra={asOfLabel ? <Typography.Text type="secondary">As of {asOfLabel}</Typography.Text> : null}
      loading={loading}
    >
      {error ? <Alert type="error" showIcon title={error} /> : null}
      {stocks.length ? (
        <ReactECharts option={option} notMerge style={{ height: 220 }} />
      ) : !error ? (
        <div className="overview-empty">No {label.toLowerCase()} data</div>
      ) : null}
      {data?.[totalField] != null && Number.isFinite(Number(data[totalField])) ? (
        <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
          Total: {Number(data[totalField]).toLocaleString()} m²
        </Typography.Text>
      ) : null}
      {(Array.isArray(data?.warnings) ? data.warnings : []).filter((warning) => !hiddenWarnings.includes(warning)).map((warning, index) => (
        <Typography.Text key={index} type="secondary" style={{ display: "block", fontSize: 11 }}>
          {warning}
        </Typography.Text>
      ))}
    </Card>
  );
}
