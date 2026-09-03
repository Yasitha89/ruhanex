import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useMemo, useState } from "react";
import dayjs from "dayjs";

import {
  Tabs,
  DatePicker,
  Button,
  Space,
  Select,
  Typography,
  message,
} from "antd";

import { SearchOutlined, DownloadOutlined } from "@ant-design/icons";


import { getHistoricalData } from "../api/reportApi";
import HistoricalTable from "../components/HistoricalTable";
import HistoricalChart from "../components/HistoricalChart";

const { RangePicker } = DatePicker;
const { Text } = Typography;

const chartMetricOptions = [
  {
    label: "Production",
    value: "production",
  },
  {
    label: "Tile Count",
    value: "tileCount",
  },
  {
    label: "Downtime",
    value: "totalDowntimeMinutes",
  },
  {
    label: "OLE",
    value: "ole",
  },
  {
    label: "Availability",
    value: "availability",
  },
  {
    label: "Performance",
    value: "performance",
  },
  {
    label: "Quality",
    value: "quality",
  },
  {
    label: "Operating Time",
    value: "actualOperatingMinutes",
  },
  {
    label: "Completed Stops",
    value: "completedStops",
  },
];

const lineMap = {
  keda1: "KEDA 1",
  keda2: "KEDA 2",
};

export default function HistoricalReport() {
  const [activeTab, setActiveTab] = useState("keda1");

  const [dateRange, setDateRange] = useState([
    dayjs().subtract(7, "day"),
    dayjs(),
  ]);

  const [selectedMetrics, setSelectedMetrics] = useState([
    "production",
    "totalDowntimeMinutes",
    "ole",
  ]);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  const loadData = async () => {
    if (!Array.isArray(dateRange) || dateRange.length !== 2) {
      message.warning("Please select a date range");
      return;
    }

    try {
      setLoading(true);

      const lineName = lineMap[activeTab];

      const result = await getHistoricalData(
        lineName,
        dateRange[0].format("YYYY-MM-DD"),
        dateRange[1].format("YYYY-MM-DD"),
      );

      /*
       * Supported API response formats:
       *
       * 1. [{ lineStats: {...} }]
       * 2. [{...lineStats fields}]
       * 3. { data: [{ lineStats: {...} }] }
       * 4. { records: [{ lineStats: {...} }] }
       */

      const rawRecords = Array.isArray(result)
        ? result
        : result?.data || result?.records || [];

      const normalizedRecords = rawRecords
        .map((record) => {
          const stats = record?.lineStats || record;

          return {
            id: record?._id || stats?._id,
            ...stats,
          };
        })
        .filter((record) => record?.shiftDate)
        .sort((a, b) => {
          const firstTime = new Date(
            a.shiftStart || `${a.shiftDate}T00:00:00`,
          ).getTime();

          const secondTime = new Date(
            b.shiftStart || `${b.shiftDate}T00:00:00`,
          ).getTime();

          return firstTime - secondTime;
        });

      setData(normalizedRecords);

      if (normalizedRecords.length === 0) {
        message.info("No historical records found");
      }
    } catch (error) {
      console.error("Historical data loading error:", error);

      message.error(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to load historical data",
      );

      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const tableData = useMemo(() => {
    return data.map((record, index) => ({
      key:
        record.id ||
        `${record.lineName}-${record.shiftDate}-${record.shift}-${index}`,
      ...record,
    }));
  }, [data]);

  const exportExcel = async () => {
    if (!tableData.length) {
      message.warning("There is no data to export");
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Historical Report");

      worksheet.columns = [
        {
          header: "Date",
          key: "shiftDate",
          width: 14,
        },
        {
          header: "Line",
          key: "lineName",
          width: 14,
        },
        {
          header: "Shift",
          key: "shift",
          width: 12,
        },
        {
          header: "Status",
          key: "status",
          width: 12,
        },
        {
          header: "Tile Count",
          key: "tileCount",
          width: 14,
        },
        {
          header: "Production",
          key: "production",
          width: 14,
        },
        {
          header: "Unit",
          key: "productionUnit",
          width: 10,
        },
        {
          header: "Downtime (min)",
          key: "totalDowntimeMinutes",
          width: 18,
        },
        {
          header: "Completed Stops",
          key: "completedStops",
          width: 18,
        },
        {
          header: "OLE (%)",
          key: "ole",
          width: 12,
        },
        {
          header: "Availability (%)",
          key: "availability",
          width: 18,
        },
        {
          header: "Performance (%)",
          key: "performance",
          width: 18,
        },
        {
          header: "Quality (%)",
          key: "quality",
          width: 14,
        },
        {
          header: "Operating Time (min)",
          key: "actualOperatingMinutes",
          width: 22,
        },
        {
          header: "Planned Production Time (min)",
          key: "plannedProductionMinutes",
          width: 28,
        },
      ];

      tableData.forEach((record) => {
        worksheet.addRow({
          shiftDate: record.shiftDate,
          lineName: record.lineName,
          shift: record.shift,
          status: record.status,
          tileCount: Number(record.tileCount) || 0,
          production: Number(record.production) || 0,
          productionUnit: record.productionUnit || "",
          totalDowntimeMinutes: Number(record.totalDowntimeMinutes) || 0,
          completedStops: Number(record.completedStops) || 0,
          ole: Number(record.ole) || 0,
          availability: Number(record.availability) || 0,
          performance: Number(record.performance) || 0,
          quality: Number(record.quality) || 0,
          actualOperatingMinutes: Number(record.actualOperatingMinutes) || 0,
          plannedProductionMinutes:
            Number(record.plannedProductionMinutes) || 0,
        });
      });

      const headerRow = worksheet.getRow(1);
      headerRow.font = {
        bold: true,
      };

      headerRow.alignment = {
        vertical: "middle",
        horizontal: "center",
      };

      worksheet.views = [
        {
          state: "frozen",
          ySplit: 1,
        },
      ];

      worksheet.autoFilter = {
        from: "A1",
        to: "O1",
      };

      const buffer = await workbook.xlsx.writeBuffer();

      const fileName = `${lineMap[activeTab].replaceAll(
        " ",
        "_",
      )}_Historical_Report_${dateRange[0].format(
        "YYYY-MM-DD",
      )}_${dateRange[1].format("YYYY-MM-DD")}.xlsx`;

      saveAs(
        new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        fileName,
      );
    } catch (error) {
      console.error("Excel export error:", error);
      message.error("Unable to export the Excel report");
    }
  };

  const reportContent = (
    <div style={{ padding: 16 }}>
      <Space
        wrap
        size="middle"
        style={{
          marginBottom: 16,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <div>
          <Text
            strong
            style={{
              display: "block",
              marginBottom: 6,
            }}
          >
            Date range
          </Text>

          <RangePicker
            value={dateRange}
            onChange={(values) => setDateRange(values || [])}
            allowClear
          />
        </div>

        <Button
          type="primary"
          icon={<SearchOutlined />}
          onClick={loadData}
          loading={loading}
        >
          Load Data
        </Button>

        <Button
          icon={<DownloadOutlined />}
          onClick={exportExcel}
          disabled={!tableData.length}
        >
          Export Excel
        </Button>
      </Space>

      <HistoricalTable data={tableData} loading={loading} />

      <div
        style={{
          marginTop: 24,
          marginBottom: 12,
        }}
      >
        <Text
          strong
          style={{
            display: "block",
            marginBottom: 6,
          }}
        >
          Select chart columns
        </Text>

        <Select
          mode="multiple"
          allowClear
          style={{
            width: "100%",
            maxWidth: 750,
          }}
          value={selectedMetrics}
          options={chartMetricOptions}
          placeholder="Select values to display in the chart"
          onChange={setSelectedMetrics}
          maxTagCount="responsive"
        />
      </div>

      <HistoricalChart
        data={tableData}
        selectedMetrics={selectedMetrics}
        loading={loading}
      />
    </div>
  );

  const items = [
    {
      key: "keda1",
      label: "Keda 1",
      children: reportContent,
    },
    {
      key: "keda2",
      label: "Keda 2",
      children: reportContent,
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={(key) => {
        setActiveTab(key);
        setData([]);
      }}
      type="card"
      className="historical-tabs"
      style={{
        background: "#fff",
        padding: 8,
        borderRadius: 8,
      }}
      items={items}
    />
  );
}
