import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import { useParams, useNavigate } from "react-router";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Statistic,
  Progress,
  Tag,
  Avatar,
  Button,
  Divider,
  Timeline,
  Alert,
  List,
  Rate,
} from "antd";
import {
  UserOutlined,
  ArrowLeftOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  FallOutlined,
  MessageOutlined,
  MailOutlined,
  PhoneOutlined,
  StarFilled,
} from "@ant-design/icons";
import { format, subMonths } from "date-fns";
import { ChurnRiskIndicator } from "../../components/analytics/ChurnRiskIndicator";

const { Title, Text, Paragraph } = Typography;

// Simple line chart for trends
const TrendLine = ({
  data,
  color = "#4a90d9",
  height = 60,
}: {
  data: number[];
  color?: string;
  height?: number;
}) => {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = height - 5 - ((value - min) / range) * (height - 10);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: "100%", height }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const WorkerDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  // Fetch worker details
  const { data: workerData, isLoading } = useCustom({
    url: `/analytics/${identity?.restaurantId}/workers/${id}`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId && !!id,
    },
  });

  const worker = workerData?.data as any;

  // Mock data for demonstration
  const mockWorker = {
    id: id || "1",
    firstName: "John",
    lastName: "Smith",
    email: "john.smith@email.com",
    phone: "(555) 123-4567",
    positions: ["BARTENDER", "SERVER"],
    hireDate: "2023-06-15",
    performanceScore: 78,
    reliabilityScore: 0.75,
    engagementScore: 45,
    churnRisk: "high",
    avgRating: 4.2,
    totalShifts: 67,
    hoursThisMonth: 85,
    hoursLastMonth: 120,
    noShows: 3,
    lateArrivals: 5,
    shiftSwaps: 12,
    performanceTrend: [82, 80, 78, 76, 78, 75, 78],
    reliabilityTrend: [0.85, 0.82, 0.78, 0.75, 0.72, 0.74, 0.75],
    hoursTrend: [140, 135, 128, 120, 95, 90, 85],
    shiftsByType: [
      { type: "Morning", count: 15 },
      { type: "Afternoon", count: 22 },
      { type: "Evening", count: 25 },
      { type: "Weekend", count: 18 },
    ],
    recentActivity: [
      { date: "2024-01-15", event: "Completed shift", type: "success" },
      { date: "2024-01-12", event: "Requested shift swap", type: "info" },
      { date: "2024-01-10", event: "Late arrival (15 min)", type: "warning" },
      { date: "2024-01-08", event: "Completed shift", type: "success" },
      { date: "2024-01-05", event: "No-show", type: "error" },
    ],
    riskFactors: [
      { factor: "Declining hours trend", severity: "high" },
      { factor: "Low engagement score", severity: "high" },
      { factor: "Multiple no-shows", severity: "medium" },
      { factor: "High swap requests", severity: "low" },
    ],
    suggestedActions: [
      "Schedule a 1:1 check-in meeting",
      "Review schedule preferences and availability",
      "Consider offering preferred shift assignments",
      "Discuss any concerns or feedback",
    ],
  };

  const data = worker || mockWorker;

  return (
    <div style={{ padding: "24px" }}>
      {/* Back Button */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate("/analytics/workers")}
        style={{ marginBottom: 24 }}
      >
        Back to Workers
      </Button>

      {/* Header Card */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
        loading={isLoading}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={8}>
            <Space size={16}>
              <Avatar
                size={80}
                style={{
                  backgroundColor:
                    data.churnRisk === "high"
                      ? "#ef4444"
                      : data.churnRisk === "medium"
                      ? "#faad14"
                      : "#4a90d9",
                }}
              >
                <span style={{ fontSize: 28 }}>
                  {data.firstName?.[0]}
                  {data.lastName?.[0]}
                </span>
              </Avatar>
              <div>
                <Title level={3} style={{ color: "#fff", margin: 0 }}>
                  {data.firstName} {data.lastName}
                </Title>
                <Space wrap style={{ marginTop: 8 }}>
                  {data.positions?.map((pos: string) => (
                    <Tag key={pos} color="blue">
                      {pos.replace(/_/g, " ")}
                    </Tag>
                  ))}
                </Space>
                <div style={{ marginTop: 8 }}>
                  <ChurnRiskIndicator risk={data.churnRisk} showLabel />
                </div>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical" size={4}>
              <Space>
                <MailOutlined style={{ color: "#666" }} />
                <Text type="secondary">{data.email}</Text>
              </Space>
              <Space>
                <PhoneOutlined style={{ color: "#666" }} />
                <Text type="secondary">{data.phone}</Text>
              </Space>
              <Space>
                <CalendarOutlined style={{ color: "#666" }} />
                <Text type="secondary">
                  Hired: {format(new Date(data.hireDate), "MMM d, yyyy")}
                </Text>
              </Space>
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: "right" }}>
            <Space>
              <Button icon={<MessageOutlined />}>Send Message</Button>
              <Button type="primary" icon={<CalendarOutlined />}>
                View Schedule
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Performance Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Performance Score</Text>}
              value={data.performanceScore}
              suffix="/ 100"
              valueStyle={{
                color:
                  data.performanceScore >= 85
                    ? "#52c41a"
                    : data.performanceScore >= 70
                    ? "#faad14"
                    : "#ef4444",
              }}
            />
            <TrendLine
              data={data.performanceTrend}
              color={
                data.performanceTrend[data.performanceTrend.length - 1] >
                data.performanceTrend[0]
                  ? "#52c41a"
                  : "#ef4444"
              }
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Last 7 weeks
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Reliability</Text>}
              value={Math.round(data.reliabilityScore * 100)}
              suffix="%"
              valueStyle={{
                color:
                  data.reliabilityScore >= 0.9
                    ? "#52c41a"
                    : data.reliabilityScore >= 0.75
                    ? "#faad14"
                    : "#ef4444",
              }}
            />
            <TrendLine
              data={data.reliabilityTrend.map((v: number) => v * 100)}
              color={
                data.reliabilityTrend[data.reliabilityTrend.length - 1] >
                data.reliabilityTrend[0]
                  ? "#52c41a"
                  : "#ef4444"
              }
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Last 7 weeks
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Hours This Month</Text>}
              value={data.hoursThisMonth}
              suffix="h"
              valueStyle={{ color: "#fff" }}
            />
            <TrendLine data={data.hoursTrend} color="#4a90d9" />
            <Text
              type="secondary"
              style={{
                fontSize: 12,
                color:
                  data.hoursThisMonth < data.hoursLastMonth ? "#ef4444" : "#52c41a",
              }}
            >
              {data.hoursThisMonth < data.hoursLastMonth ? (
                <>
                  <FallOutlined /> Down from {data.hoursLastMonth}h last month
                </>
              ) : (
                <>
                  <RiseOutlined /> Up from {data.hoursLastMonth}h last month
                </>
              )}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Average Rating</Text>}
              value={data.avgRating}
              suffix="/ 5"
              valueStyle={{ color: "#faad14" }}
            />
            <Rate disabled value={data.avgRating} style={{ fontSize: 16 }} />
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Based on {data.totalShifts} shifts
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Shifts and Risk Assessment */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CalendarOutlined style={{ color: "#4a90d9" }} />
                <span>Shifts Breakdown</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Statistic
                  title={<Text type="secondary">Total Shifts</Text>}
                  value={data.totalShifts}
                  valueStyle={{ color: "#fff" }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={<Text type="secondary">Shift Swaps</Text>}
                  value={data.shiftSwaps}
                  valueStyle={{ color: "#faad14" }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={<Text type="secondary">No-Shows</Text>}
                  value={data.noShows}
                  valueStyle={{ color: data.noShows > 0 ? "#ef4444" : "#52c41a" }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={<Text type="secondary">Late Arrivals</Text>}
                  value={data.lateArrivals}
                  valueStyle={{ color: data.lateArrivals > 2 ? "#faad14" : "#52c41a" }}
                />
              </Col>
            </Row>

            <Divider style={{ borderColor: "#2a2a4e" }} />

            <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              Shifts by Type
            </Text>
            {data.shiftsByType?.map((item: any) => (
              <div
                key={item.type}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text type="secondary">{item.type}</Text>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Progress
                    percent={(item.count / data.totalShifts) * 100}
                    size="small"
                    showInfo={false}
                    strokeColor="#4a90d9"
                    style={{ width: 100 }}
                  />
                  <Text style={{ color: "#fff", width: 30 }}>{item.count}</Text>
                </div>
              </div>
            ))}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <WarningOutlined
                  style={{
                    color: data.churnRisk === "high" ? "#ef4444" : "#faad14",
                  }}
                />
                <span>Retention Risk Assessment</span>
              </Space>
            }
            style={{
              backgroundColor:
                data.churnRisk === "high" ? "#2a1a1a" : "#1a1a2e",
              borderColor: data.churnRisk === "high" ? "#ef4444" : "#2a2a4e",
              height: "100%",
            }}
            headStyle={{
              borderColor: data.churnRisk === "high" ? "#ef4444" : "#2a2a4e",
            }}
            loading={isLoading}
          >
            <Alert
              type={
                data.churnRisk === "high"
                  ? "error"
                  : data.churnRisk === "medium"
                  ? "warning"
                  : "success"
              }
              message={
                data.churnRisk === "high"
                  ? "High Risk - Immediate Attention Required"
                  : data.churnRisk === "medium"
                  ? "Medium Risk - Monitor Closely"
                  : "Low Risk - On Track"
              }
              style={{
                marginBottom: 16,
                backgroundColor: "transparent",
                border: "none",
              }}
            />

            <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
              Risk Factors
            </Text>
            <List
              size="small"
              dataSource={data.riskFactors}
              renderItem={(item: any) => (
                <List.Item style={{ borderColor: "#2a2a4e" }}>
                  <Space>
                    <Tag
                      color={
                        item.severity === "high"
                          ? "red"
                          : item.severity === "medium"
                          ? "orange"
                          : "blue"
                      }
                    >
                      {item.severity.toUpperCase()}
                    </Tag>
                    <Text style={{ color: "#fff" }}>{item.factor}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* Recent Activity and Suggested Actions */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: "#722ed1" }} />
                <span>Recent Activity</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Timeline
              items={data.recentActivity?.map((item: any) => ({
                color:
                  item.type === "success"
                    ? "green"
                    : item.type === "warning"
                    ? "orange"
                    : item.type === "error"
                    ? "red"
                    : "blue",
                children: (
                  <div>
                    <Text style={{ color: "#fff" }}>{item.event}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {format(new Date(item.date), "MMM d, yyyy")}
                    </Text>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CheckCircleOutlined style={{ color: "#52c41a" }} />
                <span>Suggested Actions</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <List
              dataSource={data.suggestedActions}
              renderItem={(item: string, index: number) => (
                <List.Item style={{ borderColor: "#2a2a4e" }}>
                  <Space>
                    <Avatar
                      size="small"
                      style={{ backgroundColor: "#4a90d9" }}
                    >
                      {index + 1}
                    </Avatar>
                    <Text style={{ color: "#fff" }}>{item}</Text>
                  </Space>
                </List.Item>
              )}
            />
            <Divider style={{ borderColor: "#2a2a4e" }} />
            <Space>
              <Button type="primary">Schedule Check-In</Button>
              <Button>Update Preferences</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};
