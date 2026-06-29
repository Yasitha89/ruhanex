import ReactECharts from "echarts-for-react";
import dayjs from "dayjs";
import { useState, useMemo } from "react";
import { Row, Col, Statistic } from "antd";

export default function DowntimeChart({ data }) {
  let tempTotalDowntime = 0;

  // const { downtime, totalDowntime } = useMemo(() => {
  //   const downtime = [];
  //   let startTime = null;
  //   let total = 0;

  //   data.forEach((event) => {
  //     if (event.downStatus === "STOP_START") {
  //       startTime = new Date(Number(event.ts));
  //     }

  //     if (event.downStatus === "STOP_END" && startTime) {
  //       const endTime = new Date(Number(event.ts));
  //       const duration = (endTime - startTime) / 1000;

  //       total += duration;

  //       downtime.push({
  //         start: startTime,
  //         end: endTime,
  //         duration,
  //       });

  //       startTime = null;
  //     }
  //   });

  //   return {
  //     downtime,
  //     totalDowntime: total,
  //   };
  // }, [data]);

  const { downtime, totalDowntime } = useMemo(() => {
    const downtime = [];
    let startTime = null;
    let total = 0;

    data.forEach((event) => {
      if (event.downStatus === "STOP_START") {
        startTime = new Date(Number(event.ts));
      }

      if (event.downStatus === "STOP_END" && startTime) {
        const endTime = new Date(Number(event.ts));
        const duration = Math.floor((endTime - startTime) / 60000);

        total += duration;

        downtime.push({
          start: startTime,
          end: endTime,
          duration,
        });

        startTime = null;
      }
    });

    // IMPORTANT: handle OPEN STOP (still running downtime)

    if (startTime) {
      const now = new Date();
      const duration = Math.floor((now - startTime) / 60000);

      total += duration;

      downtime.push({
        start: startTime,
        end: now,
        duration,
        type: "active", // still ongoing stop
      });
    }
    return {
      downtime,
      totalDowntime: total,
    };
  }, [data]);

  const barData = downtime.map((d) => ({
    name: d.start.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: Math.floor(d.duration), // minutes
  }));

  const onEvents = {
    datazoom: (params) => {
      const start = params.batch?.[0]?.start || 0;
      setIsZoomedOut(start < 30);
    },
  };

  const formatDuration = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);

    return `${String(hours).padStart(2, "0")} hour: ${String(minutes).padStart(2, "0")} minutes`;
  };

  // 2. Build ECharts option
  const option = {
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const p = params[0];
        return `${p.name}<br/>Downtime: ${p.value} min`;
      },
    },

    xAxis: {
      type: "category",
      name: "Downtime Started Time",
      nameLocation: "bottom",
      nameGap: 50,
      boundaryGap: false,
      data: barData.map((d) => d.name),
    },

    yAxis: {
      type: "value",
      name: "Minutes",
      nameLocation: "bottom",
      nameRotate: 90,
      nameGap: 50,
    },

    series: [
      {
        type: "bar",
        data: barData.map((d) => d.value),
        itemStyle: {
          color: "#ff4d4f",
        },
        barWidth: 10, // Width in pixels
      },
    ],
  };

  return (
    <div>
      <Row justify="center" align="middle">
        <Col>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20, color: "#888" }}>Total Downtime:</span>

            <span style={{ fontSize: 20, fontWeight: 600, color: "#5c5b5b" }}>
              {formatDuration(totalDowntime)}{" "}
            </span>
          </div>
        </Col>
      </Row>

      <ReactECharts
        option={option}
        onEvents={onEvents}
        style={{ height: 350 }}
      />
    </div>
  );
}
