import { useState, useEffect } from "react";
import { useCustomMutation } from "@refinedev/core";
import {
  Card,
  Space,
  Tag,
  Button,
  Typography,
  Empty,
  Badge,
  Collapse,
  List,
  message,
  Tooltip,
} from "antd";
import {
  ShoppingCartOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  CarOutlined,
  FireOutlined,
  ExclamationCircleOutlined,
  ExpandOutlined,
} from "@ant-design/icons";
import { format, parseISO, differenceInMinutes, differenceInSeconds } from "date-fns";

const { Text } = Typography;

export interface Order {
  id: string;
  platform: string;
  platformOrderId: string;
  status: "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "PICKED_UP" | "CANCELLED";
  createdAt: string;
  acceptedAt?: string;
  items: {
    name: string;
    quantity: number;
    notes?: string;
  }[];
  total: number;
  customerName?: string;
  estimatedPrepTime?: number;
  driverEta?: number;
}

interface LiveOrderFeedProps {
  orders: Order[];
  restaurantId: string;
}

const getPlatformColor = (platform: string) => {
  const colors: Record<string, string> = {
    doordash: "#ff3008",
    ubereats: "#5fb709",
    grubhub: "#f63440",
    postmates: "#ffbc0d",
  };
  return colors[platform.toLowerCase()] || "#4a90d9";
};

const getStatusConfig = (status: string) => {
  const configs: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    NEW: { color: "gold", icon: <ExclamationCircleOutlined />, label: "New Order" },
    ACCEPTED: { color: "blue", icon: <CheckOutlined />, label: "Accepted" },
    PREPARING: { color: "cyan", icon: <FireOutlined />, label: "Preparing" },
    READY: { color: "green", icon: <ShoppingCartOutlined />, label: "Ready" },
    PICKED_UP: { color: "purple", icon: <CarOutlined />, label: "Picked Up" },
    CANCELLED: { color: "red", icon: <ExclamationCircleOutlined />, label: "Cancelled" },
  };
  return configs[status] || { color: "default", icon: null, label: status };
};

const OrderTimer = ({ createdAt, status }: { createdAt: string; status: string }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => {
      setElapsed(differenceInSeconds(new Date(), parseISO(createdAt)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  let color = "#52c41a";
  if (status === "NEW" && minutes >= 2) color = "#ef4444";
  else if (minutes >= 15) color = "#faad14";

  return (
    <Text style={{ color, fontFamily: "monospace" }}>
      {minutes.toString().padStart(2, "0")}:{seconds.toString().padStart(2, "0")}
    </Text>
  );
};

const OrderCard = ({
  order,
  restaurantId,
  onStatusUpdate,
}: {
  order: Order;
  restaurantId: string;
  onStatusUpdate: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const { mutate: updateStatus, isLoading } = useCustomMutation();

  const handleStatusUpdate = (newStatus: string) => {
    updateStatus(
      {
        url: `/ghost-kitchen/${restaurantId}/orders/${order.id}/status`,
        method: "put",
        values: { status: newStatus },
      },
      {
        onSuccess: () => {
          message.success(`Order marked as ${newStatus.toLowerCase()}`);
          onStatusUpdate();
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to update order");
        },
      }
    );
  };

  const statusConfig = getStatusConfig(order.status);
  const platformColor = getPlatformColor(order.platform);

  const getNextActions = () => {
    switch (order.status) {
      case "NEW":
        return [
          { label: "Accept", status: "ACCEPTED", type: "primary" as const },
          { label: "Decline", status: "CANCELLED", type: "default" as const, danger: true },
        ];
      case "ACCEPTED":
        return [{ label: "Start Preparing", status: "PREPARING", type: "primary" as const }];
      case "PREPARING":
        return [{ label: "Mark Ready", status: "READY", type: "primary" as const }];
      case "READY":
        return [{ label: "Picked Up", status: "PICKED_UP", type: "primary" as const }];
      default:
        return [];
    }
  };

  const actions = getNextActions();

  return (
    <Card
      size="small"
      style={{
        backgroundColor: order.status === "NEW" ? "#2a2a1a" : "#16213e",
        borderColor: order.status === "NEW" ? "#faad14" : "#2a2a4e",
        marginBottom: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Space>
          <Badge color={platformColor} />
          <Text strong style={{ color: "#fff" }}>
            {order.platform}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            #{order.platformOrderId}
          </Text>
        </Space>
        <Space>
          <ClockCircleOutlined style={{ color: "#666" }} />
          <OrderTimer createdAt={order.createdAt} status={order.status} />
        </Space>
      </div>

      {/* Status and Total */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          margin: "8px 0",
        }}
      >
        <Tag color={statusConfig.color} icon={statusConfig.icon}>
          {statusConfig.label}
        </Tag>
        <Text strong style={{ color: "#52c41a", fontSize: 16 }}>
          ${order.total.toFixed(2)}
        </Text>
      </div>

      {/* Items Preview */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", marginBottom: 8 }}
      >
        <Space>
          <ExpandOutlined style={{ color: "#666" }} />
          <Text type="secondary">
            {order.items.length} item{order.items.length !== 1 ? "s" : ""}
            {!expanded && (
              <span style={{ marginLeft: 8 }}>
                ({order.items.slice(0, 2).map((i) => i.name).join(", ")}
                {order.items.length > 2 ? "..." : ""})
              </span>
            )}
          </Text>
        </Space>
      </div>

      {/* Expanded Items */}
      {expanded && (
        <div
          style={{
            backgroundColor: "#1a1a2e",
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
          }}
        >
          {order.items.map((item, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: i < order.items.length - 1 ? "1px solid #2a2a4e" : "none",
              }}
            >
              <Space>
                <Text style={{ color: "#4a90d9" }}>{item.quantity}x</Text>
                <Text style={{ color: "#fff" }}>{item.name}</Text>
              </Space>
              {item.notes && (
                <Tooltip title={item.notes}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Notes
                  </Text>
                </Tooltip>
              )}
            </div>
          ))}
          {order.customerName && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #2a2a4e" }}>
              <Text type="secondary">Customer: {order.customerName}</Text>
            </div>
          )}
          {order.estimatedPrepTime && (
            <div>
              <Text type="secondary">Est. Prep: {order.estimatedPrepTime} min</Text>
            </div>
          )}
          {order.driverEta && (
            <div>
              <Text type="secondary">Driver ETA: {order.driverEta} min</Text>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <Space style={{ marginTop: 8 }}>
          {actions.map((action) => (
            <Button
              key={action.status}
              type={action.type}
              danger={action.danger}
              size="small"
              loading={isLoading}
              onClick={() => handleStatusUpdate(action.status)}
            >
              {action.label}
            </Button>
          ))}
        </Space>
      )}
    </Card>
  );
};

export const LiveOrderFeed = ({ orders, restaurantId }: LiveOrderFeedProps) => {
  // Sort orders: NEW first, then by creation time (newest first)
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.status === "NEW" && b.status !== "NEW") return -1;
    if (a.status !== "NEW" && b.status === "NEW") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Group orders by status
  const newOrders = sortedOrders.filter((o) => o.status === "NEW");
  const activeOrders = sortedOrders.filter((o) =>
    ["ACCEPTED", "PREPARING", "READY"].includes(o.status)
  );
  const completedOrders = sortedOrders.filter((o) =>
    ["PICKED_UP", "CANCELLED"].includes(o.status)
  );

  const handleStatusUpdate = () => {
    // The socket will handle the real-time update
    // This is just for UI feedback
  };

  if (orders.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space direction="vertical" align="center">
            <Text type="secondary">No active orders</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              New orders will appear here in real-time
            </Text>
          </Space>
        }
      />
    );
  }

  return (
    <div>
      {/* New Orders - highlighted */}
      {newOrders.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Badge status="warning" />
            <Text strong style={{ color: "#faad14", marginLeft: 8 }}>
              New Orders ({newOrders.length})
            </Text>
          </div>
          {newOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              restaurantId={restaurantId}
              onStatusUpdate={handleStatusUpdate}
            />
          ))}
        </div>
      )}

      {/* Active Orders */}
      {activeOrders.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Badge status="processing" />
            <Text strong style={{ color: "#4a90d9", marginLeft: 8 }}>
              In Progress ({activeOrders.length})
            </Text>
          </div>
          {activeOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              restaurantId={restaurantId}
              onStatusUpdate={handleStatusUpdate}
            />
          ))}
        </div>
      )}

      {/* Completed Orders (last 5) */}
      {completedOrders.length > 0 && (
        <Collapse
          ghost
          items={[
            {
              key: "completed",
              label: (
                <Text type="secondary">
                  Completed ({completedOrders.length})
                </Text>
              ),
              children: (
                <div>
                  {completedOrders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#16213e",
                        borderRadius: 4,
                        marginBottom: 4,
                        opacity: 0.7,
                      }}
                    >
                      <Space style={{ width: "100%", justifyContent: "space-between" }}>
                        <Space>
                          <Badge color={getPlatformColor(order.platform)} />
                          <Text type="secondary">
                            #{order.platformOrderId}
                          </Text>
                        </Space>
                        <Tag
                          color={getStatusConfig(order.status).color}
                          style={{ margin: 0 }}
                        >
                          {getStatusConfig(order.status).label}
                        </Tag>
                      </Space>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
};
