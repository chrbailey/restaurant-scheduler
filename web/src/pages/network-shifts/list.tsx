import { List, useTable, FilterDropdown } from "@refinedev/antd";
import { useGetIdentity } from "@refinedev/core";
import {
  Table,
  Space,
  Tag,
  Typography,
  Card,
  Empty,
  Avatar,
  Tabs,
  Select,
  DatePicker,
  Row,
  Col,
  Statistic,
} from "antd";
import {
  CalendarOutlined,
  TeamOutlined,
  ShopOutlined,
  SwapOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { format, parseISO, startOfWeek, endOfWeek } from "date-fns";

const { Text } = Typography;
const { RangePicker } = DatePicker;

export const NetworkShiftsList = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  // Our workers at other restaurants
  const {
    tableProps: outgoingTableProps,
    tableQuery: outgoingQuery,
  } = useTable({
    resource: "network-shifts",
    filters: {
      permanent: [
        {
          field: "homeRestaurantId",
          operator: "eq",
          value: identity?.restaurantId,
        },
        {
          field: "type",
          operator: "eq",
          value: "OUTGOING",
        },
      ],
    },
    syncWithLocation: false,
    sorters: {
      initial: [{ field: "startTime", order: "asc" }],
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  // Workers from other restaurants at our location
  const {
    tableProps: incomingTableProps,
    tableQuery: incomingQuery,
  } = useTable({
    resource: "network-shifts",
    filters: {
      permanent: [
        {
          field: "workingRestaurantId",
          operator: "eq",
          value: identity?.restaurantId,
        },
        {
          field: "type",
          operator: "eq",
          value: "INCOMING",
        },
      ],
    },
    syncWithLocation: false,
    sorters: {
      initial: [{ field: "startTime", order: "asc" }],
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: "default",
      PUBLISHED_UNASSIGNED: "orange",
      PUBLISHED_OFFERED: "gold",
      PUBLISHED_CLAIMED: "blue",
      CONFIRMED: "green",
      IN_PROGRESS: "cyan",
      COMPLETED: "purple",
      CANCELLED: "red",
      NO_SHOW: "magenta",
    };
    return colors[status] || "default";
  };

  // Calculate stats
  const outgoingShifts = outgoingTableProps.dataSource || [];
  const incomingShifts = incomingTableProps.dataSource || [];

  const outgoingThisWeek = outgoingShifts.filter((s: any) => {
    const shiftDate = parseISO(s.startTime);
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    return shiftDate >= weekStart && shiftDate <= weekEnd;
  }).length;

  const incomingThisWeek = incomingShifts.filter((s: any) => {
    const shiftDate = parseISO(s.startTime);
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    return shiftDate >= weekStart && shiftDate <= weekEnd;
  }).length;

  const outgoingColumns = [
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
      title: "Working At",
      dataIndex: "workingRestaurant",
      render: (restaurant: any) => (
        <Space>
          <ShopOutlined style={{ color: "#52c41a" }} />
          <Text style={{ color: "#fff" }}>{restaurant?.name}</Text>
        </Space>
      ),
      filterDropdown: (props: any) => (
        <FilterDropdown {...props}>
          <Select
            style={{ width: 200 }}
            placeholder="Select restaurant"
            allowClear
          />
        </FilterDropdown>
      ),
    },
    {
      title: "Date",
      dataIndex: "startTime",
      render: (value: string) => (
        <Text style={{ color: "#fff" }}>
          {format(parseISO(value), "EEE, MMM d")}
        </Text>
      ),
      sorter: true,
    },
    {
      title: "Time",
      dataIndex: "startTime",
      render: (value: string, record: any) => (
        <Text type="secondary">
          {format(parseISO(value), "h:mm a")} -{" "}
          {format(parseISO(record.endTime), "h:mm a")}
        </Text>
      ),
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (pos: string) => (
        <Tag color="blue">{pos?.replace(/_/g, " ")}</Tag>
      ),
      filterDropdown: (props: any) => (
        <FilterDropdown {...props}>
          <Select
            style={{ width: 150 }}
            placeholder="Position"
            options={[
              { label: "Server", value: "SERVER" },
              { label: "Host", value: "HOST" },
              { label: "Bartender", value: "BARTENDER" },
              { label: "Line Cook", value: "LINE_COOK" },
              { label: "Prep Cook", value: "PREP_COOK" },
              { label: "Dishwasher", value: "DISHWASHER" },
            ]}
          />
        </FilterDropdown>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {status?.replace(/_/g, " ")}
        </Tag>
      ),
      filterDropdown: (props: any) => (
        <FilterDropdown {...props}>
          <Select
            style={{ width: 150 }}
            placeholder="Status"
            options={[
              { label: "Confirmed", value: "CONFIRMED" },
              { label: "In Progress", value: "IN_PROGRESS" },
              { label: "Completed", value: "COMPLETED" },
              { label: "Cancelled", value: "CANCELLED" },
            ]}
          />
        </FilterDropdown>
      ),
    },
  ];

  const incomingColumns = [
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
      title: "From Restaurant",
      dataIndex: "homeRestaurant",
      render: (restaurant: any) => (
        <Space>
          <ShopOutlined style={{ color: "#4a90d9" }} />
          <Text style={{ color: "#fff" }}>{restaurant?.name}</Text>
        </Space>
      ),
      filterDropdown: (props: any) => (
        <FilterDropdown {...props}>
          <Select
            style={{ width: 200 }}
            placeholder="Select restaurant"
            allowClear
          />
        </FilterDropdown>
      ),
    },
    {
      title: "Date",
      dataIndex: "startTime",
      render: (value: string) => (
        <Text style={{ color: "#fff" }}>
          {format(parseISO(value), "EEE, MMM d")}
        </Text>
      ),
      sorter: true,
    },
    {
      title: "Time",
      dataIndex: "startTime",
      render: (value: string, record: any) => (
        <Text type="secondary">
          {format(parseISO(value), "h:mm a")} -{" "}
          {format(parseISO(record.endTime), "h:mm a")}
        </Text>
      ),
    },
    {
      title: "Position",
      dataIndex: "position",
      render: (pos: string) => (
        <Tag color="green">{pos?.replace(/_/g, " ")}</Tag>
      ),
      filterDropdown: (props: any) => (
        <FilterDropdown {...props}>
          <Select
            style={{ width: 150 }}
            placeholder="Position"
            options={[
              { label: "Server", value: "SERVER" },
              { label: "Host", value: "HOST" },
              { label: "Bartender", value: "BARTENDER" },
              { label: "Line Cook", value: "LINE_COOK" },
              { label: "Prep Cook", value: "PREP_COOK" },
              { label: "Dishwasher", value: "DISHWASHER" },
            ]}
          />
        </FilterDropdown>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {status?.replace(/_/g, " ")}
        </Tag>
      ),
      filterDropdown: (props: any) => (
        <FilterDropdown {...props}>
          <Select
            style={{ width: 150 }}
            placeholder="Status"
            options={[
              { label: "Confirmed", value: "CONFIRMED" },
              { label: "In Progress", value: "IN_PROGRESS" },
              { label: "Completed", value: "COMPLETED" },
              { label: "Cancelled", value: "CANCELLED" },
            ]}
          />
        </FilterDropdown>
      ),
    },
    {
      title: "Rating",
      dataIndex: "worker",
      render: (worker: any) => (
        <Text
          style={{
            color: worker?.reputationScore >= 4 ? "#52c41a" : "#faad14",
          }}
        >
          {worker?.reputationScore?.toFixed(1) || "N/A"}
        </Text>
      ),
    },
  ];

  const tabItems = [
    {
      key: "outgoing",
      label: (
        <Space>
          <ArrowRightOutlined />
          <span>Our Workers Elsewhere</span>
          {outgoingThisWeek > 0 && (
            <Tag color="blue">{outgoingThisWeek} this week</Tag>
          )}
        </Space>
      ),
      children: (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            Your workers who have claimed or are working shifts at other network
            restaurants.
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
                  description="No workers scheduled at other restaurants"
                />
              ),
            }}
          />
        </Card>
      ),
    },
    {
      key: "incoming",
      label: (
        <Space>
          <ArrowLeftOutlined />
          <span>Network Workers Here</span>
          {incomingThisWeek > 0 && (
            <Tag color="green">{incomingThisWeek} this week</Tag>
          )}
        </Space>
      ),
      children: (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
            Workers from other network restaurants scheduled to work at{" "}
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
                  description="No network workers scheduled at your restaurant"
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
          <GlobalOutlined style={{ color: "#4a90d9" }} />
          <span>Network Shift Activity</span>
        </Space>
      }
    >
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
      >
        <Text type="secondary">
          Track shifts involving workers from different restaurants in your network.
          See where your workers are helping out, and who's coming to help you.
        </Text>
      </Card>

      {/* Stats Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Our Workers Elsewhere</Text>}
              value={outgoingShifts.length}
              prefix={<ArrowRightOutlined style={{ color: "#4a90d9" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">Network Workers Here</Text>}
              value={incomingShifts.length}
              prefix={<ArrowLeftOutlined style={{ color: "#52c41a" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">This Week (Outgoing)</Text>}
              value={outgoingThisWeek}
              prefix={<CalendarOutlined style={{ color: "#faad14" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Statistic
              title={<Text type="secondary">This Week (Incoming)</Text>}
              value={incomingThisWeek}
              prefix={<TeamOutlined style={{ color: "#722ed1" }} />}
              valueStyle={{ color: "#fff" }}
            />
          </Card>
        </Col>
      </Row>

      <Tabs items={tabItems} defaultActiveKey="outgoing" />
    </List>
  );
};
