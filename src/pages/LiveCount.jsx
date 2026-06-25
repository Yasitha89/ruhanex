import React, { useEffect, useState } from "react";
import { Card } from "antd";

export default function LiveCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      // simulate MQTT / Influx update
      setCount((prev) => prev + Math.floor(Math.random() * 5));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card title="Live Tile Counter">
      <h1 style={{ fontSize: 60 }}>{count}</h1>
    </Card>
  );
}