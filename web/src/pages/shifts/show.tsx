import { Show } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import { Typography, Tag, Descriptions, Timeline, Card, Space, Avatar, Divider } from "antd";
import {
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { format, parseISO, differenceInHours, differenceInMinutes } from "date-fns";

const { Title, Text } = Typography;

export const ShiftShow = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;
  const shift = data?.data as any;

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

  const calculateDuration = (start: string, end: string) => {
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    const hours = differenceInHours(endDate, startDate);
    const minutes = differenceInMinutes(endDate, startDate) % 60;

    if (minutes === 0) {
      return `${hours} hours`;
    }
    return `${hours}h ${minutes}m`;
  };

  return (
    <Show isLoading={isLoading}>
      {shift && (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <Title level={3} style={{ margin: 0, color: "#fff" }}>
                {shift.position} Shift
              </Title>
              <Text type="secondary">
                {format(parseISO(shift.startTime), "EEEE, MMMM d, yyyy")}
              </Text>
            </div>
            <Tag color={getStatusColor(shift.status)} style={{ fontSize: 14, padding: "4px 12px" }}>
              {shift.status.replace(/_/g, " ")}
            </Tag>
          </div>

          {/* Main Details */}
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ color: "#888" }}>
              <Descriptions.Item label="Date">
                {format(parseISO(shift.startTime), "MMM d, yyyy")}
              </Descriptions.Item>
              <Descriptions.Item label="Time">
                {format(parseISO(shift.startTime), "h:mm a")} -{" "}
                {format(parseISO(shift.endTime), "h:mm a")}
              </Descriptions.Item>
              <Descriptions.Item label="Duration">
                {calculateDuration(shift.startTime, shift.endTime)}
              </Descriptions.Item>
              <Descriptions.Item label="Position">{shift.position}</Descriptions.Item>
              <Descriptions.Item label="Required Workers">{shift.requiredCount || 1}</Descriptions.Item>
              <Descriptions.Item label="Created">
                {format(parseISO(shift.createdAt), "MMM d, h:mm a")}
              </Descriptions.Item>
            </Descriptions>

            {shift.notes && (
              <>
                <Divider style={{ borderColor: "#2a2a4e" }} />
                <div>
                  <Text type="secondary">Notes</Text>
                  <p style={{ color: "#fff", marginTop: 8 }}>{shift.notes}</p>
                </div>
              </>
            )}
          </Card>

          {/* Assigned Worker */}
          <Card
            title={
              <Space>
                <UserOutlined style={{ color: "#4a90d9" }} />
                <span>Assigned Worker</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            {shift.assignedWorker ? (
              <Space size="large">
                <Avatar size={64} style={{ backgroundColor: "#4a90d9" }}>
                  {shift.assignedWorker.user.firstName?.[0]}
                  {shift.assignedWorker.user.lastName?.[0]}
                </Avatar>
                <div>
                  <Title level={4} style={{ margin: 0, color: "#fff" }}>
                    {shift.assignedWorker.user.firstName} {shift.assignedWorker.user.lastName}
                  </Title>
                  <Text type="secondary">{shift.assignedWorker.user.phone}</Text>
                  <br />
                  <Space style={{ marginTop: 8 }}>
                    {shift.assignedWorker.positions?.map((pos: string) => (
                      <Tag key={pos}>{pos}</Tag>
                    ))}
                  </Space>
                </div>
              </Space>
            ) : (
              <Text type="secondary">No worker assigned yet</Text>
            )}
          </Card>

          {/* Status History */}
          {shift.statusHistory && shift.statusHistory.length > 0 && (
            <Card
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: "#4a90d9" }} />
                  <span>Status History</span>
                </Space>
              }
              style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
              headStyle={{ borderColor: "#2a2a4e" }}
            >
              <Timeline
                items={shift.statusHistory.map((history: any) => ({
                  color: getStatusColor(history.toStatus),
                  children: (
                    <div>
                      <Text strong style={{ color: "#fff" }}>
                        {history.fromStatus.replace(/_/g, " ")} →{" "}
                        {history.toStatus.replace(/_/g, " ")}
                      </Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {format(parseISO(history.createdAt), "MMM d, h:mm a")}
                        {history.changedBy && ` by ${history.changedBy}`}
                      </Text>
                      {history.reason && (
                        <p style={{ color: "#888", margin: "4px 0 0" }}>{history.reason}</p>
                      )}
                    </div>
                  ),
                }))}
              />
            </Card>
          )}

          {/* Claims */}
          {shift.claims && shift.claims.length > 0 && (
            <Card
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                  <span>Claims ({shift.claims.length})</span>
                </Space>
              }
              style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
              headStyle={{ borderColor: "#2a2a4e" }}
            >
              {shift.claims.map((claim: any) => (
                <div
                  key={claim.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: "1px solid #2a2a4e",
                  }}
                >
                  <Space>
                    <Avatar style={{ backgroundColor: "#4a90d9" }}>
                      {claim.worker?.user?.firstName?.[0]}
                    </Avatar>
                    <div>
                      <Text style={{ color: "#fff" }}>
                        {claim.worker?.user?.firstName} {claim.worker?.user?.lastName}
                      </Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        Priority Score: {claim.priorityScore}
                      </Text>
                    </div>
                  </Space>
                  <Tag
                    color={
                      claim.status === "APPROVED"
                        ? "green"
                        : claim.status === "REJECTED"
                        ? "red"
                        : "gold"
                    }
                  >
                    {claim.status}
                  </Tag>
                </div>
              ))}
            </Card>
          )}
        </Space>
      )}
    </Show>
  );
};
