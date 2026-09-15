import { useMemo } from "react";
import { Button, Card, Col, Empty, Row } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";

const SHIFT_ORDER = ["06-14", "14-22", "22-06"];
const SHIFT_COLORS = {
  "06-14": "#22c55e",
  "14-22": "#f59e0b",
  "22-06": "#7c3aed",
};

function fmt(value, digits = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function cleanSizes(rows = []) {
  return rows
    .filter((row) => {
      const size = String(row?.size || "").trim();
      const n = size.toLowerCase();
      return (
        size &&
        n !== "unknown" &&
        n !== "unknown size" &&
        Number(row?.production || 0) > 0
      );
    })
    .sort((a, b) => Number(b.production || 0) - Number(a.production || 0));
}

function primarySize(shift) {
  const sizes = cleanSizes(shift?.sizes || []);
  return sizes[0]?.size || "";
}

async function exportWorkbook({ line, month, data }) {
  const ExcelJSImport = await import("exceljs");
  const ExcelJS = ExcelJSImport.default || ExcelJSImport;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ruhanex Industrial IoT";

  const daily = workbook.addWorksheet("Daily Shift Production");
  daily.addRow([`${line} - Monthly Production`]);
  daily.addRow([`Month: ${dayjs(month).format("MMMM YYYY")}`]);
  daily.addRow([]);
  daily.addRow([
    "Date",
    "06-14 Size",
    "06-14 Production (m²)",
    "14-22 Size",
    "14-22 Production (m²)",
    "22-06 Size",
    "22-06 Production (m²)",
    "Daily Total (m²)",
  ]).font = { bold: true };

  for (const day of data?.days || []) {
    const getShift = (name) => (day.shifts || []).find((s) => s.shift === name);
    const a = getShift("06-14");
    const b = getShift("14-22");
    const c = getShift("22-06");

    daily.addRow([
      day.date,
      primarySize(a),
      Number(a?.production || 0),
      primarySize(b),
      Number(b?.production || 0),
      primarySize(c),
      Number(c?.production || 0),
      Number(day.totalProduction || 0),
    ]);
  }

  daily.columns = [14, 14, 22, 14, 22, 14, 22, 20].map((width) => ({ width }));
  [3, 5, 7, 8].forEach((i) => {
    daily.getColumn(i).numFmt = "#,##0.00";
  });

  const bySize = workbook.addWorksheet("Production by Size");
  bySize.addRow([`${line} - Production by Size`]);
  bySize.addRow([`Month: ${dayjs(month).format("MMMM YYYY")}`]);
  bySize.addRow([]);
  bySize.addRow([
    "Tile Size",
    "Production (m²)",
    "Share (%)",
    "Current Shift (m²)",
  ]).font = { bold: true };

  for (const row of cleanSizes(data?.sizeTotals || [])) {
    bySize.addRow([
      row.size,
      Number(row.production || 0),
      Number(row.percentage || 0),
      Number(row.currentShiftProduction || 0),
    ]);
  }

  bySize.columns = [{ width: 18 }, { width: 22 }, { width: 14 }, { width: 22 }];
  bySize.getColumn(2).numFmt = "#,##0.00";
  bySize.getColumn(3).numFmt = "0.0";
  bySize.getColumn(4).numFmt = "#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${String(line).replace(/[^a-z0-9]+/gi, "_")}_${dayjs(month).format("YYYY-MM")}_Production.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ProductionMonthlyPanel({
  line,
  month,
  data,
  loading = false,
}) {
  const days = data?.days || [];
  const sizes = useMemo(() => cleanSizes(data?.sizeTotals || []), [data]);

  const stackedOption = useMemo(
    () => ({
      animation: false,
      grid: { left: 48, right: 20, top: 42, bottom: 42, containLabel: true },
      legend: { top: 2, data: SHIFT_ORDER },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        confine: true,
        formatter: (params) => {
          const day = params?.[0]?.data?.rawDay;
          if (!day) return "";
          let html = `<strong>${dayjs(day.date).format("DD MMM YYYY")}</strong><br/>`;
          for (const shiftName of SHIFT_ORDER) {
            const shift = (day.shifts || []).find((s) => s.shift === shiftName);
            if (!shift || Number(shift.production || 0) <= 0) continue;
            html += `${shiftName}${primarySize(shift) ? ` - ${primarySize(shift)}` : ""} &nbsp; <strong>${fmt(shift.production)} m²</strong><br/>`;
          }
          html += `<div style="margin-top:6px;border-top:1px solid #ddd;padding-top:6px"><strong>Daily Total: ${fmt(day.totalProduction)} m²</strong></div>`;
          return html;
        },
      },
      xAxis: {
        type: "category",
        data: days.map((d) => dayjs(d.date).format("D")),
        name: "Date",
        nameLocation: "middle",
        nameGap: 28,
        axisLabel: { hideOverlap: true },
      },
      yAxis: {
        type: "value",
        name: "Production (m²)",
        splitLine: { lineStyle: { color: "#eef2f7" } },
      },
      series: SHIFT_ORDER.map((shiftName) => ({
        name: shiftName,
        type: "bar",
        stack: "production",
        barMaxWidth: 22,
        itemStyle: { color: SHIFT_COLORS[shiftName] },
        data: days.map((day) => {
          const shift = (day.shifts || []).find((s) => s.shift === shiftName);
          return { value: Number(shift?.production || 0), rawDay: day };
        }),
      })),
    }),
    [days],
  );

  const sizeOption = useMemo(
    () => ({
      animation: false,
      grid: { left: 68, right: 85, top: 18, bottom: 25, containLabel: true },
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params) => {
          const row = params?.data?.raw;
          if (!row) return "";
          return `<strong>${row.size}</strong><br/>Production: <strong>${fmt(row.production)} m²</strong><br/>Share: <strong>${fmt(row.percentage, 1)}%</strong>`;
        },
      },
      xAxis: { type: "value", show: false },
      yAxis: {
        type: "category",
        inverse: true,
        data: sizes.map((r) => r.size),
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 22,
          itemStyle: { color: "#4096ff", borderRadius: [0, 5, 5, 0] },
          label: {
            show: true,
            position: "right",
            formatter: (params) =>
              `${fmt(params.data.raw.production)} m² (${fmt(params.data.raw.percentage, 1)}%)`,
            color: "#183153",
            fontWeight: 600,
          },
          data: sizes.map((row) => ({
            value: Number(row.production || 0),
            raw: row,
          })),
        },
      ],
    }),
    [sizes],
  );

  return (
    <section className="production-monthly-section">
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={14}>
          <Card
            className="production-dashboard-card production-chart-card"
            title={`Monthly Production - ${dayjs(month).format("MMMM YYYY")}`}
            loading={loading}
          >
            {days.length ? (
              <ReactECharts
                option={stackedOption}
                notMerge
                lazyUpdate
                style={{ height: 260, width: "100%" }}
              />
            ) : (
              <div className="production-chart-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No monthly production data"
                />
              </div>
            )}
            <div className="production-month-total">
              Total: {fmt(data?.totalProduction)} m²
            </div>
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card
            className="production-dashboard-card production-chart-card"
            title={`Production by Tile Size - ${dayjs(month).format("MMMM YYYY")}`}
            extra={
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                disabled={!data}
                onClick={() => exportWorkbook({ line, month, data })}
              >
                Download Excel
              </Button>
            }
            loading={loading}
          >
            {sizes.length ? (
              <ReactECharts
                option={sizeOption}
                notMerge
                lazyUpdate
                style={{ height: 260, width: "100%" }}
              />
            ) : (
              <div className="production-chart-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No size data"
                />
              </div>
            )}
            <div className="production-month-total">
              Total: {fmt(data?.totalProduction)} m²
            </div>
          </Card>
        </Col>
      </Row>
    </section>
  );
}
