import { useMemo, useState } from "react";
import { Button, Empty, Modal, Typography, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { saveAs } from "file-saver";
import dayjs from "dayjs";
import { getDesignProduction } from "../utils/designProduction";

const format = (value) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export default function DesignProductionModal({ tileSize, line, month, data, onClose }) {
  const [exporting, setExporting] = useState(false);
  const rows = useMemo(() => getDesignProduction(data?.codeWiseProduction, tileSize), [data, tileSize]);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const option = {
    animation: false,
    grid: { left: 20, right: 20, top: 55, bottom: 55, containLabel: true },
    tooltip: { trigger: "axis", confine: true, valueFormatter: (value) => `${format(value)} m²` },
    xAxis: {
      type: "category", data: rows.map((row) => row.designCode),
      name: "Design Code", nameLocation: "middle", nameGap: 40,
      axisLabel: { interval: 0, width: 100, overflow: "truncate" },
    },
    yAxis: { type: "value", name: "Production (m²)", nameGap: 22, nameTextStyle: { align: "left" } },
    series: [{
      name: "Total Production", type: "bar", barMaxWidth: 28,
      itemStyle: { color: "#22c55e", borderRadius: [5, 5, 0, 0] },
      data: rows.map((row) => row.total),
      label: { show: true, position: "top", formatter: ({ value }) => format(value), fontSize: 12 },
    }],
  };

  const download = async () => {
    setExporting(true);
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Design Production");
      sheet.addRow([line, dayjs(month).format("MMMM YYYY"), tileSize]);
      sheet.addRow(["Design Code", "Tile Size", "Total Production (m²)"]).font = { bold: true };
      rows.forEach((row) => sheet.addRow([row.designCode, tileSize, row.total]));
      sheet.addRow(["Total", tileSize, total]).font = { bold: true };
      sheet.columns = [26, 16, 26].map((width) => ({ width }));
      sheet.getColumn(3).numFmt = "#,##0.00";
      sheet.views = [{ state: "frozen", ySplit: 2 }];
      sheet.autoFilter = { from: "A2", to: `C${rows.length + 2}` };
      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `${line}_${dayjs(month).format("YYYY-MM")}_${tileSize}_Design_Production`.replace(/[^a-z0-9_-]/gi, "_");
      saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileName}.xlsx`);
    } catch {
      message.error("Unable to export design production. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal open title={`Design Code Production — ${tileSize}`} width={800} onCancel={onClose}
      footer={[
        <Button key="download" icon={<DownloadOutlined />} loading={exporting} disabled={!rows.length} onClick={download}>Download Excel</Button>,
        <Button key="close" onClick={onClose}>Close</Button>,
      ]}>
      <Typography.Paragraph>{line} · {dayjs(month).format("MMMM YYYY")}</Typography.Paragraph>
      {rows.length ? <>
        <div style={{ overflowX: "auto" }}>
          <ReactECharts option={option} notMerge style={{ height: 340, width: "100%", minWidth: rows.length * 110 + 90 }} />
        </div>
        <Typography.Paragraph strong>Total: {format(total)} m²</Typography.Paragraph>
        <Typography.Text type="secondary">Monthly totals include previous shifts and the current shift.</Typography.Text>
      </> : <Empty description="No design-code production available for this tile size" />}
    </Modal>
  );
}
