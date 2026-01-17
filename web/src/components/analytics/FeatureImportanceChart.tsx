import { Typography, Tooltip, Progress } from "antd";

const { Text } = Typography;

interface FeatureImportance {
  feature: string;
  importance: number;
}

interface FeatureImportanceChartProps {
  data: FeatureImportance[];
  showPercentage?: boolean;
}

export const FeatureImportanceChart = ({
  data,
  showPercentage = true,
}: FeatureImportanceChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 24 }}>
        <Text type="secondary">No feature importance data available</Text>
      </div>
    );
  }

  // Sort by importance descending
  const sortedData = [...data].sort((a, b) => b.importance - a.importance);
  const maxImportance = sortedData[0]?.importance || 1;

  // Color scale based on importance
  const getColor = (importance: number) => {
    const ratio = importance / maxImportance;
    if (ratio >= 0.8) return "#52c41a";
    if (ratio >= 0.5) return "#4a90d9";
    if (ratio >= 0.3) return "#faad14";
    return "#666";
  };

  return (
    <div>
      {sortedData.map((item, index) => (
        <div key={item.feature} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 13 }}>{item.feature}</Text>
            {showPercentage && (
              <Text style={{ color: getColor(item.importance), fontSize: 13 }}>
                {(item.importance * 100).toFixed(1)}%
              </Text>
            )}
          </div>
          <Tooltip
            title={`${item.feature}: ${(item.importance * 100).toFixed(1)}% contribution to predictions`}
          >
            <div
              style={{
                height: 24,
                backgroundColor: "#16213e",
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: `${(item.importance / maxImportance) * 100}%`,
                  height: "100%",
                  backgroundColor: getColor(item.importance),
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 8,
                }}
              >
                {(item.importance / maxImportance) * 100 > 30 && (
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {(item.importance * 100).toFixed(0)}%
                  </Text>
                )}
              </div>
            </div>
          </Tooltip>
        </div>
      ))}

      {/* Summary */}
      <div
        style={{
          marginTop: 24,
          padding: 12,
          backgroundColor: "#16213e",
          borderRadius: 8,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Feature importance shows how much each input factor contributes to the
          model's predictions. Higher values indicate stronger influence on
          forecast accuracy.
        </Text>
      </div>
    </div>
  );
};
