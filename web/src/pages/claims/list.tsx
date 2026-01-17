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
} from "antd";
import { CheckOutlined, CloseOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { format, parseISO } from "date-fns";

const { Text } = Typography;

export const ClaimList = () => {
  const { tableProps } = useTable({
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

  const { mutate: updateClaim, isLoading: isUpdating } = useUpdate();
  const invalidate = useInvalidate();

  const handleApprove = (id: string) => {
    updateClaim(
      {
        resource: "claims",
        id,
        values: { status: "APPROVED" },
      },
      {
        onSuccess: () => {
          message.success("Claim approved successfully");
          invalidate({ resource: "claims", invalidates: ["list"] });
          invalidate({ resource: "shifts", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to approve claim");
        },
      }
    );
  };

  const handleReject = (id: string) => {
    updateClaim(
      {
        resource: "claims",
        id,
        values: { status: "REJECTED" },
      },
      {
        onSuccess: () => {
          message.success("Claim rejected");
          invalidate({ resource: "claims", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to reject claim");
        },
      }
    );
  };

  return (
    <List
      title={
        <Space>
          <ClockCircleOutlined style={{ color: "#faad14" }} />
          <span>Pending Claims</span>
        </Space>
      }
    >
      <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 16 }}>
        <Text type="secondary">
          Review and approve shift claims from workers. Higher priority scores indicate better-suited candidates.
        </Text>
      </Card>

      <Table
        {...tableProps}
        rowKey="id"
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No pending claims"
            />
          ),
        }}
      >
        <Table.Column
          dataIndex="worker"
          title="Worker"
          render={(worker: any) => (
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
          )}
        />
        <Table.Column
          dataIndex="shift"
          title="Shift"
          render={(shift: any) => (
            <div>
              <Text strong style={{ color: "#fff" }}>
                {shift?.position}
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {shift && format(parseISO(shift.startTime), "EEE, MMM d")}
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {shift &&
                  `${format(parseISO(shift.startTime), "h:mm a")} - ${format(
                    parseISO(shift.endTime),
                    "h:mm a"
                  )}`}
              </Text>
            </div>
          )}
        />
        <Table.Column
          dataIndex="priorityScore"
          title="Priority"
          render={(score: number, record: any) => (
            <div>
              <Text
                strong
                style={{
                  color: score >= 1000 ? "#52c41a" : score >= 100 ? "#1890ff" : "#faad14",
                  fontSize: 18,
                }}
              >
                {score}
              </Text>
              <br />
              <Space size={4} wrap>
                {record.worker?.isPrimaryTier && (
                  <Tag color="gold" style={{ fontSize: 10 }}>
                    Primary
                  </Tag>
                )}
                {record.isOwnEmployee && (
                  <Tag color="green" style={{ fontSize: 10 }}>
                    Own
                  </Tag>
                )}
              </Space>
            </div>
          )}
          sorter
        />
        <Table.Column
          dataIndex="worker"
          title="Qualifications"
          render={(worker: any) => (
            <Space wrap size={4}>
              {worker?.positions?.map((pos: string) => (
                <Tag key={pos} style={{ fontSize: 10 }}>
                  {pos}
                </Tag>
              ))}
            </Space>
          )}
        />
        <Table.Column
          dataIndex="worker"
          title="Reliability"
          render={(worker: any) => (
            <Text
              style={{
                color:
                  worker?.reliabilityScore >= 0.9
                    ? "#52c41a"
                    : worker?.reliabilityScore >= 0.7
                    ? "#faad14"
                    : "#ff4d4f",
              }}
            >
              {worker?.reliabilityScore
                ? `${Math.round(worker.reliabilityScore * 100)}%`
                : "N/A"}
            </Text>
          )}
        />
        <Table.Column
          dataIndex="createdAt"
          title="Claimed"
          render={(value) => (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {format(parseISO(value), "MMM d, h:mm a")}
            </Text>
          )}
          sorter
        />
        <Table.Column
          title="Actions"
          render={(_, record: any) => (
            <Space>
              <Popconfirm
                title="Approve this claim?"
                description={`${record.worker?.user?.firstName} will be assigned to this shift.`}
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
                title="Reject this claim?"
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
          )}
        />
      </Table>
    </List>
  );
};
