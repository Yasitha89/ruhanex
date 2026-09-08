import { useState, useEffect } from "react";
import {
  Card,
  Select,
  DatePicker,
  Space,
  Tag,
  Badge,
  Modal,
  Form,
  Input,
  message,
  Descriptions,
} from "antd";
import ProductionChart from "../components/ProductionChart";
import StoppagesChart from "../components/StoppagesChart";
import {
  getShiftData,
  getShiftStoppages,
  getLineLiveSummary,
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
  const [shiftStoppages, setShiftStoppages] = useState([]);
  const [shift, setShift] = useState(initialShift);
  const [lastValue, setLastValue] = useState(0);
  const [tileSize, setTileSize] = useState("");
  const [currentShift, setCurrentShift] = useState("06-14");
  const [lineSpeed, setLineSpeed] = useState(0);
  const [totalDowntimeCurrentShift, setTotalDowntimeCurrentShift] = useState(0);
  const [date, setDate] = useState(() => {
    const now = dayjs();

    // 00:00 - 05:59 belongs to previous day's 22-06 shift
    if (now.hour() < 6) {
      return now.subtract(1, "day").startOf("day");
    }

    return now.startOf("day");
  });
  const [selectedShiftLastValue, setSelectedShiftLastValue] = useState(0);
  const [shiftStatus, setShiftStatus] = useState("Stopped");
  const [sensorStatus, setSensorStatus] = useState("Connecting..");
  const [selectedDowntime, setSelectedDowntime] = useState(null);
  const [downtimeModalOpen, setDowntimeModalOpen] = useState(false);
  const [savingDowntime, setSavingDowntime] = useState(false);
  const [downtimeForm] = Form.useForm();
  const line = "Keda 2";

  const loadLiveSummary = async () => {
    try {
      const summary = await getLineLiveSummary(line);

      setCurrentShift(summary?.currentShift || "06-14");
      setShiftStatus(summary?.shiftStatus || "Unknown");
      setSensorStatus(summary?.sensorStatus || "Unknown");
      setTileSize(summary?.tileSize || "");
      setLastValue(Number(summary?.shiftCount || 0));
      setLineSpeed(Number(summary?.speed || 0));
      setTotalDowntimeCurrentShift(Number(summary?.downtimeMinutes || 0));
    } catch (error) {
      console.error("Failed to load Glaze Line 1 live summary:", error);
      setSensorStatus("Offline");
    }
  };

  const loadSelectedShiftDetails = async () => {
    try {
      const { fromTime, toTime } = getShiftTimeRange(date, shift);

      const [productionData, stoppagesResponse] = await Promise.all([
        getShiftData(line, shift, fromTime, toTime),
        getShiftStoppages(shift, date, line),
      ]);

      if (shift !== "all") {
        setSelectedShiftLastValue(
          productionData?.findLast((item) => item?.value !== null)?.value ?? 0,
        );
      } else {
        const maxPerShift = new Map();

        for (const item of productionData || []) {
          const currentMax = maxPerShift.get(item.shift);

          if (!currentMax || item.value > currentMax.value) {
            maxPerShift.set(item.shift, item);
          }
        }

        const total = Array.from(maxPerShift.values()).reduce(
          (sum, item) => sum + Number(item.value || 0),
          0,
        );

        setSelectedShiftLastValue(total);
      }

      setData(productionData || []);
      setShiftStoppages(stoppagesResponse || []);
    } catch (error) {
      console.error("Failed to load Glaze Line 1 shift details:", error);
    }
  };

  const onChange = (value) => {
    setDate(value);
  };

  useEffect(() => {
    loadLiveSummary();

    const liveInterval = setInterval(loadLiveSummary, 5000);

    return () => clearInterval(liveInterval);
  }, []);

  useEffect(() => {
    loadSelectedShiftDetails();

    const current = getCurrentShiftTimeRange();
    const currentShiftDate = dayjs(current.currentShiftFromTime).format(
      "YYYY-MM-DD",
    );
    const selectedDate = dayjs(date).format("YYYY-MM-DD");

    const selectionIncludesLiveShift =
      selectedDate === currentShiftDate &&
      (shift === current.currentShift || shift === "all");

    if (!selectionIncludesLiveShift) {
      return undefined;
    }

    const detailInterval = setInterval(loadSelectedShiftDetails, 5000);

    return () => clearInterval(detailInterval);
  }, [shift, date]);

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
      await Promise.all([loadLiveSummary(), loadSelectedShiftDetails()]);
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
      className="glazeline-dashboard-page"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 20, // 👈 controls vertical spacing
      }}
    >
      <h3 style={{ textAlign: "left" }}>Glaze Line 1 Production Dashboard</h3>
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
              <Row
                className="keda-summary-grid"
                gutter={[12, 12]}
                style={{ marginBottom: "15px" }}
              >
                <Col
                  className="keda-summary-item"
                  xs={24}
                  sm={24}
                  md={12}
                  lg={6}
                >
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
                <Col
                  className="keda-summary-item"
                  xs={24}
                  sm={24}
                  md={12}
                  lg={6}
                >
                  <Statistic
                    title="Total Downtime"
                    value={formatDuration(totalDowntimeCurrentShift)}
                  />
                </Col>
                <Col
                  className="keda-summary-item"
                  xs={24}
                  sm={24}
                  md={12}
                  lg={6}
                >
                  <Statistic
                    title="Speed"
                    value={lineSpeed}
                    suffix={<span style={{ fontSize: "14px" }}>Tiles/min</span>}
                  />
                </Col>
                <Col
                  className="keda-summary-item"
                  xs={24}
                  sm={24}
                  md={12}
                  lg={6}
                >
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
                {dayjs(selectedDowntime.startTime).format(
                  "YYYY-MM-DD HH:mm:ss",
                )}
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
                <Input
                  placeholder="Enter machine / equipment"
                  maxLength={100}
                />
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
