import { useState, useEffect, useMemo } from "react";
import { Card, Select, DatePicker, Space, Flex, Tag } from "antd";
import ProductionChart from "../components/ProductionChart";
import DowntimeChart from "../components/DowntimeChart";
import {
  getShiftData,
  getShiftLast,
  getShiftDowntime,
  getLineSpeed,
} from "../api/dashboardApi";
import dayjs from "dayjs";
import { Row, Col, Statistic } from "antd";
import {
  getShiftTimeRange,
  getCurrentShiftTimeRange,
} from "../utils/shiftUtils";

export default function Keda2() {
  const [data, setData] = useState([]);
  const [downtime, setDowntime] = useState([]);
  const [currentShiftDowntime, setCurrentShiftDowntime] = useState([]);
  const [shift, setShift] = useState("14-22");
  const [lastValue, setLastValue] = useState(0);
  const [lineSpeed, setLineSpeed] = useState(0);
  const [tilesPerMin, setTilesPerMin] = useState(0);
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(6, "hour"),
    dayjs(),
  ]);
  const [date, setDate] = useState(dayjs());
  const [selectedShiftLastValue, setSelectedShiftLastValue] = useState(0);
  const [shiftStatus, setShiftStatus] = useState("Stopped");

  const { RangePicker } = DatePicker;

  const loadData = async () => {
    const { fromTime, toTime } = getShiftTimeRange(date, shift);
    const { currentShiftFromTime, currentShiftToTime, currentShift } =
      getCurrentShiftTimeRange();

    const [data, downtime, last, lineSpeed, currentShiftDowntime] =
      await Promise.all([
        getShiftData(shift, fromTime, toTime),
        getShiftDowntime(shift, fromTime, toTime), // this is to get the downtime based on the user selection in the date selection
        getShiftLast(shift),
        getLineSpeed(),
        getShiftDowntime(
          currentShift,
          currentShiftFromTime,
          currentShiftToTime,
        ), // this is to get the current shift downtime to display in the current shift details card
      ]);

    if (shift !== "all") {
      setSelectedShiftLastValue(
        data?.findLast((item) => item?.value !== null)?.value,
      );
    } else {
      const maxPerShift = new Map();

      for (const item of data) {
        const currentMax = maxPerShift.get(item.shift);

        if (!currentMax || item.value > currentMax.value) {
          maxPerShift.set(item.shift, item);
        }
      }

      const total = Array.from(maxPerShift.values()).reduce(
        (sum, item) => sum + item.value,
        0,
      );

      setSelectedShiftLastValue(total);
    }

    setShiftStatus(last?.shiftStatus);
    setData(data);
    setDowntime(downtime);
    setCurrentShiftDowntime(currentShiftDowntime);
    setLastValue(last?.value ?? 0);
    setLineSpeed(lineSpeed?.lineSpeed);
  };

  const onChange = (value) => {
    setDate(value);
  };

  useEffect(() => {
    // initial load

    if (dateRange && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
      loadData();
    }

    // live refresh
    const interval = setInterval(() => {
      loadData();
    }, 5000);

    // cleanup (IMPORTANT)
    return () => clearInterval(interval);
  }, [shift, dateRange, date]);

  const totalDowntimeCurrentShift = useMemo(() => {
    let startTime = null;
    let total = 0;

    currentShiftDowntime.forEach((event) => {
      if (event.downStatus === "STOP_START") {
        startTime = new Date(Number(event.ts));
      }

      if (event.downStatus === "STOP_END" && startTime) {
        const endTime = new Date(Number(event.ts));
        total += Math.floor((endTime - startTime) / 60000);
        startTime = null;
      }
    });

    if (startTime) {
      const now = new Date();
      total += Math.floor((now - startTime) / 60000);
    }

    return total;
  }, [currentShiftDowntime]);

  const formatDuration = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);

    return `${String(hours).padStart(2, "0")} h: ${String(minutes).padStart(2, "0")} m`;
  };

  return (
    // <Card>
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 20, // 👈 controls vertical spacing
      }}
    >
      <h3 style={{ textAlign: "left" }}>Keda 2 Production Dashboard</h3>
      <Row>
        <Col xs={24} span={8}>
          <Card
            title="Current Shift Status"
            style={{
              width: "100%",
              marginBottom: "10px",
              marginTop: "10px",
            }}
          >
            <div className="shift_statBar">
              <Row gutter={24} style={{ marginBottom: "15px" }}>
                <Col sm={24} md={12} lg={6}>
                  <Statistic
                    title="Status"
                    value={shiftStatus} // Keep the value as a plain string
                    formatter={(val) => (
                      <Tag
                        color={shiftStatus === "Running" ? "success" : "error"}
                        style={{ fontSize: "16px", padding: "4px 8px" }}
                      >
                        {val}
                      </Tag>
                    )}
                  />
                </Col>
                <Col sm={24} md={12} lg={6}>
                  <Statistic
                    title="Total Downtime"
                    value={formatDuration(totalDowntimeCurrentShift)}
                  />
                </Col>
                <Col sm={24} md={12} lg={6}>
                  <Statistic
                    title="Speed"
                    value={lineSpeed}
                    suffix={<span style={{ fontSize: "14px" }}>Tiles/min</span>}
                  />
                </Col>
                <Col sm={24} md={12} lg={6}>
                  <Statistic
                    title="Production"
                    suffix={<span style={{ fontSize: "14px" }}>Tiles</span>}
                    value={lastValue}
                  />
                </Col>
              </Row>
            </div>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col xs={24} span={8}>
          <Card
            title="Shift Production Details"
            style={{ width: "100%", marginBottom: "10px", marginTop: "10px" }}
            styles={{
              header: { textAlign: "left" },
            }}
            extra={
              <div style={{ display: "flex", gap: "8px", alignItems: "right" }}>
                <Select
                  value={shift}
                  onChange={(value) => setShift(value)}
                  style={{ width: 150 }}
                  options={[
                    { value: "06-14", label: "06-14 Shift" },
                    { value: "14-22", label: "14-22 Shift" },
                    { value: "22-06", label: "22-06 Shift" },
                    { value: "all", label: "All Shifts" },
                  ]}
                />
                <DatePicker
                  value={date}
                  onChange={onChange}
                  format="YYYY-MM-DD"
                />
              </div>
            }
          >
            <Row>
              <Col xs={24} xl={12} span={8}>
                <Row justify="center" align="middle">
                  <Col>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ fontSize: 20, color: "#888" }}>
                        Total Production:
                      </span>

                      <span
                        style={{
                          fontSize: 20,
                          fontWeight: 600,
                          color: "#5c5b5b",
                        }}
                      >
                        {selectedShiftLastValue}
                        {" Tiles"}
                      </span>
                    </div>
                  </Col>
                </Row>
                <ProductionChart data={data} />
              </Col>
              <Col xs={24} xl={12} span={8}>
                <Space
                  size="middle"
                  style={{
                    display: "flex",
                    justifyContent: "flex-start",
                    width: "100%",
                  }}
                ></Space>
                <DowntimeChart data={downtime} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
    // </Card>
  );
}
