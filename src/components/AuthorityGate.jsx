import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Modal, Space, Typography } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import { verifyAuthorityPassword } from "../api/authorityApi";

const { Text } = Typography;

const AUTHORITY_LABELS = {
  administrator: "Administrator",
  production_manager: "Production Manager",
};

export default function AuthorityGate({ authorityLevel, children, title }) {
  const [form] = Form.useForm();
  const navigate = useNavigate();

  // IMPORTANT:
  // Store WHICH authority was verified instead of a generic boolean.
  // This prevents a Production Manager unlock from granting
  // Administrator access if the same gate component is reused.
  const [authorizedAuthority, setAuthorizedAuthority] = useState(null);

  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const authorityLabel =
    AUTHORITY_LABELS[authorityLevel] || authorityLevel || "Authorized";

  // Whenever the required authority changes, clear the previous gate state.
  useEffect(() => {
    setAuthorizedAuthority(null);
    setError("");
    setVerifying(false);
    form.resetFields();
  }, [authorityLevel, form]);

  const handleCancel = () => {
    form.resetFields();
    setError("");
    setAuthorizedAuthority(null);

    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/dashboard", { replace: true });
    }
  };

  const handleVerify = async () => {
    try {
      const { password } = await form.validateFields();

      // Capture the authority being verified for this specific request.
      const requestedAuthority = authorityLevel;

      setVerifying(true);
      setError("");

      const result = await verifyAuthorityPassword(
        requestedAuthority,
        password,
      );

      if (
        result?.authorized !== true ||
        result?.authorityLevel !== requestedAuthority
      ) {
        form.setFieldsValue({ password: "" });
        setAuthorizedAuthority(null);
        setError(result?.message || "Incorrect password.");
        return;
      }

      form.resetFields();

      // Unlock ONLY the authority that the backend confirmed.
      setAuthorizedAuthority(requestedAuthority);
    } catch (err) {
      if (err?.errorFields) return;

      setAuthorizedAuthority(null);
      setError(
        err instanceof Error ? err.message : "Unable to verify password.",
      );
    } finally {
      setVerifying(false);
    }
  };

  // Access is granted only when the verified authority exactly
  // matches the authority required by this page.
  const authorized =
    authorizedAuthority !== null && authorizedAuthority === authorityLevel;

  if (authorized) {
    return children;
  }

  return (
    <Modal
      title={
        <span>
          <LockOutlined style={{ marginRight: 8 }} />
          {title || `${authorityLabel} Access Required`}
        </span>
      }
      open
      closable
      onCancel={handleCancel}
      maskClosable={false}
      keyboard
      footer={null}
      width={420}
      destroyOnHidden
    >
      <Text type="secondary">
        Enter the {authorityLabel.toLowerCase()} password to continue.
      </Text>

      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginTop: 16 }}
        />
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleVerify}
        style={{ marginTop: 20 }}
      >
        <Form.Item
          name="password"
          label="Password"
          rules={[
            {
              required: true,
              message: "Enter the password",
            },
          ]}
        >
          <Input.Password
            autoFocus
            autoComplete="current-password"
            placeholder={`${authorityLabel} password`}
            onPressEnter={() => form.submit()}
          />
        </Form.Item>

        <Space
          style={{
            width: "100%",
            justifyContent: "flex-end",
          }}
        >
          <Button onClick={handleCancel} disabled={verifying}>
            Cancel
          </Button>

          <Button type="primary" htmlType="submit" loading={verifying}>
            Unlock
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}
