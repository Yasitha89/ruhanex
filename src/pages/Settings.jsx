import React, { useState } from "react";
import { Card, Form, Input, Button, Switch, message } from "antd";

export default function Settings() {
  const [loading, setLoading] = useState(false);

  const onFinish = (values) => {
    setLoading(true);

    console.log("Settings:", values);

    setTimeout(() => {
      setLoading(false);
      message.success("Settings saved successfully");
    }, 1000);
  };

  return (
    <Card title="System Settings">
      <Form
        layout="vertical"
        onFinish={onFinish}
        initialValues={{
          apiUrl: "http://localhost:3000",
          refreshRate: 5000,
          darkMode: false,
        }}
      >
        <Form.Item label="API URL" name="apiUrl">
          <Input />
        </Form.Item>

        <Form.Item label="Chart Refresh Rate (ms)" name="refreshRate">
          <Input type="number" />
        </Form.Item>

        <Form.Item
          label="Enable Dark Mode"
          name="darkMode"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={loading}>
          Save Settings
        </Button>
      </Form>
    </Card>
  );
}
