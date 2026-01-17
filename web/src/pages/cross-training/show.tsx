import { Show } from "@refinedev/antd";
import { useShow, useUpdate, useList, useGetIdentity, useInvalidate } from "@refinedev/core";
import {
  Typography,
  Tag,
  Descriptions,
  Card,
  Space,
  Avatar,
  Table,
  Row,
  Col,
  Statistic,
  Button,
  Popconfirm,
  message,
  Timeline,
  Empty,
  Rate,
  Divider,
} from "antd";
import {
  UserOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  StarFilled,
  CalendarOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { format, parseISO } from "date-fns";

const { Title, Text, Paragraph } = Typography;

export const CrossTrainingShow = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;
  const record = data?.data as any;
  const invalidate = useInvalidate();

  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  // Determine if this is a request (pending approval) or certification (already approved)
  const isRequest = record?.status === "PENDING" || record?.status === "REJECTED";
  const isCertification = record?.status === "APPROVED" || record?.status === "ACTIVE";
  const isTargetRestaurant = record?.targetRestaurantId === identity?.restaurantId;

  // Fetch shifts this worker has worked at the target restaurant
  const { data: shiftsData } = useList({
    resource: "shifts",
    filters: record?.workerId && record?.targetRestaurantId
      ? [
          { field: "assignedWorkerId", operator: "eq", value: record.workerId },
          { field: "restaurantId", operator: "eq", value: record.targetRestaurantId },
          { field: "status", operator: "in", value: ["COMPLETED", "IN_PROGRESS"] },
        ]
      : [],
    pagination: { current: 1, pageSize: 10 },
    sorters: [{ field: "startTime", order: "desc" }],
    queryOptions: { enabled: !!record?.workerId && !!record?.targetRestaurantId },
  });

  const { mutate: updateRecord, isLoading: isUpdating } = useUpdate();

  const handleApprove = () => {
    updateRecord(
      {
        resource: "cross-training-requests",
        id: record.id,
        values: { status: "APPROVED" },
      },
      {
        onSuccess: () => {
          message.success("Cross-training approved");
          invalidate({ resource: "cross-training-requests", invalidates: ["detail", "list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to approve");
        },
      }
    );
  };

  const handleReject = () => {
    updateRecord(
      {
        resource: "cross-training-requests",
        id: record.id,
        values: { status: "REJECTED" },
      },
      {
        onSuccess: () => {
          message.success("Request rejected");
          invalidate({ resource: "cross-training-requests", invalidates: ["detail", "list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to reject");
        },
      }
    );
  };

  const handleRevoke = () => {
    updateRecord(
      {
        resource: "cross-training-certifications",
        id: record.id,
        values: { status: "REVOKED" },
      },
      {
        onSuccess: () => {
          message.success("Certification revoked");
          invalidate({ resource: "cross-training-certifications", invalidates: ["detail", "list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to revoke certification");
        },
      }
    );
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "gold",
      APPROVED: "green",
      REJECTED: "red",
      REVOKED: "magenta",
      ACTIVE: "green",
      EXPIRED: "default",
    };
    return colors[status] || "default";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PENDING":
        return <ClockCircleOutlined />;
      case "APPROVED":
      case "ACTIVE":
        return <CheckCircleOutlined />;
      case "REJECTED":
      case "REVOKED":
        return <CloseCircleOutlined />;
      default:
        return <ClockCircleOutlined />;
    }
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
      render: (value: string, rec: any) =>
        `${format(parseISO(value), "h:mm a")} - ${format(parseISO(rec.endTime), "h:mm a")}`,
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (pos: string) => <Tag color="blue">{pos.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={status === "COMPLETED" ? "green" : "cyan"}>
          {status.replace(/_/g, " ")}
        </Tag>
      ),
    },
  ];

  return (
    <Show isLoading={isLoading}>
      {record && (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* Header Card */}
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Row gutter={[24, 24]}>
              <Col xs={24} md={16}>
                <Space size="large" align="start">
                  <Avatar
                    size={80}
                    style={{ backgroundColor: "#4a90d9", fontSize: 28 }}
                  >
                    {record.worker?.user?.firstName?.[0]}
                    {record.worker?.user?.lastName?.[0]}
                  </Avatar>
                  <div>
                    <Title level={2} style={{ margin: 0, color: "#fff" }}>
                      {record.worker?.user?.firstName} {record.worker?.user?.lastName}
                    </Title>
                    <Text type="secondary" style={{ fontSize: 16 }}>
                      {record.worker?.user?.phone}
                    </Text>
                    <div style={{ marginTop: 12 }}>
                      <Space wrap>
                        <Tag color={getStatusColor(record.status)} icon={getStatusIcon(record.status)}>
                          {record.status}
                        </Tag>
                        <Tag color="blue">
                          <ShopOutlined style={{ marginRight: 4 }} />
                          Home: {record.homeRestaurant?.name}
                        </Tag>
                        <Tag color="purple">
                          <SafetyCertificateOutlined style={{ marginRight: 4 }} />
                          Target: {record.targetRestaurant?.name}
                        </Tag>
                      </Space>
                    </div>
                  </div>
                </Space>
              </Col>
              <Col xs={24} md={8} style={{ textAlign: "right" }}>
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary">Worker Rating</Text>
                  <br />
                  <Rate
                    disabled
                    value={record.worker?.reputationScore || 0}
                    character={<StarFilled />}
                  />
                  <Text style={{ marginLeft: 8, color: "#fff" }}>
                    ({record.worker?.reputationScore?.toFixed(1) || "N/A"})
                  </Text>
                </div>
                <Text type="secondary">
                  Reliability: {Math.round((record.worker?.reliabilityScore || 0) * 100)}%
                </Text>
              </Col>
            </Row>
          </Card>

          {/* Actions for Pending Requests */}
          {record.status === "PENDING" && isTargetRestaurant && (
            <Card style={{ backgroundColor: "#2a2a1a", borderColor: "#faad14" }}>
              <Space>
                <WarningOutlined style={{ color: "#faad14", fontSize: 24 }} />
                <div style={{ flex: 1 }}>
                  <Text strong style={{ color: "#faad14" }}>
                    Action Required
                  </Text>
                  <br />
                  <Text type="secondary">
                    This worker is requesting to be cross-trained at your restaurant.
                  </Text>
                </div>
                <Space>
                  <Popconfirm
                    title="Approve cross-training?"
                    description="This worker will be able to claim and work shifts at your restaurant."
                    onConfirm={handleApprove}
                    okText="Approve"
                    okButtonProps={{ type: "primary" }}
                  >
                    <Button type="primary" icon={<CheckCircleOutlined />} loading={isUpdating}>
                      Approve
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title="Reject this request?"
                    onConfirm={handleReject}
                    okText="Reject"
                    okButtonProps={{ danger: true }}
                  >
                    <Button danger icon={<CloseCircleOutlined />} loading={isUpdating}>
                      Reject
                    </Button>
                  </Popconfirm>
                </Space>
              </Space>
            </Card>
          )}

          {/* Stats Row */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Shifts at Target</Text>}
                  value={record.shiftsWorked || shiftsData?.total || 0}
                  prefix={<CalendarOutlined style={{ color: "#4a90d9" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Hours Worked</Text>}
                  value={record.hoursWorked || 0}
                  prefix={<ClockCircleOutlined style={{ color: "#52c41a" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Rating at Target</Text>}
                  value={record.ratingAtTarget?.toFixed(1) || "N/A"}
                  suffix="/ 5"
                  prefix={<StarFilled style={{ color: "#faad14" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Certified Positions</Text>}
                  value={(record.certifiedPositions || record.requestedPositions)?.length || 0}
                  prefix={<SafetyCertificateOutlined style={{ color: "#722ed1" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            {/* Details */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <UserOutlined style={{ color: "#4a90d9" }} />
                    <span>Details</span>
                  </Space>
                }
                style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
                headStyle={{ borderColor: "#2a2a4e" }}
              >
                <Descriptions column={1} labelStyle={{ color: "#888" }}>
                  <Descriptions.Item label="Home Restaurant">
                    {record.homeRestaurant?.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="Target Restaurant">
                    {record.targetRestaurant?.name}
                  </Descriptions.Item>
                  <Descriptions.Item label={isRequest ? "Requested Positions" : "Certified Positions"}>
                    <Space wrap>
                      {(record.certifiedPositions || record.requestedPositions)?.map((pos: string) => (
                        <Tag key={pos} color={isCertification ? "green" : "blue"}>
                          {pos.replace(/_/g, " ")}
                        </Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="Request Date">
                    {record.createdAt ? format(parseISO(record.createdAt), "MMMM d, yyyy") : "-"}
                  </Descriptions.Item>
                  {isCertification && (
                    <Descriptions.Item label="Certified Date">
                      {record.certifiedAt ? format(parseISO(record.certifiedAt), "MMMM d, yyyy") : "-"}
                    </Descriptions.Item>
                  )}
                  {record.notes && (
                    <Descriptions.Item label="Notes">
                      {record.notes}
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* Revoke Button for Active Certifications */}
                {isCertification && isTargetRestaurant && record.status !== "REVOKED" && (
                  <>
                    <Divider />
                    <Popconfirm
                      title="Revoke this certification?"
                      description="This worker will no longer be able to claim shifts at your restaurant."
                      onConfirm={handleRevoke}
                      okText="Revoke"
                      okButtonProps={{ danger: true }}
                    >
                      <Button danger icon={<CloseCircleOutlined />} loading={isUpdating}>
                        Revoke Certification
                      </Button>
                    </Popconfirm>
                  </>
                )}
              </Card>
            </Col>

            {/* History Timeline */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <ClockCircleOutlined style={{ color: "#4a90d9" }} />
                    <span>History</span>
                  </Space>
                }
                style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
                headStyle={{ borderColor: "#2a2a4e" }}
              >
                <Timeline
                  items={[
                    {
                      color: "blue",
                      children: (
                        <div>
                          <Text strong style={{ color: "#fff" }}>
                            Request Submitted
                          </Text>
                          <br />
                          <Text type="secondary">
                            {record.createdAt
                              ? format(parseISO(record.createdAt), "MMM d, yyyy h:mm a")
                              : "-"}
                          </Text>
                        </div>
                      ),
                    },
                    ...(record.status === "APPROVED" || record.status === "ACTIVE"
                      ? [
                          {
                            color: "green" as const,
                            children: (
                              <div>
                                <Text strong style={{ color: "#fff" }}>
                                  Approved
                                </Text>
                                <br />
                                <Text type="secondary">
                                  {record.certifiedAt
                                    ? format(parseISO(record.certifiedAt), "MMM d, yyyy h:mm a")
                                    : "-"}
                                </Text>
                                {record.approvedBy && (
                                  <>
                                    <br />
                                    <Text type="secondary">
                                      By: {record.approvedBy?.user?.firstName}{" "}
                                      {record.approvedBy?.user?.lastName}
                                    </Text>
                                  </>
                                )}
                              </div>
                            ),
                          },
                        ]
                      : []),
                    ...(record.status === "REJECTED"
                      ? [
                          {
                            color: "red" as const,
                            children: (
                              <div>
                                <Text strong style={{ color: "#fff" }}>
                                  Rejected
                                </Text>
                                <br />
                                <Text type="secondary">
                                  {record.rejectedAt
                                    ? format(parseISO(record.rejectedAt), "MMM d, yyyy h:mm a")
                                    : "-"}
                                </Text>
                              </div>
                            ),
                          },
                        ]
                      : []),
                    ...(record.status === "REVOKED"
                      ? [
                          {
                            color: "magenta" as const,
                            children: (
                              <div>
                                <Text strong style={{ color: "#fff" }}>
                                  Certification Revoked
                                </Text>
                                <br />
                                <Text type="secondary">
                                  {record.revokedAt
                                    ? format(parseISO(record.revokedAt), "MMM d, yyyy h:mm a")
                                    : "-"}
                                </Text>
                              </div>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </Card>
            </Col>
          </Row>

          {/* Recent Shifts at Target Restaurant */}
          {isCertification && (
            <Card
              title={
                <Space>
                  <CalendarOutlined style={{ color: "#4a90d9" }} />
                  <span>Recent Shifts at {record.targetRestaurant?.name}</span>
                </Space>
              }
              style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
              headStyle={{ borderColor: "#2a2a4e" }}
            >
              {shiftsData?.data && shiftsData.data.length > 0 ? (
                <Table
                  dataSource={shiftsData.data}
                  columns={shiftsColumns}
                  rowKey="id"
                  pagination={false}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No shifts worked at this restaurant yet"
                />
              )}
            </Card>
          )}
        </Space>
      )}
    </Show>
  );
};
