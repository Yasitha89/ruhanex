import { useState, useEffect, useMemo } from "react";
import { Card, Select, DatePicker, Space, Flex, Tag, Badge, Modal, Form, Input, message, Descriptions } from "antd";
import ProductionChart from "../components/ProductionChart";
import DowntimeChart from "../components/DowntimeChart";
import StoppagesChart from "../components/StoppagesChart";
import {
  getShiftData,
  getShiftLast,
  getShiftDowntime,
  getLineSpeed,
  getShiftStoppages,
  updateDowntimeReason,
} from "../api/dashboardApi";
import dayjs from "dayjs";
import { Row, Col, Statistic } from "antd";
import {
  getShiftTimeRange,
  getCurrentShiftTimeRange,
  calculateTileSqm,
} from "../utils/shiftUtils";

const { currentShift: initialShift } = getCurrentShiftTimeRange();

export default function Keda1() {
  const [data, setData] = useState([]);
  const [downtime, setDowntime] = useState([]);
  const [shiftStoppages, setShiftStoppages] = useState([]);
  const [currentShiftDowntime, setCurrentShiftDowntime] = useState([]);
  const [shift, setShift] = useState(initialShift);
  const [lastValue, setLastValue] = useState(0);
  const [tileSize, setTileSize] = useState(0.18);
  const [currentShift, setCurrentShift] = useState("06-14");
  const [lineSpeed, setLineSpeed] = useState(0);
  const [tilesPerMin, setTilesPerMin] = useState(0);
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(6, "hour"),
    dayjs(),
  ]);
  const [date, setDate] = useState(dayjs());
  const [selectedShiftLastValue, setSelectedShiftLastValue] = useState(0);
  const [shiftStatus, setShiftStatus] = useState("Stopped");
  const [sensorStatus, setSensorStatus] = useState("Connecting..");
  const [selectedDowntime, setSelectedDowntime] = useState(null);
  const [downtimeModalOpen, setDowntimeModalOpen] = useState(false);
  const [savingDowntime, setSavingDowntime] = useState(false);
  const [downtimeForm] = Form.useForm();

  const { RangePicker } = DatePicker;

  const loadData = async () => {
    const { fromTime, toTime } = getShiftTimeRange(date, shift);
    const { currentShiftFromTime, currentShiftToTime, currentShift } =
      getCurrentShiftTimeRange();

    const [
      data,
      downtime,
      last,
      lineSpeed,
      currentShiftDowntime,
      stoppagesResponse,
    ] = await Promise.all([
      getShiftData(shift, fromTime, toTime),
      getShiftDowntime(shift, fromTime, toTime), // this is to get the downtime based on the user selection in the date selection
      getShiftLast(shift),
      getLineSpeed(),
      getShiftDowntime(currentShift, currentShiftFromTime, currentShiftToTime), // this is to get the current shift downtime to display in the current shift details card
      getShiftStoppages(shift, date, "Keda1"), // this is to get the downtime based on the user selection in the date selection
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
    setCurrentShift(currentShift);
    setShiftStatus(last?.shiftStatus);
    setTileSize(last?.tileSize);
    setData(data);
    setDowntime(downtime);
    setCurrentShiftDowntime(currentShiftDowntime);
    setLastValue(last?.value ?? 0);
    setSensorStatus(last?.sensorStatus);
    setLineSpeed(lineSpeed?.lineSpeed);
    setShiftStoppages(stoppagesResponse);
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

  const openDowntimeModal = (selectedEvent) => {
    setSelectedDowntime(selectedEvent);
    downtimeForm.setFieldsValue({
      machine: selectedEvent?.machine || "",
      reason: selectedEvent?.reason || "",
    });
    setDowntimeModalOpen(true);
  };

  const closeDowntimeModal = () => {
    setDowntimeModalOpen(false);
    setSelectedDowntime(null);
    downtimeForm.resetFields();
  };

  const saveDowntimeReason = async () => {
    if (!selectedDowntime?._id) {
      message.error("Unable to identify the selected downtime record.");
      return;
    }

    try {
      const values = await downtimeForm.validateFields();
      setSavingDowntime(true);

      await updateDowntimeReason({
        id: selectedDowntime._id,
        date: selectedDowntime.date,
        shift: selectedDowntime.shift,
        line: selectedDowntime.line,
        stopStart_ts: selectedDowntime.stopStart_ts,
        reason: values.reason.trim(),
        machine: values.machine?.trim() || "",
      });

      message.success("Downtime reason updated successfully.");
      closeDowntimeModal();
      await loadData();
    } catch (error) {
      if (error?.errorFields) {
        return;
      }

      console.error("Failed to update downtime reason:", error);
      message.error(
        error?.response?.data?.error || "Failed to update downtime reason.",
      );
    } finally {
      setSavingDowntime(false);
    }
  };

  const formatDuration = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);

    return `${String(hours).padStart(2, "0")} h: ${String(minutes).padStart(2, "0")} m`;
  };

  return (
    // <Card>
    <div
      className="keda-dashboard-page"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 20, // 👈 controls vertical spacing
      }}
    >
      <h3 style={{ textAlign: "left" }}>Keda 1 Production Dashboard</h3>
      <Row>
        <Col xs={24} span={8}>
          <Card
            title="Current Shift Status"
            style={{
              textAlign: "left",
              width: "100%",
              marginBottom: "10px",
              marginTop: "10px",
            }}
            extra={
              <div style={{ display: "flex", gap: "8px", alignItems: "right" }}>
                <span>Sensor Status: </span>
                <Badge
                  styles={{
                    indicator: {
                      width: 14,
                      height: 14,
                    },
                  }}
                  status={
                    sensorStatus === "Online"
                      ? "success"
                      : sensorStatus === "Offline"
                        ? "error"
                        : "default" // This acts as your final "else" fallback
                  }
                  text={sensorStatus}
                />
              </div>
            }
          >
            <div className="shift_statBar">
              <Row className="keda-summary-grid" gutter={[12, 12]} style={{ marginBottom: "15px" }}>
                <Col className="keda-summary-item" xs={24} sm={24} md={12} lg={6}>
                  <Statistic
                    title="Shift Status"
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
                <Col className="keda-summary-item" xs={24} sm={24} md={12} lg={6}>
                  <Statistic
                    title="Total Downtime"
                    value={formatDuration(totalDowntimeCurrentShift)}
                  />
                </Col>
                <Col className="keda-summary-item" xs={24} sm={24} md={12} lg={6}>
                  <Statistic
                    title="Speed"
                    value={lineSpeed}
                    suffix={<span style={{ fontSize: "14px" }}>Tiles/min</span>}
                  />
                </Col>
                <Col className="keda-summary-item" xs={24} sm={24} md={12} lg={6}>
                  <Statistic
                    title="Production"
                    value={lastValue}
                    formatter={() => (
                      <span>
                        {Number(lastValue || 0).toLocaleString()}{" "}
                        <span style={{ fontSize: "14px" }}>Tiles</span>
                        {" / "}
                        {calculateTileSqm(tileSize, lastValue).toFixed(2)}
                        <span style={{ fontSize: "14px", marginLeft: "4px" }}>
                          m²
                        </span>
                      </span>
                    )}
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
                  defaultValue={currentShift}
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
                {/* <DowntimeChart data={downtime} /> */}
                <StoppagesChart
                  data={shiftStoppages}
                  loading={false}
                  onBarClick={openDowntimeModal}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Modal
        title="Downtime Details"
        open={downtimeModalOpen}
        onCancel={closeDowntimeModal}
        onOk={saveDowntimeReason}
        okText="Save"
        confirmLoading={savingDowntime}
        destroyOnHidden
      >
        {selectedDowntime && (
          <>
            <Descriptions
              size="small"
              column={1}
              bordered
              style={{ marginBottom: 20 }}
            >
              <Descriptions.Item label="Line">
                {selectedDowntime.line || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Shift">
                {selectedDowntime.shift || "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Start">
                {dayjs(selectedDowntime.startTime).format("YYYY-MM-DD HH:mm:ss")}
              </Descriptions.Item>
              <Descriptions.Item label="End">
                {selectedDowntime.isOpenStop
                  ? "Ongoing"
                  : dayjs(selectedDowntime.stopTime).format(
                      "YYYY-MM-DD HH:mm:ss",
                    )}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {formatDuration(selectedDowntime.downtimeMinutes)}
              </Descriptions.Item>
            </Descriptions>

            <Form form={downtimeForm} layout="vertical">
              <Form.Item label="Machine" name="machine">
                <Input placeholder="Enter machine / equipment" maxLength={100} />
              </Form.Item>

              <Form.Item
                label="Downtime Reason"
                name="reason"
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: "Please enter the downtime reason",
                  },
                ]}
              >
                <Input.TextArea
                  rows={4}
                  placeholder="Enter reason for this downtime"
                  maxLength={500}
                  showCount
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
            {/* <Card title="Downtime History">
        <StoppagesChart
          data={shiftStoppages}
          loading={false}
          onBarClick={(selectedEvent) => {
            console.log("Selected downtime:", selectedEvent);
          }}
        />
      </Card> */}
    </div>
    // </Card>
  );
}
