import React, { useMemo } from "react";
import { Empty, Spin, Typography } from "antd";
import ReactECharts from "echarts-for-react";

const { Text } = Typography;

export default function EnergyLiveChart({
  data = [],
  selectedMeters = [],
  metric,
  metricConfig = {},
  loading = false,
  initialLoadComplete = false,
  rangeLabel = "",
  paused = false,
  height = 420,
}) {
  const unit = metricConfig?.unit || "";
  const decimals = Number.isFinite(metricConfig?.decimals)
    ? metricConfig.decimals
    : 2;

  const metricLabel = metricConfig?.label || metric || "Live Energy Parameter";

  const chartData = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    const meters = Array.isArray(selectedMeters) ? selectedMeters : [];

    const timestampSet = new Set();

    for (const row of rows) {
      const timestamp = row?.timestamp || row?._time || row?.time;
      if (timestamp) {
        timestampSet.add(timestamp);
      }
    }

    const timestamps = Array.from(timestampSet).sort(
      (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    );

    const meterMap = new Map();

    for (const meter of meters) {
      const panel = String(meter?.panel ?? meter?.panelId ?? "").trim();
      const deviceId = String(
        meter?.deviceId ?? meter?.device_id ?? meter?.slaveId ?? "",
      ).trim();

      if (!panel || !deviceId) continue;

      const key = meter?.key || `${panel}::${deviceId}`;

      meterMap.set(key, {
        key,
        panel,
        deviceId,
        label:
          meter?.label ||
          meter?.deviceLabel ||
          meter?.panelLabel ||
          `${panel}:${deviceId}`,
      });
    }

    // Fallback: derive meter identities from returned rows.
    if (meterMap.size === 0) {
      for (const row of rows) {
        const panel = String(row?.panel ?? "").trim();
        const deviceId = String(row?.device_id ?? row?.deviceId ?? "").trim();

        if (!panel || !deviceId) continue;

        const key = `${panel}::${deviceId}`;

        if (!meterMap.has(key)) {
          meterMap.set(key, {
            key,
            panel,
            deviceId,
            label:
              row?.device_label || row?.deviceLabel || `${panel}:${deviceId}`,
          });
        }
      }
    }

    const valuesByMeter = new Map();

    for (const row of rows) {
      const panel = String(row?.panel ?? "").trim();
      const deviceId = String(row?.device_id ?? row?.deviceId ?? "").trim();

      const timestamp = row?.timestamp || row?._time || row?.time;

      if (!panel || !deviceId || !timestamp) continue;

      const key = `${panel}::${deviceId}`;

      // IMPORTANT:
      // Node-RED returns the selected value using the actual metric name,
      // e.g. row.active_power_kw, row.voltage_l1_n_v, etc.
      const rawValue =
        (metric ? row?.[metric] : undefined) ??
        row?.value ??
        row?._value ??
        row?.metricValue ??
        null;

      const numericValue =
        rawValue === null || rawValue === undefined || rawValue === ""
          ? null
          : Number(rawValue);

      if (!valuesByMeter.has(key)) {
        valuesByMeter.set(key, new Map());
      }

      valuesByMeter
        .get(key)
        .set(timestamp, Number.isFinite(numericValue) ? numericValue : null);
    }

    const series = Array.from(meterMap.values()).map((meter) => {
      const meterValues = valuesByMeter.get(meter.key) || new Map();

      return {
        name: meter.label,
        type: "line",
        showSymbol: false,
        symbol: "circle",
        symbolSize: 5,
        smooth: false,
        connectNulls: true,
        sampling: "lttb",
        animation: false,
        emphasis: {
          focus: "series",
        },
        data: timestamps.map((timestamp) => [
          timestamp,
          meterValues.has(timestamp) ? meterValues.get(timestamp) : null,
        ]),
      };
    });

    return {
      timestamps,
      series,
    };
  }, [data, selectedMeters, metric]);

  const option = useMemo(
    () => ({
      animation: false,

      grid: {
        left: 70,
        right: 30,
        top: 55,
        bottom: 75,
        containLabel: false,
      },

      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
        },
        formatter: (params) => {
          if (!Array.isArray(params) || params.length === 0) {
            return "";
          }

          const timestamp = params[0]?.value?.[0];
          const formattedTime = timestamp
            ? new Date(timestamp).toLocaleString()
            : "";

          let html = `
            <div style="margin-bottom:6px;font-weight:600;">
              ${formattedTime}
            </div>
          `;

          for (const item of params) {
            const value = item?.value?.[1];

            if (
              value === null ||
              value === undefined ||
              !Number.isFinite(Number(value))
            ) {
              continue;
            }

            html += `
              <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:20px;
                margin-top:4px;
              ">
                <span>
                  ${item.marker}
                  ${item.seriesName}
                </span>
                <strong>
                  ${Number(value).toFixed(decimals)}
                  ${unit ? ` ${unit}` : ""}
                </strong>
              </div>
            `;
          }

          return html;
        },
      },

      legend: {
        type: "scroll",
        top: 5,
        left: "center",
      },

      xAxis: {
        type: "time",
        name: "Time",
        nameLocation: "middle",
        nameGap: 45,
        axisLabel: {
          hideOverlap: true,
          formatter: (value) =>
            new Date(value).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
        },
        splitLine: {
          show: false,
        },
      },

      yAxis: {
        type: "value",
        name: unit ? `${metricLabel} (${unit})` : metricLabel,
        nameLocation: "middle",
        nameGap: 55,
        scale: true,
        axisLabel: {
          formatter: (value) =>
            Number.isFinite(Number(value))
              ? Number(value).toFixed(decimals)
              : value,
        },
        splitLine: {
          show: true,
        },
      },

      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "none",
        },
        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 15,
          height: 20,
          filterMode: "none",
        },
      ],

      toolbox: {
        right: 10,
        top: 5,
        feature: {
          dataZoom: {
            yAxisIndex: "none",
          },
          restore: {},
          saveAsImage: {
            name: `ruhanex-${String(metricLabel)
              .toLowerCase()
              .replace(/\s+/g, "-")}`,
          },
        },
      },

      series: chartData.series,
    }),
    [chartData.series, metricLabel, unit, decimals],
  );

  if (!initialLoadComplete || (loading && data.length === 0)) {
    return (
      <div
        style={{
          minHeight: height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Spin size="large" />

        <Text strong>Loading live energy data...</Text>

        {rangeLabel ? (
          <Text type="secondary">Retrieving {rangeLabel}</Text>
        ) : null}
      </div>
    );
  }

  if (initialLoadComplete && data.length === 0) {
    return (
      <div
        style={{
          minHeight: height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Empty
          description={
            <div>
              <div>No live energy samples in the selected range</div>
              {rangeLabel ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    opacity: 0.65,
                  }}
                >
                  Range: {rangeLabel}
                </div>
              ) : null}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
      }}
    >
      <ReactECharts
        option={option}
        notMerge={false}
        lazyUpdate
        style={{
          height,
          width: "100%",
        }}
      />

      {paused ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            padding: "5px 9px",
            borderRadius: 6,
            background: "rgba(0, 0, 0, 0.05)",
            pointerEvents: "none",
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            Paused
          </Text>
        </div>
      ) : null}

      {loading ? (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 100,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 9px",
            borderRadius: 6,
            background: "rgba(0, 0, 0, 0.05)",
            pointerEvents: "none",
          }}
        >
          <Spin size="small" />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Updating
          </Text>
        </div>
      ) : null}
    </div>
  );
}
