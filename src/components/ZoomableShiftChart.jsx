import { useRef, useState } from "react";
import { Button, Space, Tooltip } from "antd";
import { ZoomInOutlined, ZoomOutOutlined, ReloadOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";

export default function ZoomableShiftChart({ option, onEvents, ...props }) {
  const chartRef = useRef(null);
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 100 });
  const [legendSelection, setLegendSelection] = useState({});
  const rememberLegend = (event, chart) => {
    setLegendSelection(previous => ({ ...previous, ...event.selected }));
    onEvents?.legendselectchanged?.(event, chart);
  };
  const rememberZoom = (event, chart) => {
    const current = chart.getOption().dataZoom?.[0];
    if (current) {
      // Keep the selected times fixed as refreshed series acquire new points.
      const next = Number(current.start) === 0 && Number(current.end) === 100
        ? { start: 0, end: 100 }
        : current.startValue != null && current.endValue != null
          ? { startValue: current.startValue, endValue: current.endValue, rangeMode: ["value", "value"] }
          : { start: current.start, end: current.end };
      setZoomRange(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }
    onEvents?.datazoom?.(event, chart);
  };
  const zoom = (factor) => {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart) return;
    const current = chart.getOption().dataZoom?.[0] || {};
    const start = Number(current.start ?? 0);
    const end = Number(current.end ?? 100);
    const span = Math.min(100, Math.max(1, (end - start) * factor));
    const nextStart = Math.max(0, Math.min(100 - span, (start + end - span) / 2));
    chart.dispatchAction({ type: "dataZoom", start: nextStart, end: nextStart + span });
  };

  return <div>
    <Space size={6} style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
      <Tooltip title="Zoom in">
        <Button size="small" icon={<ZoomInOutlined />} aria-label="Zoom in" onClick={() => zoom(0.5)} />
      </Tooltip>
      <Tooltip title="Zoom out">
        <Button size="small" icon={<ZoomOutOutlined />} aria-label="Zoom out" onClick={() => zoom(2)} />
      </Tooltip>
      <Tooltip title="Reset zoom">
        <Button size="small" icon={<ReloadOutlined />} aria-label="Reset zoom" onClick={() => chartRef.current?.getEchartsInstance()
          .dispatchAction({ type: "dataZoom", start: 0, end: 100 })} />
      </Tooltip>
    </Space>
    <ReactECharts {...props} ref={chartRef} onEvents={{ ...onEvents, datazoom: rememberZoom, legendselectchanged: rememberLegend }} option={{
      ...option,
      ...(option.legend ? { legend: Array.isArray(option.legend)
        ? option.legend.map(legend => ({ ...legend, selected: { ...legend.selected, ...legendSelection } }))
        : { ...option.legend, selected: { ...option.legend.selected, ...legendSelection } } } : {}),
      grid: { ...option.grid, bottom: 80 },
      dataZoom: [
        { id: "shift-slider", type: "slider", xAxisIndex: 0, ...zoomRange, bottom: 8, height: 20,
          borderColor: "#dbe7f3", fillerColor: "rgba(22,119,255,0.12)" },
        { id: "shift-inside", type: "inside", xAxisIndex: 0, ...zoomRange },
      ],
    }} />
  </div>;
}
