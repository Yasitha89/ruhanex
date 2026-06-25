import { useState, useEffect } from "react";
import { Card, Select, DatePicker, Space } from "antd";
import ProductionChart from "../components/ProductionChart";
import { getShiftData, getShiftLast } from "../api/dashboardApi";
import dayjs from "dayjs";

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [shift, setShift] = useState("06-14");
  const [lastValue, setLastValue] = useState(0);
  const [dateRange, setDateRange] = useState([]);

  const { RangePicker } = DatePicker;

  //   const loadData = async () => {

  //     const result =
  //       await getShiftData(
  //         shift,
  //         24
  //       );

  //     setData(result);
  //   };

  const loadData = async () => {
    const fromTime = dateRange?.[0]?.toISOString();
    const toTime = dateRange?.[1]?.toISOString();
    const [data, last] = await Promise.all([
      getShiftData(shift, 24, fromTime, toTime),
      getShiftLast(shift),
    ]);

    setData(data);

    // assuming API returns: { value: 123 }
    setLastValue(last?.value ?? 0);
  };

  useEffect(() => {
    // initial load
    //loadData();

      if (dateRange && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
        loadData();
      }

    // live refresh
    const interval = setInterval(() => {
      loadData();
    }, 5000);

    // cleanup (IMPORTANT)
    return () => clearInterval(interval);
  }, [shift,dateRange]);

  return (
    <Card title="Production Trend">
      {/* <Select
        value={shift}
        onChange={setShift}
        style={{
          width: 150,
          marginBottom: 20,
        }}
      >
        <Select.Option value="06-14">06-14 Shift</Select.Option>

        <Select.Option value="14-22">14-22 Shift</Select.Option>

        <Select.Option value="22-06">22-06 Shift</Select.Option>
      </Select> */}

      <Space style={{ marginBottom: 16 }}>
        {/* Shift Selector */}
        <Select
          value={shift}
          onChange={(value) => setShift(value)}
          style={{ width: 150 }}
          options={[
            { value: "06-14", label: "06-14 Shift" },
            { value: "14-22", label: "14-22 Shift" },
            { value: "22-06", label: "22-06 Shift" },
          ]}
        />

        {/* Date Time Range Picker */}
        <RangePicker
          showTime
          format="YYYY-MM-DD HH:mm:ss"
          value={dateRange}
          onChange={(values) => setDateRange(values)}
        />
      </Space>

      <Card style={{ width: 250, marginBottom: 20 }} title="Shift Last Value">
        <h1 style={{ fontSize: 40, color: "#000" }}>{lastValue}</h1>
      </Card>

      <ProductionChart data={data} />
    </Card>
  );
}
