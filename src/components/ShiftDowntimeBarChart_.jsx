import { useMemo } from "react";
import { Empty } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";

function formatMinutes(value) {
  const n = Number(value || 0);
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} min`;
}

export default function ShiftDowntimeBarChart({ data = [], onBarClick }) {
  const rows = useMemo(
    () =>
      [...data]
        .filter((item) => Number.isFinite(Number(item?.stopStart_ts)))
        .sort((a, b) => Number(a.stopStart_ts) - Number(b.stopStart_ts)),
    [data],
  );

  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 55, right: 18, top: 25, bottom: 48, containLabel: true },
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params) => {
          const row = rows[params.dataIndex];
          if (!row) return "";

          const end = row.stopStop_ts ? dayjs(Number(row.stopStop_ts)).format("HH:mm:ss") : "Ongoing";

          return `
            <div style="min-width:210px">
              <div style="font-weight:700;margin-bottom:7px">Downtime ${params.dataIndex + 1}</div>
              <div>Start: <strong>${dayjs(Number(row.stopStart_ts)).format("HH:mm:ss")}</strong></div>
              <div>End: <strong>${end}</strong></div>
              <div>Duration: <strong>${formatMinutes(row.durationMinutes)}</strong></div>
              <div>Machine: <strong>${row.machine || "-"}</strong></div>
              <div>Reason: <strong>${row.reason || "Not specified"}</strong></div>
            </div>
          `;
        },
      },
      xAxis: {
        type: "category",
        data: rows.map((row) => dayjs(Number(row.stopStart_ts)).format("HH:mm")),
        name: "Start time",
        nameLocation: "middle",
        nameGap: 32,
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: "value",
        min: 0,
        name: "Downtime (min)",
        splitLine: { lineStyle: { color: "#eef2f7" } },
      },
      series: [
        {
          type: "bar",
          data: rows.map((row) => ({
            value: Number(row.durationMinutes || 0),
            itemStyle: {
              color: row.isOpen ? "#ff7a45" : "#ff4d4f",
              borderRadius: [4, 4, 0, 0],
            },
          })),
          barMaxWidth: 18,
        },
      ],
    }),
    [rows],
  );

  if (!rows.length) {
    return (
      <div className="production-chart-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No downtime events" />
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{ width: "100%", height: 245 }}
      onEvents={{
        click: (params) => {
          if (typeof onBarClick === "function" && Number.isInteger(params?.dataIndex)) {
            onBarClick(rows[params.dataIndex]);
          }
        },
      }}
    />
  );
}
