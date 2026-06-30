import { useState, useMemo } from "react";
import dayjs from "dayjs";

import { Tabs, DatePicker, Button, Space, message } from "antd";

import { SearchOutlined, DownloadOutlined } from "@ant-design/icons";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

import { getHistoricalData } from "../api/reportApi";
import HistoricalTable from "../components/HistoricalTable";
import HistoricalChart from "../components/HistoricalChart";

const { RangePicker } = DatePicker;

export default function HistoricalReport() {
  const [activeTab, setActiveTab] = useState("keda2");
  const [dateRange, setDateRange] = useState([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  const loadData = async () => {
    if (!dateRange || dateRange.length !== 2) {
      message.warning("Please select date range");
      return;
    }

    setLoading(true);

    const result = await getHistoricalData(
      activeTab,
      dateRange[0].format("YYYY-MM-DD"),
      dateRange[1].format("YYYY-MM-DD"),
    );

    setData(result || []);
    setLoading(false);
  };

  function getProductionDate(time, shift) {
    const date = new Date(time);

    if (shift === "22-06") {
      const hour = date.getUTCHours();
      const minute = date.getUTCMinutes();

      // Between 00:00 and 00:29 UTC → previous date
      if (hour === 0 && minute <= 30) {
        date.setUTCDate(date.getUTCDate() - 1);
      }
    }

    // Return UTC date
    return date.toISOString().split("T")[0];
  }

  function getShiftProduction(data = []) {
    const resultMap = new Map();

    // STEP 1: sort by time ascending (IMPORTANT)
    data.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );

    // STEP 2: keep overwriting → last value wins
    for (const item of data) {
      console.log("ITEM", item);
      const date = getProductionDate(item.time, item.shift);
      const shift = item.shift;
      const key = `${date}|${shift}`;

      resultMap.set(key, {
        date,
        shift,
        production: item.value,
      });
    }
    console.log(Array.from(resultMap.values()));
    // STEP 3: convert map → array
    return Array.from(resultMap.values());
  }
  function getShiftDowntime(data = []) {
    if (!Array.isArray(data)) return [];

    // Sort by timestamp
    const sorted = [...data].sort((a, b) => Number(a.ts) - Number(b.ts));

    const result = new Map();
    let stopStart = null;

    for (const item of sorted) {
      if (item.downStatus === "STOP_START") {
        stopStart = item;
        continue;
      }

      if (item.downStatus === "STOP_END" && stopStart) {
        // Calculate downtime in milliseconds
        const downtime = Math.floor(
          (Number(item.ts) - Number(stopStart.ts)) / 60000,
        );

        // Assign to the shift/date where the stop started
        //const date = stopStart.time.split("T")[0];
        const date = getProductionDate(stopStart.time, item.shift);

        const shift = stopStart.shift;

        const key = `${date}|${shift}`;

        if (!result.has(key)) {
          result.set(key, {
            date,
            shift,
            downtime: 0,
            downtimeMinutes: 0,
            downtimeHours: 0,
          });
        }

        const record = result.get(key);
        record.downtime += downtime;

        stopStart = null;
      }
    }

    // Convert units
    for (const record of result.values()) {
      record.downtimeMinutes = +(record.downtime / 60000).toFixed(2);
      record.downtimeHours = +(record.downtime / 3600000).toFixed(2);
    }

    return Array.from(result.values()).sort(
      (a, b) =>
        new Date(a.date) - new Date(b.date) || a.shift.localeCompare(b.shift),
    );
  }

  function mergeShiftData(productionData = [], downtimeData = []) {
    const map = new Map();

    // Add production
    for (const item of productionData) {
      const key = `${item.date}|${item.shift}`;

      map.set(key, {
        date: item.date,
        shift: item.shift,
        production: item.production,
        downtime: 0,
      });
    }

    // Add downtime
    for (const item of downtimeData) {
      const key = `${item.date}|${item.shift}`;

      if (map.has(key)) {
        map.get(key).downtime = item.downtime;
      } else {
        map.set(key, {
          date: item.date,
          shift: item.shift,
          production: 0,
          downtime: item.downtime,
        });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.date) - new Date(b.date) || a.shift.localeCompare(b.shift),
    );
  }

  const { tableData, chartData } = useMemo(() => {
    const production = getShiftProduction(data.production);
    const downtime = getShiftDowntime(data.downtime);

    const dataTable = mergeShiftData(production, downtime);
    // const dataChart = dataTable.map((item) => ({
    // //   label: `${item.date} (${item.shift})`,
    // //   production: item.production,
    // //   downtime: item.downtime,
    // //   shift: item.shift,
    // // }));

    const dataChart = dataTable.map((d) => ({
      date: d.date,
      shift: d.shift,
      label: `${d.date} | ${d.shift}`,
      production: d.production,
      downtime: d.downtime,
    }));

    return {
      tableData: dataTable,
      chartData: dataChart,
    };
  }, [data.production, data.downtime]);

  const exportExcel = async (tableData) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Historical Report");

    worksheet.columns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Shift", key: "shift", width: 12 },
      { header: "Production", key: "production", width: 15 },
      { header: "Downtime (min)", key: "downtime", width: 18 },
    ];

    // Add processed table data (NOT raw data)
    tableData.forEach((d) => {
      worksheet.addRow({
        date: d.date,
        shift: d.shift,
        production: d.production ?? 0,
        downtime: d.downtime ?? 0,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();

    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "Historical_Report.xlsx",
    );
  };

  const items = [
    {
      key: "keda2",
      label: "Keda 2",

      // 🔥 IMPORTANT: no Card here
      children: (
        <div style={{ padding: 16 }}>
          {/* Controls */}
          <Space
            style={{
              marginBottom: 16,
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <RangePicker value={dateRange} onChange={setDateRange} />

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
              onClick={() => exportExcel(tableData)}
            >
              Export Excel
            </Button>
          </Space>

          {/* Table */}
          <HistoricalTable data={tableData} />
          <HistoricalChart data={chartData} />
        </div>
      ),
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      // makes tab feel like container
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
