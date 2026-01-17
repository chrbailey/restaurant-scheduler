import { useState } from "react";
import { useCustom, useCustomMutation, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  DatePicker,
  Table,
  Tag,
  Button,
  message,
  Alert,
  Tooltip,
  Empty,
} from "antd";
import {
  RiseOutlined,
  CloudOutlined,
  ThunderboltOutlined,
  SunOutlined,
  CloudFilled,
  TeamOutlined,
  CheckOutlined,
  CloseOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { format, addDays, parseISO, startOfDay, endOfDay } from "date-fns";
import dayjs from "dayjs";

import { ForecastChart } from "../../components/ghost-kitchen/ForecastChart";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

export const GhostKitchenForecast = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs(),
    dayjs().add(6, "day"),
  ]);

  // Fetch forecast data
  const { data: forecastData, isLoading: forecastLoading, refetch } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/forecast`,
    method: "get",
    config: {
      query: {
        startDate: dateRange[0].format("YYYY-MM-DD"),
        endDate: dateRange[1].format("YYYY-MM-DD"),
      },
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Fetch weather forecast
  const { data: weatherData, isLoading: weatherLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/weather-forecast`,
    method: "get",
    config: {
      query: {
        days: 7,
      },
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Fetch staffing recommendations
  const { data: staffingData, isLoading: staffingLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/staffing-recommendations`,
    method: "get",
    config: {
      query: {
        startDate: dateRange[0].format("YYYY-MM-DD"),
        endDate: dateRange[1].format("YYYY-MM-DD"),
      },
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const { mutate: respondToOpportunity, isLoading: isResponding } = useCustomMutation();

  const forecast = forecastData?.data as any;
  const weather = weatherData?.data as any;
  const staffing = staffingData?.data as any;

  const handleAcceptOpportunity = (opportunityId: string) => {
    respondToOpportunity(
      {
        url: `/ghost-kitchen/${identity?.restaurantId}/opportunities/${opportunityId}/accept`,
        method: "post",
        values: {},
      },
      {
        onSuccess: () => {
          message.success("Opportunity scheduled for ghost kitchen activation");
          refetch();
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to accept opportunity");
        },
      }
    );
  };

  const handleDeclineOpportunity = (opportunityId: string) => {
    respondToOpportunity(
      {
        url: `/ghost-kitchen/${identity?.restaurantId}/opportunities/${opportunityId}/decline`,
        method: "post",
        values: {},
      },
      {
        onSuccess: () => {
          message.info("Opportunity declined");
          refetch();
        },
      }
    );
  };

  const getWeatherIcon = (condition: string) => {
    switch (condition?.toLowerCase()) {
      case "sunny":
      case "clear":
        return <SunOutlined style={{ color: "#faad14" }} />;
      case "cloudy":
      case "overcast":
        return <CloudFilled style={{ color: "#8c8c8c" }} />;
      case "rain":
      case "rainy":
        return <CloudOutlined style={{ color: "#1890ff" }} />;
      default:
        return <CloudOutlined style={{ color: "#8c8c8c" }} />;
    }
  };

  const opportunityColumns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date: string) => (
        <Text style={{ color: "#fff" }}>
          {format(parseISO(date), "EEE, MMM d")}
        </Text>
      ),
    },
    {
      title: "Time Window",
      key: "timeWindow",
      render: (_: any, record: any) => (
        <Text style={{ color: "#fff" }}>
          {record.startTime} - {record.endTime}
        </Text>
      ),
    },
    {
      title: "Score",
      dataIndex: "score",
      key: "score",
      render: (score: number) => {
        let color = "blue";
        if (score >= 80) color = "green";
        else if (score >= 60) color = "gold";
        return (
          <Tag color={color}>
            {score}/100
            <Tooltip title="Based on predicted delivery demand, dine-in levels, and weather">
              <InfoCircleOutlined style={{ marginLeft: 4 }} />
            </Tooltip>
          </Tag>
        );
      },
      sorter: (a: any, b: any) => a.score - b.score,
      defaultSortOrder: "descend" as const,
    },
    {
      title: "Predicted Orders",
      dataIndex: "predictedOrders",
      key: "predictedOrders",
      render: (orders: number) => (
        <Space>
          <ThunderboltOutlined style={{ color: "#52c41a" }} />
          <Text style={{ color: "#fff" }}>{orders}</Text>
        </Space>
      ),
    },
    {
      title: "Est. Revenue",
      dataIndex: "estimatedRevenue",
      key: "estimatedRevenue",
      render: (revenue: number) => (
        <Text style={{ color: "#52c41a" }}>
          ${revenue?.toFixed(2) || "0.00"}
        </Text>
      ),
    },
    {
      title: "Dine-In Level",
      dataIndex: "dineInLevel",
      key: "dineInLevel",
      render: (level: string) => {
        const colors: Record<string, string> = {
          low: "green",
          medium: "gold",
          high: "red",
        };
        return <Tag color={colors[level?.toLowerCase()] || "default"}>{level}</Tag>;
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const statusConfig: Record<string, { color: string; text: string }> = {
          SUGGESTED: { color: "blue", text: "Suggested" },
          ACCEPTED: { color: "green", text: "Scheduled" },
          DECLINED: { color: "default", text: "Declined" },
          COMPLETED: { color: "purple", text: "Completed" },
        };
        const config = statusConfig[status] || { color: "default", text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: any) => {
        if (record.status !== "SUGGESTED") return null;
        return (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={isResponding}
              onClick={() => handleAcceptOpportunity(record.id)}
            >
              Accept
            </Button>
            <Button
              size="small"
              icon={<CloseOutlined />}
              loading={isResponding}
              onClick={() => handleDeclineOpportunity(record.id)}
            >
              Decline
            </Button>
          </Space>
        );
      },
    },
  ];

  const staffingColumns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date: string) => format(parseISO(date), "EEE, MMM d"),
    },
    {
      title: "Time",
      key: "time",
      render: (_: any, record: any) => `${record.startTime} - ${record.endTime}`,
    },
    {
      title: "Position",
      dataIndex: "position",
      key: "position",
      render: (pos: string) => (
        <Tag color="blue">{pos?.replace(/_/g, " ")}</Tag>
      ),
    },
    {
      title: "Current",
      dataIndex: "currentStaff",
      key: "currentStaff",
    },
    {
      title: "Recommended",
      dataIndex: "recommendedStaff",
      key: "recommendedStaff",
      render: (rec: number, record: any) => {
        const diff = rec - record.currentStaff;
        let color = "#fff";
        if (diff > 0) color = "#52c41a";
        else if (diff < 0) color = "#faad14";
        return (
          <Space>
            <Text style={{ color }}>{rec}</Text>
            {diff !== 0 && (
              <Text style={{ color, fontSize: 12 }}>
                ({diff > 0 ? "+" : ""}{diff})
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason",
      ellipsis: true,
      render: (reason: string) => (
        <Tooltip title={reason}>
          <Text type="secondary">{reason}</Text>
        </Tooltip>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <RiseOutlined style={{ fontSize: 28, color: "#4a90d9" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Demand Forecast
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          AI-powered predictions for optimizing ghost kitchen activation
        </Text>
      </div>

      {/* Date Range Selector */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
      >
        <Space>
          <Text type="secondary">Date Range:</Text>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]]);
              }
            }}
            disabledDate={(current) => current && current < dayjs().startOf("day")}
          />
          <Button onClick={() => refetch()}>Refresh</Button>
        </Space>
      </Card>

      {/* Forecast Chart */}
      <Card
        title={
          <Space>
            <RiseOutlined style={{ color: "#4a90d9" }} />
            <span>Hourly Demand Forecast</span>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
        headStyle={{ borderColor: "#2a2a4e" }}
        loading={forecastLoading}
      >
        {forecast?.hourly && forecast.hourly.length > 0 ? (
          <ForecastChart data={forecast.hourly} />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">No forecast data available</Text>}
          />
        )}

        <Paragraph type="secondary" style={{ marginTop: 16 }}>
          <InfoCircleOutlined style={{ marginRight: 8 }} />
          Forecasts are based on historical data, weather predictions, and local events.
          Dine-in (blue) vs delivery (green) demand helps identify ghost kitchen opportunities.
        </Paragraph>
      </Card>

      <Row gutter={[16, 16]}>
        {/* Weather Forecast Strip */}
        <Col xs={24}>
          <Card
            title={
              <Space>
                <CloudOutlined style={{ color: "#1890ff" }} />
                <span>Weather Forecast</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={weatherLoading}
          >
            {weather?.daily && weather.daily.length > 0 ? (
              <Row gutter={[16, 16]}>
                {weather.daily.map((day: any, i: number) => (
                  <Col key={i} xs={12} sm={8} md={4} lg={3}>
                    <div
                      style={{
                        textAlign: "center",
                        padding: "12px 8px",
                        backgroundColor: "#16213e",
                        borderRadius: 8,
                      }}
                    >
                      <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                        {format(parseISO(day.date), "EEE")}
                      </Text>
                      <div style={{ fontSize: 24, margin: "8px 0" }}>
                        {getWeatherIcon(day.condition)}
                      </div>
                      <Text style={{ color: "#fff", display: "block" }}>
                        {day.highTemp} / {day.lowTemp}
                      </Text>
                      {day.deliveryImpact && (
                        <Tag
                          color={day.deliveryImpact > 0 ? "green" : "red"}
                          style={{ marginTop: 8, fontSize: 10 }}
                        >
                          {day.deliveryImpact > 0 ? "+" : ""}{day.deliveryImpact}%
                        </Tag>
                      )}
                    </div>
                  </Col>
                ))}
              </Row>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">Weather data unavailable</Text>}
              />
            )}

            <Alert
              type="info"
              showIcon
              message="Weather Impact"
              description="Rain and extreme temperatures typically increase delivery orders by 15-30%. The forecast accounts for these patterns."
              style={{ marginTop: 16, backgroundColor: "#16213e", borderColor: "#2a4a6e" }}
            />
          </Card>
        </Col>

        {/* Opportunity Windows Table */}
        <Col xs={24}>
          <Card
            title={
              <Space>
                <ThunderboltOutlined style={{ color: "#52c41a" }} />
                <span>Opportunity Windows</span>
                {forecast?.opportunities?.filter((o: any) => o.status === "SUGGESTED").length > 0 && (
                  <Tag color="green">
                    {forecast.opportunities.filter((o: any) => o.status === "SUGGESTED").length} new
                  </Tag>
                )}
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={forecastLoading}
          >
            <Table
              dataSource={forecast?.opportunities || []}
              columns={opportunityColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <Text type="secondary">
                        No opportunity windows identified for this period
                      </Text>
                    }
                  />
                ),
              }}
            />
          </Card>
        </Col>

        {/* Staffing Recommendations */}
        <Col xs={24}>
          <Card
            title={
              <Space>
                <TeamOutlined style={{ color: "#722ed1" }} />
                <span>Staffing Recommendations</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={staffingLoading}
          >
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
              Recommended ghost kitchen staffing based on forecasted demand. Positions like
              DELIVERY_PACK are specific to ghost kitchen operations.
            </Paragraph>

            <Table
              dataSource={staffing?.recommendations || []}
              columns={staffingColumns}
              rowKey={(r) => `${r.date}-${r.startTime}-${r.position}`}
              pagination={{ pageSize: 10 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <Text type="secondary">
                        No staffing recommendations for this period
                      </Text>
                    }
                  />
                ),
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
