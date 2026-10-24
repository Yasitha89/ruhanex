import { Card, Typography } from "antd";
import ReactECharts from "echarts-for-react";

export default function CodeProductionChart({ title, monthly, lines, colors, monthLabel }) {
  const totals = new Map();
  for (const line of lines) {
    const rows = monthly?.[line]?.codeWiseProduction;
    for (const row of Array.isArray(rows) ? rows : []) {
      const designCode = String(row?.designCode || "Unknown").trim() || "Unknown";
      const tileSize = String(row?.tileSize || "Unknown").trim() || "Unknown";
      const value = Number(row?.totalProduction);
      if (!Number.isFinite(value) || value <= 0) continue;
      const key = JSON.stringify([tileSize, designCode]);
      const previous = totals.get(key);
      totals.set(key, { tileSize, designCode, value: (previous?.value || 0) + value });
    }
  }
  const rows = [...totals.values()].sort((a, b) => b.value - a.value);
  const format = (value, digits = 1) => Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
  const option = {
    animationDuration: 500,
    color: colors,
    grid: { left: 20, right: 18, top: 72, bottom: rows.length > 8 ? 60 : 28, containLabel: true },
    tooltip: {
      trigger: "axis",
      confine: true,
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => `${format(value)} m²`,
    },
    legend: { type: "scroll", top: 4, left: 8, right: 8, itemWidth: 10, itemHeight: 10 },
    xAxis: {
      type: "category",
      data: rows.map((row) => `${row.designCode}\n${row.tileSize}`),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#dbe3ee" } },
      axisLabel: { interval: 0, width: 80, overflow: "truncate" },
    },
    yAxis: {
      type: "value",
      name: "Production (m²)",
      nameGap: 18,
      splitLine: { lineStyle: { color: "#edf2f7" } },
    },
    dataZoom: rows.length > 8 ? [
      { type: "slider", bottom: 4, height: 18, startValue: 0, endValue: 7 },
      { type: "inside", startValue: 0, endValue: 7 },
    ] : [],
    series: [{
      name: title,
      type: "bar",
      barMaxWidth: 25,
      itemStyle: { borderRadius: [7, 7, 0, 0] },
      data: rows.map((row, index) => ({ value: row.value, itemStyle: { color: colors[index % colors.length] } })),
      label: { show: true, position: "top", formatter: ({ value }) => format(value, 0), fontSize: 11 },
    }],
  };

  return (
    <Card className="overview-chart-card" title={title} extra={<Typography.Text type="secondary">{monthLabel}</Typography.Text>}>
      {rows.length ? (
        <ReactECharts option={option} notMerge style={{ height: 280 }} />
      ) : (
        <div className="overview-empty">No code-wise production data</div>
      )}
    </Card>
  );
}
