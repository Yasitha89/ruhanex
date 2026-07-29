import { useMemo } from "react";
import { Empty, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";

const metricConfig = {
  current_l1_a: {
    label: "L1 Current",
    unit: "A",
    axisGroup: "current",
    decimals: 2,
  },

  current_l2_a: {
    label: "L2 Current",
    unit: "A",
    axisGroup: "current",
    decimals: 2,
  },

  current_l3_a: {
    label: "L3 Current",
    unit: "A",
    axisGroup: "current",
    decimals: 2,
  },

  current_avg_a: {
    label: "Average Current",
    unit: "A",
    axisGroup: "current",
    decimals: 2,
  },

  voltage_l1_l2_v: {
    label: "L1-L2 Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  voltage_l2_l3_v: {
    label: "L2-L3 Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  voltage_l3_l1_v: {
    label: "L3-L1 Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  voltage_ll_avg_v: {
    label: "Average Line Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  voltage_l1_n_v: {
    label: "L1-N Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  voltage_l2_n_v: {
    label: "L2-N Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  voltage_l3_n_v: {
    label: "L3-N Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  voltage_ln_avg_v: {
    label: "Average Phase Voltage",
    unit: "V",
    axisGroup: "voltage",
    decimals: 2,
  },

  power_active_kw: {
    label: "Active Power",
    unit: "kW",
    axisGroup: "power",
    decimals: 3,
  },

  power_reactive_kvar: {
    label: "Reactive Power",
    unit: "kvar",
    axisGroup: "power",
    decimals: 3,
  },

  power_apparent_kva: {
    label: "Apparent Power",
    unit: "kVA",
    axisGroup: "power",
    decimals: 3,
  },

  power_power_factor: {
    label: "Power Factor",
    unit: "",
    axisGroup: "powerFactor",
    decimals: 3,
  },

  power_frequency_hz: {
    label: "Frequency",
    unit: "Hz",
    axisGroup: "frequency",
    decimals: 2,
  },
};

function getYAxisIndex(metricKey) {
  const axisGroup = metricConfig[metricKey]?.axisGroup;

  switch (axisGroup) {
    case "current":
      return 0;

    case "voltage":
      return 1;

    case "power":
      return 2;

    case "powerFactor":
      return 3;

    case "frequency":
      return 4;

    default:
      return 0;
  }
}

function formatTooltipNumber(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function EnergyHistoricalChart({
  data = [],
  selectedMetrics = [],
  loading = false,
}) {
  const availableMetrics = useMemo(() => {
    return selectedMetrics.filter((metric) => metricConfig[metric]);
  }, [selectedMetrics]);

  const option = useMemo(() => {
    const series = availableMetrics.map((metricKey) => {
      const config = metricConfig[metricKey];

      return {
        name: config.label,
        type: "line",
        yAxisIndex: getYAxisIndex(metricKey),

        data: data.map((record) => {
          const timestamp = record.timestamp;

          const number = Number(record[metricKey]);

          return [timestamp, Number.isFinite(number) ? number : null];
        }),

        showSymbol: false,
        symbol: "circle",
        symbolSize: 5,
        smooth: false,
        connectNulls: false,

        lineStyle: {
          width: 2,
        },

        emphasis: {
          focus: "series",
        },
      };
    });

    return {
      animation: false,

      title: {
        text: "Historical Electricity Measurements",
        left: "center",
      },

      legend: {
        type: "scroll",
        top: 38,
        left: 20,
        right: 20,
      },

      tooltip: {
        trigger: "axis",
        confine: true,

        axisPointer: {
          type: "cross",

          label: {
            show: true,
          },
        },

        formatter: (params) => {
          if (!Array.isArray(params) || !params.length) {
            return "";
          }

          const firstValue = params[0]?.value;

          const timestamp = Array.isArray(firstValue)
            ? firstValue[0]
            : params[0]?.axisValue;

          const tooltipLines = [
            `<strong>${dayjs(timestamp).format(
              "YYYY-MM-DD HH:mm:ss",
            )}</strong>`,
          ];

          params.forEach((item) => {
            const metricKey = availableMetrics[item.seriesIndex];

            const config = metricConfig[metricKey];

            const value = Array.isArray(item.value)
              ? item.value[1]
              : item.value;

            const formattedValue = formatTooltipNumber(
              value,
              config?.decimals ?? 2,
            );

            const unit = config?.unit ? ` ${config.unit}` : "";

            tooltipLines.push(
              `${item.marker} ${item.seriesName}: ` +
                `${formattedValue}${unit}`,
            );
          });

          return tooltipLines.join("<br/>");
        },
      },

      toolbox: {
        right: 20,

        feature: {
          dataZoom: {
            yAxisIndex: "none",
          },

          restore: {},

          saveAsImage: {
            name: "Historical_Electricity_Chart",
            pixelRatio: 2,
          },
        },
      },

      grid: {
        top: 95,
        left: 145,
        right: 240,
        bottom: 105,
        containLabel: true,
      },

      xAxis: {
        type: "time",

        axisLabel: {
          hideOverlap: true,

          formatter: (value) => {
            return dayjs(value).format("MM-DD HH:mm");
          },
        },

        axisPointer: {
          label: {
            formatter: ({ value }) => {
              return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
            },
          },
        },
      },

      yAxis: [
        {
          type: "value",
          name: "Current (A)",
          position: "left",
          offset: 0,
          min: 0,

          nameLocation: "middle",
          nameGap: 55,

          axisLabel: {
            margin: 10,

            formatter: (value) => {
              return `${value} A`;
            },
          },

          splitLine: {
            show: true,
          },
        },

        {
          type: "value",
          name: "Voltage (V)",
          position: "right",
          offset: 0,
          min: 0,

          nameLocation: "middle",
          nameGap: 60,

          axisLabel: {
            margin: 10,

            formatter: (value) => {
              return `${value} V`;
            },
          },

          splitLine: {
            show: false,
          },
        },

        {
          type: "value",
          name: "Power",
          position: "right",
          offset: 85,
          min: 0,

          nameLocation: "middle",
          nameGap: 65,

          axisLabel: {
            margin: 10,

            formatter: (value) => {
              return Number(value).toLocaleString("en-US", {
                maximumFractionDigits: 2,
              });
            },
          },

          splitLine: {
            show: false,
          },
        },

        {
          type: "value",
          name: "Power Factor",
          position: "left",
          offset: 75,
          min: 0,
          max: 1,

          nameLocation: "middle",
          nameGap: 55,

          axisLabel: {
            margin: 10,

            formatter: (value) => {
              return Number(value).toFixed(2);
            },
          },

          splitLine: {
            show: false,
          },
        },

        {
          type: "value",
          name: "Frequency (Hz)",
          position: "right",
          offset: 165,
          min: (value) => {
            if (!Number.isFinite(value.min)) {
              return 0;
            }

            return Math.floor(value.min - 1);
          },

          max: (value) => {
            if (!Number.isFinite(value.max)) {
              return 60;
            }

            return Math.ceil(value.max + 1);
          },

          nameLocation: "middle",
          nameGap: 65,

          axisLabel: {
            margin: 10,

            formatter: (value) => {
              return `${Number(value).toFixed(1)} Hz`;
            },
          },

          splitLine: {
            show: false,
          },
        },
      ],

      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
        },

        {
          type: "slider",
          xAxisIndex: 0,
          filterMode: "none",
          bottom: 25,
          height: 24,
        },
      ],

      series,
    };
  }, [data, availableMetrics]);

  if (loading) {
    return (
      <div
        style={{
          height: 550,
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
          height: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Empty description="No electricity data available" />
      </div>
    );
  }

  if (!availableMetrics.length) {
    return (
      <div
        style={{
          height: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Empty description="Select at least one measurement for the chart" />
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      notMerge={true}
      lazyUpdate={true}
      style={{
        height: 580,
        width: "100%",
        marginTop: 24,
      }}
    />
  );
}
