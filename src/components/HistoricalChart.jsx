// import {
//   BarChart,
//   Bar,
//   XAxis,
//   YAxis,
//   Tooltip,
//   Legend,
//   CartesianGrid,
//   ResponsiveContainer,
// } from "recharts";

// const shiftColors = {
//   "06-14": "#4CAF50",
//   "14-22": "#2196F3",
//   "22-06": "#FF9800",
// };

// export default function HistoricalChart({ data }) {
//   return (
//     <ResponsiveContainer width="100%" height={400}>
//       <BarChart data={data}>
//         <CartesianGrid strokeDasharray="3 3" />
//         <XAxis dataKey="label" />
//         <YAxis />
//         <Tooltip />
//         <Legend />

//         {/* Production (dynamic color via shift) */}
//         <Bar dataKey="production" name="Production" fill="#8884d8">
//           {data.map((entry, index) => (
//             <cell
//               key={`prod-${index}`}
//               fill={shiftColors[entry.shift] || "#8884d8"}
//             />
//           ))}
//         </Bar>

//         {/* Downtime (always red) */}
//         <Bar dataKey="downtime" name="Downtime" fill="#FF4D4F" />
//       </BarChart>
//     </ResponsiveContainer>
//   );
// }
// import ReactECharts from "echarts-for-react";

// const shiftColors = {
//   "06-14": "#4CAF50",
//   "14-22": "#2196F3",
//   "22-06": "#FF9800",
// };

// export default function HistoricalChart({ data }) {
//   const option = {
//     tooltip: {
//       trigger: "axis",
//     },
//     legend: {
//       data: ["Production", "Downtime"],
//     },
//     grid: {
//       left: "3%",
//       right: "4%",
//       bottom: "3%",
//       containLabel: true,
//     },
//     xAxis: {
//       type: "category",
//       data: data.map((d) => d.label),
//       axisLabel: {
//         rotate: 45,
//       },
//     },
//     yAxis: {
//       type: "value",
//     },
//     series: [
//       // PRODUCTION (dynamic color per bar)
//       {
//         name: "Production",
//         type: "bar",
//         data: data.map((d) => ({
//           value: d.production,
//           itemStyle: {
//             color: shiftColors[d.shift] || "#8884d8",
//           },
//         })),
//       },

//       // DOWNTIME (always red)
//       {
//         name: "Downtime",
//         type: "bar",
//         data: data.map((d) => d.downtime),
//         itemStyle: {
//           color: "#FF4D4F",
//         },
//       },
//     ],
//   };

//   return <ReactECharts option={option} style={{ height: 400 }} />;
// }
import ReactECharts from "echarts-for-react";

const shiftColors = {
  "06-14": "#4CAF50",
  "14-22": "#2196F3",
  "22-06": "#FF9800",
};

export default function HistoricalChart({ data }) {
  // STEP 1: build grouped data with visual gaps between dates
  const groupedData = [];

  let lastDate = null;

  data.forEach((d) => {
    if (lastDate && lastDate !== d.date) {
      // spacer row between dates
      groupedData.push({
        label: "",
        production: 0,
        downtime: 0,
        shift: null,
        isGap: true,
      });
    }

    groupedData.push({
      label: `${d.date} | ${d.shift}`,
      production: d.production,
      downtime: d.downtime,
      shift: d.shift,
      isGap: false,
    });

    lastDate = d.date;
  });

  // STEP 2: ECharts option
  const option = {
    tooltip: {
      trigger: "axis",
    },
    legend: {
      data: ["Production", "Downtime"],
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "10%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: groupedData.map((d) => d.label),
      axisLabel: {
        rotate: 45,
      },
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
    },
    series: [
      // PRODUCTION (shift-based color)
      {
        name: "Production",
        type: "bar",
        barGap: "0%",
        barCategoryGap: "5%",

        data: groupedData.map((d) => ({
          value: d.production,
          itemStyle: {
            color: d.isGap ? "transparent" : shiftColors[d.shift] || "#8884d8",
          },
        })),
        barWidth: 10, // Width in pixels
      },

      // DOWNTIME (always red)
      {
        name: "Downtime",
        type: "bar",
        barGap: "0%",
        data: groupedData.map((d) => ({
          value: d.downtime,
          itemStyle: {
            color: d.isGap ? "transparent" : "#FF4D4F",
          },
        })),
        barWidth: 10, // Width in pixels
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 450 }} />;
}
