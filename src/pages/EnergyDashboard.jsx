import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Col, Row, Typography, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

import EnergySummaryCard from "../components/EnergySummaryCard";
import { getEnergyData } from "../api/energyApi.js";

const { Title, Text } = Typography;

export default function EnergyDashboard() {
  const [energyData, setEnergyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadEnergyData = useCallback(async ({ showLoading = false } = {}) => {
    if (showLoading) {
      setRefreshing(true);
    }

    setError("");

    try {
      const result = await getEnergyData({
        panel: "ATS1",
        deviceId: 1,
      });
      //   let result = {};
      //   const result_ = {
      //     panel: "ATS1",
      //     device_id: 1,
      //     timestamp_ms: 15200,
      //     current: {
      //       l1_a: 4.52,
      //       l2_a: 4.48,
      //       l3_a: 4.6,
      //       avg_a: 4.53,
      //     },
      //     voltage: {
      //       l1_l2_v: 400.12,
      //       l2_l3_v: 399.85,
      //       l3_l1_v: 400.5,
      //       ll_avg_v: 400.15,
      //       l1_n_v: 231.02,
      //       l2_n_v: 230.85,
      //       l3_n_v: 231.2,
      //       ln_avg_v: 231.02,
      //     },
      //     power: {
      //       active_kw: 3.125,
      //       reactive_kvar: 0.41,
      //       apparent_kva: 3.152,
      //       power_factor: 0.99,
      //       frequency_hz: 50.02,
      //     },
      //     energy: {
      //       active_kwh: 1152568.235,
      //     },
      //     status: "OK",
      //   };
      //   result = result_;
      if (!result) {
        throw new Error("No energy data was returned by the server.");
      }
      setEnergyData(result);
    } catch (err) {
      console.error("Energy data loading error:", err);

      const errorMessage =
        err instanceof Error ? err.message : "Unable to load energy data.";

      setError(errorMessage);

      if (showLoading) {
        message.error(errorMessage);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEnergyData();

    const intervalId = window.setInterval(() => {
      loadEnergyData();
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadEnergyData]);

  return (
    <div style={{ width: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          Energy Dashboard
        </Title>

        <Text type="secondary">
          Live electrical measurements and energy usage
        </Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={16} lg={12} xl={10}>
          <EnergySummaryCard title="ATS Panel Energy Meter" data={energyData} />
        </Col>
      </Row>
    </div>
  );
}
