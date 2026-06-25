import { useState, useEffect } from "react";
import { Card, Select, DatePicker, Space } from "antd";
import ProductionChart from "../components/ProductionChart";
import { getShiftData, getShiftLast } from "../api/dashboardApi";
import dayjs from "dayjs";
import { Row, Col } from "antd";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [shift, setShift] = useState("14-22");
  const [lastValue, setLastValue] = useState(0);
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(6, "hour"),
    dayjs(),
  ]);

  const { RangePicker } = DatePicker;

  const loadData = async () => {
    const fromTime = dateRange?.[0]?.toISOString();
    const toTime = dateRange?.[1]?.toISOString();
    const [data, last] = await Promise.all([
      getShiftData(shift, 24, fromTime, toTime),
      getShiftLast(shift),
    ]);

    setData(data);

    setLastValue(last?.value ?? 0);
  };

  useEffect(() => {
    // initial load

    if (dateRange && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
      loadData();
    }

    // live refresh
    const interval = setInterval(() => {
      loadData();
    }, 5000);

    // cleanup (IMPORTANT)
    return () => clearInterval(interval);
  }, [shift, dateRange]);

  return (
    <Card>
      <Select
        value={shift}
        onChange={(value) => setShift(value)}
        style={{ width: 150 }}
        options={[
          { value: "06-14", label: "06-14 Shift" },
          { value: "14-22", label: "14-22 Shift" },
          { value: "22-06", label: "22-06 Shift" },
          { value: "all", label: "All Shifts" },
        ]}
      />
      <RangePicker
        showTime={{
          format: "HH:mm",
          showSecond: false,
        }}
        format="YYYY-MM-DD HH:mm"
        value={dateRange}
        onChange={(values) => setDateRange(values)}
      />

      <Card style={{ width: 250, marginBottom: 20 }} title="Shift Last Value">
        <h1 style={{ fontSize: 40, color: "#000" }}>{lastValue}</h1>
      </Card>

      <ProductionChart data={data} />
    </Card>
  );
}
