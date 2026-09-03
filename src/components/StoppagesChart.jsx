import { useMemo } from "react";
import { Empty, Spin } from "antd";
import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import "./DashboardCharts.css";

function isTouchCapableDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    "ontouchstart" in window ||
    Number(navigator.maxTouchPoints || 0) > 0 ||
    window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches === true
  );
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(0, Math.floor(Number(milliseconds) / 60000));

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function formatTotalDowntime(totalMinutes) {
  const safeTotalMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  const hours = Math.floor(safeTotalMinutes / 60);
  const minutes = safeTotalMinutes % 60;

  return `${hours}h:${String(minutes).padStart(2, "0")}m`;
}

function formatDateTime(timestamp) {
  const value = Number(timestamp);

  if (!Number.isFinite(value)) {
    return "-";
  }

  return dayjs(value).format("YYYY-MM-DD HH:mm");
}

export default function StoppagesChart({
  data = [],
  loading = false,
  onBarClick,
}) {
  const touchDevice = useMemo(() => isTouchCapableDevice(), []);
  const chartData = useMemo(() => {
    const currentTime = Date.now();

    return data
      .map((record, index) => {
        const startTime = Number(record.stopStart_ts);

        const storedStopTime = Number(record.stopStop_ts);

        const isOpenStop =
          record.downStatus === "STOP_START" ||
          !Number.isFinite(storedStopTime) ||
          storedStopTime <= startTime;

        const stopTime = isOpenStop ? currentTime : storedStopTime;

        if (!Number.isFinite(startTime) || stopTime <= startTime) {
          return null;
        }

        const downtimeMs = stopTime - startTime;

        const downtimeMinutes = downtimeMs / 60000;

        return {
          ...record,

          id: record._id || `${startTime}-${stopTime}-${index}`,

          startTime,
          stopTime,
          isOpenStop,
          downtimeMs,

          downtimeMinutes: Number(downtimeMinutes.toFixed(2)),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startTime - b.startTime)
      .map((item, index) => ({
        ...item,

        eventNumber: index + 1,

        xAxisLabel: `${dayjs(item.startTime).format("HH:mm")}`,
      }));
  }, [data]);

  // Sum the same whole-minute value shown for each individual bar.
  // This makes the heading exactly match the manual total of the bar labels.
  const totalDowntimeMinutes = useMemo(
    () =>
      chartData.reduce(
        (total, item) =>
          total + Math.max(0, Math.floor(Number(item.downtimeMs) / 60000)),
        0,
      ),
    [chartData],
  );

  const option = useMemo(
    () => ({
      animation: false,

      title: {
        text: `{label|Total Downtime:} {value|${formatTotalDowntime(totalDowntimeMinutes)}}`,
        left: "center",

        textStyle: {
          rich: {
            label: {
              fontSize: 20,
              fontWeight: 400,
              color: "#888",
            },

            value: {
              fontSize: 20,
              fontWeight: 600,
              color: "#5c5b5b",
            },
          },
        },
      },
      tooltip: {
        show: !touchDevice,
        trigger: "item",
        triggerOn: touchDevice ? "none" : "mousemove|click",
        confine: true,

        formatter: (params) => {
          const item = chartData[params.dataIndex];

          if (!item) {
            return "";
          }

          return `
            <strong>
              Downtime Event ${item.eventNumber}
            </strong>
            <br/>
            Status: ${item.isOpenStop ? "Ongoing" : "Completed"}
            <br/>
            Line: ${item.line || "-"}
            <br/>
            Shift: ${item.shift || "-"}
            <br/>
            Machine: ${item.machine?.trim() || "Not specified"}
            <br/>
            Start: ${formatDateTime(item.startTime)}
            <br/>
            End: ${item.isOpenStop ? "Ongoing" : formatDateTime(item.stopTime)}
            <br/>
            <strong>
              Duration: ${formatDuration(item.downtimeMs)}
            </strong>
            <br/>
            Reason: ${item.reason?.trim() || "Not specified"}
          `;
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
            name: "Downtime_Duration",
            pixelRatio: 2,
          },
        },
      },

      grid: {
        top: 80,
        left: 70,
        right: 30,
        bottom: 100,
        containLabel: true,
      },

      xAxis: {
        type: "category",
        name: "Downtime start time",
        nameLocation: "middle",
        nameGap: 65,

        data: chartData.map((item) => item.xAxisLabel),

        axisLabel: {
          rotate: 45,
          interval: 0,
        },
      },

      yAxis: {
        type: "value",
        name: "Downtime (minutes)",
        min: 0,

        axisLabel: {
          formatter: "{value} min",
        },
      },

      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
        },

        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 20,
          height: 25,
        },
      ],

      media: [
        {
          query: { maxWidth: 600 },
          option: {
            title: {
              top: 2,
              textStyle: {
                rich: {
                  label: { fontSize: 15, fontWeight: 400, color: "#888" },
                  value: { fontSize: 15, fontWeight: 600, color: "#5c5b5b" },
                },
              },
            },
            toolbox: { show: false },
            grid: {
              top: 58,
              left: 4,
              right: 4,
              bottom: 88,
              containLabel: false,
            },
            xAxis: {
              name: "Start time",
              nameGap: 48,
              axisLabel: {
                rotate: 35,
                interval: "auto",
                fontSize: 10,
                hideOverlap: true,
              },
              nameTextStyle: { fontSize: 11 },
            },
            yAxis: {
              name: "Downtime (min)",
              nameLocation: "end",
              nameGap: 8,
              nameTextStyle: { fontSize: 10, align: "left" },
              axisLabel: {
                inside: true,
                fontSize: 9,
                margin: 4,
                formatter: "{value}",
              },
              axisTick: { inside: true },
            },
            dataZoom: [
              { type: "inside", xAxisIndex: 0 },
              { type: "slider", xAxisIndex: 0, bottom: 18, height: 18 },
            ],
          },
        },
      ],

      series: [
        {
          name: "Downtime",
          type: "bar",

          data: chartData.map((item) => ({
            value: item.downtimeMinutes,

            eventId: item.id,

            itemStyle: {
              color: item.isOpenStop
                ? "#faad14" // Orange = ongoing
                : "#ff4d4f", // Red = completed
            },

            // itemStyle: {
            //   opacity: item.isOpenStop ? 0.65 : 1,

            //   borderType: item.isOpenStop ? "dashed" : "solid",

            //   borderWidth: item.isOpenStop ? 2 : 0,
            // },
          })),

          barMaxWidth: 45,

          label: {
            show: true,
            position: "top",

            formatter: (params) => {
              const item = chartData[params.dataIndex];

              if (!item) {
                return "";
              }

              const duration = formatDuration(item.downtimeMs);

              return item.isOpenStop ? `${duration} • Ongoing` : duration;
            },
          },

          emphasis: {
            focus: "series",
          },
        },
      ],
    }),
    [chartData, totalDowntimeMinutes],
  );

  const events = useMemo(
    () => ({
      click: (params) => {
        const selectedEvent = chartData[params.dataIndex];

        if (selectedEvent && typeof onBarClick === "function") {
          onBarClick(selectedEvent);
        }
      },
    }),
    [chartData, onBarClick],
  );

  if (loading) {
    return (
      <div
        style={{
          height: 450,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div
        style={{
          height: 400,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Empty description="No downtime events available" />
      </div>
    );
  }

  return (
    <div className="responsive-dashboard-chart responsive-dashboard-chart--stoppages">
      <ReactECharts
        className="responsive-dashboard-chart__canvas"
        option={option}
        onEvents={events}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
