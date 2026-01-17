import { useState, useEffect } from "react";
import { useCustom, useCustomMutation, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Switch,
  Typography,
  Space,
  Statistic,
  Tag,
  Slider,
  Button,
  Progress,
  Divider,
  Alert,
  Badge,
} from "antd";
import {
  FireOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  ShoppingCartOutlined,
  DollarOutlined,
  CloudOutlined,
  RiseOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
} from "@ant-design/icons";
import { format } from "date-fns";
import { useNavigate } from "react-router";

import { LiveOrderFeed } from "../../components/ghost-kitchen/LiveOrderFeed";
import { CapacityMeter } from "../../components/ghost-kitchen/CapacityMeter";
import { ForecastChart } from "../../components/ghost-kitchen/ForecastChart";
import { useGhostKitchenSocket } from "../../hooks/useGhostKitchenSocket";

const { Title, Text } = Typography;

export const GhostKitchenDashboard = () => {
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  const [maxCapacity, setMaxCapacity] = useState(15);
  const [autoAccept, setAutoAccept] = useState(true);

  // WebSocket connection for real-time updates
  const {
    orders,
    currentCapacity,
    isConnected,
    sessionDuration
  } = useGhostKitchenSocket(identity?.restaurantId || "");

  // Fetch ghost kitchen status
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/status`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
      refetchInterval: 30000, // Refetch every 30 seconds
    },
  });

  // Fetch today's forecast
  const { data: forecastData, isLoading: forecastLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/forecast/today`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Fetch today's stats
  const { data: statsData, isLoading: statsLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/stats/today`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
      refetchInterval: 60000, // Refetch every minute
    },
  });

  const { mutate: toggleGhostKitchen, isLoading: isToggling } = useCustomMutation();

  const status = statusData?.data as any;
  const forecast = forecastData?.data as any;
  const stats = statsData?.data as any;

  const isActive = status?.isActive || false;

  const handleToggle = (checked: boolean) => {
    toggleGhostKitchen(
      {
        url: `/ghost-kitchen/${identity?.restaurantId}/${checked ? "enable" : "disable"}`,
        method: "post",
        values: {
          maxCapacity,
          autoAccept,
        },
      },
      {
        onSuccess: () => {
          refetchStatus();
        },
      }
    );
  };

  const handleUpdateSettings = () => {
    if (isActive) {
      toggleGhostKitchen(
        {
          url: `/ghost-kitchen/${identity?.restaurantId}/settings`,
          method: "put",
          values: {
            maxCapacity,
            autoAccept,
          },
        },
        {
          onSuccess: () => {
            refetchStatus();
          },
        }
      );
    }
  };

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <FireOutlined style={{ fontSize: 28, color: "#ff6b35" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Ghost Kitchen
          </Title>
          {isActive && (
            <Tag color="green" icon={<ThunderboltOutlined />}>
              ACTIVE
            </Tag>
          )}
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Delivery-only mode for maximizing revenue during low dine-in periods
        </Text>
      </div>

      {/* Connection Status */}
      {!isConnected && isActive && (
        <Alert
          message="Real-time connection lost"
          description="Attempting to reconnect... Order updates may be delayed."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Control Panel */}
      <Card
        style={{
          backgroundColor: isActive ? "#1a2a1a" : "#1a1a2e",
          borderColor: isActive ? "#22c55e40" : "#2a2a4e",
          marginBottom: 24,
        }}
      >
        <Row gutter={[24, 24]} align="middle">
          {/* Main Toggle */}
          <Col xs={24} md={8}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <Switch
                checked={isActive}
                onChange={handleToggle}
                loading={isToggling || statusLoading}
                style={{
                  transform: "scale(2)",
                  backgroundColor: isActive ? "#22c55e" : undefined,
                }}
              />
              <Space style={{ marginTop: 16 }}>
                {isActive ? (
                  <CheckCircleOutlined style={{ color: "#22c55e", fontSize: 20 }} />
                ) : (
                  <PauseCircleOutlined style={{ color: "#666", fontSize: 20 }} />
                )}
                <Text strong style={{
                  color: isActive ? "#22c55e" : "#666",
                  fontSize: 18
                }}>
                  {isActive ? "Ghost Kitchen Active" : "Ghost Kitchen Inactive"}
                </Text>
              </Space>
            </Space>
          </Col>

          {/* Active Session Info */}
          {isActive && (
            <Col xs={24} md={8}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title={<Text type="secondary">Session Time</Text>}
                    value={formatDuration(sessionDuration || status?.sessionDuration || 0)}
                    prefix={<ClockCircleOutlined style={{ color: "#4a90d9" }} />}
                    valueStyle={{ color: "#fff" }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={<Text type="secondary">Orders</Text>}
                    value={orders.length || status?.orderCount || 0}
                    prefix={<ShoppingCartOutlined style={{ color: "#52c41a" }} />}
                    valueStyle={{ color: "#fff" }}
                  />
                </Col>
              </Row>
            </Col>
          )}

          {/* Capacity Meter */}
          {isActive && (
            <Col xs={24} md={8}>
              <CapacityMeter
                current={currentCapacity || status?.currentCapacity || 0}
                max={status?.maxCapacity || maxCapacity}
              />
            </Col>
          )}

          {/* Settings (when inactive or can be adjusted) */}
          {!isActive && (
            <Col xs={24} md={16}>
              <Row gutter={[24, 16]}>
                <Col xs={24} md={12}>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Text type="secondary">Max Capacity (concurrent orders)</Text>
                    <Slider
                      min={5}
                      max={30}
                      value={maxCapacity}
                      onChange={setMaxCapacity}
                      marks={{
                        5: "5",
                        15: "15",
                        30: "30",
                      }}
                      tooltip={{ formatter: (v) => `${v} orders` }}
                    />
                  </Space>
                </Col>
                <Col xs={24} md={12}>
                  <Space direction="vertical">
                    <Text type="secondary">Auto-Accept Orders</Text>
                    <Switch
                      checked={autoAccept}
                      onChange={setAutoAccept}
                      checkedChildren="On"
                      unCheckedChildren="Off"
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Automatically accept orders under capacity threshold
                    </Text>
                  </Space>
                </Col>
              </Row>
            </Col>
          )}
        </Row>

        {/* Quick Settings when active */}
        {isActive && (
          <>
            <Divider style={{ borderColor: "#2a4a2a" }} />
            <Row gutter={[24, 16]} align="middle">
              <Col xs={12} md={6}>
                <Space direction="vertical" size={0}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Max Capacity</Text>
                  <Slider
                    min={5}
                    max={30}
                    value={maxCapacity}
                    onChange={(v) => setMaxCapacity(v)}
                    onChangeComplete={handleUpdateSettings}
                    style={{ width: 120 }}
                  />
                </Space>
              </Col>
              <Col xs={12} md={6}>
                <Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>Auto-Accept</Text>
                  <Switch
                    size="small"
                    checked={autoAccept}
                    onChange={(v) => {
                      setAutoAccept(v);
                      handleUpdateSettings();
                    }}
                  />
                </Space>
              </Col>
              <Col xs={24} md={12} style={{ textAlign: "right" }}>
                <Button
                  type="link"
                  onClick={() => navigate("/ghost-kitchen/settings")}
                >
                  More Settings
                </Button>
              </Col>
            </Row>
          </>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        {/* Live Order Feed (when active) */}
        {isActive && (
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space>
                  <Badge status="processing" />
                  <span>Live Orders</span>
                  <Tag color="blue">{orders.length || 0}</Tag>
                </Space>
              }
              style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
              headStyle={{ borderColor: "#2a2a4e" }}
              bodyStyle={{ maxHeight: 400, overflow: "auto" }}
            >
              <LiveOrderFeed orders={orders} restaurantId={identity?.restaurantId || ""} />
            </Card>
          </Col>
        )}

        {/* Today's Forecast */}
        <Col xs={24} lg={isActive ? 12 : 16}>
          <Card
            title={
              <Space>
                <RiseOutlined style={{ color: "#4a90d9" }} />
                <span>Today's Demand Forecast</span>
              </Space>
            }
            extra={
              <Button type="link" onClick={() => navigate("/ghost-kitchen/forecast")}>
                Full Forecast
              </Button>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={forecastLoading}
          >
            <ForecastChart data={forecast?.hourly || []} compact />

            {forecast?.weather && (
              <div style={{ marginTop: 16, padding: "12px 16px", backgroundColor: "#16213e", borderRadius: 8 }}>
                <Space>
                  <CloudOutlined style={{ color: "#4a90d9" }} />
                  <Text type="secondary">Weather: </Text>
                  <Text style={{ color: "#fff" }}>
                    {forecast.weather.condition}, {forecast.weather.temp}
                  </Text>
                  {forecast.weather.deliveryBoost && (
                    <Tag color="green">+{forecast.weather.deliveryBoost}% delivery expected</Tag>
                  )}
                </Space>
              </div>
            )}

            {/* Opportunity Windows */}
            {forecast?.opportunities && forecast.opportunities.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                  Opportunity Windows
                </Text>
                <Space wrap>
                  {forecast.opportunities.slice(0, 3).map((opp: any, i: number) => (
                    <Tag
                      key={i}
                      color={opp.score >= 80 ? "green" : opp.score >= 60 ? "gold" : "blue"}
                    >
                      {opp.startTime} - {opp.endTime} (Score: {opp.score})
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </Card>
        </Col>

        {/* Quick Stats */}
        <Col xs={24} lg={isActive ? 24 : 8}>
          <Card
            title={
              <Space>
                <DollarOutlined style={{ color: "#52c41a" }} />
                <span>Today's Performance</span>
              </Space>
            }
            extra={
              <Button type="link" onClick={() => navigate("/ghost-kitchen/analytics")}>
                Analytics
              </Button>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={statsLoading}
          >
            <Row gutter={[16, 24]}>
              <Col xs={12} md={isActive ? 6 : 24}>
                <Statistic
                  title={<Text type="secondary">Orders</Text>}
                  value={stats?.totalOrders || 0}
                  prefix={<ShoppingCartOutlined style={{ color: "#4a90d9" }} />}
                  valueStyle={{ color: "#fff" }}
                  suffix={
                    stats?.ordersChange !== undefined && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: stats.ordersChange >= 0 ? "#52c41a" : "#ef4444"
                        }}
                      >
                        {stats.ordersChange >= 0 ? "+" : ""}{stats.ordersChange}%
                      </Text>
                    )
                  }
                />
              </Col>
              <Col xs={12} md={isActive ? 6 : 24}>
                <Statistic
                  title={<Text type="secondary">Revenue</Text>}
                  value={stats?.totalRevenue || 0}
                  precision={2}
                  prefix={<DollarOutlined style={{ color: "#52c41a" }} />}
                  valueStyle={{ color: "#fff" }}
                  suffix={
                    stats?.revenueChange !== undefined && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: stats.revenueChange >= 0 ? "#52c41a" : "#ef4444"
                        }}
                      >
                        {stats.revenueChange >= 0 ? "+" : ""}{stats.revenueChange}%
                      </Text>
                    )
                  }
                />
              </Col>
              <Col xs={12} md={isActive ? 6 : 24}>
                <Statistic
                  title={<Text type="secondary">Avg Prep Time</Text>}
                  value={stats?.avgPrepTime || 0}
                  suffix="min"
                  prefix={<ClockCircleOutlined style={{ color: "#faad14" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Col>
              <Col xs={12} md={isActive ? 6 : 24}>
                <div>
                  <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                    Compared to Yesterday
                  </Text>
                  <Progress
                    percent={stats?.vsYesterday || 0}
                    status={stats?.vsYesterday >= 100 ? "success" : "normal"}
                    strokeColor={stats?.vsYesterday >= 100 ? "#52c41a" : "#4a90d9"}
                    format={(p) => `${p}%`}
                  />
                </div>
              </Col>
            </Row>

            {/* Platform breakdown if active */}
            {isActive && stats?.byPlatform && (
              <div style={{ marginTop: 24 }}>
                <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                  By Platform
                </Text>
                <Row gutter={[8, 8]}>
                  {Object.entries(stats.byPlatform).map(([platform, data]: [string, any]) => (
                    <Col key={platform} xs={12} sm={8}>
                      <div style={{
                        padding: "8px 12px",
                        backgroundColor: "#16213e",
                        borderRadius: 8
                      }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{platform}</Text>
                        <div>
                          <Text strong style={{ color: "#fff" }}>{data.orders}</Text>
                          <Text type="secondary" style={{ marginLeft: 8 }}>${data.revenue}</Text>
                        </div>
                      </div>
                    </Col>
                  ))}
                </Row>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};
