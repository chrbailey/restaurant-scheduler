import { Tag, Tooltip, Space, Progress } from "antd";
import {
  WarningOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";

interface ChurnRiskIndicatorProps {
  risk: "low" | "medium" | "high" | string;
  showLabel?: boolean;
  showProgress?: boolean;
  size?: "small" | "default";
}

export const ChurnRiskIndicator = ({
  risk,
  showLabel = false,
  showProgress = false,
  size = "default",
}: ChurnRiskIndicatorProps) => {
  const config = {
    low: {
      color: "#52c41a",
      bgColor: "#1a2a1a",
      borderColor: "#52c41a",
      icon: <CheckCircleOutlined />,
      label: "Low Risk",
      description: "Worker is engaged and satisfied. No immediate concerns.",
      progressPercent: 25,
    },
    medium: {
      color: "#faad14",
      bgColor: "#2a2a1a",
      borderColor: "#faad14",
      icon: <ExclamationCircleOutlined />,
      label: "Medium Risk",
      description:
        "Some warning signs detected. Consider proactive engagement.",
      progressPercent: 55,
    },
    high: {
      color: "#ef4444",
      bgColor: "#2a1a1a",
      borderColor: "#ef4444",
      icon: <WarningOutlined />,
      label: "High Risk",
      description:
        "Significant retention risk. Immediate attention recommended.",
      progressPercent: 85,
    },
  };

  const riskConfig = config[risk as keyof typeof config] || config.low;

  if (showProgress) {
    return (
      <Tooltip title={riskConfig.description}>
        <div style={{ width: size === "small" ? 80 : 120 }}>
          <Progress
            percent={riskConfig.progressPercent}
            size="small"
            showInfo={false}
            strokeColor={riskConfig.color}
            trailColor="#2a2a4e"
          />
          {showLabel && (
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <span
                style={{
                  color: riskConfig.color,
                  fontSize: size === "small" ? 10 : 12,
                }}
              >
                {riskConfig.label}
              </span>
            </div>
          )}
        </div>
      </Tooltip>
    );
  }

  if (showLabel) {
    return (
      <Tooltip title={riskConfig.description}>
        <Space size={4}>
          <Tag
            color={risk === "low" ? "green" : risk === "medium" ? "orange" : "red"}
            icon={riskConfig.icon}
            style={{
              margin: 0,
              fontSize: size === "small" ? 11 : 12,
            }}
          >
            {riskConfig.label}
          </Tag>
        </Space>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`${riskConfig.label}: ${riskConfig.description}`}>
      <Tag
        color={risk === "low" ? "green" : risk === "medium" ? "orange" : "red"}
        icon={riskConfig.icon}
        style={{
          margin: 0,
          fontSize: size === "small" ? 11 : 12,
        }}
      >
        {risk.toUpperCase()}
      </Tag>
    </Tooltip>
  );
};
