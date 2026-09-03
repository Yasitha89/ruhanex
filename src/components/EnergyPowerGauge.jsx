import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { Typography } from "antd";

const { Text } = Typography;

function formatPower(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export default function EnergyPowerGauge({
  value = 0,
  max = 1000,
  loading = false,
}) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const safeMax = Math.max(Number(max) || 1000, safeValue * 1.15, 1);

  const option = useMemo(
    () => ({
      animationDuration: 500,
      series: [
        {
          type: "gauge",
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: safeMax,
          center: ["50%", "70%"],
          radius: "95%",
          splitNumber: 4,

          axisLine: {
            lineStyle: {
              width: 18,
            },
          },

          progress: {
            show: true,
            width: 18,
          },

          pointer: {
            show: true,
            length: "62%",
            width: 6,
          },

          anchor: {
            show: true,
            size: 10,
          },

          axisTick: {
            show: false,
          },

          splitLine: {
            show: false,
          },

          axisLabel: {
            distance: -44,
            fontSize: 11,
            formatter: (v) => {
              if (v === 0) return "0";

              if (Math.abs(v - safeMax) < safeMax * 0.02) {
                return Number(safeMax).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                });
              }

              return "";
            },
          },

          detail: {
            valueAnimation: true,
            offsetCenter: [0, "24%"],
            fontSize: 24,
            fontWeight: 600,
            formatter: (v) => `${formatPower(v)} kW`,
          },

          title: {
            show: false,
          },

          // Keep the previous reading visible while the next API update is loading.
          data: [{ value: safeValue }],
        },
      ],
    }),
    [safeMax, safeValue],
  );

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 2,
        }}
      >
        <Text
          strong
          style={{
            fontSize: 16,
          }}
        >
          Current Power
        </Text>
      </div>

      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{
          height: 220,
          width: "100%",
        }}
      />
    </div>
  );
}
