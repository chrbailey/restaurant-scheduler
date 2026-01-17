import { List, useTable, ShowButton } from "@refinedev/antd";
import { useCreate, useDelete, useGetIdentity, useInvalidate } from "@refinedev/core";
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
  Tooltip,
} from "antd";
import {
  PlusOutlined,
  GlobalOutlined,
  TeamOutlined,
  CrownOutlined,
  LogoutOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router";
import { format, parseISO } from "date-fns";

const { Text, Title } = Typography;

export const NetworkList = () => {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  const { tableProps, tableQuery } = useTable({
    resource: "networks",
    syncWithLocation: true,
    sorters: {
      initial: [{ field: "joinedAt", order: "desc" }],
    },
  });

  const { mutate: leaveNetwork, isLoading: isLeaving } = useDelete();

  const handleLeaveNetwork = (networkId: string, networkName: string) => {
    leaveNetwork(
      {
        resource: "network-memberships",
        id: `${networkId}/${identity?.restaurantId}`,
      },
      {
        onSuccess: () => {
          message.success(`Left ${networkName} successfully`);
          invalidate({ resource: "networks", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to leave network");
        },
      }
    );
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      OWNER: "gold",
      ADMIN: "purple",
      MEMBER: "blue",
    };
    return colors[role] || "default";
  };

  const getRoleIcon = (role: string) => {
    if (role === "OWNER") return <CrownOutlined />;
    if (role === "ADMIN") return <TeamOutlined />;
    return null;
  };

  const networks = tableProps.dataSource || [];
  const hasNetworks = networks.length > 0;

  return (
    <List
      title={
        <Space>
          <GlobalOutlined style={{ color: "#4a90d9" }} />
          <span>Restaurant Networks</span>
        </Space>
      }
      headerButtons={() => (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate("/networks/create")}
          disabled={hasNetworks}
        >
          Create Network
        </Button>
      )}
    >
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}
      >
        <Text type="secondary">
          Networks allow restaurants to share workers and fill shifts across locations.
          Join or create a network to access cross-restaurant scheduling features.
        </Text>
      </Card>

      {!hasNetworks && !tableQuery.isLoading ? (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical" align="center">
                <Text type="secondary">Not part of any network</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Create a new network or wait for an invitation from another restaurant
                </Text>
              </Space>
            }
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate("/networks/create")}
            >
              Create Your Network
            </Button>
          </Empty>
        </Card>
      ) : (
        <Table
          {...tableProps}
          rowKey="id"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No networks found"
              />
            ),
          }}
        >
          <Table.Column
            dataIndex="name"
            title="Network"
            render={(name: string, record: any) => (
              <Space>
                <Avatar
                  style={{ backgroundColor: "#4a90d9" }}
                  icon={<GlobalOutlined />}
                />
                <div>
                  <Text strong style={{ color: "#fff" }}>
                    {name}
                  </Text>
                  {record.description && (
                    <>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.description}
                      </Text>
                    </>
                  )}
                </div>
              </Space>
            )}
          />
          <Table.Column
            dataIndex="memberCount"
            title="Members"
            render={(count: number) => (
              <Space>
                <TeamOutlined style={{ color: "#52c41a" }} />
                <Text style={{ color: "#fff" }}>{count || 0} restaurants</Text>
              </Space>
            )}
          />
          <Table.Column
            dataIndex="role"
            title="Your Role"
            render={(role: string) => (
              <Tag color={getRoleColor(role)} icon={getRoleIcon(role)}>
                {role}
              </Tag>
            )}
          />
          <Table.Column
            dataIndex="joinedAt"
            title="Joined"
            render={(value: string) => (
              <Text type="secondary">
                {value ? format(parseISO(value), "MMM d, yyyy") : "-"}
              </Text>
            )}
            sorter
          />
          <Table.Column
            dataIndex="activeWorkersShared"
            title="Shared Workers"
            render={(count: number) => (
              <Tooltip title="Workers cross-trained at other network restaurants">
                <Text style={{ color: "#fff" }}>{count || 0}</Text>
              </Tooltip>
            )}
          />
          <Table.Column
            title="Actions"
            render={(_, record: any) => (
              <Space>
                <ShowButton
                  hideText
                  size="small"
                  recordItemId={record.id}
                  icon={<EyeOutlined />}
                />
                {record.role !== "OWNER" && (
                  <Popconfirm
                    title="Leave this network?"
                    description={
                      <div style={{ maxWidth: 300 }}>
                        <Text type="secondary">
                          Your workers will lose cross-training certifications at other
                          restaurants in this network.
                        </Text>
                      </div>
                    }
                    onConfirm={() => handleLeaveNetwork(record.id, record.name)}
                    okText="Leave"
                    okButtonProps={{ danger: true }}
                    cancelText="Cancel"
                  >
                    <Button
                      danger
                      size="small"
                      icon={<LogoutOutlined />}
                      loading={isLeaving}
                    >
                      Leave
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            )}
          />
        </Table>
      )}
    </List>
  );
};
