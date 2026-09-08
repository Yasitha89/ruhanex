import ReactECharts from "echarts-for-react";
import { useEffect, useMemo, useState } from "react";
import { Row, Col } from "antd";

export default function DowntimeChart({ data = [] }) {
  // Used to continuously update an active/open stoppage.
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update once every second while component is mounted.
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // ============================================================
  // CALCULATE DOWNTIME
  //
  // IMPORTANT:
  // - Do NOT round each individual stop before totaling.
  // - Add milliseconds first.
  // - Divide by 60000 only once at the end.
  // ============================================================

  const { downtime, totalDowntime } = useMemo(() => {
    const downtime = [];

    let startTime = null;

    // Keep total in milliseconds for maximum accuracy.
    let totalMs = 0;

    data.forEach((event) => {
      // ========================================================
      // STOP START
      // ========================================================

      if (event.downStatus === "STOP_START") {
        const timestamp = Number(event.ts);

        if (Number.isFinite(timestamp)) {
          startTime = new Date(timestamp);
        }
      }

      // ========================================================
      // STOP END
      // ========================================================

      if (event.downStatus === "STOP_END" && startTime) {
        const timestamp = Number(event.ts);

        if (!Number.isFinite(timestamp)) {
          return;
        }

        const endTime = new Date(timestamp);

        const durationMs = endTime.getTime() - startTime.getTime();

        // Ignore invalid / negative duration.
        if (durationMs > 0) {
          // Add precise milliseconds to total.
          totalMs += durationMs;

          // Duration in minutes.
          const durationMinutes = durationMs / 60000;

          downtime.push({
            start: startTime,
            end: endTime,
            duration: durationMinutes,
            durationMs,
            type: "completed",
          });
        }

        startTime = null;
      }
    });

    // ==========================================================
    // HANDLE OPEN STOP
    // ==========================================================

    if (startTime) {
      const endTime = new Date(currentTime);

      const durationMs = endTime.getTime() - startTime.getTime();

      if (durationMs > 0) {
        totalMs += durationMs;

        const durationMinutes = durationMs / 60000;

        downtime.push({
          start: startTime,
          end: endTime,
          duration: durationMinutes,
          durationMs,
          type: "active",
        });
      }
    }

    // ==========================================================
    // CONVERT TOTAL TO MINUTES ONLY ONCE
    // ==========================================================

    const totalDowntime = totalMs / 60000;

    return {
      downtime,
      totalDowntime,
    };
  }, [data, currentTime]);

  // ============================================================
  // BAR CHART DATA
  // ============================================================

  const barData = useMemo(() => {
    return downtime.map((d) => ({
      name: d.start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),

      // Keep 2 decimals for each bar.
      value: Number(d.duration.toFixed(2)),

      type: d.type,
    }));
  }, [downtime]);

  // ============================================================
  // FORMAT TOTAL DOWNTIME
  //
  // Example:
  // 65.8 minutes -> 01 hour: 05 minutes
  //
  // This follows the same display style as your Node-RED API,
  // which floors the displayed whole minutes.
  // ============================================================

  const formatDuration = (totalMinutes) => {
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
      return "00 hour: 00 minutes";
    }

    const wholeMinutes = Math.floor(totalMinutes);

    const hours = Math.floor(wholeMinutes / 60);

    const minutes = wholeMinutes % 60;

    return `${String(hours).padStart(2, "0")} hour: ${String(minutes).padStart(
      2,
      "0",
    )} minutes`;
  };

  // ============================================================
  // ECHARTS OPTIONS
  // ============================================================

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis",

        formatter: (params) => {
          const p = params?.[0];

          if (!p) {
            return "";
          }

          return `
            ${p.name}
            <br/>
            Downtime: ${Number(p.value).toFixed(2)} min
          `;
        },
      },

      xAxis: {
        type: "category",
        name: "Downtime Started Time",
        nameLocation: "middle",
        nameGap: 35,
        boundaryGap: true,
        data: barData.map((d) => d.name),
      },

      yAxis: {
        type: "value",
        name: "Minutes",
        nameLocation: "middle",
        nameRotate: 90,
        nameGap: 45,
        min: 0,
      },

      series: [
        {
          type: "bar",

          data: barData.map((d) => ({
            value: d.value,
          })),

          itemStyle: {
            color: "#ff4d4f",
          },

          barWidth: 10,
        },
      ],
    }),
    [barData],
  );

  // ============================================================
  // UI
  // ============================================================

  return (
    <div>
      <Row justify="center" align="middle">
        <Col>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                fontSize: 20,
                color: "#888",
              }}
            >
              Total Downtime:
            </span>

            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: "#5c5b5b",
              }}
            >
              {formatDuration(totalDowntime)}
            </span>
          </div>
        </Col>
      </Row>

      <ReactECharts
        option={option}
        style={{
          height: 350,
        }}
      />
    </div>
  );
}
