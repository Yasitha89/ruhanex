// // import {
// //   LineChart,
// //   Line,
// //   XAxis,
// //   YAxis,
// //   Tooltip,
// //   CartesianGrid,
// //   ResponsiveContainer,
// //   Brush,
// // } from "recharts";

// import { Line } from "@ant-design/charts";

// export default function ProductionChart({ data }) {
//   const config = {
//     data,
//     xField: "time",
//     yField: "value",
//     smooth: true,
//   };
//   return (
//     <Line {...config} />
//     // <ResponsiveContainer width="100%" height={500}>
//     //   {/* <LineChart data={data}>
//     //     <CartesianGrid strokeDasharray="3 3" />

//     //     <XAxis
//     //       dataKey="time"
//     //       tickFormatter={(value) =>
//     //         new Date(value).toLocaleTimeString([], {
//     //           hour: "2-digit",
//     //           minute: "2-digit",
//     //         })
//     //       }
//     //     />

//     //     <YAxis />

//     //     <Tooltip labelFormatter={(value) => new Date(value).toLocaleString()} />

//     //     <Line type="monotone" dataKey="value" dot={false} />
//     //     <Brush dataKey="time" height={30} stroke="#8884d8" />
//     //   </LineChart> */}

//     // </ResponsiveContainer>
//   );
// }
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";

export default function ProductionChart({ data }) {
  // 1. Clean + format data
  const filtered = (data || [])
    .filter((d) => d.time && d.value !== undefined)
    .map((d) => ({
      time: dayjs(d.time).format("HH:mm"),
      value: d.value,
    }));

  //   const shiftColors = {
  //     "06-14": 1,
  //     "14-22": 2,
  //     "22-06": 3,
  //   };

  //   const filtered = (data || [])
  //     .filter((d) => d.time && d.value !== undefined)
  //     .map((d) => ({
  //       time: d.time,
  //       value: d.value,
  //       shift: d.shift,
  //       shiftCode: shiftColors[d.shift] || 0,
  //     }));

  // 2. Build ECharts option
  const option = {
    title: {
      text: "Shift Production (Pieces)",
      left: "center",
    },

    tooltip: {
      trigger: "axis",
    },

    xAxis: {
      type: "category",
      name: "Time",
      nameLocation: "bottom",
      nameGap: 50,
      data: filtered.map((d) => d.time),
      boundaryGap: false,
      axisLabel: {
        margin: 12,
      },
    },

    yAxis: {
      type: "value",
      name: "Production",
      nameLocation: "bottom",
      nameRotate: 90,
      nameGap: 50,
    },

    series: [
      //   {
      //     name: "06-14",
      //     type: "line",
      //     data: filtered.map((d) => d.value),
      //     lineStyle: { color: "#52c41a" },
      //   },
      //   {
      //     name: "14-22",
      //     type: "line",
      //     data: filtered.map((d) => d.value),
      //     lineStyle: { color: "#fa8c16" },
      //   },
      //   {
      //     name: "22-06",
      //     type: "line",
      //     data: filtered.map((d) => d.value),
      //     lineStyle: { color: "#1677ff" },
      //   },
      {
        name: "Shift Count",
        type: "line",
        data: filtered.map((d) => d.value),
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2,
        },
        areaStyle: {
          opacity: 0.2,
        },
        // markLine: {
        //   data: [{ xAxis: "06:00" }, { xAxis: "14:00" }, { xAxis: "22:00" }],
        // },
      },
    ],

    grid: {
      left: 40,
      right: 20,
      top: 50,
      bottom: 120,
    },
    dataZoom: [
      { type: "inside", xAxisIndex: 0 },
      { type: "slider", xAxisIndex: 0 },
    ],
  };

  return <ReactECharts option={option} style={{ height: 350 }} />;
}
