import { useMemo } from "react";
import { Empty, Spin } from "antd";
import ReactECharts from "echarts-for-react";

const metricConfig = {
  production: {
    label: "Production",
    unit: "m²",
    axisType: "production",
    chartType: "bar",
  },
  tileCount: {
    label: "Tile Count",
    unit: "tiles",
    axisType: "production",
    chartType: "line",
  },
  totalDowntimeMinutes: {
    label: "Downtime",
    unit: "min",
    axisType: "minutes",
    chartType: "bar",
  },
  actualOperatingMinutes: {
    label: "Operating Time",
    unit: "min",
    axisType: "minutes",
    chartType: "line",
  },
  completedStops: {
    label: "Completed Stops",
    unit: "stops",
    axisType: "production",
    chartType: "line",
  },
  ole: {
    label: "OLE",
    unit: "%",
    axisType: "percentage",
    chartType: "line",
  },
  availability: {
    label: "Availability",
    unit: "%",
    axisType: "percentage",
    chartType: "line",
  },
  performance: {
    label: "Performance",
    unit: "%",
    axisType: "percentage",
    chartType: "line",
  },
  quality: {
    label: "Quality",
    unit: "%",
    axisType: "percentage",
    chartType: "line",
  },
};

function getAxisIndex(metric) {
  const axisType = metricConfig[metric]?.axisType;

  if (axisType === "percentage") {
    return 0;
  }

  if (axisType === "minutes") {
    return 1;
  }

  return 2;
}

export default function HistoricalChart({
  data = [],
  selectedMetrics = [],
  loading = false,
}) {
  const option = useMemo(() => {
    const labels = data.map(
      (record) => `${record.shiftDate} | ${record.shift}`,
    );

    const series = selectedMetrics
      .filter((metric) => metricConfig[metric])
      .map((metric) => {
        const config = metricConfig[metric];

        return {
          name: config.label,
          type: config.chartType,
          yAxisIndex: getAxisIndex(metric),

          data: data.map((record) => {
            const value = Number(record[metric]);
            return Number.isFinite(value) ? value : 0;
          }),

          smooth: config.chartType === "line",
          symbol: "circle",
          symbolSize: 7,
          showSymbol: data.length <= 40,

          barMaxWidth: 30,

          emphasis: {
            focus: "series",
          },

          lineStyle: {
            width: 2,
          },
        };
      });

    return {
      title: {
        text: "Keda 1 Historical Shift Performance",
        left: "center",
      },

      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
        },

        formatter: (params) => {
          if (!Array.isArray(params) || !params.length) {
            return "";
          }

          const record = data[params[0].dataIndex];

          const lines = [
            `<strong>${record.shiftDate} | ${record.shift}</strong>`,
            `Line: ${record.lineName || "-"}`,
            `Status: ${record.status || "-"}`,
          ];

          params.forEach((item) => {
            const metric = selectedMetrics[item.seriesIndex];
            const config = metricConfig[metric];

            lines.push(
              `${item.marker} ${item.seriesName}: ` +
                `${Number(item.value).toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })} ${config?.unit || ""}`,
            );
          });

          return lines.join("<br/>");
        },
      },

      legend: {
        top: 35,
        type: "scroll",
      },

      grid: {
        top: 90,
        left: 80,
        right: 190,
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
            name: "Historical_Shift_Performance",
          },
        },
      },

      xAxis: {
        type: "category",
        data: labels,
        boundaryGap: true,
        axisLabel: {
          rotate: data.length > 8 ? 45 : 0,
          hideOverlap: true,
        },
      },

      yAxis: [
        {
          type: "value",
          name: "Percentage (%)",
          position: "left",
          min: 0,
          max: 100,
          axisLabel: {
            formatter: "{value}%",
          },
        },
        {
          type: "value",
          name: "Time (min)",
          position: "right",
          offset: 0,
          min: 0,

          nameLocation: "middle",
          nameGap: 55,

          axisLabel: {
            formatter: "{value} min",
            margin: 12,
          },
        },
        {
          type: "value",
          name: "Production / Count",
          position: "right",
          offset: 100,

          min: 0,

          nameLocation: "middle",
          nameGap: 65,

          nameTextStyle: {
            fontSize: 12,
          },

          axisLabel: {
            margin: 12,
            formatter: (value) =>
              Number(value).toLocaleString("en-US", {
                notation: value >= 10000 ? "compact" : "standard",
                maximumFractionDigits: 1,
              }),
          },

          splitLine: {
            show: false,
          },
        },
      ],

      dataZoom: [
        {
          type: "inside",
          start: 0,
          end: data.length > 20 ? 40 : 100,
        },
        {
          type: "slider",
          bottom: 25,
          start: 0,
          end: data.length > 20 ? 40 : 100,
        },
      ],

      series,
    };
  }, [data, selectedMetrics]);

  if (loading) {
    return (
      <div
        style={{
          height: 450,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
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
          height: 350,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Empty description="No historical chart data" />
      </div>
    );
  }

  if (!selectedMetrics.length) {
    return (
      <div
        style={{
          height: 350,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Empty description="Select at least one chart column" />
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{
        height: 550,
        width: "100%",
      }}
    />
  );
}
