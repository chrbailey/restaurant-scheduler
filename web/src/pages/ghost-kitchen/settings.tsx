import { useState } from "react";
import { useCustom, useCustomMutation, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Tabs,
  message,
  Select,
  TimePicker,
  Slider,
  Alert,
  Tag,
  Popconfirm,
  Divider,
} from "antd";
import {
  SettingOutlined,
  ApiOutlined,
  DashboardOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  BellOutlined,
  LinkOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Title, Text, Paragraph } = Typography;

interface Platform {
  id: string;
  name: string;
  connected: boolean;
  commissionRate: number;
  lastSync?: string;
}

export const GhostKitchenSettings = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch current settings
  const { data: settingsData, isLoading, refetch } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/settings`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const { mutate: updateSettings } = useCustomMutation();
  const { mutate: connectPlatform, isLoading: isConnecting } = useCustomMutation();
  const { mutate: disconnectPlatform, isLoading: isDisconnecting } = useCustomMutation();

  const settings = settingsData?.data as any;

  const handleSave = async (section: string, values: any) => {
    setIsSubmitting(true);
    updateSettings(
      {
        url: `/ghost-kitchen/${identity?.restaurantId}/settings/${section}`,
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

  const handleConnectPlatform = (platformId: string) => {
    // In real app, this would open OAuth flow or API key entry
    connectPlatform(
      {
        url: `/ghost-kitchen/${identity?.restaurantId}/platforms/${platformId}/connect`,
        method: "post",
        values: {},
      },
      {
        onSuccess: () => {
          message.success(`Connected to ${platformId}`);
          refetch();
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to connect platform");
        },
      }
    );
  };

  const handleDisconnectPlatform = (platformId: string) => {
    disconnectPlatform(
      {
        url: `/ghost-kitchen/${identity?.restaurantId}/platforms/${platformId}/disconnect`,
        method: "post",
        values: {},
      },
      {
        onSuccess: () => {
          message.info(`Disconnected from ${platformId}`);
          refetch();
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to disconnect platform");
        },
      }
    );
  };

  const handleUpdateCommission = (platformId: string, rate: number) => {
    updateSettings(
      {
        url: `/ghost-kitchen/${identity?.restaurantId}/platforms/${platformId}/commission`,
        method: "put",
        values: { commissionRate: rate },
      },
      {
        onSuccess: () => {
          message.success("Commission rate updated");
          refetch();
        },
      }
    );
  };

  const availablePlatforms: Platform[] = [
    { id: "doordash", name: "DoorDash", connected: settings?.platforms?.doordash?.connected || false, commissionRate: settings?.platforms?.doordash?.commissionRate || 15 },
    { id: "ubereats", name: "Uber Eats", connected: settings?.platforms?.ubereats?.connected || false, commissionRate: settings?.platforms?.ubereats?.commissionRate || 15 },
    { id: "grubhub", name: "Grubhub", connected: settings?.platforms?.grubhub?.connected || false, commissionRate: settings?.platforms?.grubhub?.commissionRate || 15 },
    { id: "postmates", name: "Postmates", connected: settings?.platforms?.postmates?.connected || false, commissionRate: settings?.platforms?.postmates?.commissionRate || 15 },
  ];

  const items = [
    {
      key: "platforms",
      label: (
        <Space>
          <ApiOutlined />
          <span>Platforms</span>
        </Space>
      ),
      children: (
        <div>
          <Paragraph type="secondary" style={{ marginBottom: 24 }}>
            Connect your delivery platform accounts to receive and manage orders.
          </Paragraph>

          <Row gutter={[16, 16]}>
            {availablePlatforms.map((platform) => (
              <Col xs={24} md={12} key={platform.id}>
                <Card
                  style={{
                    backgroundColor: platform.connected ? "#1a2a1a" : "#1a1a2e",
                    borderColor: platform.connected ? "#22c55e40" : "#2a2a4e",
                  }}
                >
                  <Row align="middle" justify="space-between">
                    <Col>
                      <Space>
                        {platform.connected ? (
                          <CheckCircleOutlined style={{ color: "#52c41a", fontSize: 20 }} />
                        ) : (
                          <CloseCircleOutlined style={{ color: "#666", fontSize: 20 }} />
                        )}
                        <div>
                          <Text strong style={{ color: "#fff", display: "block" }}>
                            {platform.name}
                          </Text>
                          {platform.connected && (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Last sync: {platform.lastSync || "Just now"}
                            </Text>
                          )}
                        </div>
                      </Space>
                    </Col>
                    <Col>
                      {platform.connected ? (
                        <Popconfirm
                          title={`Disconnect from ${platform.name}?`}
                          description="You won't receive orders from this platform"
                          onConfirm={() => handleDisconnectPlatform(platform.id)}
                          okText="Disconnect"
                          okButtonProps={{ danger: true }}
                        >
                          <Button
                            danger
                            icon={<DisconnectOutlined />}
                            loading={isDisconnecting}
                          >
                            Disconnect
                          </Button>
                        </Popconfirm>
                      ) : (
                        <Button
                          type="primary"
                          icon={<LinkOutlined />}
                          loading={isConnecting}
                          onClick={() => handleConnectPlatform(platform.id)}
                        >
                          Connect
                        </Button>
                      )}
                    </Col>
                  </Row>

                  {platform.connected && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #2a2a4e" }}>
                      <Row align="middle" gutter={16}>
                        <Col flex="auto">
                          <Text type="secondary">Commission Rate</Text>
                        </Col>
                        <Col>
                          <InputNumber
                            min={0}
                            max={50}
                            value={platform.commissionRate}
                            onChange={(v) => handleUpdateCommission(platform.id, v || 0)}
                            formatter={(v) => `${v}%`}
                            parser={(v) => parseFloat(v?.replace("%", "") || "0")}
                            style={{ width: 100 }}
                          />
                        </Col>
                      </Row>
                    </div>
                  )}
                </Card>
              </Col>
            ))}
          </Row>

          <Alert
            type="info"
            showIcon
            message="Platform Integration"
            description="Commission rates are used for P&L calculations. Make sure they match your actual contract rates with each platform."
            style={{ marginTop: 24, backgroundColor: "#16213e", borderColor: "#2a4a6e" }}
          />
        </div>
      ),
    },
    {
      key: "capacity",
      label: (
        <Space>
          <DashboardOutlined />
          <span>Capacity</span>
        </Space>
      ),
      children: (
        <Form
          layout="vertical"
          initialValues={settings?.capacity}
          onFinish={(values) => handleSave("capacity", values)}
          disabled={isLoading}
        >
          <Card
            title="Order Capacity"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Row gutter={[24, 0]}>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Default Max Concurrent Orders"
                  name="defaultMaxOrders"
                  extra="Maximum orders you can handle at once"
                >
                  <InputNumber min={5} max={50} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Auto-Pause Threshold (%)"
                  name="autoPauseThreshold"
                  extra="Pause new orders at this capacity level"
                >
                  <Slider
                    min={50}
                    max={100}
                    marks={{ 50: "50%", 75: "75%", 100: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Resume Threshold (%)"
                  name="resumeThreshold"
                  extra="Resume accepting orders below this level"
                >
                  <Slider
                    min={30}
                    max={80}
                    marks={{ 30: "30%", 50: "50%", 80: "80%" }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title="Prep Time Estimates"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              Average prep time per category helps calculate accurate capacity.
            </Paragraph>

            <Row gutter={[24, 0]}>
              <Col xs={12} md={6}>
                <Form.Item
                  label="Appetizers (min)"
                  name={["prepTimes", "appetizers"]}
                >
                  <InputNumber min={1} max={30} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  label="Entrees (min)"
                  name={["prepTimes", "entrees"]}
                >
                  <InputNumber min={5} max={45} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  label="Desserts (min)"
                  name={["prepTimes", "desserts"]}
                >
                  <InputNumber min={1} max={20} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={6}>
                <Form.Item
                  label="Beverages (min)"
                  name={["prepTimes", "beverages"]}
                >
                  <InputNumber min={1} max={10} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              Save Capacity Settings
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "automation",
      label: (
        <Space>
          <ThunderboltOutlined />
          <span>Automation</span>
        </Space>
      ),
      children: (
        <Form
          layout="vertical"
          initialValues={settings?.automation}
          onFinish={(values) => handleSave("automation", values)}
          disabled={isLoading}
        >
          <Card
            title="Auto-Enable Settings"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Auto-Enable on Opportunity"
              name="autoEnableOnOpportunity"
              valuePropName="checked"
              extra="Automatically activate ghost kitchen when a high-score opportunity is detected"
            >
              <Switch />
            </Form.Item>

            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Minimum Opportunity Score"
                  name="minOpportunityScore"
                  extra="Only auto-enable for opportunities scoring above this threshold"
                >
                  <Slider
                    min={50}
                    max={100}
                    marks={{ 50: "50", 75: "75", 100: "100" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Require Manager Approval"
                  name="requireApprovalForAutoEnable"
                  valuePropName="checked"
                  extra="Send notification for approval instead of auto-enabling"
                >
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title="Auto-Disable Settings"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Auto-Disable Time"
              name="autoDisableTime"
              extra="Automatically disable ghost kitchen at this time each day"
            >
              <TimePicker format="h:mm A" use12Hours style={{ width: 200 }} />
            </Form.Item>

            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Max Session Duration (hours)"
                  name="maxSessionDuration"
                  extra="Automatically disable after this many hours (0 = no limit)"
                >
                  <InputNumber min={0} max={12} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Disable on Low Demand"
                  name="disableOnLowDemand"
                  valuePropName="checked"
                  extra="Auto-disable when order rate drops below threshold"
                >
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title="Order Handling"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Auto-Accept Orders"
              name="autoAcceptOrders"
              valuePropName="checked"
              extra="Automatically accept incoming orders when under capacity"
            >
              <Switch />
            </Form.Item>

            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Auto-Accept Capacity Limit (%)"
                  name="autoAcceptLimit"
                  extra="Only auto-accept when below this capacity level"
                >
                  <Slider
                    min={50}
                    max={100}
                    marks={{ 50: "50%", 75: "75%", 100: "100%" }}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Order Timeout (seconds)"
                  name="orderTimeout"
                  extra="Auto-reject orders not accepted within this time"
                >
                  <InputNumber min={30} max={300} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              Save Automation Settings
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: "costs",
      label: (
        <Space>
          <DollarOutlined />
          <span>Costs</span>
        </Space>
      ),
      children: (
        <Form
          layout="vertical"
          initialValues={settings?.costs}
          onFinish={(values) => handleSave("costs", values)}
          disabled={isLoading}
        >
          <Card
            title="Order Costs"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              These values are used for P&L calculations and profit tracking.
            </Paragraph>

            <Row gutter={[24, 0]}>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Per-Order Supply Cost ($)"
                  name="perOrderSupplyCost"
                  extra="Packaging, utensils, napkins, etc."
                >
                  <InputNumber min={0} max={10} step={0.25} prefix="$" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Per-Order Misc Cost ($)"
                  name="perOrderMiscCost"
                  extra="Other variable costs per order"
                >
                  <InputNumber min={0} max={10} step={0.25} prefix="$" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Food Cost Percentage (%)"
                  name="foodCostPercent"
                  extra="Average food cost as % of order total"
                >
                  <InputNumber min={0} max={100} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title="Labor Costs"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Row gutter={[24, 0]}>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Ghost Shift Hourly Rate ($)"
                  name="ghostShiftHourlyRate"
                  extra="Labor cost per hour during ghost kitchen"
                >
                  <InputNumber min={0} max={100} step={0.5} prefix="$" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Min Staff for Ghost Mode"
                  name="minGhostStaff"
                  extra="Minimum workers needed"
                >
                  <InputNumber min={1} max={10} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="Include Existing Staff Cost"
                  name="includeExistingStaffCost"
                  valuePropName="checked"
                  extra="Count already-scheduled staff in costs"
                >
                  <Switch />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              Save Cost Settings
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
          onFinish={(values) => handleSave("notifications", values)}
          disabled={isLoading}
        >
          <Card
            title="Opportunity Alerts"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Alert on New Opportunity"
              name="alertOnOpportunity"
              valuePropName="checked"
              extra="Receive notification when a ghost kitchen opportunity is detected"
            >
              <Switch />
            </Form.Item>

            <Row gutter={[24, 0]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Minimum Score to Alert"
                  name="minAlertScore"
                  extra="Only alert for opportunities above this score"
                >
                  <Slider min={40} max={100} marks={{ 40: "40", 70: "70", 100: "100" }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Alert Method"
                  name="alertMethod"
                >
                  <Select
                    options={[
                      { label: "Push Notification", value: "push" },
                      { label: "Email", value: "email" },
                      { label: "SMS", value: "sms" },
                      { label: "All", value: "all" },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Card
            title="Operational Alerts"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Form.Item
              label="Alert on Capacity Threshold"
              name="alertOnCapacityThreshold"
              valuePropName="checked"
              extra="Notify when capacity reaches critical level"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Capacity Alert Threshold (%)"
              name="capacityAlertThreshold"
            >
              <Slider min={50} max={100} marks={{ 50: "50%", 75: "75%", 90: "90%", 100: "100%" }} />
            </Form.Item>

            <Divider style={{ borderColor: "#2a2a4e" }} />

            <Form.Item
              label="Alert on Order Issues"
              name="alertOnOrderIssues"
              valuePropName="checked"
              extra="Notify for late prep, rejected orders, etc."
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Daily Summary"
              name="sendDailySummary"
              valuePropName="checked"
              extra="Receive daily ghost kitchen performance summary"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              label="Summary Time"
              name="dailySummaryTime"
            >
              <TimePicker format="h:mm A" use12Hours style={{ width: 200 }} />
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
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <SettingOutlined style={{ fontSize: 28, color: "#4a90d9" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Ghost Kitchen Settings
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Configure platforms, capacity, automation, and costs for ghost kitchen operations
        </Text>
      </div>

      <Tabs items={items} tabPosition="left" />
    </div>
  );
};
