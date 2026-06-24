import { useState, useEffect } from "react";

import {
  Card,
  Select,
} from "antd";

import ProductionChart from
  "../components/ProductionChart";

import {
  getShiftData,
   getShiftLast
} from "../api/dashboardApi";

export default function Dashboard() {

  const [data, setData] =
    useState([]);

  const [shift, setShift] =
    useState("06-14");

  const [lastValue, setLastValue] = useState(0);

  
//   const loadData = async () => {

//     const result =
//       await getShiftData(
//         shift,
//         24
//       );

//     setData(result);
//   };

  const loadData = async () => {
  const [data, last] = await Promise.all([
    getShiftData(shift, 24),
    getShiftLast(shift)
  ]);

  setData(data);

  // assuming API returns: { value: 123 }
  setLastValue(last?.value ?? 0);
};
  

  useEffect(() => {
    // initial load
  loadData();

  // live refresh
  const interval = setInterval(() => {
    loadData();
  }, 5000);

  // cleanup (IMPORTANT)
  return () => clearInterval(interval);
  }, [shift]);

  return (

    <Card title="Production Trend">

      <Select
        value={shift}
        onChange={setShift}
        style={{
          width: 150,
          marginBottom: 20
        }}
      >
        <Select.Option value="06-14">
          Shift 1
        </Select.Option>

        <Select.Option value="14-22">
          Shift 2
        </Select.Option>

        <Select.Option value="22-06">
          Shift 3
        </Select.Option>
      </Select>

      <Card
  style={{ width: 250, marginBottom: 20 }}
  title="Shift Last Value"
>
  <h1 style={{ fontSize: 40,color: "#000"  }}>
    {lastValue}
  </h1>
</Card>

      <ProductionChart
        data={data}
      />
           
     

    </Card>
  );
}