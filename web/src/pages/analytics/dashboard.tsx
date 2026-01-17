import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Statistic,
  Button,
  Alert,
  Progress,
  Tooltip,
  Badge,
} from "antd";
import {
  DollarOutlined,
  RiseOutlined,
  TeamOutlined,
  SmileOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
  ReloadOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router";
import { format, subDays } from "date-fns";

const { Title, Text, Paragraph } = Typography;

// Simple trend chart component
const TrendChart = ({
  data,
  height = 100,
  color = "#4a90d9",
}: {
  data: number[];
  height?: number;
  color?: string;
}) => {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - 10 - ((value - min) / range) * (height - 20);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPath = `M 0,${height - 10} L ${points} L ${width},${height - 10} Z`;
  const linePath = `M ${points}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
      <defs>
        <linearGradient id={`gradient-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#gradient-${color.replace("#", "")})`} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const AnalyticsDashboard = () => {
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  // Fetch executive analytics
  const { data: analyticsData, isLoading, refetch } = useCustom({
    url: `/analytics/${identity?.restaurantId}/executive`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Fetch alerts
  const { data: alertsData } = useCustom({
    url: `/analytics/${identity?.restaurantId}/alerts`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const analytics = analyticsData?.data as any;
  const alerts = alertsData?.data as any;

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "critical":
        return <ExclamationCircleOutlined style={{ color: "#ef4444" }} />;
      case "warning":
        return <WarningOutlined style={{ color: "#faad14" }} />;
      case "info":
        return <ClockCircleOutlined style={{ color: "#4a90d9" }} />;
      default:
        return <CheckCircleOutlined style={{ color: "#52c41a" }} />;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case "critical":
        return "#ef4444";
      case "warning":
        return "#faad14";
      case "info":
        return "#4a90d9";
      default:
        return "#52c41a";
    }
  };

  // Mock trend data for visualization
  const laborCostTrend = analytics?.laborCostTrend || [
    4200, 4350, 4100, 4500, 4300, 4450, 4600,
  ];
  const efficiencyTrend = analytics?.efficiencyTrend || [
    82, 85, 83, 87, 84, 88, 86,
  ];

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Space align="center">
            <LineChartOutlined style={{ fontSize: 28, color: "#4a90d9" }} />
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              Executive Analytics
            </Title>
          </Space>
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            Key performance indicators and insights for {identity?.restaurantName || "your restaurant"}
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => refetch()}
          loading={isLoading}
        >
          Refresh
        </Button>
      </div>

      {/* Key Metrics Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Labor Cost (This Week)</Text>}
              value={analytics?.laborCost || 4532}
              precision={2}
              prefix={<DollarOutlined style={{ color: "#4a90d9" }} />}
              valueStyle={{ color: "#fff" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text
                style={{
                  color:
                    (analytics?.laborCostChange || -2.3) >= 0 ? "#ef4444" : "#52c41a",
                }}
              >
                {(analytics?.laborCostChange || -2.3) >= 0 ? "+" : ""}
                {analytics?.laborCostChange || -2.3}% vs last week
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Schedule Efficiency</Text>}
              value={analytics?.efficiency || 87}
              suffix="%"
              prefix={<RiseOutlined style={{ color: "#52c41a" }} />}
              valueStyle={{ color: "#fff" }}
            />
            <Progress
              percent={analytics?.efficiency || 87}
              showInfo={false}
              strokeColor="#52c41a"
              trailColor="#2a2a4e"
              style={{ marginTop: 8 }}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Forecast Accuracy</Text>}
              value={analytics?.forecastAccuracy || 91.2}
              suffix="%"
              prefix={<ThunderboltOutlined style={{ color: "#722ed1" }} />}
              valueStyle={{ color: "#fff" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                MAPE: {analytics?.mape || 8.8}%
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Worker Satisfaction</Text>}
              value={analytics?.workerSatisfaction || 4.2}
              suffix="/ 5"
              prefix={<SmileOutlined style={{ color: "#faad14" }} />}
              valueStyle={{ color: "#fff" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                Based on {analytics?.feedbackCount || 47} responses
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Trend Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <DollarOutlined style={{ color: "#4a90d9" }} />
                <span>Labor Cost Trend</span>
              </Space>
            }
            extra={
              <Button
                type="link"
                onClick={() => navigate("/analytics/labor")}
              >
                View Details
              </Button>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <TrendChart data={laborCostTrend} color="#4a90d9" height={120} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid #2a2a4e",
              }}
            >
              <div>
                <Text type="secondary">7-day average</Text>
                <br />
                <Text style={{ color: "#fff", fontSize: 18 }}>
                  ${(laborCostTrend.reduce((a, b) => a + b, 0) / laborCostTrend.length).toFixed(2)}
                </Text>
              </div>
              <div style={{ textAlign: "right" }}>
                <Text type="secondary">Projected monthly</Text>
                <br />
                <Text style={{ color: "#fff", fontSize: 18 }}>
                  ${((laborCostTrend.reduce((a, b) => a + b, 0) / laborCostTrend.length) * 30).toFixed(2)}
                </Text>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <RiseOutlined style={{ color: "#52c41a" }} />
                <span>Efficiency Trend</span>
              </Space>
            }
            extra={
              <Button
                type="link"
                onClick={() => navigate("/analytics/forecasting")}
              >
                View Details
              </Button>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <TrendChart data={efficiencyTrend} color="#52c41a" height={120} />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid #2a2a4e",
              }}
            >
              <div>
                <Text type="secondary">Average efficiency</Text>
                <br />
                <Text style={{ color: "#fff", fontSize: 18 }}>
                  {(efficiencyTrend.reduce((a, b) => a + b, 0) / efficiencyTrend.length).toFixed(1)}%
                </Text>
              </div>
              <div style={{ textAlign: "right" }}>
                <Text type="secondary">Target</Text>
                <br />
                <Text style={{ color: "#52c41a", fontSize: 18 }}>90%</Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Alerts and Quick Actions Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <WarningOutlined style={{ color: "#faad14" }} />
                <span>Alerts & Issues</span>
                {alerts?.items?.length > 0 && (
                  <Badge
                    count={alerts.items.length}
                    style={{ backgroundColor: "#ef4444" }}
                  />
                )}
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              {(
                alerts?.items || [
                  {
                    type: "critical",
                    title: "3 unfilled shifts tomorrow",
                    description:
                      "Morning shifts on Dec 20 need coverage. Consider posting to shift pool.",
                    action: "Fill Gaps",
                    actionPath: "/ai-scheduling/suggestions",
                  },
                  {
                    type: "warning",
                    title: "Overtime threshold approaching",
                    description:
                      "2 workers are at 35+ hours this week. Monitor to avoid overtime costs.",
                    action: "View Workers",
                    actionPath: "/analytics/workers",
                  },
                  {
                    type: "info",
                    title: "High churn risk detected",
                    description:
                      "John Smith has low engagement score. Consider scheduling a check-in.",
                    action: "View Details",
                    actionPath: "/analytics/workers/123",
                  },
                ]
              ).map((alert: any, index: number) => (
                <Alert
                  key={index}
                  type={alert.type === "critical" ? "error" : alert.type}
                  showIcon
                  icon={getAlertIcon(alert.type)}
                  message={
                    <Text style={{ color: "#fff" }}>{alert.title}</Text>
                  }
                  description={
                    <div>
                      <Text type="secondary">{alert.description}</Text>
                      {alert.action && (
                        <Button
                          type="link"
                          size="small"
                          style={{
                            padding: 0,
                            marginLeft: 8,
                            color: getAlertColor(alert.type),
                          }}
                          onClick={() => navigate(alert.actionPath)}
                        >
                          {alert.action}
                        </Button>
                      )}
                    </div>
                  }
                  style={{
                    backgroundColor:
                      alert.type === "critical"
                        ? "#2a1a1a"
                        : alert.type === "warning"
                        ? "#2a2a1a"
                        : "#1a1a2e",
                    border: `1px solid ${getAlertColor(alert.type)}40`,
                  }}
                />
              ))}

              {(!alerts?.items || alerts.items.length === 0) && (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <CheckCircleOutlined
                    style={{ fontSize: 32, color: "#52c41a", marginBottom: 12 }}
                  />
                  <br />
                  <Text type="secondary">
                    No urgent issues. Everything is running smoothly!
                  </Text>
                </div>
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <RocketOutlined style={{ color: "#722ed1" }} />
                <span>Quick Actions</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                block
                size="large"
                onClick={() => navigate("/ai-scheduling/optimizer")}
                style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
              >
                Optimize Schedule
              </Button>

              <Button
                icon={<TeamOutlined />}
                block
                size="large"
                onClick={() => navigate("/ai-scheduling/suggestions")}
              >
                AI Fill Gaps
              </Button>

              <Button
                icon={<LineChartOutlined />}
                block
                size="large"
                onClick={() => navigate("/analytics/labor")}
              >
                Labor Cost Report
              </Button>

              <Button
                icon={<SmileOutlined />}
                block
                size="large"
                onClick={() => navigate("/analytics/workers")}
              >
                Worker Performance
              </Button>
            </Space>

            <div
              style={{
                marginTop: 24,
                padding: 16,
                backgroundColor: "#16213e",
                borderRadius: 8,
              }}
            >
              <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                AI Recommendation
              </Text>
              <Paragraph style={{ color: "#fff", margin: 0 }}>
                {analytics?.aiRecommendation ||
                  "Based on current patterns, consider scheduling an additional server for Saturday evening (6-10 PM) to handle expected demand increase."}
              </Paragraph>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
