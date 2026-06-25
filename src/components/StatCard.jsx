import React from "react";
import { Card } from "antd";

export default function StatCard({ title, value }) {
  return (
    <Card style={{ textAlign: "center" }}>
      <h3>{title}</h3>
      <h1 style={{ fontSize: 28 }}>{value}</h1>
    </Card>
  );
}