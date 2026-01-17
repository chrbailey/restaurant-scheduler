import { useState } from "react";
import { useGetIdentity, useCustom, useCustomMutation } from "@refinedev/core";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Space,
  Typography,
  Divider,
  Select,
  TimePicker,
  message,
  Row,
  Col,
  Tabs,
} from "antd";
import {
  SettingOutlined,
  ClockCircleOutlined,
  BellOutlined,
  TeamOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text, Paragraph } = Typography;

export const SettingsPage = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch current settings
  const { data: settingsData, isLoading, refetch } = useCustom({
    url: `/restaurants/${identity?.restaurantId}/settings`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const { mutate: updateSettings } = useCustomMutation();

  const settings = settingsData?.data as any;

  const handleSave = async (values: any) => {
    setIsSubmitting(true);
    updateSettings(
      {
        url: `/restaurants/${identity?.restaurantId}/settings`,
        method: "put",
        values,
      },
      {
        onSuccess: () => {
          message.success("Settings saved successfully");
          refetch();
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to save settings");
        },
        onSettled: () => {
          setIsSubmitting(false);
        },
      }
    );
  };

  const items = [
    {
      key: "general",
      label: (
        <Space>
          <ShopOutlined />
          <span>General</span>
        </Space>
      ),
      children: (
        <Form
          layout="vertical"
          initialValues={settings}
          onFinish={handleSave}
          disabled={isLoading}
        >
          <Row gutter={[24, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Restaurant Name"
                name="name"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Timezone" name="timezone">
                <Select
                  options={[
                    { label: "America/New_York (EST)", value: "America/New_York" },
                    { label: "America/Chicago (CST)", value: "America/Chicago" },
                    { label: "America/Denver (MST)", value: "America/Denver" },
                    { label: "America/Los_Angeles (PST)", value: "America/Los_Angeles" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Address" name="address">
            <Input.TextArea rows={2} />
          </Form.Item>

          <Row gutter={[24, 0]}>
            <Col xs={24} md={12}>
              <Form.Item label="Contact Phone" name="phone">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Contact Email" name="email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              Save Changes
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "scheduling",
      label: (
        <Space>
          <ClockCircleOutlined />
          <span>Scheduling</span>
        </Space>
      ),
      children: (
        <Form
          layout="vertical"
          initialValues={settings?.scheduling}
          onFinish={(values) => handleSave({ scheduling: values })}
          disabled={isLoading}
        >
          <Card
            title="Shift Defaults"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Row gutter={[24, 0]}>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Default Shift Duration (hours)"
                  name="defaultShiftDuration"
                >
                  <InputNumber min={1} max={12} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Minimum Break Between Shifts (hours)" name="minBreakBetweenShifts">
                  <InputNumber min={4} max={24} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="Max Shifts Per Day" name="maxShiftsPerDay">
                  <InputNumber min={1} max={3} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title="Claim Settings"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Auto-Approve Claims"
              name="autoApproveClaims"
              valuePropName="checked"
              extra="Automatically approve claims from workers with high reliability scores"
            >
              <Switch />
            </Form.Item>

            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Auto-Approve Reliability Threshold"
                  name="autoApproveReliabilityThreshold"
                  extra="Minimum reliability score for auto-approval (0-1)"
                >
                  <InputNumber min={0} max={1} step={0.1} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Auto-Approve Reputation Threshold"
                  name="autoApproveReputationThreshold"
                  extra="Minimum rating for auto-approval (0-5)"
                >
                  <InputNumber min={0} max={5} step={0.5} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="Allow Same-Day Claims"
              name="allowSameDayClaims"
              valuePropName="checked"
              extra="Allow workers to claim shifts on the same day"
            >
              <Switch />
            </Form.Item>
          </Card>

          <Card
            title="Swap Settings"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Auto-Approve Same-Position Swaps"
              name="autoApproveSamePositionSwaps"
              valuePropName="checked"
              extra="Automatically approve swaps between workers with the same position"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Allow Pool Drops"
              name="allowPoolDrops"
              valuePropName="checked"
              extra="Allow workers to drop shifts back to the open pool"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Minimum Notice for Pool Drop (hours)"
              name="minNoticeForPoolDrop"
            >
              <InputNumber min={1} max={72} style={{ width: "100%" }} />
            </Form.Item>
          </Card>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              Save Scheduling Settings
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "notifications",
      label: (
        <Space>
          <BellOutlined />
          <span>Notifications</span>
        </Space>
      ),
      children: (
        <Form
          layout="vertical"
          initialValues={settings?.notifications}
          onFinish={(values) => handleSave({ notifications: values })}
          disabled={isLoading}
        >
          <Card
            title="Shift Reminders"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Send Shift Reminders"
              name="sendShiftReminders"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Reminder Time Before Shift (hours)"
              name="reminderHoursBefore"
            >
              <Select
                options={[
                  { label: "1 hour", value: 1 },
                  { label: "2 hours", value: 2 },
                  { label: "4 hours", value: 4 },
                  { label: "12 hours", value: 12 },
                  { label: "24 hours", value: 24 },
                ]}
              />
            </Form.Item>
          </Card>

          <Card
            title="Quiet Hours"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Paragraph type="secondary">
              Non-urgent notifications will be batched and sent outside quiet hours.
            </Paragraph>

            <Form.Item
              label="Enable Quiet Hours"
              name="enableQuietHours"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item label="Quiet Hours Start" name="quietHoursStart">
                  <TimePicker format="h:mm A" use12Hours style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Quiet Hours End" name="quietHoursEnd">
                  <TimePicker format="h:mm A" use12Hours style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title="Manager Alerts"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Alert on Unfilled Shifts"
              name="alertUnfilledShifts"
              valuePropName="checked"
              extra="Get notified when shifts remain unfilled within 24 hours"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Alert on No-Shows"
              name="alertNoShows"
              valuePropName="checked"
              extra="Get notified when workers don't check in for their shifts"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Daily Coverage Summary"
              name="sendDailySummary"
              valuePropName="checked"
              extra="Receive a daily email summary of coverage and gaps"
            >
              <Switch />
            </Form.Item>
          </Card>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              Save Notification Settings
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "positions",
      label: (
        <Space>
          <TeamOutlined />
          <span>Positions</span>
        </Space>
      ),
      children: (
        <div>
          <Card
            title="Available Positions"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Paragraph type="secondary">
              These are the positions available for scheduling at your restaurant.
            </Paragraph>

            <Form
              layout="vertical"
              initialValues={{ positions: settings?.positions || [] }}
              onFinish={(values) => handleSave({ positions: values.positions })}
            >
              <Form.Item name="positions">
                <Select
                  mode="multiple"
                  placeholder="Select positions"
                  style={{ width: "100%" }}
                  options={[
                    { label: "Server", value: "SERVER" },
                    { label: "Host", value: "HOST" },
                    { label: "Bartender", value: "BARTENDER" },
                    { label: "Line Cook", value: "LINE_COOK" },
                    { label: "Prep Cook", value: "PREP_COOK" },
                    { label: "Dishwasher", value: "DISHWASHER" },
                    { label: "Manager", value: "MANAGER" },
                    { label: "Busser", value: "BUSSER" },
                    { label: "Expo", value: "EXPO" },
                    { label: "Delivery Pack", value: "DELIVERY_PACK" },
                  ]}
                />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={isSubmitting}>
                  Save Positions
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ color: "#fff", margin: 0 }}>
          <SettingOutlined style={{ marginRight: 12 }} />
          Settings
        </Title>
        <Text type="secondary">
          Configure your restaurant's scheduling and notification preferences
        </Text>
      </div>

      <Tabs items={items} tabPosition="left" />
    </div>
  );
};
