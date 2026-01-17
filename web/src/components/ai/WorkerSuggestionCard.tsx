import { Card, Typography, Space, Tag, Progress, Avatar, Button, Tooltip } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  QuestionCircleOutlined,
  StarFilled,
  TrophyOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

interface WorkerSuggestion {
  workerId: string;
  firstName: string;
  lastName: string;
  matchScore: number;
  reasons: string[];
  availability: "confirmed" | "likely" | "unknown";
  reliabilityScore: number;
  previousShiftsInPosition: number;
}

interface WorkerSuggestionCardProps {
  suggestion: WorkerSuggestion;
  rank: number;
  isSelected: boolean;
  onSelect: () => void;
}

export const WorkerSuggestionCard = ({
  suggestion,
  rank,
  isSelected,
  onSelect,
}: WorkerSuggestionCardProps) => {
  const getAvailabilityConfig = (availability: string) => {
    switch (availability) {
      case "confirmed":
        return {
          icon: <CheckCircleOutlined />,
          color: "green",
          label: "Confirmed",
        };
      case "likely":
        return {
          icon: <ClockCircleOutlined />,
          color: "blue",
          label: "Likely Available",
        };
      default:
        return {
          icon: <QuestionCircleOutlined />,
          color: "default",
          label: "Unknown",
        };
    }
  };

  const availabilityConfig = getAvailabilityConfig(suggestion.availability);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "#52c41a";
    if (score >= 75) return "#4a90d9";
    if (score >= 60) return "#faad14";
    return "#666";
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1)
      return {
        color: "#ffd700",
        label: "Best Match",
        icon: <TrophyOutlined />,
      };
    if (rank === 2)
      return {
        color: "#c0c0c0",
        label: "#2",
        icon: <StarFilled />,
      };
    if (rank === 3)
      return {
        color: "#cd7f32",
        label: "#3",
        icon: <StarFilled />,
      };
    return null;
  };

  const rankBadge = getRankBadge(rank);

  return (
    <Card
      hoverable
      onClick={onSelect}
      style={{
        backgroundColor: isSelected ? "#1a3a2a" : "#16213e",
        borderColor: isSelected ? "#52c41a" : "#2a2a4e",
        borderWidth: isSelected ? 2 : 1,
        transition: "all 0.3s",
        height: "100%",
      }}
      bodyStyle={{ padding: 16 }}
    >
      {/* Header with rank and avatar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <Space>
          <Avatar
            size={48}
            style={{
              backgroundColor: isSelected ? "#52c41a" : "#4a90d9",
              fontSize: 18,
            }}
          >
            {suggestion.firstName[0]}
            {suggestion.lastName[0]}
          </Avatar>
          <div>
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>
              {suggestion.firstName} {suggestion.lastName}
            </Text>
            <br />
            <Tag color={availabilityConfig.color} icon={availabilityConfig.icon}>
              {availabilityConfig.label}
            </Tag>
          </div>
        </Space>
        {rankBadge && (
          <Tooltip title={rankBadge.label}>
            <div
              style={{
                backgroundColor: `${rankBadge.color}20`,
                borderRadius: 8,
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ color: rankBadge.color }}>{rankBadge.icon}</span>
              {rank === 1 && (
                <Text style={{ color: rankBadge.color, fontSize: 11 }}>
                  Best
                </Text>
              )}
            </div>
          </Tooltip>
        )}
      </div>

      {/* Match Score */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            Match Score
          </Text>
          <Text
            style={{
              color: getScoreColor(suggestion.matchScore),
              fontWeight: 600,
            }}
          >
            {suggestion.matchScore}%
          </Text>
        </div>
        <Progress
          percent={suggestion.matchScore}
          showInfo={false}
          strokeColor={getScoreColor(suggestion.matchScore)}
          trailColor="#2a2a4e"
          size="small"
        />
      </div>

      {/* Quick Stats */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
          padding: 12,
          backgroundColor: "#0f0f23",
          borderRadius: 8,
        }}
      >
        <Tooltip title="Reliability Score">
          <Space direction="vertical" align="center" size={0}>
            <SafetyCertificateOutlined
              style={{
                color:
                  suggestion.reliabilityScore >= 0.9
                    ? "#52c41a"
                    : suggestion.reliabilityScore >= 0.75
                    ? "#faad14"
                    : "#ef4444",
              }}
            />
            <Text style={{ color: "#fff", fontSize: 14 }}>
              {Math.round(suggestion.reliabilityScore * 100)}%
            </Text>
            <Text type="secondary" style={{ fontSize: 10 }}>
              Reliable
            </Text>
          </Space>
        </Tooltip>
        <Tooltip title="Previous shifts in this position">
          <Space direction="vertical" align="center" size={0}>
            <TrophyOutlined style={{ color: "#faad14" }} />
            <Text style={{ color: "#fff", fontSize: 14 }}>
              {suggestion.previousShiftsInPosition}
            </Text>
            <Text type="secondary" style={{ fontSize: 10 }}>
              Shifts
            </Text>
          </Space>
        </Tooltip>
      </div>

      {/* Reasons */}
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 8 }}>
          Why suggested:
        </Text>
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          {suggestion.reasons.slice(0, 3).map((reason, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
              }}
            >
              <CheckCircleOutlined
                style={{ color: "#52c41a", fontSize: 12, marginTop: 2 }}
              />
              <Text style={{ color: "#ccc", fontSize: 12, lineHeight: 1.4 }}>
                {reason}
              </Text>
            </div>
          ))}
          {suggestion.reasons.length > 3 && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              +{suggestion.reasons.length - 3} more reasons
            </Text>
          )}
        </Space>
      </div>

      {/* Select Button */}
      <Button
        type={isSelected ? "primary" : "default"}
        block
        icon={isSelected ? <CheckCircleOutlined /> : null}
        style={
          isSelected
            ? {
                backgroundColor: "#52c41a",
                borderColor: "#52c41a",
              }
            : {}
        }
      >
        {isSelected ? "Selected" : "Select Worker"}
      </Button>
    </Card>
  );
};
