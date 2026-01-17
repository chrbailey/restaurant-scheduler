import { List, useTable, ShowButton, FilterDropdown } from "@refinedev/antd";
import { Table, Space, Tag, Avatar, Select, Rate, Typography, Progress } from "antd";
import { UserOutlined, StarFilled } from "@ant-design/icons";

const { Text } = Typography;

export const WorkerList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  const positionOptions = [
    { label: "Server", value: "SERVER" },
    { label: "Host", value: "HOST" },
    { label: "Bartender", value: "BARTENDER" },
    { label: "Line Cook", value: "LINE_COOK" },
    { label: "Prep Cook", value: "PREP_COOK" },
    { label: "Dishwasher", value: "DISHWASHER" },
    { label: "Manager", value: "MANAGER" },
    { label: "Delivery Pack", value: "DELIVERY_PACK" },
  ];

  const roleOptions = [
    { label: "Worker", value: "WORKER" },
    { label: "Lead", value: "LEAD" },
    { label: "Manager", value: "MANAGER" },
    { label: "Admin", value: "ADMIN" },
  ];

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column
          dataIndex="user"
          title="Worker"
          render={(user: any) => (
            <Space>
              <Avatar style={{ backgroundColor: "#4a90d9" }}>
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </Avatar>
              <div>
                <Text strong style={{ color: "#fff" }}>
                  {user?.firstName} {user?.lastName}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {user?.phone}
                </Text>
              </div>
            </Space>
          )}
        />
        <Table.Column
          dataIndex="positions"
          title="Positions"
          render={(positions: string[]) => (
            <Space wrap>
              {positions?.map((pos) => (
                <Tag key={pos} color="blue">
                  {pos.replace(/_/g, " ")}
                </Tag>
              ))}
            </Space>
          )}
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select
                style={{ width: 200 }}
                placeholder="Filter by position"
                options={positionOptions}
                mode="multiple"
              />
            </FilterDropdown>
          )}
        />
        <Table.Column
          dataIndex="role"
          title="Role"
          render={(role: string) => {
            const colors: Record<string, string> = {
              WORKER: "default",
              LEAD: "blue",
              MANAGER: "purple",
              ADMIN: "gold",
            };
            return <Tag color={colors[role] || "default"}>{role}</Tag>;
          }}
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select
                style={{ width: 200 }}
                placeholder="Filter by role"
                options={roleOptions}
              />
            </FilterDropdown>
          )}
        />
        <Table.Column
          dataIndex="reputationScore"
          title="Rating"
          render={(score: number) => (
            <Space>
              <Rate
                disabled
                value={score || 0}
                style={{ fontSize: 14 }}
                character={<StarFilled />}
              />
              <Text type="secondary">({score?.toFixed(1) || "N/A"})</Text>
            </Space>
          )}
          sorter
        />
        <Table.Column
          dataIndex="reliabilityScore"
          title="Reliability"
          render={(score: number) => (
            <div style={{ width: 100 }}>
              <Progress
                percent={Math.round((score || 0) * 100)}
                size="small"
                status={score >= 0.9 ? "success" : score >= 0.7 ? "normal" : "exception"}
                format={(percent) => `${percent}%`}
              />
            </div>
          )}
          sorter
        />
        <Table.Column
          dataIndex="shiftsCompleted"
          title="Shifts"
          render={(count: number) => count || 0}
          sorter
        />
        <Table.Column
          dataIndex="isActive"
          title="Status"
          render={(isActive: boolean) => (
            <Tag color={isActive ? "green" : "default"}>
              {isActive ? "Active" : "Inactive"}
            </Tag>
          )}
        />
        <Table.Column
          title="Actions"
          render={(_, record: any) => (
            <ShowButton hideText size="small" recordItemId={record.id} />
          )}
        />
      </Table>
    </List>
  );
};
