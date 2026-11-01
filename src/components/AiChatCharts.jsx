import { useRef, useState } from "react";
import { Alert, Button, Modal, message } from "antd";
import { DownloadOutlined, ExpandOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { buildAiChartOption, validateAiChart } from "../utils/aiCharts";

function ChartDataTable({ chart }) {
  return (
    <details className="ask-ai-chart-data">
      <summary>View data ({chart.unit})</summary>
      <div className="ask-ai-chart-table-scroll">
        <table>
          <caption>{chart.title}</caption>
          <thead><tr><th scope="col">Category</th>{chart.series.map((series, index) => <th scope="col" key={index}>{series.name}</th>)}</tr></thead>
          <tbody>{chart.labels.map((label, index) => <tr key={index}><th scope="row">{label}</th>{chart.series.map((series, seriesIndex) => <td key={seriesIndex}>{series.values[index] === null ? "No data" : series.values[index].toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

export default function AiChatCharts({ charts, warnings }) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const expandedRef = useRef(null);
  const chartRefs = useRef(new Map());
  const candidates = Array.isArray(charts) ? charts.slice(0, 3) : [];
  const validated = candidates.map(validateAiChart);
  const expanded = expandedIndex === null ? null : validated[expandedIndex];
  const notes = Array.isArray(warnings) ? warnings.filter((note) => typeof note === "string").slice(0, 3) : [];
  const download = async (ref, chart) => {
    try {
      const instance = ref?.getEchartsInstance();
      if (!instance) throw new Error("Chart is not ready");
      const pixelRatio = 3;
      const image = new Image();
      const loaded = new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      image.src = instance.getDataURL({ type: "png", pixelRatio, backgroundColor: "#ffffff" });
      await loaded;
      const width = image.naturalWidth / pixelRatio;
      const height = image.naturalHeight / pixelRatio;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export unavailable");
      context.font = "600 17px Arial";
      const lines = [];
      let line = "";
      for (const character of chart.title) {
        if (line && context.measureText(line + character).width > width - 40) {
          lines.push(line.trim());
          line = "";
        }
        line += character;
      }
      if (line.trim()) lines.push(line.trim());
      const titleHeight = 32 + lines.length * 24;
      canvas.width = Math.ceil(width * pixelRatio);
      canvas.height = Math.ceil((height + titleHeight) * pixelRatio);
      context.scale(pixelRatio, pixelRatio);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height + titleHeight);
      context.font = "600 17px Arial";
      context.fillStyle = "#17375e";
      context.textBaseline = "top";
      lines.forEach((text, index) => context.fillText(text, 20, 16 + index * 24));
      context.drawImage(image, 0, titleHeight, width, height);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${chart.title.replace(/[^a-z0-9_-]/gi, "_").slice(0, 100) || "Ruhana_chart"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      message.error("Unable to download the chart. Please try again.");
    }
  };
  return (
    <div className="ask-ai-charts">
      {validated.map((chart, index) => chart ? (
        <section className="ask-ai-chart" key={index} aria-label={chart.title}>
          <div className="ask-ai-chart-heading"><h4>{chart.title}</h4><div className="ask-ai-chart-actions">
            <Button type="text" size="small" icon={<DownloadOutlined />} aria-label={`Download ${chart.title} as PNG`} title="Download PNG" onClick={() => download(chartRefs.current.get(index), chart)} />
            <Button type="text" size="small" icon={<ExpandOutlined />} aria-label={`Enlarge ${chart.title}`} title="Enlarge chart" onClick={() => setExpandedIndex(index)} />
          </div></div>
          <ReactECharts ref={(ref) => { if (ref) chartRefs.current.set(index, ref); else chartRefs.current.delete(index); }} option={buildAiChartOption(chart)} notMerge style={{ height: 250, width: "100%" }} />
          <ChartDataTable chart={chart} />
        </section>
      ) : <Alert key={index} type="warning" showIcon title="This chart could not be displayed because its data format is invalid." />)}
      {notes.map((note, index) => <Alert key={index} type="warning" showIcon title={note} />)}
      <Modal open={Boolean(expanded)} title={expanded?.title} onCancel={() => setExpandedIndex(null)} footer={null} width={960} destroyOnHidden afterOpenChange={(visible) => { if (visible) expandedRef.current?.getEchartsInstance().resize(); }}>
        {expanded && <>
          <div className="ask-ai-chart-download"><Button icon={<DownloadOutlined />} onClick={() => download(expandedRef.current, expanded)}>Download PNG</Button></div>
          <div className="ask-ai-expanded-chart-scroll">
            <ReactECharts ref={expandedRef} option={buildAiChartOption(expanded, { expanded: true })} notMerge style={{ height: "min(60vh, 520px)", minHeight: 360, width: "100%", minWidth: expanded.type === "pie" ? 0 : Math.min(expanded.labels.length, 8) * 105 + 80 }} />
          </div>
          <ChartDataTable chart={expanded} />
        </>}
      </Modal>
    </div>
  );
}
