import { List, useTable, ShowButton, FilterDropdown } from "@refinedev/antd";
import { useUpdate, useInvalidate, useGetIdentity } from "@refinedev/core";
import {
  Table,
  Space,
  Tag,
  Button,
  Typography,
  Card,
  Empty,
  Popconfirm,
  message,
  Avatar,
  Tabs,
  Select,
  Badge,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  SwapOutlined,
  UserOutlined,
  ShopOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { format, parseISO } from "date-fns";

const { Text } = Typography;

export const CrossTrainingList = () => {
  const invalidate = useInvalidate();
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  // Incoming requests - workers from other restaurants wanting to work here
  const {
    tableProps: incomingTableProps,
    tableQuery: incomingQuery,
  } = useTable({
    resource: "cross-training-requests",
    filters: {
      permanent: [
        {
          field: "targetRestaurantId",
          operator: "eq",
          value: identity?.restaurantId,
        },
      ],
    },
    syncWithLocation: false,
    sorters: {
      initial: [{ field: "createdAt", order: "desc" }],
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Outgoing - our workers certified at other restaurants
  const {
    tableProps: outgoingTableProps,
    tableQuery: outgoingQuery,
  } = useTable({
    resource: "cross-training-certifications",
    filters: {
      permanent: [
        {
          field: "homeRestaurantId",
          operator: "eq",
          value: identity?.restaurantId,
        },
      ],
    },
    syncWithLocation: false,
    sorters: {
      initial: [{ field: "certifiedAt", order: "desc" }],
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const { mutate: updateRequest, isLoading: isUpdating } = useUpdate();

  const handleApprove = (id: string, workerName: string) => {
    updateRequest(
      {
        resource: "cross-training-requests",
        id,
        values: { status: "APPROVED" },
      },
      {
        onSuccess: () => {
          message.success(`${workerName} approved for cross-training`);
          invalidate({ resource: "cross-training-requests", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to approve request");
        },
      }
    );
  };

  const handleReject = (id: string) => {
    updateRequest(
      {
        resource: "cross-training-requests",
        id,
        values: { status: "REJECTED" },
      },
      {
        onSuccess: () => {
          message.success("Request rejected");
          invalidate({ resource: "cross-training-requests", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to reject request");
        },
      }
    );
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "gold",
      APPROVED: "green",
      REJECTED: "red",
      EXPIRED: "default",
      REVOKED: "magenta",
      ACTIVE: "green",
    };
    return colors[status] || "default";
  };

  const pendingCount = incomingTableProps.dataSource?.filter(
    (r: any) => r.status === "PENDING"
  ).length || 0;

  const incomingColumns = [
    {
      title: "Worker",
      dataIndex: "worker",
      render: (worker: any) => (
        <Space>
          <Avatar style={{ backgroundColor: "#4a90d9" }}>
            {worker?.user?.firstName?.[0]}
            {worker?.user?.lastName?.[0]}
          </Avatar>
          <div>
            <Text strong style={{ color: "#fff" }}>
              {worker?.user?.firstName} {worker?.user?.lastName}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {worker?.user?.phone}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "From Restaurant",
      dataIndex: "homeRestaurant",
      render: (restaurant: any) => (
        <Space>
          <ShopOutlined style={{ color: "#4a90d9" }} />
          <Text style={{ color: "#fff" }}>{restaurant?.name}</Text>
        </Space>
      ),
    },
    {
      title: "Requested Positions",
      dataIndex: "requestedPositions",
      render: (positions: string[]) => (
        <Space wrap size={4}>
          {positions?.map((pos: string) => (
            <Tag key={pos} color="blue">
              {pos.replace(/_/g, " ")}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Worker Rating",
      dataIndex: "worker",
      render: (worker: any) => (
        <div>
          <Text
            style={{
              color: worker?.reputationScore >= 4 ? "#52c41a" : "#faad14",
            }}
          >
            {worker?.reputationScore?.toFixed(1) || "N/A"}
          </Text>
          <Text type="secondary"> / 5</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {Math.round((worker?.reliabilityScore || 0) * 100)}% reliable
          </Text>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
      filterDropdown: (props: any) => (
        <FilterDropdown {...props}>
          <Select
            style={{ width: 150 }}
            placeholder="Select status"
            options={[
              { label: "Pending", value: "PENDING" },
              { label: "Approved", value: "APPROVED" },
              { label: "Rejected", value: "REJECTED" },
            ]}
          />
        </FilterDropdown>
      ),
    },
    {
      title: "Requested",
      dataIndex: "createdAt",
      render: (value: string) => (
        <Text type="secondary">
          {value ? format(parseISO(value), "MMM d, yyyy") : "-"}
        </Text>
      ),
      sorter: true,
    },
    {
      title: "Actions",
      render: (_: any, record: any) => (
        <Space>
          <ShowButton
            hideText
            size="small"
            recordItemId={record.id}
            icon={<EyeOutlined />}
          />
          {record.status === "PENDING" && (
            <>
              <Popconfirm
                title="Approve cross-training?"
                description={`${record.worker?.user?.firstName} will be able to claim shifts here.`}
                onConfirm={() =>
                  handleApprove(
                    record.id,
                    `${record.worker?.user?.firstName} ${record.worker?.user?.lastName}`
                  )
                }
                okText="Approve"
                okButtonProps={{ type: "primary" }}
              >
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={isUpdating}
                >
                  Approve
                </Button>
              </Popconfirm>
              <Popconfirm
                title="Reject this request?"
                onConfirm={() => handleReject(record.id)}
                okText="Reject"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  size="small"
                  icon={<CloseOutlined />}
                  loading={isUpdating}
                >
                  Reject
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  const outgoingColumns = [
    {
      title: "Worker",
      dataIndex: "worker",
      render: (worker: any) => (
        <Space>
          <Avatar style={{ backgroundColor: "#52c41a" }}>
            {worker?.user?.firstName?.[0]}
            {worker?.user?.lastName?.[0]}
          </Avatar>
          <div>
            <Text strong style={{ color: "#fff" }}>
              {worker?.user?.firstName} {worker?.user?.lastName}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {worker?.user?.phone}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Certified At",
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
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      ),
    },
    {
      title: "Certified Date",
      dataIndex: "certifiedAt",
      render: (value: string) => (
        <Text type="secondary">
          {value ? format(parseISO(value), "MMM d, yyyy") : "-"}
        </Text>
      ),
      sorter: true,
    },
    {
      title: "Shifts Worked",
      dataIndex: "shiftsWorked",
      render: (count: number) => (
        <Text style={{ color: "#fff" }}>{count || 0}</Text>
      ),
    },
    {
      title: "Actions",
      render: (_: any, record: any) => (
        <ShowButton
          hideText
          size="small"
          recordItemId={record.id}
          icon={<EyeOutlined />}
        />
      ),
    },
  ];

  const tabItems = [
    {
      key: "incoming",
      label: (
        <Space>
          <ArrowLeftOutlined />
          <span>Incoming Requests</span>
          {pendingCount > 0 && <Badge count={pendingCount} />}
        </Space>
      ),
      children: (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            Workers from other network restaurants requesting to work at{" "}
            {identity?.restaurantName || "your restaurant"}.
          </Text>
          <Table
            {...incomingTableProps}
            columns={incomingColumns}
            rowKey="id"
            loading={incomingQuery.isLoading}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No cross-training requests"
                />
              ),
            }}
          />
        </Card>
      ),
    },
    {
      key: "outgoing",
      label: (
        <Space>
          <ArrowRightOutlined />
          <span>Our Workers at Other Restaurants</span>
        </Space>
      ),
      children: (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            Your workers who are certified to work at other network restaurants.
          </Text>
          <Table
            {...outgoingTableProps}
            columns={outgoingColumns}
            rowKey="id"
            loading={outgoingQuery.isLoading}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No workers cross-trained at other restaurants"
                />
              ),
            }}
          />
        </Card>
      ),
    },
  ];

  return (
    <List
      title={
        <Space>
          <SwapOutlined style={{ color: "#4a90d9" }} />
          <span>Cross-Training Management</span>
        </Space>
      }
    >
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
      >
        <Text type="secondary">
          Manage workers who want to work across multiple restaurants in your network.
          Approve incoming requests to allow workers from partner restaurants to claim
          shifts at your location.
        </Text>
      </Card>

      <Tabs items={tabItems} defaultActiveKey="incoming" />
    </List>
  );
};
