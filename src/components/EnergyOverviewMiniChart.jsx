// import { useMemo } from "react";
// import { Empty, Skeleton, Tooltip as AntTooltip } from "antd";
// import { WarningOutlined } from "@ant-design/icons";
// import ReactECharts from "echarts-for-react";
// import { formatColomboApiTime } from "../utils/energyTime";

// function getEnergyDisplayUnit(totalKwh) {
//   const total = Math.max(0, Number(totalKwh) || 0);

//   if (total >= 1_000_000) {
//     return { unit: "GWh", divisor: 1_000_000, decimals: 3 };
//   }

//   if (total >= 1_0000) {
//     return { unit: "MWh", divisor: 1_000, decimals: 3 };
//   }

//   return { unit: "kWh", divisor: 1, decimals: 2 };
// }

// function convertEnergy(kwh, displayUnit) {
//   return Math.max(0, Number(kwh) || 0) / displayUnit.divisor;
// }

// function formatConvertedEnergy(kwh, displayUnit) {
//   return `${convertEnergy(kwh, displayUnit).toLocaleString("en-US", {
//     maximumFractionDigits: displayUnit.decimals,
//   })} ${displayUnit.unit}`;
// }

// function labelForInterval(timestamp, interval) {
//   if (interval === "1y") return formatColomboApiTime(timestamp, "YYYY");
//   if (interval === "1mo") return formatColomboApiTime(timestamp, "MMM YY");
//   if (interval === "1d") return formatColomboApiTime(timestamp, "DD MMM");
//   return formatColomboApiTime(timestamp, "HH:mm");
// }

// export default function EnergyOverviewMiniChart({
//   title,
//   data = [],
//   interval = "1h",
//   loading = false,
//   error = "",
//   forceUnit,
// }) {
//   const total = useMemo(
//     () =>
//       data.reduce((sum, item) => {
//         const value = Number(item.energyUsageKwh);
//         return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
//       }, 0),
//     [data],
//   );

//   // Select the display unit once from the total for this card. Every bar,
//   // tooltip value and the total then uses exactly the same unit.
//   const displayUnit = useMemo(() => {
//     if (forceUnit === "kWh") {
//       return { unit: "kWh", divisor: 1, decimals: 2 };
//     }

//     return getEnergyDisplayUnit(total);
//   }, [total, forceUnit]);

//   const option = useMemo(
//     () => ({
//       animationDuration: 500,
//       animationEasing: "cubicOut",
//       tooltip: {
//         trigger: "axis",
//         backgroundColor: "rgba(15, 23, 42, 0.94)",
//         borderWidth: 0,
//         textStyle: { color: "#fff", fontSize: 12 },
//         padding: [8, 10],
//         axisPointer: {
//           type: "shadow",
//           shadowStyle: { color: "rgba(22,119,255,0.06)" },
//         },
//         formatter: (params) => {
//           const item = Array.isArray(params) ? params[0] : null;
//           const record = data[item?.dataIndex];
//           if (!record) return "";
//           return `<div style="font-weight:600;margin-bottom:3px">${labelForInterval(
//             record.intervalStart,
//             interval,
//           )}</div><div>${formatConvertedEnergy(
//             record.energyUsageKwh,
//             displayUnit,
//           )}</div>`;
//         },
//       },
//       grid: {
//         top: 8,
//         left: 2,
//         right: 2,
//         bottom: 2,
//       },
//       xAxis: {
//         type: "category",
//         show: false,
//         boundaryGap: true,
//         data: data.map((item) =>
//           labelForInterval(item.intervalStart, interval),
//         ),
//       },
//       yAxis: {
//         type: "value",
//         show: false,
//         min: 0,
//       },
//       series: [
//         {
//           type: "bar",
//           data: data.map((item) =>
//             convertEnergy(item.energyUsageKwh, displayUnit),
//           ),
//           barMaxWidth: 12,
//           itemStyle: {
//             borderRadius: [5, 5, 1, 1],
//             color: {
//               type: "linear",
//               x: 0,
//               y: 0,
//               x2: 0,
//               y2: 1,
//               colorStops: [
//                 { offset: 0, color: "#1677ff" },
//                 { offset: 1, color: "#69b1ff" },
//               ],
//             },
//           },
//           emphasis: {
//             itemStyle: { shadowBlur: 8, shadowColor: "rgba(22,119,255,0.22)" },
//           },
//         },
//       ],
//     }),
//     [data, displayUnit, interval],
//   );

//   if (loading) {
//     return (
//       <div className="energy-mini-card energy-mini-card-loading">
//         <div className="energy-mini-title">{title}</div>
//         <Skeleton active paragraph={{ rows: 2 }} title={false} />
//       </div>
//     );
//   }

//   return (
//     <div className="energy-mini-card">
//       <div className="energy-mini-card-header">
//         <div className="energy-mini-title">{title}</div>
//         {error ? (
//           <AntTooltip title={error}>
//             <WarningOutlined className="energy-mini-warning" />
//           </AntTooltip>
//         ) : null}
//       </div>

//       {data.length ? (
//         <ReactECharts
//           option={option}
//           notMerge
//           lazyUpdate
//           style={{ height: 92, width: "100%" }}
//         />
//       ) : (
//         <div className="energy-mini-empty">
//           <Empty
//             image={Empty.PRESENTED_IMAGE_SIMPLE}
//             description={error ? "Unavailable" : false}
//           />
//         </div>
//       )}
//       <div className="energy-mini-total">
//         {formatConvertedEnergy(total, displayUnit)}
//       </div>
//       <div className="energy-mini-unit-label">
//         Energy consumption · {displayUnit.unit}
//       </div>
//     </div>
//   );
// }
import { useMemo } from "react";
import { Empty, Skeleton, Tooltip as AntTooltip } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import { formatColomboApiTime } from "../utils/energyTime";

// ============================================================
// DISPLAY UNIT
// ============================================================

function getEnergyDisplayUnit(totalKwh) {
  const total = Math.max(0, Number(totalKwh) || 0);

  if (total >= 1_000_000) {
    return {
      unit: "GWh",
      divisor: 1_000_000,
      decimals: 3,
    };
  }

  if (total >= 10_000) {
    return {
      unit: "MWh",
      divisor: 1_000,
      decimals: 3,
    };
  }

  return {
    unit: "kWh",
    divisor: 1,
    decimals: 2,
  };
}

// ============================================================
// CONVERT ENERGY
// ============================================================

function convertEnergy(kwh, displayUnit) {
  return Math.max(0, Number(kwh) || 0) / displayUnit.divisor;
}

// ============================================================
// FORMAT ENERGY
// ============================================================

function formatConvertedEnergy(kwh, displayUnit) {
  return `${convertEnergy(kwh, displayUnit).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayUnit.decimals,
  })} ${displayUnit.unit}`;
}

// ============================================================
// AXIS / TOOLTIP LABEL
// ============================================================

function labelForInterval(timestamp, interval) {
  if (interval === "1y") {
    return formatColomboApiTime(timestamp, "YYYY");
  }

  if (interval === "1mo") {
    return formatColomboApiTime(timestamp, "MMM YY");
  }

  if (interval === "1d") {
    return formatColomboApiTime(timestamp, "DD MMM");
  }

  return formatColomboApiTime(timestamp, "HH:mm");
}

// ============================================================
// CREATE A COMMON GROUP KEY
//
// This prevents multiple device rows from appearing as
// separate bars for the same period.
//
// Example:
//
// Device 1:
// 2026-09-08T18:30:00.000Z
//
// Device 3:
// 2026-09-08T18:30:00.000Z
//
// Both become the same key.
// ============================================================

function getIntervalKey(timestamp, interval) {
  if (!timestamp) {
    return "";
  }

  if (interval === "1y") {
    return formatColomboApiTime(timestamp, "YYYY");
  }

  if (interval === "1mo") {
    return formatColomboApiTime(timestamp, "YYYY-MM");
  }

  if (interval === "1d") {
    return formatColomboApiTime(timestamp, "YYYY-MM-DD");
  }

  if (interval === "6h") {
    const date = new Date(timestamp);

    if (!Number.isFinite(date.getTime())) {
      return String(timestamp);
    }

    // Use Sri Lanka local components.
    const parts = {};

    for (const part of new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Colombo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date)) {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }
    }

    const hour = Number(parts.hour || 0);

    const bucketHour = Math.floor(hour / 6) * 6;

    return `${parts.year}-${parts.month}-${parts.day}-${String(
      bucketHour,
    ).padStart(2, "0")}`;
  }

  // Default = hourly
  return formatColomboApiTime(timestamp, "YYYY-MM-DD HH");
}

// ============================================================
// COMBINE MULTIPLE DEVICES INTO ONE RECORD PER INTERVAL
//
// Input:
//
// [
//   {
//     intervalStart: "...",
//     device_id: 1,
//     energyUsageKwh: 500
//   },
//   {
//     intervalStart: "...",
//     device_id: 3,
//     energyUsageKwh: 200
//   }
// ]
//
// Output:
//
// [
//   {
//     intervalStart: "...",
//     energyUsageKwh: 700,
//     deviceCount: 2
//   }
// ]
// ============================================================

function combineRecordsByInterval(data, interval) {
  const grouped = new Map();

  for (const item of data || []) {
    if (!item?.intervalStart) {
      continue;
    }

    const key = getIntervalKey(item.intervalStart, interval);

    if (!key) {
      continue;
    }

    const energyValue = Math.max(0, Number(item.energyUsageKwh) || 0);

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,

        intervalStart: item.intervalStart,

        intervalEnd: item.intervalEnd,

        energyUsageKwh: 0,

        devices: new Set(),
      });
    }

    const record = grouped.get(key);

    record.energyUsageKwh += energyValue;

    if (item.device_id !== undefined && item.device_id !== null) {
      record.devices.add(String(item.device_id));
    }
  }

  return Array.from(grouped.values())

    .map((record) => ({
      key: record.key,

      intervalStart: record.intervalStart,

      intervalEnd: record.intervalEnd,

      energyUsageKwh: record.energyUsageKwh,

      deviceCount: record.devices.size,

      deviceIds: Array.from(record.devices),
    }))

    .sort(
      (a, b) =>
        new Date(a.intervalStart).getTime() -
        new Date(b.intervalStart).getTime(),
    );
}

// ============================================================
// COMPONENT
// ============================================================

export default function EnergyOverviewMiniChart({
  title,
  data = [],
  interval = "1h",
  loading = false,
  error = "",
  forceUnit,
}) {
  // ==========================================================
  // COMBINE MULTIPLE DEVICES FIRST
  // ==========================================================

  const combinedData = useMemo(
    () => combineRecordsByInterval(data, interval),
    [data, interval],
  );

  // ==========================================================
  // TOTAL ENERGY
  //
  // IMPORTANT:
  // Uses combined interval data.
  // ==========================================================

  const total = useMemo(
    () =>
      combinedData.reduce((sum, item) => {
        const value = Number(item.energyUsageKwh);

        return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
      }, 0),
    [combinedData],
  );

  // ==========================================================
  // DISPLAY UNIT
  // ==========================================================

  const displayUnit = useMemo(() => {
    if (forceUnit === "kWh") {
      return {
        unit: "kWh",
        divisor: 1,
        decimals: 2,
      };
    }

    return getEnergyDisplayUnit(total);
  }, [total, forceUnit]);

  // ==========================================================
  // ECHART OPTION
  // ==========================================================

  const option = useMemo(
    () => ({
      animationDuration: 500,

      animationEasing: "cubicOut",

      // ======================================================
      // TOOLTIP
      // ======================================================

      tooltip: {
        trigger: "axis",

        backgroundColor: "rgba(15, 23, 42, 0.94)",

        borderWidth: 0,

        textStyle: {
          color: "#fff",

          fontSize: 12,
        },

        padding: [8, 10],

        axisPointer: {
          type: "shadow",

          shadowStyle: {
            color: "rgba(22,119,255,0.06)",
          },
        },

        formatter: (params) => {
          const item = Array.isArray(params) ? params[0] : null;

          const record = combinedData[item?.dataIndex];

          if (!record) {
            return "";
          }

          return `
              <div style="
                font-weight:600;
                margin-bottom:4px
              ">
                ${labelForInterval(record.intervalStart, interval)}
              </div>

              <div style="
                font-size:14px;
                font-weight:600
              ">
                ${formatConvertedEnergy(record.energyUsageKwh, displayUnit)}
              </div>
            `;
        },
      },

      // ======================================================
      // GRID
      // ======================================================

      grid: {
        top: 8,

        left: 2,

        right: 2,

        bottom: 2,
      },

      // ======================================================
      // X AXIS
      // ======================================================

      xAxis: {
        type: "category",

        show: false,

        boundaryGap: true,

        data: combinedData.map((item) =>
          labelForInterval(item.intervalStart, interval),
        ),
      },

      // ======================================================
      // Y AXIS
      // ======================================================

      yAxis: {
        type: "value",

        show: false,

        min: 0,
      },

      // ======================================================
      // SERIES
      // ======================================================

      series: [
        {
          type: "bar",

          data: combinedData.map((item) =>
            convertEnergy(item.energyUsageKwh, displayUnit),
          ),

          barMaxWidth: 12,

          itemStyle: {
            borderRadius: [5, 5, 1, 1],

            color: {
              type: "linear",

              x: 0,

              y: 0,

              x2: 0,

              y2: 1,

              colorStops: [
                {
                  offset: 0,

                  color: "#1677ff",
                },

                {
                  offset: 1,

                  color: "#69b1ff",
                },
              ],
            },
          },

          emphasis: {
            itemStyle: {
              shadowBlur: 8,

              shadowColor: "rgba(22,119,255,0.22)",
            },
          },
        },
      ],
    }),

    [combinedData, displayUnit, interval],
  );

  // ==========================================================
  // LOADING
  // ==========================================================

  if (loading) {
    return (
      <div
        className="
          energy-mini-card
          energy-mini-card-loading
        "
      >
        <div
          className="
            energy-mini-title
          "
        >
          {title}
        </div>

        <Skeleton
          active
          paragraph={{
            rows: 2,
          }}
          title={false}
        />
      </div>
    );
  }

  // ==========================================================
  // CARD
  // ==========================================================

  return (
    <div
      className="
        energy-mini-card
      "
    >
      <div
        className="
          energy-mini-card-header
        "
      >
        <div
          className="
            energy-mini-title
          "
        >
          {title}
        </div>

        {error ? (
          <AntTooltip title={error}>
            <WarningOutlined
              className="
                energy-mini-warning
              "
            />
          </AntTooltip>
        ) : null}
      </div>

      {/* ======================================================
          MINI CHART
      ====================================================== */}

      {combinedData.length ? (
        <ReactECharts
          option={option}
          notMerge
          lazyUpdate
          style={{
            height: 92,

            width: "100%",
          }}
        />
      ) : (
        <div
          className="
            energy-mini-empty
          "
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={error ? "Unavailable" : false}
          />
        </div>
      )}

      {/* ======================================================
          TOTAL
      ====================================================== */}

      <div
        className="
          energy-mini-total
        "
      >
        {formatConvertedEnergy(total, displayUnit)}
      </div>

      {/* ======================================================
          UNIT LABEL
      ====================================================== */}

      <div
        className="
          energy-mini-unit-label
        "
      >
        Energy consumption · {displayUnit.unit}
      </div>
    </div>
  );
}
