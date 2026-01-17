import { Progress, Typography, Space, Tooltip } from "antd";
import {
  WarningOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

interface CapacityMeterProps {
  current: number;
  max: number;
  variant?: "default" | "compact" | "circle";
}

export const CapacityMeter = ({
  current,
  max,
  variant = "default",
}: CapacityMeterProps) => {
  const percentage = max > 0 ? Math.round((current / max) * 100) : 0;

  const getColor = () => {
    if (percentage >= 90) return "#ef4444";
    if (percentage >= 70) return "#faad14";
    return "#52c41a";
  };

  const getStatus = (): "success" | "normal" | "exception" => {
    if (percentage >= 90) return "exception";
    if (percentage >= 70) return "normal";
    return "success";
  };

  const getStatusIcon = () => {
    if (percentage >= 90) return <WarningOutlined style={{ color: "#ef4444" }} />;
    if (percentage >= 70) return <ThunderboltOutlined style={{ color: "#faad14" }} />;
    return <CheckCircleOutlined style={{ color: "#52c41a" }} />;
  };

  const getStatusText = () => {
    if (percentage >= 90) return "Near Capacity";
    if (percentage >= 70) return "Getting Busy";
    return "Capacity Available";
  };

  if (variant === "circle") {
    return (
      <Tooltip title={`${current} of ${max} orders`}>
        <Progress
          type="circle"
          percent={percentage}
          size={80}
          strokeColor={getColor()}
          trailColor="#2a2a4e"
          format={() => (
            <div style={{ textAlign: "center" }}>
              <Text style={{ color: "#fff", fontSize: 18, display: "block" }}>
                {current}
              </Text>
              <Text type="secondary" style={{ fontSize: 10 }}>
                of {max}
              </Text>
            </div>
          )}
        />
      </Tooltip>
    );
  }

  if (variant === "compact") {
    return (
      <div style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            Capacity
          </Text>
          <Text style={{ color: getColor(), fontSize: 12 }}>
            {current}/{max}
          </Text>
        </div>
        <Progress
          percent={percentage}
          showInfo={false}
          strokeColor={getColor()}
          trailColor="#2a2a4e"
          size="small"
        />
      </div>
    );
  }

  // Default variant
  return (
    <div
      style={{
        padding: 16,
        backgroundColor: "#16213e",
        borderRadius: 8,
        border: `1px solid ${percentage >= 90 ? "#ef444440" : "#2a2a4e"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Space>
          {getStatusIcon()}
          <Text style={{ color: getColor() }}>{getStatusText()}</Text>
        </Space>
        <Text strong style={{ color: "#fff", fontSize: 18 }}>
          {current} / {max}
        </Text>
      </div>

      <Progress
        percent={percentage}
        showInfo={false}
        strokeColor={{
          "0%": "#52c41a",
          "70%": "#faad14",
          "90%": "#ef4444",
        }}
        trailColor="#2a2a4e"
        strokeLinecap="round"
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          0
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {Math.round(max * 0.7)} (70%)
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {max}
        </Text>
      </div>

      {/* Visual capacity bar with individual slots */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        {Array.from({ length: Math.min(max, 20) }).map((_, i) => {
          const slotIndex = max <= 20 ? i : Math.floor((i / 20) * max);
          const isFilled = slotIndex < current;
          const normalizedPosition = max <= 20 ? i / max : slotIndex / max;

          let bgColor = "#2a2a4e";
          if (isFilled) {
            if (normalizedPosition >= 0.9) bgColor = "#ef4444";
            else if (normalizedPosition >= 0.7) bgColor = "#faad14";
            else bgColor = "#52c41a";
          }

          return (
            <Tooltip key={i} title={`Slot ${slotIndex + 1}`}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: bgColor,
                  transition: "background-color 0.3s",
                }}
              />
            </Tooltip>
          );
        })}
        {max > 20 && (
          <Text type="secondary" style={{ fontSize: 10, marginLeft: 4 }}>
            +{max - 20} more
          </Text>
        )}
      </div>
    </div>
  );
};
