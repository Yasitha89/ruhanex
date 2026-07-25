import React, { useEffect, useState } from "react";
import { Col, Row, Typography, Spin, Alert } from "antd";
import LineSummaryCard from "../components/LineSummaryCard";
import { getDashboardStats } from "../api/dashboardApi";
import { getCurrentShiftTimeRange } from "../utils/shiftUtils";

const { Title, Text } = Typography;

export default function Dashboard() {
  const [lineStats, setLineStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const { currentShiftFromTime, currentShiftToTime, currentShift } =
    getCurrentShiftTimeRange();

  const loadData = async () => {
    try {
      const data = await getDashboardStats(
        "keda 1",
        currentShift,
        currentShiftFromTime,
        currentShiftToTime,
      );

      if (data.success) {
        setLineStats(data.lineStats);
        setError("");
      } else {
        throw new Error("Invalid response");
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const timer = setInterval(loadData, 5000);

    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert type="error" message="Connection Error" description={error} />
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Production Dashboard
        </Title>

        <Text type="secondary">
          Current production-line performance summary
        </Text>
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} md={24} lg={12} xl={8}>
          <LineSummaryCard
            lineName={lineStats.lineName}
            status={lineStats.status}
            ole={lineStats.ole}
            availability={lineStats.availability}
            performance={lineStats.performance}
            production={lineStats.production}
            downtime={lineStats.formattedDowntime}
          />
        </Col>
      </Row>
    </div>
  );
}
