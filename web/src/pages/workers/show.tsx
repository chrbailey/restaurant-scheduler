import { Show } from "@refinedev/antd";
import { useShow, useList, useGetIdentity } from "@refinedev/core";
import {
  Typography,
  Tag,
  Descriptions,
  Card,
  Space,
  Avatar,
  Rate,
  Progress,
  Table,
  Row,
  Col,
  Statistic,
  Calendar,
  Badge,
  Empty,
  Divider,
} from "antd";
import {
  UserOutlined,
  CalendarOutlined,
  StarFilled,
  TrophyOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  GlobalOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import { format, parseISO, startOfMonth, endOfMonth, isSameDay } from "date-fns";
import type { Dayjs } from "dayjs";

const { Title, Text } = Typography;

export const WorkerShow = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;
  const worker = data?.data as any;

  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  // Fetch worker's recent shifts
  const { data: shiftsData } = useList({
    resource: "shifts",
    filters: worker?.id
      ? [
          {
            field: "assignedWorkerId",
            operator: "eq",
            value: worker.id,
          },
        ]
      : [],
    pagination: { current: 1, pageSize: 10 },
    sorters: [{ field: "startTime", order: "desc" }],
    queryOptions: { enabled: !!worker?.id },
  });

  // Fetch cross-training certifications (where this worker can work at other restaurants)
  const { data: crossTrainingData } = useList({
    resource: "cross-training-certifications",
    filters: worker?.id
      ? [
          {
            field: "workerId",
            operator: "eq",
            value: worker.id,
          },
          {
            field: "status",
            operator: "in",
            value: ["ACTIVE", "APPROVED"],
          },
        ]
      : [],
    pagination: { current: 1, pageSize: 10 },
    queryOptions: { enabled: !!worker?.id },
  });

  // Fetch recent network shifts (shifts at other restaurants)
  const { data: networkShiftsData } = useList({
    resource: "network-shifts",
    filters: worker?.id
      ? [
          {
            field: "workerId",
            operator: "eq",
            value: worker.id,
          },
          {
            field: "type",
            operator: "eq",
            value: "OUTGOING",
          },
        ]
      : [],
    pagination: { current: 1, pageSize: 5 },
    sorters: [{ field: "startTime", order: "desc" }],
    queryOptions: { enabled: !!worker?.id },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      CONFIRMED: "green",
      IN_PROGRESS: "cyan",
      COMPLETED: "purple",
      NO_SHOW: "magenta",
      CANCELLED: "red",
      ACTIVE: "green",
      APPROVED: "green",
    };
    return colors[status] || "default";
  };

  const shiftsColumns = [
    {
      title: "Date",
      dataIndex: "startTime",
      render: (value: string) => format(parseISO(value), "MMM d, yyyy"),
    },
    {
      title: "Time",
      dataIndex: "startTime",
      render: (value: string, record: any) =>
        `${format(parseISO(value), "h:mm a")} - ${format(parseISO(record.endTime), "h:mm a")}`,
    },
    {
      title: "Position",
      dataIndex: "position",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status.replace(/_/g, " ")}</Tag>
      ),
    },
  ];

  const crossTrainingColumns = [
    {
      title: "Restaurant",
      dataIndex: "targetRestaurant",
      render: (restaurant: any) => (
        <Space>
          <ShopOutlined style={{ color: "#52c41a" }} />
          <Text style={{ color: "#fff" }}>{restaurant?.name}</Text>
        </Space>
      ),
    },
    {
      title: "Certified Positions",
      dataIndex: "certifiedPositions",
      render: (positions: string[]) => (
        <Space wrap size={4}>
          {positions?.map((pos: string) => (
            <Tag key={pos} color="green">
              {pos.replace(/_/g, " ")}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Certified Since",
      dataIndex: "certifiedAt",
      render: (value: string) => (
        <Text type="secondary">
          {value ? format(parseISO(value), "MMM d, yyyy") : "-"}
        </Text>
      ),
    },
    {
      title: "Shifts Worked",
      dataIndex: "shiftsWorked",
      render: (count: number) => <Text style={{ color: "#fff" }}>{count || 0}</Text>,
    },
  ];

  const networkShiftColumns = [
    {
      title: "Restaurant",
      dataIndex: "workingRestaurant",
      render: (restaurant: any) => (
        <Text style={{ color: "#fff" }}>{restaurant?.name}</Text>
      ),
    },
    {
      title: "Date",
      dataIndex: "startTime",
      render: (value: string) => format(parseISO(value), "MMM d"),
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (pos: string) => <Tag color="blue">{pos?.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status?.replace(/_/g, " ")}</Tag>
      ),
    },
  ];

  const hasCrossTraining = crossTrainingData?.data && crossTrainingData.data.length > 0;
  const hasNetworkShifts = networkShiftsData?.data && networkShiftsData.data.length > 0;

  return (
    <Show isLoading={isLoading}>
      {worker && (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* Profile Header */}
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space size="large" align="start">
              <Avatar
                size={100}
                style={{ backgroundColor: "#4a90d9", fontSize: 36 }}
              >
                {worker.user?.firstName?.[0]}
                {worker.user?.lastName?.[0]}
              </Avatar>
              <div style={{ flex: 1 }}>
                <Title level={2} style={{ margin: 0, color: "#fff" }}>
                  {worker.user?.firstName} {worker.user?.lastName}
                </Title>
                <Text type="secondary">{worker.user?.phone}</Text>
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    <Tag color={worker.role === "MANAGER" ? "purple" : "blue"}>
                      {worker.role}
                    </Tag>
                    <Tag color={worker.isActive ? "green" : "default"}>
                      {worker.isActive ? "Active" : "Inactive"}
                    </Tag>
                    {worker.isPrimaryTier && (
                      <Tag color="gold">
                        <TrophyOutlined /> Primary Tier
                      </Tag>
                    )}
                    {hasCrossTraining && (
                      <Tag color="cyan">
                        <GlobalOutlined /> Network Certified
                      </Tag>
                    )}
                  </Space>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary">Rating</Text>
                  <br />
                  <Rate
                    disabled
                    value={worker.reputationScore || 0}
                    character={<StarFilled />}
                  />
                  <Text style={{ marginLeft: 8, color: "#fff" }}>
                    ({worker.reputationScore?.toFixed(1) || "N/A"})
                  </Text>
                </div>
              </div>
            </Space>
          </Card>

          {/* Stats Row */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Shifts Completed</Text>}
                  value={worker.shiftsCompleted || 0}
                  prefix={<CalendarOutlined style={{ color: "#4a90d9" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Hours This Month</Text>}
                  value={worker.hoursThisMonth || 0}
                  prefix={<ClockCircleOutlined style={{ color: "#52c41a" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Reliability</Text>}
                  value={Math.round((worker.reliabilityScore || 0) * 100)}
                  suffix="%"
                  valueStyle={{
                    color:
                      worker.reliabilityScore >= 0.9
                        ? "#52c41a"
                        : worker.reliabilityScore >= 0.7
                        ? "#faad14"
                        : "#ff4d4f",
                  }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">No-Shows</Text>}
                  value={worker.noShowCount || 0}
                  valueStyle={{
                    color: worker.noShowCount > 0 ? "#ff4d4f" : "#52c41a",
                  }}
                />
              </Card>
            </Col>
          </Row>

          {/* Details */}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <UserOutlined style={{ color: "#4a90d9" }} />
                    <span>Profile Details</span>
                  </Space>
                }
                style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
                headStyle={{ borderColor: "#2a2a4e" }}
              >
                <Descriptions column={1} labelStyle={{ color: "#888" }}>
                  <Descriptions.Item label="Positions">
                    <Space wrap>
                      {worker.positions?.map((pos: string) => (
                        <Tag key={pos} color="blue">
                          {pos.replace(/_/g, " ")}
                        </Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="Hourly Rate">
                    ${worker.hourlyRate?.toFixed(2) || "N/A"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Joined">
                    {format(parseISO(worker.createdAt), "MMMM d, yyyy")}
                  </Descriptions.Item>
                  <Descriptions.Item label="Max Hours/Week">
                    {worker.maxHoursPerWeek || "Not set"}
                  </Descriptions.Item>
                  <Descriptions.Item label="Min Hours/Week">
                    {worker.minHoursPerWeek || "Not set"}
                  </Descriptions.Item>
                </Descriptions>

                {worker.certifications && worker.certifications.length > 0 && (
                  <>
                    <Text type="secondary" style={{ display: "block", marginTop: 16 }}>
                      Certifications
                    </Text>
                    <Space wrap style={{ marginTop: 8 }}>
                      {worker.certifications.map((cert: string) => (
                        <Tag key={cert} color="purple">
                          {cert}
                        </Tag>
                      ))}
                    </Space>
                  </>
                )}
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <CalendarOutlined style={{ color: "#4a90d9" }} />
                    <span>Recent Shifts</span>
                  </Space>
                }
                style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
                headStyle={{ borderColor: "#2a2a4e" }}
              >
                <Table
                  dataSource={shiftsData?.data || []}
                  columns={shiftsColumns}
                  pagination={false}
                  size="small"
                  rowKey="id"
                  locale={{ emptyText: "No recent shifts" }}
                />
              </Card>
            </Col>
          </Row>

          {/* Cross-Training Section */}
          <Card
            title={
              <Space>
                <SafetyCertificateOutlined style={{ color: "#52c41a" }} />
                <span>Cross-Training Certifications</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            {hasCrossTraining ? (
              <>
                <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                  This worker is certified to work at the following network restaurants.
                </Text>
                <Table
                  dataSource={crossTrainingData.data}
                  columns={crossTrainingColumns}
                  pagination={false}
                  size="small"
                  rowKey="id"
                />
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary">
                    Not certified at any other network restaurants
                  </Text>
                }
              />
            )}
          </Card>

          {/* Network Activity Section */}
          <Card
            title={
              <Space>
                <GlobalOutlined style={{ color: "#722ed1" }} />
                <span>Network Activity</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            {hasNetworkShifts ? (
              <>
                <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                  Recent shifts worked at other restaurants in your network.
                </Text>
                <Table
                  dataSource={networkShiftsData.data}
                  columns={networkShiftColumns}
                  pagination={false}
                  size="small"
                  rowKey="id"
                />
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Text type="secondary">
                    No shifts worked at other network restaurants yet
                  </Text>
                }
              />
            )}
          </Card>

          {/* Availability */}
          {worker.availability && (
            <Card
              title="Weekly Availability"
              style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
              headStyle={{ borderColor: "#2a2a4e" }}
            >
              <Row gutter={[8, 8]}>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
                  const dayAvail = worker.availability?.[index];
                  return (
                    <Col key={day} xs={24} sm={12} md={8} lg={3}>
                      <Card
                        size="small"
                        style={{
                          backgroundColor: dayAvail?.available ? "#1a2e1a" : "#2a2a4e",
                          borderColor: dayAvail?.available ? "#52c41a" : "#2a2a4e",
                          textAlign: "center",
                        }}
                      >
                        <Text strong style={{ color: "#fff" }}>
                          {day}
                        </Text>
                        <br />
                        {dayAvail?.available ? (
                          <Text style={{ color: "#52c41a", fontSize: 12 }}>
                            {dayAvail.startTime} - {dayAvail.endTime}
                          </Text>
                        ) : (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            Unavailable
                          </Text>
                        )}
                      </Card>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          )}
        </Space>
      )}
    </Show>
  );
};
