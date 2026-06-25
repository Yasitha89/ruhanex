import React from "react";
import { Row, Col, Card } from "antd";
import TileCountChart from "../components/TileCountChart";

export default function Dashboard() {
  return (
    <>
      <Row gutter={16}>
        <Col span={6}>
          <Card title="Current Shift">
            <h1>122</h1>
          </Card>
        </Col>

        <Col span={6}>
          <Card title="Today Total">
            <h1>784</h1>
          </Card>
        </Col>

        <Col span={6}>
          <Card title="Hourly Avg">
            <h1>54</h1>
          </Card>
        </Col>

        <Col span={6}>
          <Card title="Machine Status">
            <h1>RUNNING</h1>
          </Card>
        </Col>
      </Row>

      <Card
        style={{ marginTop: 20 }}
        title="Tile Production Trend"
      >
        <TileCountChart
          bucket="RCLH"
          measurement="tile_events"
          field="shift_count"
          refreshRate={5000}
        />
      </Card>
    </>
  );
}