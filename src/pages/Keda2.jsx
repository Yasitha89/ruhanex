import { useState, useEffect } from "react";
import { Card, Select, DatePicker, Space, Flex, Tag } from "antd";
import ProductionChart from "../components/ProductionChart";
import { getShiftData, getShiftLast } from "../api/dashboardApi";
import dayjs from "dayjs";
import { Row, Col, Statistic } from "antd";
import { getShiftTimeRange } from "../utils/shiftUtils";

export default function Keda2() {
  const [data, setData] = useState([]);
  const [shift, setShift] = useState("14-22");
  const [lastValue, setLastValue] = useState(0);
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
    console.log("Time", fromTime, toTime);
    // const fromTime = dateRange?.[0]?.toISOString();
    // const toTime = dateRange?.[1]?.toISOString();

    const [data, last] = await Promise.all([
      getShiftData(shift, 24, fromTime, toTime),
      getShiftLast(shift),
    ]);

    setSelectedShiftLastValue(
      data?.findLast((item) => item?.value !== null)?.value,
    );
    setShiftStatus(last?.shiftStatus);

    setData(data);

    setLastValue(last?.value ?? 0);
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
      {/* <Space
        size="middle"
        style={{
          display: "flex",
          justifyContent: "flex-start",
          width: "100%",
        }}
      >
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
        <DatePicker value={date} onChange={onChange} format="YYYY-MM-DD" />
      </Space> */}

      <Row>
        <Col xs={24} span={8}>
          <Card
            title="Current Shift Status"
            style={{
              width: "100%",
              marginBottom: "10px",
              marginTop: "10px",
            }}
            // styles={{
            //   header: { textAlign: "left" },
            // }}
          >
            <div className="shift_statBar">
              <Row gutter={24} style={{ marginBottom: "15px" }}>
                <Col sm={24} md={12} lg={8}>
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
                <Col sm={24} md={12} lg={8}>
                  <Statistic
                    title="Downtime"
                    //value={this.state.pendingMembers}
                  />
                </Col>
                <Col sm={24} md={12} lg={8}>
                  <Statistic
                    title="Production"
                    suffix={<span style={{ fontSize: "14px" }}>Tiles</span>}
                    value={lastValue}
                  />
                </Col>
                {/* <Col sm={24} md={12} lg={6}>
                  <Statistic
                  // title={
                  //   <>
                  //     {Utils.membershipStatusTag("no subscription")}Members
                  //   </>
                  // }
                  // value={this.state.noSubscriptionMembers}
                  />
                </Col> */}
              </Row>
            </div>
          </Card>
        </Col>
      </Row>
      {/* <Flex gap={16}>
        <Card style={{ width: 250, marginBottom: 20 }} title="Shift Production">
          <h1 style={{ fontSize: 40, color: "#000" }}>{lastValue}</h1>
        </Card>
        <Card style={{ width: 250, marginBottom: 20 }} title="Shift Downtime">
          <h1 style={{ fontSize: 40, color: "#000" }}>{lastValue}</h1>
        </Card>
      </Flex> */}

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
            <Statistic
              value={selectedShiftLastValue}
              suffix={<span style={{ fontSize: "14px" }}>Tiles</span>}
              // style={{
              //   display: "flex",
              //   flexDirection: "row",
              //   alignItems: "bottom", // Keeps items vertically centered
              //   gap: 16, // Adds space between the title and value
              // }}
            />
            <Space
              size="middle"
              style={{
                display: "flex",
                justifyContent: "flex-start",
                width: "100%",
              }}
            ></Space>
            <ProductionChart data={data} />
            {/* <div className="shift_chart">
              <Row gutter={24} style={{ marginBottom: "15px" }}>
                <Col sm={24} md={12} lg={6}>
                  <ProductionChart data={data} />
                </Col>
              </Row>
            </div> */}
          </Card>
        </Col>
      </Row>

      {/* <ProductionChart data={data} /> */}
    </div>
    // </Card>
  );
}
