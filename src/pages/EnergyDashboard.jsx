import React, { useCallback, useEffect, useState } from "react";
import { Alert, Col, Row, Typography } from "antd";

import EnergySummaryCard from "../components/EnergySummaryCard";
import { getEnergyData } from "../api/energyApi.js";

const { Title, Text } = Typography;

const ENERGY_METERS = [
  {
    key: "ats-panel",
    title: "ATS Panel",
    panel: "ATS1",
    deviceId: 1,
  },
  {
    key: "ats-generator",
    title: "ATS Generator",
    panel: "ATS1",
    deviceId: 2,
  },
  {
    key: "msb-panel",
    title: "MSB Panel",
    panel: "ATS1",
    deviceId: 3,
  },
];

function createInitialMeterState() {
  return ENERGY_METERS.reduce((state, meter) => {
    state[meter.key] = {
      data: null,
      loading: true,
      error: "",
    };

    return state;
  }, {});
}

export default function EnergyDashboard() {
  const [meters, setMeters] = useState(createInitialMeterState);

  const loadEnergyData = useCallback(async () => {
    const results = await Promise.allSettled(
      ENERGY_METERS.map((meter) =>
        getEnergyData({
          panel: meter.panel,
          deviceId: meter.deviceId,
        }),
      ),
    );

    setMeters((previous) => {
      const next = { ...previous };

      results.forEach((result, index) => {
        const meter = ENERGY_METERS[index];

        if (result.status === "fulfilled" && result.value) {
          next[meter.key] = {
            data: result.value,
            loading: false,
            error: "",
          };
          return;
        }

        const errorMessage =
          result.status === "rejected"
            ? result.reason?.message || "Unable to load energy data."
            : "No energy data was returned by the server.";

        console.error(
          `Energy data loading error for ${meter.title}:`,
          result.status === "rejected" ? result.reason : errorMessage,
        );

        next[meter.key] = {
          // Keep the most recently received valid data visible if a refresh fails.
          data: previous[meter.key]?.data ?? null,
          loading: false,
          error: errorMessage,
        };
      });

      return next;
    });
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
        {ENERGY_METERS.map((meter) => {
          const meterState = meters[meter.key] || {};

          return (
            <Col key={meter.key} xs={24} xl={12} xxl={8}>
              {meterState.error ? (
                <Alert
                  type="warning"
                  showIcon
                  message={`${meter.title}: ${meterState.error}`}
                  style={{ marginBottom: 8 }}
                />
              ) : null}

              <EnergySummaryCard
                title={meter.title}
                data={meterState.data}
                loading={meterState.loading}
              />
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
