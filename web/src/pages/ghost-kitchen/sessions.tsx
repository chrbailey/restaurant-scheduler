import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Typography,
  Space,
  Table,
  Tag,
  Button,
  Modal,
  Row,
  Col,
  Statistic,
  Descriptions,
  Timeline,
  Empty,
  Tooltip,
  DatePicker,
} from "antd";
import {
  HistoryOutlined,
  DollarOutlined,
  ShoppingCartOutlined,
  ClockCircleOutlined,
  FireOutlined,
  StopOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { format, parseISO, differenceInMinutes } from "date-fns";
import dayjs from "dayjs";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// Simple hourly chart component
const HourlyChart = ({ data }: { data: { hour: string; orders: number; revenue: number }[] }) => {
  if (!data || data.length === 0) return null;
  const maxOrders = Math.max(...data.map((d) => d.orders));

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
      {data.map((d, i) => (
        <Tooltip key={i} title={`${d.hour}: ${d.orders} orders, $${d.revenue.toFixed(2)}`}>
          <div
            style={{
              flex: 1,
              height: `${(d.orders / maxOrders) * 100}%`,
              minHeight: 4,
              backgroundColor: "#4a90d9",
              borderRadius: "4px 4px 0 0",
            }}
          />
        </Tooltip>
      ))}
    </div>
  );
};

export const GhostKitchenSessions = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, "day"),
    dayjs(),
  ]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch sessions list
  const { data: sessionsData, isLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/sessions`,
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

  // Fetch session details when selected
  const { data: sessionDetailData, isLoading: detailLoading } = useCustom({
    url: `/ghost-kitchen/${identity?.restaurantId}/sessions/${selectedSession?.id}`,
    method: "get",
    queryOptions: {
      enabled: !!selectedSession?.id,
    },
  });

  const sessions = sessionsData?.data as any;
  const sessionDetail = sessionDetailData?.data as any;

  const handleViewSession = (session: any) => {
    setSelectedSession(session);
    setModalOpen(true);
  };

  const formatDuration = (minutes: number) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getEndReasonConfig = (reason: string) => {
    const configs: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
      MANUAL: { color: "blue", icon: <StopOutlined />, text: "Manual Stop" },
      CAPACITY_LIMIT: { color: "gold", icon: <WarningOutlined />, text: "Capacity Limit" },
      SCHEDULED: { color: "green", icon: <ClockCircleOutlined />, text: "Scheduled End" },
      AUTO_DISABLE: { color: "purple", icon: <ClockCircleOutlined />, text: "Auto Disabled" },
      ERROR: { color: "red", icon: <WarningOutlined />, text: "Error" },
    };
    return configs[reason] || { color: "default", icon: null, text: reason };
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "startTime",
      key: "date",
      render: (startTime: string) => (
        <Space>
          <CalendarOutlined style={{ color: "#4a90d9" }} />
          <Text style={{ color: "#fff" }}>
            {format(parseISO(startTime), "EEE, MMM d, yyyy")}
          </Text>
        </Space>
      ),
      sorter: (a: any, b: any) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      defaultSortOrder: "descend" as const,
    },
    {
      title: "Time",
      key: "time",
      render: (_: any, record: any) => (
        <Text type="secondary">
          {format(parseISO(record.startTime), "h:mm a")} -{" "}
          {record.endTime ? format(parseISO(record.endTime), "h:mm a") : "Active"}
        </Text>
      ),
    },
    {
      title: "Duration",
      key: "duration",
      render: (_: any, record: any) => {
        const duration = record.endTime
          ? differenceInMinutes(parseISO(record.endTime), parseISO(record.startTime))
          : differenceInMinutes(new Date(), parseISO(record.startTime));
        return (
          <Space>
            <ClockCircleOutlined style={{ color: "#faad14" }} />
            <Text style={{ color: "#fff" }}>{formatDuration(duration)}</Text>
          </Space>
        );
      },
    },
    {
      title: "Orders",
      dataIndex: "totalOrders",
      key: "orders",
      render: (orders: number) => (
        <Space>
          <ShoppingCartOutlined style={{ color: "#52c41a" }} />
          <Text style={{ color: "#fff" }}>{orders || 0}</Text>
        </Space>
      ),
      sorter: (a: any, b: any) => (a.totalOrders || 0) - (b.totalOrders || 0),
    },
    {
      title: "Revenue",
      dataIndex: "totalRevenue",
      key: "revenue",
      render: (revenue: number) => (
        <Text style={{ color: "#52c41a" }}>
          ${revenue?.toFixed(2) || "0.00"}
        </Text>
      ),
      sorter: (a: any, b: any) => (a.totalRevenue || 0) - (b.totalRevenue || 0),
    },
    {
      title: "Profit",
      dataIndex: "netProfit",
      key: "profit",
      render: (profit: number) => (
        <Text style={{ color: profit >= 0 ? "#52c41a" : "#ef4444" }}>
          ${profit?.toFixed(2) || "0.00"}
        </Text>
      ),
      sorter: (a: any, b: any) => (a.netProfit || 0) - (b.netProfit || 0),
    },
    {
      title: "End Reason",
      dataIndex: "endReason",
      key: "endReason",
      render: (reason: string, record: any) => {
        if (!record.endTime) {
          return (
            <Tag color="green" icon={<FireOutlined />}>
              Active
            </Tag>
          );
        }
        const config = getEndReasonConfig(reason);
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        );
      },
      filters: [
        { text: "Manual Stop", value: "MANUAL" },
        { text: "Capacity Limit", value: "CAPACITY_LIMIT" },
        { text: "Scheduled End", value: "SCHEDULED" },
        { text: "Auto Disabled", value: "AUTO_DISABLE" },
      ],
      onFilter: (value: any, record: any) => record.endReason === value,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: any, record: any) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => handleViewSession(record)}
        >
          Details
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <HistoryOutlined style={{ fontSize: 28, color: "#722ed1" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Session History
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Review past ghost kitchen sessions and their performance
        </Text>
      </div>

      {/* Date Filter */}
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
          />
        </Space>
      </Card>

      {/* Summary Stats */}
      {sessions?.summary && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={12} md={6}>
            <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
              <Statistic
                title={<Text type="secondary">Total Sessions</Text>}
                value={sessions.summary.totalSessions || 0}
                prefix={<FireOutlined style={{ color: "#ff6b35" }} />}
                valueStyle={{ color: "#fff" }}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
              <Statistic
                title={<Text type="secondary">Total Orders</Text>}
                value={sessions.summary.totalOrders || 0}
                prefix={<ShoppingCartOutlined style={{ color: "#52c41a" }} />}
                valueStyle={{ color: "#fff" }}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
              <Statistic
                title={<Text type="secondary">Total Revenue</Text>}
                value={sessions.summary.totalRevenue || 0}
                precision={2}
                prefix={<DollarOutlined style={{ color: "#52c41a" }} />}
                valueStyle={{ color: "#fff" }}
              />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
              <Statistic
                title={<Text type="secondary">Total Profit</Text>}
                value={sessions.summary.totalProfit || 0}
                precision={2}
                prefix={<DollarOutlined style={{ color: "#52c41a" }} />}
                valueStyle={{
                  color: (sessions.summary.totalProfit || 0) >= 0 ? "#52c41a" : "#ef4444",
                }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Sessions Table */}
      <Card
        title={
          <Space>
            <HistoryOutlined style={{ color: "#4a90d9" }} />
            <span>Sessions</span>
            {sessions?.sessions?.length > 0 && (
              <Tag color="blue">{sessions.sessions.length}</Tag>
            )}
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
        headStyle={{ borderColor: "#2a2a4e" }}
      >
        <Table
          dataSource={sessions?.sessions || []}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary">
                    No ghost kitchen sessions found for this period
                  </Text>
                }
              />
            ),
          }}
        />
      </Card>

      {/* Session Detail Modal */}
      <Modal
        title={
          <Space>
            <FireOutlined style={{ color: "#ff6b35" }} />
            <span>Session Details</span>
            {selectedSession && (
              <Text type="secondary">
                {format(parseISO(selectedSession.startTime), "MMMM d, yyyy")}
              </Text>
            )}
          </Space>
        }
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setSelectedSession(null);
        }}
        footer={null}
        width={800}
      >
        {detailLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading...</div>
        ) : sessionDetail ? (
          <div>
            {/* Session Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Statistic
                  title="Duration"
                  value={formatDuration(sessionDetail.durationMinutes || 0)}
                  prefix={<ClockCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Orders"
                  value={sessionDetail.totalOrders || 0}
                  prefix={<ShoppingCartOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Revenue"
                  value={sessionDetail.totalRevenue || 0}
                  precision={2}
                  prefix="$"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Profit"
                  value={sessionDetail.netProfit || 0}
                  precision={2}
                  prefix="$"
                  valueStyle={{
                    color: (sessionDetail.netProfit || 0) >= 0 ? "#52c41a" : "#ef4444",
                  }}
                />
              </Col>
            </Row>

            {/* Session Info */}
            <Descriptions
              bordered
              size="small"
              column={2}
              style={{ marginBottom: 24 }}
            >
              <Descriptions.Item label="Start Time">
                {format(parseISO(sessionDetail.startTime), "h:mm a")}
              </Descriptions.Item>
              <Descriptions.Item label="End Time">
                {sessionDetail.endTime
                  ? format(parseISO(sessionDetail.endTime), "h:mm a")
                  : "Active"}
              </Descriptions.Item>
              <Descriptions.Item label="Max Capacity">
                {sessionDetail.maxCapacity || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Peak Orders">
                {sessionDetail.peakConcurrentOrders || 0}
              </Descriptions.Item>
              <Descriptions.Item label="Avg Prep Time">
                {sessionDetail.avgPrepTime || 0} min
              </Descriptions.Item>
              <Descriptions.Item label="End Reason">
                {sessionDetail.endReason ? (
                  <Tag
                    color={getEndReasonConfig(sessionDetail.endReason).color}
                    icon={getEndReasonConfig(sessionDetail.endReason).icon}
                  >
                    {getEndReasonConfig(sessionDetail.endReason).text}
                  </Tag>
                ) : (
                  <Tag color="green">Active</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>

            {/* Hourly Breakdown */}
            {sessionDetail.hourlyBreakdown && (
              <Card
                size="small"
                title="Hourly Breakdown"
                style={{ marginBottom: 24 }}
              >
                <HourlyChart data={sessionDetail.hourlyBreakdown} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  {sessionDetail.hourlyBreakdown.map((h: any, i: number) => (
                    <Text key={i} type="secondary" style={{ fontSize: 10 }}>
                      {h.hour}
                    </Text>
                  ))}
                </div>
              </Card>
            )}

            {/* Orders List */}
            {sessionDetail.orders && sessionDetail.orders.length > 0 && (
              <Card size="small" title="Orders">
                <Table
                  dataSource={sessionDetail.orders}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 5 }}
                  columns={[
                    {
                      title: "Time",
                      dataIndex: "createdAt",
                      render: (time: string) =>
                        format(parseISO(time), "h:mm a"),
                    },
                    {
                      title: "Platform",
                      dataIndex: "platform",
                      render: (p: string) => <Tag color="blue">{p}</Tag>,
                    },
                    {
                      title: "Items",
                      dataIndex: "itemCount",
                    },
                    {
                      title: "Total",
                      dataIndex: "total",
                      render: (t: number) => `$${t?.toFixed(2) || "0.00"}`,
                    },
                    {
                      title: "Prep Time",
                      dataIndex: "prepTime",
                      render: (t: number) => `${t || 0} min`,
                    },
                    {
                      title: "Status",
                      dataIndex: "status",
                      render: (s: string) => {
                        const colors: Record<string, string> = {
                          COMPLETED: "green",
                          PREPARING: "blue",
                          READY: "gold",
                          PICKED_UP: "purple",
                          CANCELLED: "red",
                        };
                        return <Tag color={colors[s] || "default"}>{s}</Tag>;
                      },
                    },
                  ]}
                />
              </Card>
            )}

            {/* Platform Breakdown */}
            {sessionDetail.platformBreakdown && (
              <Card size="small" title="Platform Breakdown" style={{ marginTop: 16 }}>
                <Row gutter={[8, 8]}>
                  {Object.entries(sessionDetail.platformBreakdown).map(
                    ([platform, data]: [string, any]) => (
                      <Col key={platform} span={8}>
                        <div
                          style={{
                            padding: 12,
                            backgroundColor: "#f0f0f0",
                            borderRadius: 8,
                            textAlign: "center",
                          }}
                        >
                          <Text strong>{platform}</Text>
                          <div>
                            <Text type="secondary">
                              {data.orders} orders | ${data.revenue?.toFixed(2)}
                            </Text>
                          </div>
                        </div>
                      </Col>
                    )
                  )}
                </Row>
              </Card>
            )}
          </div>
        ) : (
          <Empty description="No session data available" />
        )}
      </Modal>
    </div>
  );
};
