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
    .filter(d => d.time && d.value !== undefined)
    .map(d => ({
      time: dayjs(d.time).format("HH:mm:ss"),
      value: d.value
    }));

  // 2. Build ECharts option
  const option = {
    title: {
      text: "Shift Production",
      left: "center"
    },

    tooltip: {
      trigger: "axis"
    },

    xAxis: {
      type: "category",
      data: filtered.map(d => d.time),
      boundaryGap: false
    },

    yAxis: {
      type: "value"
    },

    series: [
      {
        name: "Shift Count",
        type: "line",
        data: filtered.map(d => d.value),
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2
        },
        areaStyle: {
          opacity: 0.2
        }
      }
    ],

    grid: {
      left: 40,
      right: 20,
      top: 50,
      bottom: 30
    }
  };

  return <ReactECharts option={option} style={{ height: 350 }} />;
}