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
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "online" || normalizedStatus === "ok") {
    return {
      status: "success",
      text: "Online",
    };
  }

  if (
    normalizedStatus === "offline" ||
    normalizedStatus === "error" ||
    normalizedStatus === "fault"
  ) {
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

function KpiItem({ value, label, subLabel }) {
  return (
    <div
      style={{
        textAlign: "center",
        minWidth: 0,
        padding: "2px 4px",
      }}
    >
      <div
        style={{
          fontSize: "clamp(15px, 1.5vw, 19px)",
          fontWeight: 700,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>

      <div
        style={{
          height: 34,
          marginTop: 4,
        }}
      >
        <Text
          type="secondary"
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            lineHeight: "15px",
          }}
        >
          {label}
        </Text>

        <Text
          type="secondary"
          style={{
            display: "block",
            fontSize: 10,
            lineHeight: "15px",
            visibility: subLabel ? "visible" : "hidden",
          }}
        >
          {subLabel || "\u00A0"}
        </Text>
      </div>
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

  const averageVoltage = `${formatValue(
    voltage.ll_avg_v,
    1,
  )} / ${formatValue(voltage.ln_avg_v, 1)} V`;

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

      {/* Main KPI section */}
      <Row gutter={[8, 12]} align="middle" style={{ padding: "4px 0 2px" }}>
        <Col xs={24} sm={8}>
          <KpiItem
            value={averageVoltage}
            label="Avg Voltage"
            subLabel="LL / LN"
          />
        </Col>

        <Col xs={12} sm={8}>
          <KpiItem
            value={`${formatValue(current.avg_a, 1)} A`}
            label="Avg Current"
          />
        </Col>

        <Col xs={12} sm={8}>
          <KpiItem
            value={`${formatValue(power.active_kw, 1)} kW`}
            label="Active Power"
          />
        </Col>
      </Row>

      {/* Secondary KPI strip */}
      <div
        style={{
          marginTop: 10,
          padding: "9px 12px",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-around",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
          <Text type="secondary">Power Factor</Text>
          <Text strong style={{ fontSize: 15 }}>
            {formatValue(power.power_factor, 2)}
          </Text>
        </div>

        <div style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
          <Text type="secondary">Frequency</Text>
          <Text strong style={{ fontSize: 15 }}>
            {formatValue(power.frequency_hz, 2)} Hz
          </Text>
        </div>
      </div>

      <Divider className="compact-energy-section-divider" />

      {/* Detailed voltage */}
      <section className="compact-energy-section">
        <Text strong className="compact-energy-section-title">
          Voltage
        </Text>

        <Row gutter={[28, 8]}>
          <Col xs={24} sm={12}>
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Line-Line
            </Text>

            <DataRow
              label="L1-L2:"
              value={voltage.l1_l2_v}
              unit="V"
              precision={1}
            />
            <DataRow
              label="L2-L3:"
              value={voltage.l2_l3_v}
              unit="V"
              precision={1}
            />
            <DataRow
              label="L3-L1:"
              value={voltage.l3_l1_v}
              unit="V"
              precision={1}
            />
          </Col>

          <Col xs={24} sm={12}>
            <Text
              type="secondary"
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Line-Neutral
            </Text>

            <DataRow
              label="L1-N:"
              value={voltage.l1_n_v}
              unit="V"
              precision={1}
            />
            <DataRow
              label="L2-N:"
              value={voltage.l2_n_v}
              unit="V"
              precision={1}
            />
            <DataRow
              label="L3-N:"
              value={voltage.l3_n_v}
              unit="V"
              precision={1}
            />
          </Col>
        </Row>
      </section>

      <Divider className="compact-energy-section-divider" />

      {/* Current and power details */}
      <Row gutter={[28, 12]} className="compact-current-power-row">
        <Col xs={24} sm={12}>
          <section className="compact-energy-section">
            <Text strong className="compact-energy-section-title">
              Current
            </Text>

            <DataRow label="L1:" value={current.l1_a} unit="A" precision={2} />
            <DataRow label="L2:" value={current.l2_a} unit="A" precision={2} />
            <DataRow label="L3:" value={current.l3_a} unit="A" precision={2} />
          </section>
        </Col>

        <Col xs={24} sm={12}>
          <section className="compact-energy-section compact-power-section">
            <Text strong className="compact-energy-section-title">
              Power
            </Text>

            <DataRow
              label="Reactive:"
              value={power.reactive_kvar}
              unit="kvar"
              precision={2}
            />

            <DataRow
              label="Apparent:"
              value={power.apparent_kva}
              unit="kVA"
              precision={2}
            />
          </section>
        </Col>
      </Row>

      <Divider className="compact-energy-section-divider" />

      {/* Total energy */}
      <div
        style={{
          padding: "10px 12px",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: 8,
        }}
      >
        <Text
          type="secondary"
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Total Energy
        </Text>

        <Text
          strong
          style={{
            display: "block",
            marginTop: 2,
            fontSize: 18,
            lineHeight: 1.25,
          }}
        >
          {formatValue(energy.active_kwh, 2)} kWh
        </Text>
      </div>
    </Card>
  );
}
