import { useList, useGetIdentity } from "@refinedev/core";
import { Card, Col, Row, Statistic, Typography, Table, Tag, Space, Empty, Avatar } from "antd";
import {
  CalendarOutlined,
  TeamOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  GlobalOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { format, parseISO, isToday, isTomorrow, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { useNavigate } from "react-router";

const { Title, Text } = Typography;

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<{
    name: string;
    restaurantName: string;
    restaurantId: string;
  }>();

  // Fetch dashboard stats
  const { data: dashboardData, isLoading } = useList({
    resource: "dashboard",
    pagination: { mode: "off" },
  });

  const stats = dashboardData?.data as any;

  // Fetch today's shifts
  const { data: todayShifts } = useList({
    resource: "shifts",
    filters: [
      {
        field: "date",
        operator: "eq",
        value: format(new Date(), "yyyy-MM-dd"),
      },
    ],
    pagination: { current: 1, pageSize: 10 },
  });

  // Fetch pending claims
  const { data: pendingClaims } = useList({
    resource: "claims",
    filters: [
      {
        field: "status",
        operator: "eq",
        value: "PENDING",
      },
    ],
    pagination: { current: 1, pageSize: 5 },
  });

  // Fetch pending swaps
  const { data: pendingSwaps } = useList({
    resource: "swaps",
    filters: [
      {
        field: "status",
        operator: "eq",
        value: "PENDING",
      },
    ],
    pagination: { current: 1, pageSize: 5 },
  });

  // Fetch network membership info
  const { data: networksData } = useList({
    resource: "networks",
    pagination: { current: 1, pageSize: 1 },
  });

  const isInNetwork = networksData?.data && networksData.data.length > 0;
  const networkInfo = isInNetwork ? networksData.data[0] : null;

  // Fetch incoming network workers today (workers from other restaurants scheduled here today)
  const { data: incomingWorkersData } = useList({
    resource: "network-shifts",
    filters: identity?.restaurantId
      ? [
          {
            field: "workingRestaurantId",
            operator: "eq",
            value: identity.restaurantId,
          },
          {
            field: "type",
            operator: "eq",
            value: "INCOMING",
          },
          {
            field: "date",
            operator: "eq",
            value: format(new Date(), "yyyy-MM-dd"),
          },
        ]
      : [],
    pagination: { current: 1, pageSize: 5 },
    queryOptions: { enabled: !!identity?.restaurantId && isInNetwork },
  });

  // Fetch outgoing workers today (our workers at other restaurants today)
  const { data: outgoingWorkersData } = useList({
    resource: "network-shifts",
    filters: identity?.restaurantId
      ? [
          {
            field: "homeRestaurantId",
            operator: "eq",
            value: identity.restaurantId,
          },
          {
            field: "type",
            operator: "eq",
            value: "OUTGOING",
          },
          {
            field: "date",
            operator: "eq",
            value: format(new Date(), "yyyy-MM-dd"),
          },
        ]
      : [],
    pagination: { current: 1, pageSize: 5 },
    queryOptions: { enabled: !!identity?.restaurantId && isInNetwork },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return "green";
      case "PUBLISHED_UNASSIGNED":
        return "orange";
      case "PUBLISHED_CLAIMED":
        return "blue";
      case "IN_PROGRESS":
        return "cyan";
      case "PENDING":
        return "gold";
      default:
        return "default";
    }
  };

  const shiftsColumns = [
    {
      title: "Time",
      dataIndex: "startTime",
      render: (startTime: string) => format(parseISO(startTime), "h:mm a"),
    },
    {
      title: "Position",
      dataIndex: "position",
    },
    {
      title: "Worker",
      dataIndex: "assignedWorker",
      render: (worker: any) =>
        worker ? `${worker.user.firstName} ${worker.user.lastName}` : <Tag color="orange">Unassigned</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {status.replace(/_/g, " ")}
        </Tag>
      ),
    },
  ];

  const claimsColumns = [
    {
      title: "Worker",
      dataIndex: "worker",
      render: (worker: any) =>
        worker ? `${worker.user.firstName} ${worker.user.lastName}` : "-",
    },
    {
      title: "Shift",
      dataIndex: "shift",
      render: (shift: any) =>
        shift ? `${shift.position} - ${format(parseISO(shift.startTime), "MMM d, h:mm a")}` : "-",
    },
    {
      title: "Priority",
      dataIndex: "priorityScore",
      render: (score: number) => (
        <Text strong style={{ color: score > 1000 ? "#52c41a" : "#1890ff" }}>
          {score}
        </Text>
      ),
    },
  ];

  const networkIncomingColumns = [
    {
      title: "Worker",
      dataIndex: "worker",
      render: (worker: any) => (
        <Space>
          <Avatar size="small" style={{ backgroundColor: "#52c41a" }}>
            {worker?.user?.firstName?.[0]}
          </Avatar>
          <Text style={{ color: "#fff" }}>
            {worker?.user?.firstName} {worker?.user?.lastName}
          </Text>
        </Space>
      ),
    },
    {
      title: "From",
      dataIndex: "homeRestaurant",
      render: (restaurant: any) => (
        <Text type="secondary">{restaurant?.name}</Text>
      ),
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (pos: string) => <Tag color="green">{pos?.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Time",
      dataIndex: "startTime",
      render: (value: string, record: any) => (
        <Text type="secondary">
          {format(parseISO(value), "h:mm a")} - {format(parseISO(record.endTime), "h:mm a")}
        </Text>
      ),
    },
  ];

  const networkOutgoingColumns = [
    {
      title: "Worker",
      dataIndex: "worker",
      render: (worker: any) => (
        <Space>
          <Avatar size="small" style={{ backgroundColor: "#4a90d9" }}>
            {worker?.user?.firstName?.[0]}
          </Avatar>
          <Text style={{ color: "#fff" }}>
            {worker?.user?.firstName} {worker?.user?.lastName}
          </Text>
        </Space>
      ),
    },
    {
      title: "At",
      dataIndex: "workingRestaurant",
      render: (restaurant: any) => (
        <Text type="secondary">{restaurant?.name}</Text>
      ),
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (pos: string) => <Tag color="blue">{pos?.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Time",
      dataIndex: "startTime",
      render: (value: string, record: any) => (
        <Text type="secondary">
          {format(parseISO(value), "h:mm a")} - {format(parseISO(record.endTime), "h:mm a")}
        </Text>
      ),
    },
  ];

  const hasIncomingWorkers = incomingWorkersData?.data && incomingWorkersData.data.length > 0;
  const hasOutgoingWorkers = outgoingWorkersData?.data && outgoingWorkersData.data.length > 0;
  const hasNetworkActivity = hasIncomingWorkers || hasOutgoingWorkers;

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ color: "#fff", margin: 0 }}>
          Welcome back, {identity?.name?.split(" ")[0] || "Manager"}
        </Title>
        <Text type="secondary">{identity?.restaurantName || "Your Restaurant"}</Text>
        {isInNetwork && (
          <Tag color="cyan" style={{ marginLeft: 12 }}>
            <GlobalOutlined style={{ marginRight: 4 }} />
            {(networkInfo as any)?.name || "Network Member"}
          </Tag>
        )}
      </div>

      {/* Stats Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Today's Shifts</Text>}
              value={stats?.todayShifts || todayShifts?.total || 0}
              prefix={<CalendarOutlined style={{ color: "#4a90d9" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Active Workers</Text>}
              value={stats?.activeWorkers || 0}
              prefix={<TeamOutlined style={{ color: "#52c41a" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Pending Claims</Text>}
              value={pendingClaims?.total || 0}
              prefix={<ClockCircleOutlined style={{ color: "#faad14" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Pending Swaps</Text>}
              value={pendingSwaps?.total || 0}
              prefix={<SwapOutlined style={{ color: "#722ed1" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Alerts Row */}
      {(stats?.unfilledShifts > 0 || stats?.coverageGaps > 0) && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {stats?.unfilledShifts > 0 && (
            <Col xs={24} sm={12}>
              <Card
                style={{
                  backgroundColor: "#2a1a1a",
                  borderColor: "#ef4444",
                  borderLeftWidth: 4,
                }}
              >
                <Space>
                  <WarningOutlined style={{ color: "#ef4444", fontSize: 24 }} />
                  <div>
                    <Text strong style={{ color: "#ef4444" }}>
                      {stats.unfilledShifts} Unfilled Shifts
                    </Text>
                    <br />
                    <Text type="secondary">Shifts without assigned workers this week</Text>
                  </div>
                </Space>
              </Card>
            </Col>
          )}
          {stats?.coverageGaps > 0 && (
            <Col xs={24} sm={12}>
              <Card
                style={{
                  backgroundColor: "#2a2a1a",
                  borderColor: "#faad14",
                  borderLeftWidth: 4,
                }}
              >
                <Space>
                  <WarningOutlined style={{ color: "#faad14", fontSize: 24 }} />
                  <div>
                    <Text strong style={{ color: "#faad14" }}>
                      {stats.coverageGaps} Coverage Gaps
                    </Text>
                    <br />
                    <Text type="secondary">Time slots with insufficient staff</Text>
                  </div>
                </Space>
              </Card>
            </Col>
          )}
        </Row>
      )}

      {/* Network Activity Card - Only show if in a network */}
      {isInNetwork && (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24}>
            <Card
              title={
                <Space>
                  <GlobalOutlined style={{ color: "#4a90d9" }} />
                  <span>Network Activity Today</span>
                </Space>
              }
              style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
              headStyle={{ borderColor: "#2a2a4e" }}
              extra={
                <a onClick={() => navigate("/network-shifts")} style={{ color: "#4a90d9" }}>
                  View All
                </a>
              }
            >
              {hasNetworkActivity ? (
                <Row gutter={[16, 16]}>
                  {/* Incoming workers */}
                  <Col xs={24} lg={12}>
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ArrowLeftOutlined style={{ color: "#52c41a" }} />
                          <Text style={{ color: "#fff" }}>Network Workers Here</Text>
                          {hasIncomingWorkers && (
                            <Tag color="green">{incomingWorkersData?.data?.length}</Tag>
                          )}
                        </Space>
                      }
                      style={{ backgroundColor: "#16213e", borderColor: "#2a2a4e" }}
                      headStyle={{ borderColor: "#2a2a4e" }}
                    >
                      {hasIncomingWorkers ? (
                        <Table
                          dataSource={incomingWorkersData?.data || []}
                          columns={networkIncomingColumns}
                          pagination={false}
                          size="small"
                          rowKey="id"
                        />
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={
                            <Text type="secondary">No network workers scheduled today</Text>
                          }
                        />
                      )}
                    </Card>
                  </Col>

                  {/* Outgoing workers */}
                  <Col xs={24} lg={12}>
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ArrowRightOutlined style={{ color: "#4a90d9" }} />
                          <Text style={{ color: "#fff" }}>Your Workers Elsewhere</Text>
                          {hasOutgoingWorkers && (
                            <Tag color="blue">{outgoingWorkersData?.data?.length}</Tag>
                          )}
                        </Space>
                      }
                      style={{ backgroundColor: "#16213e", borderColor: "#2a2a4e" }}
                      headStyle={{ borderColor: "#2a2a4e" }}
                    >
                      {hasOutgoingWorkers ? (
                        <Table
                          dataSource={outgoingWorkersData?.data || []}
                          columns={networkOutgoingColumns}
                          pagination={false}
                          size="small"
                          rowKey="id"
                        />
                      ) : (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={
                            <Text type="secondary">None of your workers at other restaurants today</Text>
                          }
                        />
                      )}
                    </Card>
                  </Col>
                </Row>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical" align="center">
                      <Text type="secondary">No network activity today</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        When workers from network restaurants claim shifts, they'll appear here
                      </Text>
                    </Space>
                  }
                />
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* Tables Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CalendarOutlined style={{ color: "#4a90d9" }} />
                <span>Today's Shifts</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Table
              dataSource={todayShifts?.data || []}
              columns={shiftsColumns}
              pagination={false}
              size="small"
              rowKey="id"
              locale={{ emptyText: "No shifts scheduled for today" }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: "#faad14" }} />
                <span>Pending Approvals</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <Table
              dataSource={pendingClaims?.data || []}
              columns={claimsColumns}
              pagination={false}
              size="small"
              rowKey="id"
              locale={{ emptyText: "No pending approvals" }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};
