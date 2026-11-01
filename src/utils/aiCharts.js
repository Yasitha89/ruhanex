const COLORS = ["#2563eb", "#0d9488", "#7c3aed", "#d97706"];

export function validateAiChart(chart) {
  const text = (value, max) => typeof value === "string" && Boolean(value.trim()) && value.length <= max;
  if (!chart || !["bar", "line", "pie"].includes(chart.type) || !text(chart.title, 160) || !text(chart.unit, 40)) return null;
  if (!Array.isArray(chart.labels) || !chart.labels.length || chart.labels.length > 60 || !chart.labels.every((label) => text(label, 160))) return null;
  if (!Array.isArray(chart.series) || !chart.series.length || chart.series.length > 4) return null;
  if (!chart.series.every((series) => series && text(series.name, 120) && Array.isArray(series.values)
    && series.values.length === chart.labels.length
    && series.values.every((value) => value === null || (typeof value === "number" && Number.isFinite(value))))) return null;
  if (!chart.series.some((series) => series.values.some((value) => value !== null))) return null;
  if (chart.type === "pie" && (chart.series.length !== 1 || chart.series[0].values.some((value) => value === null || value < 0) || !chart.series[0].values.some((value) => value > 0))) return null;
  return { type: chart.type, title: chart.title, unit: chart.unit, labels: [...chart.labels], series: chart.series.map(({ name, values }) => ({ name, values: [...values] })) };
}

export function wrapAiChartLabel(value, maxLength = 16) {
  return String(value).split("\n").map((paragraph) => {
    const lines = [];
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + word.length + 1 > maxLength) { lines.push(line); line = ""; }
      let remaining = word;
      while (remaining.length > maxLength) { lines.push(remaining.slice(0, maxLength)); remaining = remaining.slice(maxLength); }
      line = line ? `${line} ${remaining}` : remaining;
    }
    if (line) lines.push(line);
    return lines.join("\n");
  }).join("\n");
}

export function buildAiChartOption(chart, { expanded = false } = {}) {
  const formatValue = (value) => value === null ? "No data" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${chart.unit}`;
  const base = {
    color: COLORS,
    animationDuration: 350,
    aria: { enabled: true, description: chart.title },
    legend: { type: "scroll", top: 4, left: 4, right: 4, textStyle: { fontSize: 11 } },
    tooltip: { trigger: chart.type === "pie" ? "item" : "axis", renderMode: "richText", confine: true, valueFormatter: formatValue },
  };
  if (chart.type === "pie") return {
    ...base,
    series: [{ name: chart.series[0].name, type: "pie", radius: ["35%", "62%"], center: ["50%", "58%"],
      label: { show: false }, emphasis: { label: { show: true, formatter: "{b}: {d}%" } },
      data: chart.labels.map((name, index) => ({ name, value: chart.series[0].values[index] })),
    }],
    legend: { ...base.legend, data: chart.labels },
  };
  return {
    ...base,
    grid: { left: 12, right: 16, top: 64, bottom: chart.labels.length > 8 ? 55 : 20, containLabel: true },
    xAxis: { type: "category", data: chart.labels, axisTick: { show: false }, axisLine: { lineStyle: { color: "#dbe3ee" } }, axisLabel: expanded
      ? { interval: 0, formatter: (value) => wrapAiChartLabel(value), lineHeight: 16, fontSize: 11, margin: 12, hideOverlap: false }
      : { width: 70, overflow: "truncate", hideOverlap: true } },
    yAxis: { type: "value", name: chart.unit, nameGap: 18, splitLine: { lineStyle: { color: "#edf2f7" } }, axisLabel: { formatter: "{value}" } },
    ...(chart.labels.length > 8 ? { dataZoom: [{ type: "slider", startValue: 0, endValue: 7, height: 16, bottom: 4 }, { type: "inside", startValue: 0, endValue: 7 }] } : {}),
    series: chart.series.map((series) => ({ name: series.name, type: chart.type, data: series.values,
      ...(chart.type === "bar" ? { barMaxWidth: 25, itemStyle: { borderRadius: [5, 5, 0, 0] } } : { symbol: "circle", symbolSize: 6, connectNulls: false, lineStyle: { width: 2 } }),
    })),
  };
}
