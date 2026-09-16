import { useMemo } from "react";
import { Empty } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";

export default function ShiftTileCountChart({ data = [] }) {
  const points = useMemo(
    () =>
      [...data]
        .filter((item) => item?.time && Number.isFinite(Number(item?.value)))
        .sort((a, b) => new Date(a.time) - new Date(b.time)),
    [data],
  );

  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 62, right: 20, top: 48, bottom: 48, containLabel: true },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (params) => {
          const p = params?.[0];
          if (!p) return "";
          return `${p.axisValue}<br/><strong>${Number(p.value).toLocaleString()} tiles</strong>`;
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((p) => dayjs(p.time).format("HH:mm")),
        name: "Time",
        nameLocation: "middle",
        nameGap: 32,
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: "value",
        min: 0,
        name: "Tile Count",
        nameLocation: "end",
        nameGap: 14,
        nameTextStyle: { padding: [0, 0, 4, 0] },
        splitLine: { lineStyle: { color: "#eef2f7" } },
      },
      series: [
        {
          name: "Tile Count",
          type: "line",
          smooth: 0.16,
          showSymbol: false,
          connectNulls: true,
          lineStyle: { width: 2, color: "#1677ff" },
          itemStyle: { color: "#1677ff" },
          areaStyle: { color: "rgba(22,119,255,0.10)" },
          data: points.map((p) => Number(p.value || 0)),
        },
      ],
    }),
    [points],
  );

  if (!points.length) {
    return (
      <div className="production-chart-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No production samples"
        />
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{ width: "100%", height: 245 }}
    />
  );
}
