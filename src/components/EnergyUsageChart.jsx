import { useMemo } from "react";
import { Empty, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import "./DashboardCharts.css";

function getIntervalLabel(timestamp, interval) {
  if (interval === "1d") {
    return dayjs(timestamp).format("YYYY-MM-DD");
  }

  return dayjs(timestamp).format("MM-DD HH:mm");
}

export default function EnergyUsageChart({
  data = [],
  loading = false,
  interval = "1h",
}) {
  const option = useMemo(() => {
    return {
      title: {
        text: "Energy Usage",
        left: "center",
      },

      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },

        formatter: (params) => {
          if (!Array.isArray(params)) {
            return "";
          }

          const item = params[0];
          const record = data[item?.dataIndex];

          if (!record) {
            return "";
          }

          return [
            `<strong>${getIntervalLabel(
              record.intervalStart,
              interval,
            )}</strong>`,

            `Start: ${dayjs(record.intervalStart).format(
              "YYYY-MM-DD HH:mm:ss",
            )}`,

            `End: ${dayjs(record.intervalEnd).format("YYYY-MM-DD HH:mm:ss")}`,

            `${item.marker} Usage: ${Number(
              record.energyUsageKwh,
            ).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} kWh`,

            `First reading: ${Number(record.firstEnergyKwh).toFixed(2)} kWh`,

            `Last reading: ${Number(record.lastEnergyKwh).toFixed(2)} kWh`,
          ].join("<br/>");
        },
      },

      grid: {
        top: 80,
        left: 75,
        right: 35,
        bottom: 100,
        containLabel: true,
      },

      toolbox: {
        right: 20,

        feature: {
          dataZoom: {
            yAxisIndex: "none",
          },
          restore: {},
          saveAsImage: {
            name: "Energy_Usage",
          },
        },
      },

      xAxis: {
        type: "category",

        data: data.map((record) =>
          getIntervalLabel(record.intervalStart, interval),
        ),

        axisLabel: {
          rotate: data.length > 10 ? 45 : 0,
          hideOverlap: true,
        },
      },

      yAxis: {
        type: "value",
        name: "Energy (kWh)",
        min: 0,

        nameLocation: "middle",
        nameGap: 55,

        axisLabel: {
          formatter: "{value} kWh",
        },
      },

      dataZoom: [
        {
          type: "inside",
        },
        {
          type: "slider",
          bottom: 25,
        },
      ],

      media: [
        {
          query: { maxWidth: 600 },
          option: {
            title: { top: 2, textStyle: { fontSize: 15, fontWeight: 500 } },
            toolbox: { show: false },
            grid: {
              top: 55,
              left: 12,
              right: 12,
              bottom: 82,
              containLabel: true,
            },
            xAxis: {
              name: interval === "1d" ? "Date" : "Time",
              nameLocation: "middle",
              nameGap: 50,
              nameTextStyle: { fontSize: 11 },
              axisLabel: {
                rotate: data.length > 6 ? 35 : 0,
                fontSize: 9,
                hideOverlap: true,
                interval: "auto",
              },
            },
            yAxis: {
              name: "Energy (kWh)",
              nameGap: 44,
              nameTextStyle: { fontSize: 10 },
              axisLabel: { fontSize: 9, formatter: "{value}" },
            },
            dataZoom: [
              { type: "inside" },
              { type: "slider", bottom: 18, height: 18 },
            ],
          },
        },
      ],

      series: [
        {
          name: "Energy Usage",
          type: "bar",
          barMaxWidth: 45,

          data: data.map((record) => {
            const value = Number(record.energyUsageKwh);

            return Number.isFinite(value) ? value : 0;
          }),

          emphasis: {
            focus: "series",
          },
        },
      ],
    };
  }, [data, interval]);

  if (loading) {
    return (
      <div
        style={{
          height: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!data.length) {
    return (
      <div
        style={{
          height: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Empty description="No energy usage data" />
      </div>
    );
  }

  return (
    <div
      className="responsive-dashboard-chart responsive-dashboard-chart--history"
      style={{ marginTop: 24 }}
    >
      <ReactECharts
        className="responsive-dashboard-chart__canvas"
        option={option}
        notMerge={true}
        lazyUpdate={true}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
