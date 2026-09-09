// // import { useMemo } from "react";
// // import { Empty, Spin } from "antd";
// // import ReactECharts from "echarts-for-react";
// // import { formatColomboApiTime } from "../utils/energyTime";

// // function getAxisLabel(timestamp, interval, view) {
// //   if (interval === "1mo")
// //     return formatColomboApiTime(timestamp, view === "Total" ? "MMM YY" : "MMM");
// //   if (interval === "1d") return formatColomboApiTime(timestamp, "DD");
// //   return formatColomboApiTime(timestamp, "HH:mm");
// // }

// // function getTooltipLabel(timestamp, interval) {
// //   if (interval === "1mo") return formatColomboApiTime(timestamp, "MMMM YYYY");
// //   if (interval === "1d") return formatColomboApiTime(timestamp, "DD MMMM YYYY");
// //   return formatColomboApiTime(timestamp, "DD MMMM YYYY, HH:mm");
// // }

// // function getXAxisName(interval, view) {
// //   if (interval === "1mo") return view === "Total" ? "Month / Year" : "Month";
// //   if (interval === "1d") return "Date";
// //   return "Time (Sri Lanka)";
// // }

// // export default function EnergyOverviewUsageChart({
// //   chartRef,
// //   data = [],
// //   interval = "1d",
// //   view = "Month",
// //   loading = false,
// // }) {
// //   const option = useMemo(
// //     () => ({
// //       animationDuration: 650,
// //       animationEasing: "cubicOut",
// //       tooltip: {
// //         trigger: "axis",
// //         backgroundColor: "rgba(15, 23, 42, 0.96)",
// //         borderWidth: 0,
// //         padding: [11, 13],
// //         textStyle: { color: "#fff", fontSize: 12 },
// //         axisPointer: {
// //           type: "shadow",
// //           shadowStyle: { color: "rgba(22,119,255,0.07)" },
// //         },
// //         formatter: (params) => {
// //           const item = Array.isArray(params) ? params[0] : null;
// //           const record = data[item?.dataIndex];
// //           if (!record) return "";

// //           return [
// //             `<div style="font-weight:600;font-size:13px;margin-bottom:5px">${getTooltipLabel(
// //               record.intervalStart,
// //               interval,
// //             )}</div>`,
// //             `<div style="opacity:.78;margin-bottom:2px">Energy consumption</div>`,
// //             `<div style="font-size:16px;font-weight:700">${Number(
// //               record.energyUsageKwh || 0,
// //             ).toLocaleString("en-US", {
// //               minimumFractionDigits: 2,
// //               maximumFractionDigits: 2,
// //             })} kWh</div>`,
// //           ].join("");
// //         },
// //       },
// //       grid: {
// //         top: 34,
// //         left: 76,
// //         right: 34,
// //         bottom: data.length > 45 ? 86 : 72,
// //         containLabel: true,
// //       },
// //       xAxis: {
// //         type: "category",
// //         name: getXAxisName(interval, view),
// //         nameLocation: "middle",
// //         nameGap: data.length > 45 ? 58 : 44,
// //         nameTextStyle: {
// //           color: "#667085",
// //           fontSize: 12,
// //           fontWeight: 500,
// //         },
// //         data: data.map((record) =>
// //           getAxisLabel(record.intervalStart, interval, view),
// //         ),
// //         axisTick: { alignWithLabel: true, lineStyle: { color: "#d0d5dd" } },
// //         axisLine: { lineStyle: { color: "#d0d5dd" } },
// //         axisLabel: {
// //           color: "#667085",
// //           fontSize: 11,
// //           hideOverlap: true,
// //           interval: data.length > 40 ? 2 : 0,
// //           margin: 12,
// //         },
// //       },
// //       yAxis: {
// //         type: "value",
// //         name: "Energy Consumption (kWh)",
// //         min: 0,
// //         nameLocation: "middle",
// //         nameGap: 58,
// //         nameRotate: 90,
// //         nameTextStyle: {
// //           color: "#667085",
// //           fontSize: 12,
// //           fontWeight: 500,
// //         },
// //         axisLine: { show: false },
// //         axisTick: { show: false },
// //         splitNumber: 5,
// //         splitLine: {
// //           lineStyle: { color: "#eaecf0", type: "dashed" },
// //         },
// //         axisLabel: {
// //           color: "#667085",
// //           fontSize: 11,
// //           formatter: (value) => Number(value).toLocaleString("en-US"),
// //         },
// //       },
// //       dataZoom:
// //         data.length > 45
// //           ? [
// //               { type: "inside", start: 0, end: 100 },
// //               {
// //                 type: "slider",
// //                 height: 18,
// //                 bottom: 8,
// //                 borderColor: "transparent",
// //                 backgroundColor: "#f2f4f7",
// //                 fillerColor: "rgba(22,119,255,0.14)",
// //                 handleStyle: { color: "#1677ff", borderColor: "#1677ff" },
// //                 moveHandleStyle: { color: "#98a2b3" },
// //                 dataBackground: {
// //                   lineStyle: { color: "#b2ddff" },
// //                   areaStyle: { color: "#e6f4ff" },
// //                 },
// //                 selectedDataBackground: {
// //                   lineStyle: { color: "#1677ff" },
// //                   areaStyle: { color: "#91caff" },
// //                 },
// //               },
// //             ]
// //           : [],
// //       series: [
// //         {
// //           name: "Energy consumption",
// //           type: "bar",
// //           barMaxWidth: 30,
// //           barMinWidth: 7,
// //           showBackground: true,
// //           backgroundStyle: {
// //             color: "rgba(148,163,184,0.07)",
// //             borderRadius: [6, 6, 0, 0],
// //           },
// //           itemStyle: {
// //             borderRadius: [6, 6, 1, 1],
// //             color: {
// //               type: "linear",
// //               x: 0,
// //               y: 0,
// //               x2: 0,
// //               y2: 1,
// //               colorStops: [
// //                 { offset: 0, color: "#1677ff" },
// //                 { offset: 1, color: "#69b1ff" },
// //               ],
// //             },
// //           },
// //           emphasis: {
// //             focus: "series",
// //             itemStyle: {
// //               shadowBlur: 10,
// //               shadowColor: "rgba(22,119,255,0.22)",
// //             },
// //           },
// //           data: data.map((record) => Math.max(0, Number(record.energyUsageKwh) || 0)),
// //         },
// //       ],
// //     }),
// //     [data, interval, view],
// //   );

// //   if (loading) {
// //     return (
// //       <div className="energy-main-chart-state">
// //         <div className="energy-chart-loading-content">
// //           <Spin size="large" />
// //           <span>Loading energy data...</span>
// //         </div>
// //       </div>
// //     );
// //   }

// //   if (!data.length) {
// //     return (
// //       <div className="energy-main-chart-state">
// //         <Empty description="No energy data for the selected period" />
// //       </div>
// //     );
// //   }

// //   return (
// //     <ReactECharts
// //       ref={chartRef}
// //       option={option}
// //       notMerge
// //       lazyUpdate
// //       style={{ height: 450, width: "100%" }}
// //     />
// //   );
// // }
// import { useMemo } from "react";
// import { Empty, Spin } from "antd";
// import ReactECharts from "echarts-for-react";
// import { formatColomboApiTime } from "../utils/energyTime";

// function getAxisLabel(timestamp, interval, view) {
//   if (interval === "1mo") {
//     return formatColomboApiTime(timestamp, view === "Total" ? "MMM YY" : "MMM");
//   }

//   if (interval === "1d") {
//     return formatColomboApiTime(timestamp, "DD");
//   }

//   return formatColomboApiTime(timestamp, "HH:mm");
// }

// function getTooltipLabel(timestamp, interval) {
//   if (interval === "1mo") {
//     return formatColomboApiTime(timestamp, "MMMM YYYY");
//   }

//   if (interval === "1d") {
//     return formatColomboApiTime(timestamp, "DD MMMM YYYY");
//   }

//   return formatColomboApiTime(timestamp, "DD MMMM YYYY, HH:mm");
// }

// function getXAxisName(interval, view) {
//   if (interval === "1mo") {
//     return view === "Total" ? "Month / Year" : "Month";
//   }

//   if (interval === "1d") {
//     return "Date";
//   }

//   return "Time (Sri Lanka)";
// }

// // ============================================================
// // GROUP DEVICE RECORDS BY TIME INTERVAL
// //
// // Input:
// //
// // [
// //   {
// //     intervalStart: "...",
// //     device_id: 1,
// //     energyUsageKwh: 50
// //   },
// //   {
// //     intervalStart: "...",
// //     device_id: 3,
// //     energyUsageKwh: 30
// //   }
// // ]
// //
// // Output:
// //
// // [
// //   {
// //     intervalStart: "...",
// //     device_1: 50,
// //     device_3: 30,
// //     total: 80
// //   }
// // ]
// // ============================================================

// function getBucketKey(timestamp, interval) {
//   if (interval === "1mo") {
//     return formatColomboApiTime(timestamp, "YYYY-MM");
//   }

//   if (interval === "1d") {
//     return formatColomboApiTime(timestamp, "YYYY-MM-DD");
//   }

//   if (interval === "6h") {
//     return formatColomboApiTime(timestamp, "YYYY-MM-DD HH");
//   }

//   // 1h
//   return formatColomboApiTime(timestamp, "YYYY-MM-DD HH");
// }

// function buildStackedChartData(data, interval) {
//   const grouped = new Map();

//   for (const record of data || []) {
//     if (!record?.intervalStart) {
//       continue;
//     }

//     const deviceId =
//       record.device_id !== undefined && record.device_id !== null
//         ? String(record.device_id)
//         : "unknown";

//     const value = Math.max(0, Number(record.energyUsageKwh) || 0);

//     // --------------------------------------------------------
//     // IMPORTANT:
//     // Group using the actual chart interval rather than
//     // requiring the raw timestamps to match exactly.
//     // --------------------------------------------------------

//     const bucketKey = getBucketKey(record.intervalStart, interval);

//     if (!grouped.has(bucketKey)) {
//       grouped.set(bucketKey, {
//         bucketKey,

//         // Keep one timestamp for axis/tooltip formatting
//         intervalStart: record.intervalStart,

//         total: 0,
//       });
//     }

//     const row = grouped.get(bucketKey);

//     const deviceKey = `device_${deviceId}`;

//     row[deviceKey] = Number(row[deviceKey] || 0) + value;

//     row.total = Number(row.total || 0) + value;
//   }

//   return Array.from(grouped.values()).sort(
//     (a, b) =>
//       new Date(a.intervalStart).getTime() - new Date(b.intervalStart).getTime(),
//   );
// }

// export default function EnergyOverviewUsageChart({
//   chartRef,
//   data = [],
//   interval = "1d",
//   view = "Month",
//   loading = false,
// }) {
//   // ==========================================================
//   // FIND ALL DEVICES RETURNED BY API
//   // ==========================================================

//   const deviceIds = useMemo(() => {
//     const ids = new Set();

//     for (const record of data || []) {
//       if (record?.device_id !== undefined && record?.device_id !== null) {
//         ids.add(String(record.device_id));
//       }
//     }

//     return Array.from(ids).sort((a, b) => Number(a) - Number(b));
//   }, [data]);

//   // ==========================================================
//   // GROUP RECORDS INTO ONE ROW PER TIME INTERVAL
//   // ==========================================================

//   const chartData = useMemo(() => buildStackedChartData(data), [data]);

//   // ==========================================================
//   // ECHART OPTION
//   // ==========================================================

//   const option = useMemo(() => {
//     const series = deviceIds.map((deviceId, index) => ({
//       name: `Device ${deviceId}`,

//       type: "bar",

//       // All devices share the same stack.
//       stack: "energy-total",

//       barMaxWidth: 30,

//       barMinWidth: 7,

//       // Background only on first series.
//       showBackground: index === 0,

//       backgroundStyle:
//         index === 0
//           ? {
//               color: "rgba(148,163,184,0.07)",

//               borderRadius: [6, 6, 0, 0],
//             }
//           : undefined,

//       emphasis: {
//         focus: "series",

//         itemStyle: {
//           shadowBlur: 10,

//           shadowColor: "rgba(0,0,0,0.15)",
//         },
//       },

//       data: chartData.map((record) =>
//         Math.max(0, Number(record[`device_${deviceId}`]) || 0),
//       ),
//     }));

//     return {
//       animationDuration: 650,

//       animationEasing: "cubicOut",

//       // ======================================================
//       // LEGEND
//       // ======================================================

//       legend: {
//         show: deviceIds.length > 1,

//         top: 0,

//         left: "center",

//         data: meters.map((meter) => meter.label),
//       },

//       // ======================================================
//       // TOOLTIP
//       // ======================================================

//       tooltip: {
//         trigger: "axis",

//         backgroundColor: "rgba(15, 23, 42, 0.96)",

//         borderWidth: 0,

//         padding: [11, 13],

//         textStyle: {
//           color: "#fff",
//           fontSize: 12,
//         },

//         axisPointer: {
//           type: "shadow",

//           shadowStyle: {
//             color: "rgba(22,119,255,0.07)",
//           },
//         },

//         formatter: (params) => {
//           const list = Array.isArray(params) ? params : [];

//           if (!list.length) {
//             return "";
//           }

//           const dataIndex = list[0]?.dataIndex;

//           const record = chartData[dataIndex];

//           if (!record) {
//             return "";
//           }

//           const rows = [
//             `<div style="
//               font-weight:600;
//               font-size:13px;
//               margin-bottom:8px
//             ">
//               ${getTooltipLabel(record.intervalStart, interval)}
//             </div>`,
//           ];

//           // ----------------------------------------------
//           // EACH DEVICE
//           // ----------------------------------------------

//           list.forEach((item) => {
//             const value = Math.max(0, Number(item?.value) || 0);

//             rows.push(`
//               <div style="
//                 display:flex;
//                 justify-content:space-between;
//                 align-items:center;
//                 gap:24px;
//                 margin-bottom:4px
//               ">
//                 <span>
//                   ${item.marker || ""}
//                   ${item.seriesName}
//                 </span>

//                 <strong>
//                   ${value.toLocaleString("en-US", {
//                     minimumFractionDigits: 2,
//                     maximumFractionDigits: 2,
//                   })} kWh
//                 </strong>
//               </div>
//             `);
//           });

//           // ----------------------------------------------
//           // TOTAL
//           // ----------------------------------------------

//           rows.push(`
//             <div style="
//               border-top:
//                 1px solid rgba(255,255,255,0.18);
//               margin-top:7px;
//               padding-top:7px;
//               display:flex;
//               justify-content:space-between;
//               gap:24px
//             ">
//               <span style="font-weight:600">
//                 Total
//               </span>

//               <strong style="font-size:14px">
//                 ${Number(record.total || 0).toLocaleString("en-US", {
//                   minimumFractionDigits: 2,
//                   maximumFractionDigits: 2,
//                 })} kWh
//               </strong>
//             </div>
//           `);

//           return rows.join("");
//         },
//       },

//       // ======================================================
//       // GRID
//       // ======================================================

//       grid: {
//         top: meters.length > 1 ? 58 : 34,

//         left: 76,

//         right: 34,

//         bottom: chartData.length > 45 ? 86 : 72,

//         containLabel: true,
//       },

//       // ======================================================
//       // X AXIS
//       // ======================================================

//       xAxis: {
//         type: "category",

//         name: getXAxisName(interval, view),

//         nameLocation: "middle",

//         nameGap: chartData.length > 45 ? 58 : 44,

//         nameTextStyle: {
//           color: "#667085",

//           fontSize: 12,

//           fontWeight: 500,
//         },

//         data: chartData.map((record) =>
//           getAxisLabel(record.intervalStart, interval, view),
//         ),

//         axisTick: {
//           alignWithLabel: true,

//           lineStyle: {
//             color: "#d0d5dd",
//           },
//         },

//         axisLine: {
//           lineStyle: {
//             color: "#d0d5dd",
//           },
//         },

//         axisLabel: {
//           color: "#667085",

//           fontSize: 11,

//           hideOverlap: true,

//           interval: chartData.length > 40 ? 2 : 0,

//           margin: 12,
//         },
//       },

//       // ======================================================
//       // Y AXIS
//       // ======================================================

//       yAxis: {
//         type: "value",

//         name: "Energy Consumption (kWh)",

//         min: 0,

//         nameLocation: "middle",

//         nameGap: 58,

//         nameRotate: 90,

//         nameTextStyle: {
//           color: "#667085",

//           fontSize: 12,

//           fontWeight: 500,
//         },

//         axisLine: {
//           show: false,
//         },

//         axisTick: {
//           show: false,
//         },

//         splitNumber: 5,

//         splitLine: {
//           lineStyle: {
//             color: "#eaecf0",

//             type: "dashed",
//           },
//         },

//         axisLabel: {
//           color: "#667085",

//           fontSize: 11,

//           formatter: (value) => Number(value).toLocaleString("en-US"),
//         },
//       },

//       // ======================================================
//       // ZOOM
//       // ======================================================

//       dataZoom:
//         chartData.length > 45
//           ? [
//               {
//                 type: "inside",

//                 start: 0,

//                 end: 100,
//               },

//               {
//                 type: "slider",

//                 height: 18,

//                 bottom: 8,

//                 borderColor: "transparent",

//                 backgroundColor: "#f2f4f7",

//                 fillerColor: "rgba(22,119,255,0.14)",

//                 handleStyle: {
//                   color: "#1677ff",

//                   borderColor: "#1677ff",
//                 },

//                 moveHandleStyle: {
//                   color: "#98a2b3",
//                 },

//                 dataBackground: {
//                   lineStyle: {
//                     color: "#b2ddff",
//                   },

//                   areaStyle: {
//                     color: "#e6f4ff",
//                   },
//                 },

//                 selectedDataBackground: {
//                   lineStyle: {
//                     color: "#1677ff",
//                   },

//                   areaStyle: {
//                     color: "#91caff",
//                   },
//                 },
//               },
//             ]
//           : [],

//       // ======================================================
//       // STACKED DEVICE SERIES
//       // ======================================================

//       series,
//     };
//   }, [chartData, deviceIds, interval, view]);

//   // ==========================================================
//   // LOADING
//   // ==========================================================

//   if (loading) {
//     return (
//       <div className="energy-main-chart-state">
//         <div className="energy-chart-loading-content">
//           <Spin size="large" />

//           <span>Loading energy data...</span>
//         </div>
//       </div>
//     );
//   }

//   // ==========================================================
//   // EMPTY
//   // ==========================================================

//   if (!data.length) {
//     return (
//       <div className="energy-main-chart-state">
//         <Empty description={"No energy data for the selected period"} />
//       </div>
//     );
//   }

//   // ==========================================================
//   // CHART
//   // ==========================================================

//   return (
//     <ReactECharts
//       ref={chartRef}
//       option={option}
//       notMerge
//       lazyUpdate
//       style={{
//         height: 450,
//         width: "100%",
//       }}
//     />
//   );
// }
import { useMemo } from "react";
import { Empty, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import { formatColomboApiTime } from "../utils/energyTime";
import { getEnergyMeterKey, getEnergyMeters } from "../utils/energyMeter";

function getAxisLabel(timestamp, interval, view) {
  if (interval === "1mo") {
    return formatColomboApiTime(timestamp, view === "Total" ? "MMM YY" : "MMM");
  }

  if (interval === "1d") {
    return formatColomboApiTime(timestamp, "DD");
  }

  return formatColomboApiTime(timestamp, "HH:mm");
}

function getTooltipLabel(timestamp, interval) {
  if (interval === "1mo") {
    return formatColomboApiTime(timestamp, "MMMM YYYY");
  }

  if (interval === "1d") {
    return formatColomboApiTime(timestamp, "DD MMMM YYYY");
  }

  return formatColomboApiTime(timestamp, "DD MMMM YYYY, HH:mm");
}

function getXAxisName(interval, view) {
  if (interval === "1mo") {
    return view === "Total" ? "Month / Year" : "Month";
  }

  if (interval === "1d") {
    return "Date";
  }

  return "Time (Sri Lanka)";
}

// ============================================================
// GROUP DEVICE RECORDS BY TIME INTERVAL
//
// Input:
//
// [
//   {
//     intervalStart: "...",
//     device_id: 1,
//     energyUsageKwh: 50
//   },
//   {
//     intervalStart: "...",
//     device_id: 3,
//     energyUsageKwh: 30
//   }
// ]
//
// Output:
//
// [
//   {
//     intervalStart: "...",
//     device_1: 50,
//     device_3: 30,
//     total: 80
//   }
// ]
// ============================================================

function buildStackedChartData(data) {
  const grouped = new Map();

  for (const record of data || []) {
    const intervalStart = record?.intervalStart;

    if (!intervalStart) {
      continue;
    }

    const meterKey = getEnergyMeterKey(record);

    const value = Math.max(0, Number(record?.energyUsageKwh) || 0);

    if (!grouped.has(intervalStart)) {
      grouped.set(intervalStart, {
        intervalStart,
        total: 0,
      });
    }

    const row = grouped.get(intervalStart);

    const key = `meter_${meterKey}`;

    row[key] = Number(row[key] || 0) + value;

    row.total = Number(row.total || 0) + value;
  }

  return Array.from(grouped.values()).sort(
    (a, b) =>
      new Date(a.intervalStart).getTime() - new Date(b.intervalStart).getTime(),
  );
}

export default function EnergyOverviewUsageChart({
  chartRef,
  data = [],
  interval = "1d",
  view = "Month",
  loading = false,
}) {
  // ==========================================================
  // FIND ALL DEVICES RETURNED BY API
  // ==========================================================

  const meters = useMemo(() => getEnergyMeters(data), [data]);

  // ==========================================================
  // GROUP RECORDS INTO ONE ROW PER TIME INTERVAL
  // ==========================================================

  const chartData = useMemo(() => buildStackedChartData(data), [data]);

  // ==========================================================
  // ECHART OPTION
  // ==========================================================

  const option = useMemo(() => {
    const series = meters.map((meter, index) => ({
      name: meter.label,

      type: "bar",

      // All devices share the same stack.
      stack: "energy-total",

      barMaxWidth: 30,

      barMinWidth: 7,

      // Background only on first series.
      showBackground: index === 0,

      backgroundStyle:
        index === 0
          ? {
              color: "rgba(148,163,184,0.07)",

              borderRadius: [6, 6, 0, 0],
            }
          : undefined,

      emphasis: {
        focus: "series",

        itemStyle: {
          shadowBlur: 10,

          shadowColor: "rgba(0,0,0,0.15)",
        },
      },

      data: chartData.map((record) =>
        Math.max(0, Number(record[`meter_${meter.key}`]) || 0),
      ),
    }));

    return {
      animationDuration: 650,

      animationEasing: "cubicOut",

      // ======================================================
      // LEGEND
      // ======================================================

      legend: {
        show: meters.length > 1,

        top: 0,

        left: "center",

        data: meters.map((meter) => meter.label),
      },

      // ======================================================
      // TOOLTIP
      // ======================================================

      tooltip: {
        trigger: "axis",

        backgroundColor: "rgba(15, 23, 42, 0.96)",

        borderWidth: 0,

        padding: [11, 13],

        textStyle: {
          color: "#fff",
          fontSize: 12,
        },

        axisPointer: {
          type: "shadow",

          shadowStyle: {
            color: "rgba(22,119,255,0.07)",
          },
        },

        formatter: (params) => {
          const list = Array.isArray(params) ? params : [];

          if (!list.length) {
            return "";
          }

          const dataIndex = list[0]?.dataIndex;

          const record = chartData[dataIndex];

          if (!record) {
            return "";
          }

          const rows = [
            `<div style="
              font-weight:600;
              font-size:13px;
              margin-bottom:8px
            ">
              ${getTooltipLabel(record.intervalStart, interval)}
            </div>`,
          ];

          // ----------------------------------------------
          // EACH DEVICE
          // ----------------------------------------------

          list.forEach((item) => {
            const value = Math.max(0, Number(item?.value) || 0);

            rows.push(`
              <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:24px;
                margin-bottom:4px
              ">
                <span>
                  ${item.marker || ""}
                  ${item.seriesName}
                </span>

                <strong>
                  ${value.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} kWh
                </strong>
              </div>
            `);
          });

          // ----------------------------------------------
          // TOTAL
          // ----------------------------------------------

          rows.push(`
            <div style="
              border-top:
                1px solid rgba(255,255,255,0.18);
              margin-top:7px;
              padding-top:7px;
              display:flex;
              justify-content:space-between;
              gap:24px
            ">
              <span style="font-weight:600">
                Total
              </span>

              <strong style="font-size:14px">
                ${Number(record.total || 0).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} kWh
              </strong>
            </div>
          `);

          return rows.join("");
        },
      },

      // ======================================================
      // GRID
      // ======================================================

      grid: {
        top: meters.length > 1 ? 58 : 34,

        left: 76,

        right: 34,

        bottom: chartData.length > 45 ? 86 : 72,

        containLabel: true,
      },

      // ======================================================
      // X AXIS
      // ======================================================

      xAxis: {
        type: "category",

        name: getXAxisName(interval, view),

        nameLocation: "middle",

        nameGap: chartData.length > 45 ? 58 : 44,

        nameTextStyle: {
          color: "#667085",

          fontSize: 12,

          fontWeight: 500,
        },

        data: chartData.map((record) =>
          getAxisLabel(record.intervalStart, interval, view),
        ),

        axisTick: {
          alignWithLabel: true,

          lineStyle: {
            color: "#d0d5dd",
          },
        },

        axisLine: {
          lineStyle: {
            color: "#d0d5dd",
          },
        },

        axisLabel: {
          color: "#667085",

          fontSize: 11,

          hideOverlap: true,

          interval: chartData.length > 40 ? 2 : 0,

          margin: 12,
        },
      },

      // ======================================================
      // Y AXIS
      // ======================================================

      yAxis: {
        type: "value",

        name: "Energy Consumption (kWh)",

        min: 0,

        nameLocation: "middle",

        nameGap: 58,

        nameRotate: 90,

        nameTextStyle: {
          color: "#667085",

          fontSize: 12,

          fontWeight: 500,
        },

        axisLine: {
          show: false,
        },

        axisTick: {
          show: false,
        },

        splitNumber: 5,

        splitLine: {
          lineStyle: {
            color: "#eaecf0",

            type: "dashed",
          },
        },

        axisLabel: {
          color: "#667085",

          fontSize: 11,

          formatter: (value) => Number(value).toLocaleString("en-US"),
        },
      },

      // ======================================================
      // ZOOM
      // ======================================================

      dataZoom:
        chartData.length > 45
          ? [
              {
                type: "inside",

                start: 0,

                end: 100,
              },

              {
                type: "slider",

                height: 18,

                bottom: 8,

                borderColor: "transparent",

                backgroundColor: "#f2f4f7",

                fillerColor: "rgba(22,119,255,0.14)",

                handleStyle: {
                  color: "#1677ff",

                  borderColor: "#1677ff",
                },

                moveHandleStyle: {
                  color: "#98a2b3",
                },

                dataBackground: {
                  lineStyle: {
                    color: "#b2ddff",
                  },

                  areaStyle: {
                    color: "#e6f4ff",
                  },
                },

                selectedDataBackground: {
                  lineStyle: {
                    color: "#1677ff",
                  },

                  areaStyle: {
                    color: "#91caff",
                  },
                },
              },
            ]
          : [],

      // ======================================================
      // STACKED DEVICE SERIES
      // ======================================================

      series,
    };
  }, [chartData, meters, interval, view]);

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div className="energy-main-chart-state">
        <div className="energy-chart-loading-content">
          <Spin size="large" />

          <span>Loading energy data...</span>
        </div>
      </div>
    );
  }

  // ==========================================================
  // EMPTY
  // ==========================================================

  if (!data.length) {
    return (
      <div className="energy-main-chart-state">
        <Empty description={"No energy data for the selected period"} />
      </div>
    );
  }

  // ==========================================================
  // CHART
  // ==========================================================

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      notMerge
      lazyUpdate
      style={{
        height: 450,
        width: "100%",
      }}
    />
  );
}
