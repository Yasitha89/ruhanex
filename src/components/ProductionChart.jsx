import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import { useState, useMemo } from "react";

export default function ProductionChart({ data }) {
  const [isZoomedOut, setIsZoomedOut] = useState(true);

  const dataPoints = data.map((d) => [
    d.time,
    d.value,
    d.shift === "06-14" ? 1 : d.shift === "14-22" ? 2 : 3,
  ]);

  const s1 = dataPoints.filter((d) => d[2] === 1);
  const s2 = dataPoints.filter((d) => d[2] === 2);
  const s3 = dataPoints.filter((d) => d[2] === 3);

  const onEvents = {
    datazoom: (params) => {
      const start = params.batch?.[0]?.start || 0;
      setIsZoomedOut(start < 30);
    },
  };

  // 2. Build ECharts option
  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",
      },

      xAxis: {
        type: "time",
        name: "Time",
        nameLocation: "bottom",
        nameGap: 50,
        boundaryGap: false,
        //scale: true, // 👈 IMPORTANT: disables auto compression behavior
        minInterval: 60 * 1000, // 👈 1 minute resolution (important)
        axisLabel: {
          hideOverlap: true, // 👈 stops ECharts from reformatting aggressively
          formatter: (value) => {
            const date = new Date(value);

            const hours = date.getHours();
            const minutes = date.getMinutes();

            // FIX: DO NOT rely on isZoomedOut for 8h view
            const rangeHours =
              dataPoints?.length > 0
                ? (new Date(dataPoints[dataPoints.length - 1][0]) -
                    new Date(dataPoints[0][0])) /
                  36e5
                : 0;

            // 🔥 KEY FIX: decide format by actual range, NOT zoom state
            if (rangeHours > 12) {
              return date.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              });
            }

            return `${hours.toString().padStart(2, "0")}:${minutes
              .toString()
              .padStart(2, "0")}`;
          },
          // formatter: function (value) {
          //   const date = new Date(value);

          //   if (isZoomedOut) {
          //     return date.toLocaleDateString("en-GB", {
          //       day: "2-digit",
          //       month: "short",
          //     });
          //   }

          //   // zoomed in → show TIME
          //   return date.toLocaleTimeString([], {
          //     hour: "2-digit",
          //     minute: "2-digit",
          //   });
          // },
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
        {
          name: "06-14",
          type: "line",
          connectNulls: true,
          data: s1,
          showSymbol: false,
          color: "#52c41a",
          lineStyle: { color: "#52c41a" },
        },
        {
          name: "14-22",
          type: "line",
          connectNulls: true,
          data: s2,
          showSymbol: false,
          color: "#fa8c16",
          symbolSize: 5,
          lineStyle: { color: "#fa8c16" },
        },
        {
          name: "22-06",
          type: "line",
          connectNulls: true,
          data: s3,
          showSymbol: false,
          color: "#1677ff",
          lineStyle: { color: "#1677ff" },
        },

        // {
        //   name: "Shift Count",
        //   type: "line",
        //   data: dataPoints,
        //   smooth: false,
        //   showSymbol: false,
        //   connectNulls: true,
        //   lineStyle: {
        //     width: 2,
        //   },
        //   areaStyle: {
        //     opacity: 0.2,
        //   },
        //   // markLine: {
        //   //   data: [{ xAxis: "06:00" }, { xAxis: "14:00" }, { xAxis: "22:00" }],
        //   // },
        // },
      ],

      grid: {
        left: 40,
        right: 20,
        top: 50,
        bottom: 120,
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
        { type: "slider", xAxisIndex: 0, filterMode: "none" },
      ],

      media: [
        {
          query: { maxWidth: 600 },
          option: {
            grid: {
              left: 4,
              right: 4,
              top: 36,
              bottom: 86,
              containLabel: false,
            },
            xAxis: {
              name: "Time",
              nameLocation: "middle",
              nameGap: 42,
              nameTextStyle: { fontSize: 11 },
              axisLabel: {
                fontSize: 9,
                hideOverlap: true,
              },
            },
            yAxis: {
              name: "Production",
              nameLocation: "end",
              nameRotate: 0,
              nameGap: 8,
              nameTextStyle: {
                fontSize: 10,
                align: "left",
              },
              axisLabel: {
                inside: true,
                fontSize: 9,
                margin: 4,
                formatter: (value) =>
                  Number(value).toLocaleString("en-US", {
                    notation: value >= 10000 ? "compact" : "standard",
                    maximumFractionDigits: 0,
                  }),
              },
              axisTick: { inside: true },
            },
            dataZoom: [
              { type: "inside", xAxisIndex: 0, filterMode: "none" },
              { type: "slider", xAxisIndex: 0, filterMode: "none", bottom: 16, height: 18 },
            ],
          },
        },
      ],
    }),
    [isZoomedOut, dataPoints],
  );

  return (
    <ReactECharts option={option} onEvents={onEvents} style={{ height: 380 }} />
  );
}
