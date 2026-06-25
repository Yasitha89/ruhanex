import React from "react";
import { Card, Form, Input, Button, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Title } = Typography;

export default function Login() {
  const navigate = useNavigate();

  const onFinish = () => {
    localStorage.setItem("token", "demo-token");
    navigate("/dashboard");
  };

  return (
    <div style={styles.container}>

      {/* 🌫 Glass Card */}
      <div style={styles.glassCard}>

        {/* Logo */}
        <img
          src="/logo.png"
          alt="Company Logo"
          style={styles.logo}
        />

        <Title level={3} style={{ color: "#fff", textAlign: "center" }}>
          Ruhanex Technologies
        </Title>

        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            name="username"
            rules={[{ required: true }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Username"
              style={styles.input}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Password"
              style={styles.input}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            style={styles.button}
          >
            Login
          </Button>
        </Form>

      </div>
    </div>
  );
}

const styles = {
  container: {
    height: "100vh",
    width: "100%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",

    // 🌆 Background gradient
    background:
      "linear-gradient(135deg, #0f172a, #1e293b, #0f172a)",
  },

  glassCard: {
    width: 380,
    padding: 30,
    borderRadius: 20,

    // 🌫 Glass effect
    background: "rgba(255, 255, 255, 0.08)",
    backdropFilter: "blur(15px)",
    WebkitBackdropFilter: "blur(15px)",

    border: "1px solid rgba(255, 255, 255, 0.2)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
  },

  logo: {
    width: 90,
    height: 90,
    borderRadius: "50%",
    objectFit: "cover",
    display: "block",
    margin: "0 auto 15px",
    border: "2px solid rgba(255,255,255,0.4)",
  },

  input: {
    height: 40,
  },

  button: {
    height: 42,
    fontWeight: "bold",
  },
};