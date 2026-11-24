import { useEffect, useState } from "react";
import { Alert, Button, Empty, Modal, Space, Spin, Table, Typography } from "antd";
import ReactECharts from "echarts-for-react";
import { format as echartsFormat } from "echarts";
import { getProductionShiftQuality } from "../api/productionDashboardApi";

const number = (value) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const percentage = (value) => value == null ? "—" : `${number(value)}%`;
const qualityColors = ["#16a34a", "#faad14", "#ef4444", "#94a3b8"];
const designColumns = [
  { title: "Design", dataIndex: "designCode", key: "designCode" },
  { title: "Size", dataIndex: "tileSize", key: "tileSize" },
  { title: "Boxes", dataIndex: "boxes", align: "right", render: number },
  { title: "Tiles", dataIndex: "tiles", align: "right", render: number },
  { title: "% of design", dataIndex: "percentageOfDesign", align: "right", render: percentage },
  { title: "% of category", dataIndex: "percentageOfCategory", align: "right", render: percentage },
];
const gradeColumns = [
  { title: "Grade number", dataIndex: "gradeNumber", width: 110 },
  { title: "Grade", dataIndex: "grade" },
  { title: "Description", dataIndex: "description" },
  { title: "Boxes", dataIndex: "boxes", align: "right", render: number },
  { title: "Tiles", dataIndex: "tiles", align: "right", render: number },
  { title: "% of design", dataIndex: "percentageOfDesign", align: "right", render: percentage },
];

function emptyMessage(status) {
  if (status === "historical-quality-pending") return "Quality for this shift is still being processed.";
  if (status === "historical-shift-not-saved") return "This shift summary has not been saved yet.";
  if (status === "historical-quality-details-unavailable") return "Quality details were not recorded for this shift.";
  if (status === "no-quality-sensor" || status === "historical-quality-assumed") return "No measured quality data is available for this shift.";
  return "No tracked quality tiles for this shift.";
}

export default function ShiftGradeChart({ line, date, shift, refreshKey = 0 }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [legendSelection, setLegendSelection] = useState({});

  useEffect(() => {
    let active = true;
    let timer;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await getProductionShiftQuality({ line, date, shift, signal: controller.signal });
        if (!active) return;
        if (response?.success !== true) throw new Error(response?.error || "Unable to load shift quality.");
        setResult(response);
        setError("");
        if (!response.historical || ["historical-quality-pending", "historical-shift-not-saved"].includes(response.status)) {
          timer = setTimeout(load, 15000);
        }
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        if (cause.response?.status === 400 && cause.response?.data?.error === "The requested shift has not started.") {
          setResult({ qualityAvailable: false, status: "shift-not-started", pie: { data: [] } });
          setError("");
          timer = setTimeout(load, 30000);
          return;
        }
        setError(cause.response?.data?.error || cause.message || "Unable to load shift quality.");
        timer = setTimeout(load, 30000);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [line, date, shift, refreshKey]);

  const data = result?.pie?.data || [];
  const selected = result?.categories?.find((item) => item.category === selectedCategory);
  const gradeTotals = new Map();
  for (const design of selected?.designs || []) {
    for (const grade of design.grades || []) {
      const name = String(grade.grade || `Grade ${grade.gradeNumber}`).trim();
      const item = gradeTotals.get(name) || { name, tiles: 0, boxes: 0 };
      item.tiles += Number(grade.tiles || 0);
      item.boxes += Number(grade.boxes || 0);
      gradeTotals.set(name, item);
    }
  }
  const gradeProduction = [...gradeTotals.values()].filter((item) => item.tiles > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const gradeOption = {
    grid: { left: 12, right: gradeProduction.length > 8 ? 62 : 42, top: 16, bottom: 40, containLabel: true },
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" }, confine: true,
      formatter: (params) => {
        const item = gradeProduction[params[0]?.dataIndex];
        return item ? `${echartsFormat.encodeHTML(item.name)}<br/>${number(item.tiles)} tiles · ${number(item.boxes)} boxes` : "";
      },
    },
    xAxis: { type: "value", name: "Tiles", nameLocation: "middle", nameGap: 26, minInterval: 1 },
    yAxis: { type: "category", inverse: true, data: gradeProduction.map((item) => item.name), axisLabel: { width: 110, overflow: "truncate" } },
    dataZoom: gradeProduction.length > 8 ? [{ type: "slider", yAxisIndex: 0, right: 0, width: 16, start: 0, end: 800 / gradeProduction.length }] : [],
    series: [{
      type: "bar", barMaxWidth: 28,
      data: gradeProduction.map((item) => item.tiles),
      itemStyle: { color: { 1: "#16a34a", 2: "#faad14", 3: "#ef4444" }[selectedCategory] || "#16a34a", borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: "right", formatter: ({ value }) => number(value) },
    }],
  };
  const option = {
    color: qualityColors,
    tooltip: {
      trigger: "item", confine: true,
      formatter: ({ data: item }) => `${echartsFormat.encodeHTML(item.name)}: ${percentage(item.percentage)}<br/>${number(item.value)} tiles · ${number(item.boxes)} boxes`,
    },
    legend: { show: false, selected: legendSelection },
    series: [{
      type: "pie", radius: ["36%", "62%"], center: ["50%", "42%"],
      itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 },
      label: { position: "inside", formatter: ({ data: item }) => item.value > 0 ? percentage(item.percentage) : "", color: "#fff", fontWeight: 700 },
      data,
    }],
  };

  return <>
    {loading && !result ? <div style={{ height: 260, display: "grid", placeItems: "center" }}><Spin /></div>
      : result?.qualityAvailable && data.length ? <>
        <ReactECharts option={option} style={{ height: 300, width: "100%" }} onEvents={{
          click: ({ data: item }) => { if ([1, 2, 3].includes(item?.category) && item.value > 0) setSelectedCategory(item.category); },
        }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px 12px", padding: "0 8px 8px" }} aria-label="Quality chart legend">
          {data.map((item, index) => <button key={item.name} type="button"
            aria-pressed={legendSelection[item.name] !== false}
            onClick={() => setLegendSelection(previous => ({ ...previous, [item.name]: previous[item.name] === false }))}
            style={{ display: "flex", alignItems: "center", gap: 6, border: 0, background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", font: "inherit", fontSize: 12, color: "inherit", opacity: legendSelection[item.name] === false ? 0.4 : 1 }}>
            <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 2, background: qualityColors[index % qualityColors.length] }} />
            <span>{item.name}</span>
          </button>)}
        </div>
      </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error ? "Quality data could not be loaded." : emptyMessage(result?.status)} />}
    <Modal open={Boolean(selected)} title={`${selected?.name || "Quality"} — ${line}`} width={920}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }} onCancel={() => setSelectedCategory(null)}
      footer={<Button onClick={() => setSelectedCategory(null)}>Close</Button>}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Typography.Text>{date} · {shift}</Typography.Text>
        <Typography.Text strong>{percentage(selected?.percentage)} · {number(selected?.tiles)} tiles · {number(selected?.boxes)} boxes</Typography.Text>
      </Space>
      {result?.gradeBreakdownAvailable === false && <Alert type="info" showIcon title="Individual grade counts were not saved for this older shift. Design totals are shown below." style={{ marginBottom: 12 }} />}
      {result?.designBreakdownComplete === false && <Alert type="info" showIcon title="Some quality output could not be matched to a saved production design." style={{ marginBottom: 12 }} />}
      {gradeProduction.length > 0 && <section style={{ marginBottom: 20 }} aria-label="Grade-wise production">
        <Typography.Text strong>Grade-wise Production</Typography.Text>
        <ReactECharts option={gradeOption} notMerge style={{ height: Math.min(420, Math.max(220, gradeProduction.length * 36 + 70)), width: "100%" }} />
      </section>}
      <Table size="small" columns={designColumns} dataSource={selected?.designs || []}
        rowKey={(row) => JSON.stringify([row.designCode, row.tileSize])} pagination={false} scroll={{ x: 650 }}
        expandable={{
          rowExpandable: (record) => Boolean(record.grades?.length),
          expandedRowRender: (record) => <Table size="small" columns={gradeColumns} dataSource={record.grades || []}
            rowKey={(row) => JSON.stringify([row.gradeNumber, row.grade, row.category])} pagination={false} scroll={{ x: 600 }} />,
        }} />
      {result?.gradeBreakdownAvailable !== false && <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>Expand a design to see its individual grades.</Typography.Paragraph>}
    </Modal>
  </>;
}
