import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  DatePicker,
  Statistic,
  Table,
  Tag,
  Progress,
  Segmented,
  Empty,
  Tooltip,
} from "antd";
import {
  DollarOutlined,
  ShoppingCartOutlined,
  ClockCircleOutlined,
  RiseOutlined,
  FallOutlined,
  PieChartOutlined,
  BarChartOutlined,
  LineChartOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { format, parseISO, subDays, startOfWeek, startOfMonth } from "date-fns";
import dayjs from "dayjs";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// Simple chart components using divs (in real app, use recharts or ant-design-charts)
const SimplePieChart = ({ data }: { data: { name: string; value: number; color: string }[] }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let currentAngle = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `conic-gradient(${data
            .map((d) => {
              const startAngle = currentAngle;
              currentAngle += (d.value / total) * 360;
              return `${d.color} ${startAngle}deg ${currentAngle}deg`;
            })
            .join(", ")})`,
        }}
      />
      <div>
        {data.map((d) => (
          <div key={d.name} style={{ marginBottom: 8 }}>
            <Space>
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: d.color,
                  borderRadius: 2,
                }}
              />
              <Text type="secondary">{d.name}</Text>
              <Text style={{ color: "#fff" }}>
                ${d.value.toFixed(2)} ({((d.value / total) * 100).toFixed(1)}%)
              </Text>
            </Space>
          </div>
        ))}
      </div>
    </div>
  );
};

const SimpleBarChart = ({ data }: { data: { label: string; value: number }[] }) => {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div>
      {data.map((d, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Text type="secondary">{d.label}</Text>
            <Text style={{ color: "#fff" }}>{d.value}</Text>
          </div>
          <Progress
            percent={(d.value / max) * 100}
            showInfo={false}
            strokeColor="#4a90d9"
            trailColor="#2a2a4e"
          />
        </div>
      ))}
    </div>
  );
};

const SimpleLineChart = ({ data, height = 150 }: { data: { x: string; predicted: number; actual: number }[]; height?: number }) => {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.flatMap((d) => [d.predicted, d.actual || 0]));
  const width = 100;

  const getY = (value: number) => height - (value / maxValue) * (height - 20);

  const predictedPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${(i / (data.length - 1)) * width} ${getY(d.predicted)}`)
    .join(" ");

  const actualPath = data
    .filter((d) => d.actual !== undefined)
    .map((d, i, arr) => `${i === 0 ? "M" : "L"} ${(data.indexOf(d) / (data.length - 1)) * width} ${getY(d.actual)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
      {/* Predicted line */}
      <path d={predictedPath} fill="none" stroke="#4a90d9" strokeWidth="2" strokeDasharray="5,5" />
      {/* Actual line */}
      {actualPath && <path d={actualPath} fill="none" stroke="#52c41a" strokeWidth="2" />}
      {/* Legend */}
      <line x1="5" y1="10" x2="15" y2="10" stroke="#4a90d9" strokeWidth="2" strokeDasharray="3,3" />
      <text x="20" y="13" fill="#888" fontSize="6">Predicted</text>
      <line x1="50" y1="10" x2="60" y2="10" stroke="#52c41a" strokeWidth="2" />
      <text x="65" y="13" fill="#888" fontSize="6">Actual</text>
    </svg>
  );
};

export const GhostKitchenAnalytics = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [period, setPeriod] = useState<"today" | "week" | "month" | "custom">("week");
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(6, "day"),
    dayjs(),
  ]);

  const getDateRange = () => {
    switch (period) {
      case "today":
        return { startDate: format(new Date(), "yyyy-MM-dd"), endDate: format(new Date(), "yyyy-MM-dd") };
      case "week":
        return {
          startDate: format(subDays(new Date(), 6), "yyyy-MM-dd"),
          endDate: format(new Date(), "yyyy-MM-dd"),
        };
      case "month":
        return {
          startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
          endDate: format(new Date(), "yyyy-MM-dd"),
        };
      case "custom":
        return {
          startDate: customRange[0].format("YYYY-MM-DD"),
          endDate: customRange[1].format("YYYY-MM-DD"),
        };
    }
  };

  const dateRange = getDateRange();

  // Fetch analytics data
  const { data: analyticsData, isLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/analytics`,
    method: "get",
    config: {
      query: dateRange,
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Fetch platform comparison
  const { data: platformData, isLoading: platformLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/analytics/platforms`,
    method: "get",
    config: {
      query: dateRange,
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Fetch forecast accuracy
  const { data: accuracyData, isLoading: accuracyLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/analytics/accuracy`,
    method: "get",
    config: {
      query: dateRange,
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const analytics = analyticsData?.data as any;
  const platforms = platformData?.data as any;
  const accuracy = accuracyData?.data as any;

  const platformColumns = [
    {
      title: "Platform",
      dataIndex: "platform",
      key: "platform",
      render: (platform: string) => (
        <Tag color="blue">{platform}</Tag>
      ),
    },
    {
      title: "Orders",
      dataIndex: "orders",
      key: "orders",
      render: (orders: number) => (
        <Text style={{ color: "#fff" }}>{orders}</Text>
      ),
      sorter: (a: any, b: any) => a.orders - b.orders,
    },
    {
      title: "Revenue",
      dataIndex: "revenue",
      key: "revenue",
      render: (revenue: number) => (
        <Text style={{ color: "#52c41a" }}>${revenue?.toFixed(2) || "0.00"}</Text>
      ),
      sorter: (a: any, b: any) => a.revenue - b.revenue,
    },
    {
      title: "Platform Fees",
      dataIndex: "fees",
      key: "fees",
      render: (fees: number) => (
        <Text style={{ color: "#ef4444" }}>-${fees?.toFixed(2) || "0.00"}</Text>
      ),
    },
    {
      title: "Fee %",
      dataIndex: "feePercent",
      key: "feePercent",
      render: (percent: number) => (
        <Text type="secondary">{percent?.toFixed(1) || 0}%</Text>
      ),
    },
    {
      title: "Net Revenue",
      dataIndex: "netRevenue",
      key: "netRevenue",
      render: (net: number) => (
        <Text style={{ color: net >= 0 ? "#52c41a" : "#ef4444" }}>
          ${net?.toFixed(2) || "0.00"}
        </Text>
      ),
      sorter: (a: any, b: any) => a.netRevenue - b.netRevenue,
    },
    {
      title: "Avg Order",
      dataIndex: "avgOrderValue",
      key: "avgOrderValue",
      render: (avg: number) => (
        <Text type="secondary">${avg?.toFixed(2) || "0.00"}</Text>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <BarChartOutlined style={{ fontSize: 28, color: "#52c41a" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Ghost Kitchen Analytics
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          P&L analysis and performance metrics for ghost kitchen operations
        </Text>
      </div>

      {/* Date Range Filter */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
      >
        <Space wrap>
          <Segmented
            value={period}
            onChange={(v) => setPeriod(v as any)}
            options={[
              { label: "Today", value: "today" },
              { label: "This Week", value: "week" },
              { label: "This Month", value: "month" },
              { label: "Custom", value: "custom" },
            ]}
          />
          {period === "custom" && (
            <RangePicker
              value={customRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setCustomRange([dates[0], dates[1]]);
                }
              }}
            />
          )}
        </Space>
      </Card>

      {/* Revenue, Costs, Profit Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Revenue Card */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <DollarOutlined style={{ color: "#52c41a" }} />
                <span>Revenue</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              value={analytics?.totalRevenue || 0}
              precision={2}
              prefix="$"
              valueStyle={{ color: "#52c41a", fontSize: 32 }}
            />

            {analytics?.revenueByPlatform && (
              <div style={{ marginTop: 24 }}>
                <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                  By Platform
                </Text>
                <SimplePieChart
                  data={Object.entries(analytics.revenueByPlatform).map(
                    ([name, value], i) => ({
                      name,
                      value: value as number,
                      color: ["#4a90d9", "#52c41a", "#faad14", "#722ed1", "#eb2f96"][i % 5],
                    })
                  )}
                />
              </div>
            )}
          </Card>
        </Col>

        {/* Costs Card */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <FallOutlined style={{ color: "#ef4444" }} />
                <span>Costs</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              value={analytics?.totalCosts || 0}
              precision={2}
              prefix="-$"
              valueStyle={{ color: "#ef4444", fontSize: 32 }}
            />

            <div style={{ marginTop: 24 }}>
              {analytics?.costs && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text type="secondary">Labor</Text>
                    <Text style={{ color: "#fff" }}>
                      ${analytics.costs.labor?.toFixed(2) || "0.00"}
                    </Text>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text type="secondary">Supplies/Packaging</Text>
                    <Text style={{ color: "#fff" }}>
                      ${analytics.costs.supplies?.toFixed(2) || "0.00"}
                    </Text>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text type="secondary">Platform Fees</Text>
                    <Text style={{ color: "#fff" }}>
                      ${analytics.costs.platformFees?.toFixed(2) || "0.00"}
                    </Text>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      paddingTop: 8,
                      borderTop: "1px solid #2a2a4e",
                    }}
                  >
                    <Text type="secondary">Other</Text>
                    <Text style={{ color: "#fff" }}>
                      ${analytics.costs.other?.toFixed(2) || "0.00"}
                    </Text>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Col>

        {/* Profit Card */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <RiseOutlined style={{ color: "#4a90d9" }} />
                <span>Net Profit</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              value={analytics?.netProfit || 0}
              precision={2}
              prefix="$"
              valueStyle={{
                color: (analytics?.netProfit || 0) >= 0 ? "#52c41a" : "#ef4444",
                fontSize: 32,
              }}
            />

            <div style={{ marginTop: 24 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <Text type="secondary">Profit Margin</Text>
                <Text
                  style={{
                    color: (analytics?.profitMargin || 0) >= 0 ? "#52c41a" : "#ef4444",
                    fontSize: 18,
                  }}
                >
                  {analytics?.profitMargin?.toFixed(1) || 0}%
                </Text>
              </div>

              <Progress
                percent={Math.abs(analytics?.profitMargin || 0)}
                status={(analytics?.profitMargin || 0) >= 0 ? "success" : "exception"}
                strokeColor={(analytics?.profitMargin || 0) >= 0 ? "#52c41a" : "#ef4444"}
              />

              {analytics?.profitChange !== undefined && (
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">vs. Previous Period: </Text>
                  <Text
                    style={{
                      color: analytics.profitChange >= 0 ? "#52c41a" : "#ef4444",
                    }}
                  >
                    {analytics.profitChange >= 0 ? "+" : ""}
                    {analytics.profitChange.toFixed(1)}%
                  </Text>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Performance Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: "#faad14" }} />
                <span>Performance Metrics</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Row gutter={[16, 24]}>
              <Col xs={12}>
                <Statistic
                  title={<Text type="secondary">Total Orders</Text>}
                  value={analytics?.totalOrders || 0}
                  prefix={<ShoppingCartOutlined style={{ color: "#4a90d9" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Col>
              <Col xs={12}>
                <Statistic
                  title={<Text type="secondary">Avg Prep Time</Text>}
                  value={analytics?.avgPrepTime || 0}
                  suffix="min"
                  prefix={<ClockCircleOutlined style={{ color: "#faad14" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Col>
              <Col xs={12}>
                <Statistic
                  title={<Text type="secondary">Avg Order Value</Text>}
                  value={analytics?.avgOrderValue || 0}
                  precision={2}
                  prefix="$"
                  valueStyle={{ color: "#fff" }}
                />
              </Col>
              <Col xs={12}>
                <Statistic
                  title={<Text type="secondary">Orders/Hour (avg)</Text>}
                  value={analytics?.avgOrdersPerHour || 0}
                  precision={1}
                  valueStyle={{ color: "#fff" }}
                />
              </Col>
            </Row>

            {/* Orders Per Hour Chart */}
            {analytics?.ordersPerHour && (
              <div style={{ marginTop: 24 }}>
                <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                  Orders by Hour
                </Text>
                <SimpleBarChart
                  data={analytics.ordersPerHour.map((v: number, i: number) => ({
                    label: `${i}:00`,
                    value: v,
                  }))}
                />
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LineChartOutlined style={{ color: "#722ed1" }} />
                <span>Capacity Utilization</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Average Utilization</Text>}
              value={analytics?.avgCapacityUtilization || 0}
              suffix="%"
              valueStyle={{ color: "#fff", fontSize: 32 }}
            />

            <Progress
              percent={analytics?.avgCapacityUtilization || 0}
              strokeColor={{
                "0%": "#4a90d9",
                "70%": "#faad14",
                "90%": "#ef4444",
              }}
              trailColor="#2a2a4e"
              style={{ marginTop: 16 }}
            />

            <Paragraph type="secondary" style={{ marginTop: 16 }}>
              <InfoCircleOutlined style={{ marginRight: 8 }} />
              Optimal utilization is 60-80%. Higher may indicate missed orders,
              lower suggests room for growth.
            </Paragraph>

            {analytics?.peakHours && (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                  Peak Hours
                </Text>
                <Space wrap>
                  {analytics.peakHours.map((hour: string) => (
                    <Tag key={hour} color="gold">
                      {hour}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Platform Comparison Table */}
      <Card
        title={
          <Space>
            <PieChartOutlined style={{ color: "#eb2f96" }} />
            <span>Platform Comparison</span>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
        headStyle={{ borderColor: "#2a2a4e" }}
        loading={platformLoading}
      >
        <Table
          dataSource={platforms?.platforms || []}
          columns={platformColumns}
          rowKey="platform"
          pagination={false}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">No platform data available</Text>}
              />
            ),
          }}
        />
      </Card>

      {/* Forecast Accuracy */}
      <Card
        title={
          <Space>
            <LineChartOutlined style={{ color: "#1890ff" }} />
            <span>Forecast Accuracy</span>
            <Tooltip title="How well our predictions matched actual orders">
              <InfoCircleOutlined style={{ color: "#666" }} />
            </Tooltip>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
        headStyle={{ borderColor: "#2a2a4e" }}
        loading={accuracyLoading}
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <Statistic
              title={<Text type="secondary">Overall Accuracy</Text>}
              value={accuracy?.overallAccuracy || 0}
              suffix="%"
              valueStyle={{
                color: (accuracy?.overallAccuracy || 0) >= 80 ? "#52c41a" : "#faad14",
                fontSize: 36,
              }}
            />
            <Progress
              percent={accuracy?.overallAccuracy || 0}
              showInfo={false}
              strokeColor={(accuracy?.overallAccuracy || 0) >= 80 ? "#52c41a" : "#faad14"}
              trailColor="#2a2a4e"
            />
          </Col>
          <Col xs={24} md={16}>
            {accuracy?.dailyComparison && (
              <div>
                <Text type="secondary" style={{ display: "block", marginBottom: 12 }}>
                  Predicted vs Actual Orders
                </Text>
                <SimpleLineChart data={accuracy.dailyComparison} height={150} />
              </div>
            )}
          </Col>
        </Row>

        {accuracy?.insights && (
          <div
            style={{
              marginTop: 24,
              padding: 16,
              backgroundColor: "#16213e",
              borderRadius: 8,
            }}
          >
            <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
              Insights
            </Text>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {accuracy.insights.map((insight: string, i: number) => (
                <li key={i}>
                  <Text style={{ color: "#fff" }}>{insight}</Text>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
};
