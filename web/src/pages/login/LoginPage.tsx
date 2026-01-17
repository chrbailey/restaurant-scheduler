import { useState } from "react";
import { useLogin } from "@refinedev/core";
import { Form, Input, Button, Card, Typography, Alert, Space } from "antd";
import { MailOutlined, LockOutlined, ShopOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

export const LoginPage = () => {
  const { mutate: login, isLoading } = useLogin();
  const [error, setError] = useState<string | null>(null);

  const onFinish = (values: { email: string; password: string }) => {
    setError(null);
    login(values, {
      onError: (error: any) => {
        setError(error.message || "Login failed");
      },
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)",
        padding: 24,
      }}
    >
      <Card
        style={{
          width: 400,
          maxWidth: "100%",
          backgroundColor: "#1a1a2e",
          border: "1px solid #2a2a4e",
        }}
      >
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          <div style={{ textAlign: "center" }}>
            <ShopOutlined
              style={{ fontSize: 48, color: "#4a90d9", marginBottom: 16 }}
            />
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              Restaurant Scheduler
            </Title>
            <Text type="secondary">Manager Dashboard</Text>
          </div>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
            />
          )}

          <Form
            name="login"
            onFinish={onFinish}
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              name="email"
              rules={[
                { required: true, message: "Please enter your email" },
                { type: "email", message: "Please enter a valid email" },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: "#666" }} />}
                placeholder="Email"
                size="large"
                style={{
                  backgroundColor: "#16213e",
                  borderColor: "#2a2a4e",
                }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: "Please enter your password" },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "#666" }} />}
                placeholder="Password"
                size="large"
                style={{
                  backgroundColor: "#16213e",
                  borderColor: "#2a2a4e",
                }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={isLoading}
                block
              >
                Sign In
              </Button>
            </Form.Item>
          </Form>

          <Text
            type="secondary"
            style={{ textAlign: "center", display: "block", fontSize: 12 }}
          >
            Workers should use the mobile app to access their schedule
          </Text>
        </Space>
      </Card>
    </div>
  );
};
