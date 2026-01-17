import { useState } from "react";
import { useCustom, useGetIdentity, useList } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Table,
  Tag,
  Button,
  Tabs,
  Avatar,
  Badge,
  Empty,
  Switch,
  Statistic,
  message,
  Popconfirm,
} from "antd";
import {
  SwapOutlined,
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  UserOutlined,
  SettingOutlined,
  TeamOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { format, parseISO } from "date-fns";

const { Title, Text } = Typography;

interface TradeOffer {
  id: string;
  type: "swap" | "giveaway" | "pickup";
  status: "pending" | "approved" | "rejected" | "completed" | "expired";
  offeredShift: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    position: string;
  };
  requestedShift?: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    position: string;
  };
  offeredBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  requestedBy?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
  expiresAt: string;
  reason?: string;
}

export const MarketplaceList = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [activeTab, setActiveTab] = useState("active");
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);

  // Fetch trade offers
  const { data: tradesData, isLoading, refetch } = useCustom({
    url: `/marketplace/${identity?.restaurantId}/trades`,
    method: "get",
    config: {
      query: { status: activeTab },
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const trades: TradeOffer[] = tradesData?.data?.trades || [
    {
      id: "t1",
      type: "swap",
      status: "pending",
      offeredShift: {
        id: "s1",
        date: "2024-01-20",
        startTime: "17:00",
        endTime: "23:00",
        position: "SERVER",
      },
      requestedShift: {
        id: "s2",
        date: "2024-01-21",
        startTime: "11:00",
        endTime: "17:00",
        position: "SERVER",
      },
      offeredBy: { id: "w1", firstName: "John", lastName: "Smith" },
      requestedBy: { id: "w2", firstName: "Sarah", lastName: "Johnson" },
      createdAt: "2024-01-18T10:30:00",
      expiresAt: "2024-01-19T23:59:59",
      reason: "Personal appointment on Saturday evening",
    },
    {
      id: "t2",
      type: "giveaway",
      status: "pending",
      offeredShift: {
        id: "s3",
        date: "2024-01-22",
        startTime: "06:00",
        endTime: "14:00",
        position: "LINE_COOK",
      },
      offeredBy: { id: "w3", firstName: "Michael", lastName: "Chen" },
      createdAt: "2024-01-18T14:15:00",
      expiresAt: "2024-01-21T23:59:59",
      reason: "Need to reduce hours this week",
    },
    {
      id: "t3",
      type: "pickup",
      status: "pending",
      offeredShift: {
        id: "s4",
        date: "2024-01-23",
        startTime: "11:00",
        endTime: "19:00",
        position: "HOST",
      },
      offeredBy: { id: "w4", firstName: "Emily", lastName: "Davis" },
      requestedBy: { id: "w5", firstName: "David", lastName: "Wilson" },
      createdAt: "2024-01-18T16:00:00",
      expiresAt: "2024-01-22T23:59:59",
    },
  ];

  const completedTrades: TradeOffer[] = [
    {
      id: "t4",
      type: "swap",
      status: "completed",
      offeredShift: {
        id: "s5",
        date: "2024-01-15",
        startTime: "17:00",
        endTime: "23:00",
        position: "BARTENDER",
      },
      requestedShift: {
        id: "s6",
        date: "2024-01-16",
        startTime: "17:00",
        endTime: "23:00",
        position: "BARTENDER",
      },
      offeredBy: { id: "w6", firstName: "Lisa", lastName: "Brown" },
      requestedBy: { id: "w7", firstName: "Alex", lastName: "Taylor" },
      createdAt: "2024-01-13T09:00:00",
      expiresAt: "2024-01-14T23:59:59",
    },
  ];

  const handleApprove = async (tradeId: string) => {
    try {
      // In real implementation, call API
      await new Promise((resolve) => setTimeout(resolve, 500));
      message.success("Trade approved successfully");
      refetch();
    } catch (error) {
      message.error("Failed to approve trade");
    }
  };

  const handleReject = async (tradeId: string) => {
    try {
      // In real implementation, call API
      await new Promise((resolve) => setTimeout(resolve, 500));
      message.success("Trade rejected");
      refetch();
    } catch (error) {
      message.error("Failed to reject trade");
    }
  };

  const getTradeTypeTag = (type: string) => {
    switch (type) {
      case "swap":
        return <Tag color="blue">SWAP</Tag>;
      case "giveaway":
        return <Tag color="orange">GIVEAWAY</Tag>;
      case "pickup":
        return <Tag color="green">PICKUP</Tag>;
      default:
        return <Tag>{type}</Tag>;
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case "pending":
        return <Tag color="gold">PENDING</Tag>;
      case "approved":
        return <Tag color="blue">APPROVED</Tag>;
      case "completed":
        return <Tag color="green">COMPLETED</Tag>;
      case "rejected":
        return <Tag color="red">REJECTED</Tag>;
      case "expired":
        return <Tag color="default">EXPIRED</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const pendingColumns = [
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (type: string) => getTradeTypeTag(type),
    },
    {
      title: "Offered Shift",
      key: "offeredShift",
      render: (_: any, record: TradeOffer) => (
        <Space direction="vertical" size={0}>
          <Text style={{ color: "#fff" }}>
            {format(parseISO(record.offeredShift.date), "EEE, MMM d")}
          </Text>
          <Text type="secondary">
            {record.offeredShift.startTime} - {record.offeredShift.endTime}
          </Text>
          <Tag color="blue" style={{ marginTop: 4 }}>
            {record.offeredShift.position.replace(/_/g, " ")}
          </Tag>
        </Space>
      ),
    },
    {
      title: "Offered By",
      key: "offeredBy",
      render: (_: any, record: TradeOffer) => (
        <Space>
          <Avatar style={{ backgroundColor: "#4a90d9" }}>
            {record.offeredBy.firstName[0]}
          </Avatar>
          <Text style={{ color: "#fff" }}>
            {record.offeredBy.firstName} {record.offeredBy.lastName}
          </Text>
        </Space>
      ),
    },
    {
      title: "Trade For",
      key: "requestedShift",
      render: (_: any, record: TradeOffer) => {
        if (record.type === "giveaway") {
          return <Text type="secondary">-</Text>;
        }
        if (record.requestedShift) {
          return (
            <Space direction="vertical" size={0}>
              <Text style={{ color: "#fff" }}>
                {format(parseISO(record.requestedShift.date), "EEE, MMM d")}
              </Text>
              <Text type="secondary">
                {record.requestedShift.startTime} - {record.requestedShift.endTime}
              </Text>
            </Space>
          );
        }
        return <Text type="secondary">Any available</Text>;
      },
    },
    {
      title: "With",
      key: "requestedBy",
      render: (_: any, record: TradeOffer) => {
        if (!record.requestedBy) {
          return (
            <Tag color="orange">
              <ClockCircleOutlined /> Awaiting taker
            </Tag>
          );
        }
        return (
          <Space>
            <Avatar style={{ backgroundColor: "#52c41a" }}>
              {record.requestedBy.firstName[0]}
            </Avatar>
            <Text style={{ color: "#fff" }}>
              {record.requestedBy.firstName} {record.requestedBy.lastName}
            </Text>
          </Space>
        );
      },
    },
    {
      title: "Expires",
      key: "expiresAt",
      render: (_: any, record: TradeOffer) => (
        <Text type="secondary">
          {format(parseISO(record.expiresAt), "MMM d, h:mm a")}
        </Text>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 150,
      render: (_: any, record: TradeOffer) => (
        <Space>
          <Popconfirm
            title="Approve this trade?"
            onConfirm={() => handleApprove(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              type="primary"
              icon={<CheckOutlined />}
              size="small"
              style={{ backgroundColor: "#52c41a", borderColor: "#52c41a" }}
            >
              Approve
            </Button>
          </Popconfirm>
          <Popconfirm
            title="Reject this trade?"
            onConfirm={() => handleReject(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button icon={<CloseOutlined />} size="small" danger>
              Reject
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const historyColumns = [
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (type: string) => getTradeTypeTag(type),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: "Shift",
      key: "offeredShift",
      render: (_: any, record: TradeOffer) => (
        <Space direction="vertical" size={0}>
          <Text style={{ color: "#fff" }}>
            {format(parseISO(record.offeredShift.date), "EEE, MMM d")}
          </Text>
          <Text type="secondary">
            {record.offeredShift.startTime} - {record.offeredShift.endTime}
          </Text>
          <Tag color="blue" style={{ marginTop: 4 }}>
            {record.offeredShift.position.replace(/_/g, " ")}
          </Tag>
        </Space>
      ),
    },
    {
      title: "From",
      key: "offeredBy",
      render: (_: any, record: TradeOffer) => (
        <Text style={{ color: "#fff" }}>
          {record.offeredBy.firstName} {record.offeredBy.lastName}
        </Text>
      ),
    },
    {
      title: "To",
      key: "requestedBy",
      render: (_: any, record: TradeOffer) =>
        record.requestedBy ? (
          <Text style={{ color: "#fff" }}>
            {record.requestedBy.firstName} {record.requestedBy.lastName}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: "Date",
      key: "createdAt",
      render: (_: any, record: TradeOffer) => (
        <Text type="secondary">
          {format(parseISO(record.createdAt), "MMM d, yyyy")}
        </Text>
      ),
    },
  ];

  // Stats
  const pendingCount = trades.filter((t) => t.status === "pending").length;
  const needsApprovalCount = trades.filter(
    (t) => t.status === "pending" && t.requestedBy
  ).length;
  const totalThisMonth = completedTrades.length + pendingCount;

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <SwapOutlined style={{ fontSize: 28, color: "#4a90d9" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Trade Marketplace
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Manage shift swaps, giveaways, and pickups between workers
        </Text>
      </div>

      {/* Stats Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Pending Approval</Text>}
              value={needsApprovalCount}
              prefix={
                <Badge
                  count={needsApprovalCount}
                  style={{ backgroundColor: needsApprovalCount > 0 ? "#faad14" : "#52c41a" }}
                >
                  <ClockCircleOutlined style={{ color: "#faad14" }} />
                </Badge>
              }
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Active Offers</Text>}
              value={trades.filter((t) => !t.requestedBy).length}
              prefix={<TeamOutlined style={{ color: "#4a90d9" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Completed This Month</Text>}
              value={completedTrades.length}
              prefix={<CheckOutlined style={{ color: "#52c41a" }} />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
        bodyStyle={{ padding: 0 }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          tabBarStyle={{ padding: "0 24px", marginBottom: 0 }}
          items={[
            {
              key: "active",
              label: (
                <Space>
                  <ClockCircleOutlined />
                  <span>Pending</span>
                  {pendingCount > 0 && (
                    <Badge count={pendingCount} style={{ marginLeft: 8 }} />
                  )}
                </Space>
              ),
              children: (
                <div style={{ padding: 24 }}>
                  {trades.filter((t) => t.status === "pending").length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <Text type="secondary">No pending trades</Text>
                      }
                    />
                  ) : (
                    <Table
                      dataSource={trades.filter((t) => t.status === "pending")}
                      columns={pendingColumns}
                      rowKey="id"
                      pagination={false}
                      loading={isLoading}
                    />
                  )}
                </div>
              ),
            },
            {
              key: "history",
              label: (
                <Space>
                  <HistoryOutlined />
                  <span>History</span>
                </Space>
              ),
              children: (
                <div style={{ padding: 24 }}>
                  {completedTrades.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={
                        <Text type="secondary">No completed trades</Text>
                      }
                    />
                  ) : (
                    <Table
                      dataSource={completedTrades}
                      columns={historyColumns}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: "settings",
              label: (
                <Space>
                  <SettingOutlined />
                  <span>Settings</span>
                </Space>
              ),
              children: (
                <div style={{ padding: 24 }}>
                  <Card
                    style={{
                      backgroundColor: "#16213e",
                      borderColor: "#2a2a4e",
                      marginBottom: 16,
                    }}
                  >
                    <Space
                      style={{
                        width: "100%",
                        justifyContent: "space-between",
                      }}
                    >
                      <Space direction="vertical" size={0}>
                        <Text style={{ color: "#fff" }}>Enable Marketplace</Text>
                        <Text type="secondary">
                          Allow workers to post and claim shift trades
                        </Text>
                      </Space>
                      <Switch
                        checked={marketplaceEnabled}
                        onChange={setMarketplaceEnabled}
                      />
                    </Space>
                  </Card>

                  <Card
                    style={{
                      backgroundColor: "#16213e",
                      borderColor: "#2a2a4e",
                      marginBottom: 16,
                    }}
                  >
                    <Space
                      style={{
                        width: "100%",
                        justifyContent: "space-between",
                      }}
                    >
                      <Space direction="vertical" size={0}>
                        <Text style={{ color: "#fff" }}>Auto-Approve Eligible Trades</Text>
                        <Text type="secondary">
                          Automatically approve trades between qualified workers
                          with matching availability
                        </Text>
                      </Space>
                      <Switch checked={autoApprove} onChange={setAutoApprove} />
                    </Space>
                  </Card>

                  <Card
                    style={{ backgroundColor: "#16213e", borderColor: "#2a2a4e" }}
                  >
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <Text style={{ color: "#fff" }}>Trade Rules</Text>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        <li>
                          <Text type="secondary">
                            Workers can only swap shifts with others qualified for
                            the same position
                          </Text>
                        </li>
                        <li>
                          <Text type="secondary">
                            Trades must be requested at least 24 hours before the
                            shift
                          </Text>
                        </li>
                        <li>
                          <Text type="secondary">
                            Workers cannot exceed weekly hour limits through trades
                          </Text>
                        </li>
                        <li>
                          <Text type="secondary">
                            All trades require manager approval unless auto-approve
                            is enabled
                          </Text>
                        </li>
                      </ul>
                    </Space>
                  </Card>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
