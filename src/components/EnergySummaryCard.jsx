import React from "react";
import { Badge, Card, Col, Divider, Row, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";

import "./CompactEnergyCard.css";

const { Text } = Typography;

function formatValue(value, precision = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  return number.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function getStatusBadge(status) {
  const normalizedStatus = String(status || "");

  if (normalizedStatus === "Online") {
    return {
      status: "success",
      text: "Online",
    };
  }

  if (normalizedStatus === "Offline") {
    return {
      status: "error",
      text: "Offline",
    };
  }

  return {
    status: "default",
    text: "Connecting",
  };
}

function DataRow({ label, value, unit = "", precision = 1 }) {
  return (
    <div className="compact-energy-data-row">
      <Text className="compact-energy-data-label">{label}</Text>

      <Text className="compact-energy-data-value">
        {formatValue(value, precision)}

        {unit && <span className="compact-energy-data-unit"> {unit}</span>}
      </Text>
    </div>
  );
}

export default function CompactEnergyCard({ data, title, loading = false }) {
  const current = data?.current || {};
  const voltage = data?.voltage || {};
  const power = data?.power || {};
  const energy = data?.energy || {};

  const deviceName = data?.device || "Energy Meter";
  const statusBadge = getStatusBadge(data?.status);

  return (
    <Card className="compact-energy-card" loading={loading} size="small">
      {/* Header */}
      <div className="compact-energy-header">
        <div className="compact-energy-title">
          <ThunderboltOutlined />

          <Text strong>{title || deviceName}</Text>
        </div>

        <div className="compact-energy-status">
          <Text type="secondary">Status:</Text>

          <Badge status={statusBadge.status} text={statusBadge.text} />
        </div>
      </div>

      <Divider className="compact-energy-header-divider" />

      {/* Voltage section */}
      <section className="compact-energy-section">
        <Text strong className="compact-energy-section-title">
          Voltage
        </Text>

        <Row gutter={[28, 4]}>
          <Col xs={24} sm={12}>
            <DataRow
              label="V L1-L2:"
              value={voltage.l1_l2_v}
              unit="V"
              precision={1}
            />

            <DataRow
              label="V L2-L3:"
              value={voltage.l2_l3_v}
              unit="V"
              precision={1}
            />

            <DataRow
              label="V L3-L1:"
              value={voltage.l3_l1_v}
              unit="V"
              precision={1}
            />

            <DataRow
              label="V L-L Avg:"
              value={voltage.ll_avg_v}
              unit="V"
              precision={1}
            />
          </Col>

          <Col xs={24} sm={12}>
            <DataRow
              label="V L1-N:"
              value={voltage.l1_n_v}
              unit="V"
              precision={1}
            />

            <DataRow
              label="V L2-N:"
              value={voltage.l2_n_v}
              unit="V"
              precision={1}
            />

            <DataRow
              label="V L3-N:"
              value={voltage.l3_n_v}
              unit="V"
              precision={1}
            />

            <DataRow
              label="V L-N Avg:"
              value={voltage.ln_avg_v}
              unit="V"
              precision={1}
            />
          </Col>
        </Row>
      </section>

      <Divider className="compact-energy-section-divider" />

      {/* Current and power section */}
      <Row gutter={[28, 12]} className="compact-current-power-row">
        <Col xs={24} sm={12}>
          <section className="compact-energy-section">
            <Text strong className="compact-energy-section-title">
              Current
            </Text>

            <DataRow
              label="I L1:"
              value={current.l1_a}
              unit="A"
              precision={2}
            />

            <DataRow
              label="I L2:"
              value={current.l2_a}
              unit="A"
              precision={2}
            />

            <DataRow
              label="I L3:"
              value={current.l3_a}
              unit="A"
              precision={2}
            />

            <DataRow
              label="I Avg:"
              value={current.avg_a}
              unit="A"
              precision={2}
            />
          </section>
        </Col>

        <Col xs={24} sm={12}>
          <section className="compact-energy-section compact-power-section">
            <Text strong className="compact-energy-section-title">
              Power
            </Text>

            <DataRow
              label="Active:"
              value={power.active_kw}
              unit="KW"
              precision={3}
            />

            <DataRow
              label="Reactive:"
              value={power.reactive_kvar}
              unit="KVAR"
              precision={3}
            />

            <DataRow
              label="Apparent:"
              value={power.apparent_kva}
              unit="kVA"
              precision={3}
            />

            <DataRow
              label="Power Factor:"
              value={power.power_factor}
              precision={2}
            />
          </section>
        </Col>
      </Row>

      <Divider className="compact-energy-section-divider" />

      {/* Energy and frequency on one line */}
      <div className="compact-energy-footer-line">
        <div className="compact-energy-footer-reading">
          <Text strong>Energy:</Text>

          <Text strong>{formatValue(energy.active_kwh, 3)} kWh</Text>
        </div>

        <div className="compact-energy-footer-reading">
          <Text strong>Frequency:</Text>

          <Text>{formatValue(power.frequency_hz, 2)} Hz</Text>
        </div>
      </div>
    </Card>
  );
}
