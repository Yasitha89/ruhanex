import React from "react";
import {
  Card,
  Col,
  Divider,
  Progress,
  Row,
  Statistic,
  Tag,
  Typography,
} from "antd";

const { Text } = Typography;

export default function LineSummaryCard({
  lineName,
  status,
  ole,
  availability,
  performance,
  production,
  downtime,
  loading = false,
}) {
  const isRunning = String(status).toLowerCase() === "running";

  const safeNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  const oleValue = safeNumber(ole);
  const availabilityValue = safeNumber(availability);
  const performanceValue = safeNumber(performance);
  const productionValue = safeNumber(production);

  return (
    <Card
      title={lineName}
      loading={loading}
      style={{
        width: "100%",
        borderRadius: 12,
      }}
      styles={{
        header: {
          fontSize: 18,
          fontWeight: 600,
        },
        body: {
          padding: 20,
        },
      }}
    >
      <Row gutter={[16, 20]}>
        <Col span={24}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text type="secondary">Line Status</Text>

            <Tag
              color={isRunning ? "success" : "error"}
              style={{
                marginInlineEnd: 0,
                fontSize: 14,
                padding: "4px 12px",
                borderRadius: 16,
              }}
            >
              {status || "Unknown"}
            </Tag>
          </div>
        </Col>

        <Col xs={24} sm={8}>
          <Statistic title="OLE" value={oleValue} precision={0} suffix="%" />

          <Progress
            percent={oleValue}
            showInfo={false}
            size="small"
            status={oleValue < 60 ? "exception" : "normal"}
          />
        </Col>

        <Col xs={24} sm={8}>
          <Statistic
            title="Availability"
            value={availabilityValue}
            precision={0}
            suffix="%"
          />

          <Progress
            percent={availabilityValue}
            showInfo={false}
            size="small"
            status={availabilityValue < 60 ? "exception" : "normal"}
          />
        </Col>

        <Col xs={24} sm={8}>
          <Statistic
            title="Performance"
            value={performanceValue}
            precision={0}
            suffix="%"
          />

          <Progress
            percent={performanceValue}
            showInfo={false}
            size="small"
            status={performanceValue < 60 ? "exception" : "normal"}
          />
        </Col>
      </Row>

      <Divider
        style={{
          margin: "20px 0",
        }}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Statistic
            title="Production"
            value={productionValue}
            precision={2}
            suffix={
              <span
                style={{
                  fontSize: 14,
                }}
              >
                m²
              </span>
            }
          />
        </Col>

        <Col xs={24} sm={12}>
          <Statistic title="Downtime" value={downtime || "0h 00m"} />
        </Col>
      </Row>
    </Card>
  );
}
