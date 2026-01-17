import { List, useTable } from "@refinedev/antd";
import { useUpdate, useInvalidate } from "@refinedev/core";
import {
  Table,
  Space,
  Tag,
  Avatar,
  Button,
  Typography,
  Popconfirm,
  message,
  Card,
  Empty,
  Select,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  SwapOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import { format, parseISO } from "date-fns";
import { FilterDropdown } from "@refinedev/antd";

const { Text, Title } = Typography;

export const SwapList = () => {
  const { tableProps, filters, setFilters } = useTable({
    syncWithLocation: true,
    filters: {
      initial: [
        {
          field: "status",
          operator: "eq",
          value: "PENDING",
        },
      ],
    },
    sorters: {
      initial: [{ field: "createdAt", order: "desc" }],
    },
  });

  const { mutate: updateSwap, isLoading: isUpdating } = useUpdate();
  const invalidate = useInvalidate();

  const handleApprove = (id: string) => {
    updateSwap(
      {
        resource: "swaps",
        id,
        values: { status: "APPROVED" },
      },
      {
        onSuccess: () => {
          message.success("Swap approved successfully");
          invalidate({ resource: "swaps", invalidates: ["list"] });
          invalidate({ resource: "shifts", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to approve swap");
        },
      }
    );
  };

  const handleReject = (id: string) => {
    updateSwap(
      {
        resource: "swaps",
        id,
        values: { status: "REJECTED" },
      },
      {
        onSuccess: () => {
          message.success("Swap rejected");
          invalidate({ resource: "swaps", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to reject swap");
        },
      }
    );
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: "gold",
      APPROVED: "green",
      REJECTED: "red",
      CANCELLED: "default",
      ACCEPTED: "cyan",
    };
    return colors[status] || "default";
  };

  const getSwapTypeLabel = (swap: any) => {
    if (swap.targetWorker && swap.targetShift) {
      return { label: "Direct Swap", color: "blue" };
    }
    if (swap.targetWorker) {
      return { label: "Direct Transfer", color: "purple" };
    }
    return { label: "Pool Drop", color: "orange" };
  };

  return (
    <List
      title={
        <Space>
          <SwapOutlined style={{ color: "#722ed1" }} />
          <span>Swap Requests</span>
        </Space>
      }
    >
      <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}>
        <Space size="large" wrap>
          <div>
            <Text type="secondary">Status Filter: </Text>
            <Select
              style={{ width: 150 }}
              value={
                (filters?.find((f: any) => f.field === "status") as any)?.value || "PENDING"
              }
              onChange={(value) =>
                setFilters([{ field: "status", operator: "eq", value }])
              }
              options={[
                { label: "Pending", value: "PENDING" },
                { label: "Approved", value: "APPROVED" },
                { label: "Rejected", value: "REJECTED" },
                { label: "All", value: "" },
              ]}
            />
          </div>
          <Text type="secondary">
            Workers can request shift swaps with colleagues or drop shifts to the open pool.
          </Text>
        </Space>
      </Card>

      <Table
        {...tableProps}
        rowKey="id"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No swap requests"
            />
          ),
        }}
      >
        <Table.Column
          dataIndex="type"
          title="Type"
          render={(_, record: any) => {
            const swapType = getSwapTypeLabel(record);
            return <Tag color={swapType.color}>{swapType.label}</Tag>;
          }}
        />
        <Table.Column
          dataIndex="sourceWorker"
          title="From"
          render={(worker: any, record: any) => (
            <Space direction="vertical" size={4}>
              <Space>
                <Avatar size="small" style={{ backgroundColor: "#4a90d9" }}>
                  {worker?.user?.firstName?.[0]}
                </Avatar>
                <Text style={{ color: "#fff" }}>
                  {worker?.user?.firstName} {worker?.user?.lastName}
                </Text>
              </Space>
              {record.sourceShift && (
                <div style={{ paddingLeft: 32 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {record.sourceShift.position}
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {format(parseISO(record.sourceShift.startTime), "MMM d, h:mm a")}
                  </Text>
                </div>
              )}
            </Space>
          )}
        />
        <Table.Column
          title=""
          width={50}
          render={() => (
            <ArrowRightOutlined style={{ color: "#4a90d9", fontSize: 16 }} />
          )}
        />
        <Table.Column
          dataIndex="targetWorker"
          title="To"
          render={(worker: any, record: any) => {
            if (!worker) {
              return (
                <Tag color="orange" style={{ fontSize: 12 }}>
                  Open Pool
                </Tag>
              );
            }
            return (
              <Space direction="vertical" size={4}>
                <Space>
                  <Avatar size="small" style={{ backgroundColor: "#52c41a" }}>
                    {worker?.user?.firstName?.[0]}
                  </Avatar>
                  <Text style={{ color: "#fff" }}>
                    {worker?.user?.firstName} {worker?.user?.lastName}
                  </Text>
                </Space>
                {record.targetShift && (
                  <div style={{ paddingLeft: 32 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {record.targetShift.position}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {format(parseISO(record.targetShift.startTime), "MMM d, h:mm a")}
                    </Text>
                  </div>
                )}
              </Space>
            );
          }}
        />
        <Table.Column
          dataIndex="status"
          title="Status"
          render={(status: string) => (
            <Tag color={getStatusColor(status)}>{status}</Tag>
          )}
        />
        <Table.Column
          dataIndex="reason"
          title="Reason"
          ellipsis
          render={(reason) => (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {reason || "-"}
            </Text>
          )}
        />
        <Table.Column
          dataIndex="createdAt"
          title="Requested"
          render={(value) => (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {format(parseISO(value), "MMM d, h:mm a")}
            </Text>
          )}
          sorter
        />
        <Table.Column
          title="Actions"
          render={(_, record: any) => {
            if (record.status !== "PENDING") {
              return <Text type="secondary">-</Text>;
            }
            return (
              <Space>
                <Popconfirm
                  title="Approve this swap?"
                  description="The shift assignments will be updated."
                  onConfirm={() => handleApprove(record.id)}
                  okText="Approve"
                  okButtonProps={{ type: "primary" }}
                >
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    size="small"
                    loading={isUpdating}
                  >
                    Approve
                  </Button>
                </Popconfirm>
                <Popconfirm
                  title="Reject this swap?"
                  onConfirm={() => handleReject(record.id)}
                  okText="Reject"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    danger
                    icon={<CloseOutlined />}
                    size="small"
                    loading={isUpdating}
                  >
                    Reject
                  </Button>
                </Popconfirm>
              </Space>
            );
          }}
        />
      </Table>
    </List>
  );
};
