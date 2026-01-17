import { Typography, Space } from "antd";

const { Text } = Typography;

interface ForecastDataPoint {
  date: string;
  predicted: number;
  actual: number;
}

interface ForecastAccuracyChartProps {
  data: ForecastDataPoint[];
  height?: number;
}

export const ForecastAccuracyChart = ({
  data,
  height = 200,
}: ForecastAccuracyChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 24 }}>
        <Text type="secondary">No forecast data available</Text>
      </div>
    );
  }

  const allValues = data.flatMap((d) => [d.predicted, d.actual]);
  const maxValue = Math.max(...allValues);
  const minValue = Math.min(...allValues);
  const range = maxValue - minValue || 1;

  const chartWidth = 100;
  const chartHeight = height - 40;

  const getY = (value: number) => {
    return chartHeight - 10 - ((value - minValue) / range) * (chartHeight - 20);
  };

  const predictedPoints = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * chartWidth;
      const y = getY(d.predicted);
      return `${x},${y}`;
    })
    .join(" ");

  const actualPoints = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * chartWidth;
      const y = getY(d.actual);
      return `${x},${y}`;
    })
    .join(" ");

  // Calculate accuracy metrics
  const differences = data.map((d) => Math.abs(d.predicted - d.actual));
  const avgDifference =
    differences.reduce((sum, d) => sum + d, 0) / differences.length;
  const mape =
    (data.reduce(
      (sum, d) => sum + Math.abs((d.predicted - d.actual) / d.actual),
      0
    ) /
      data.length) *
    100;

  return (
    <div>
      {/* Chart */}
      <div style={{ position: "relative" }}>
        {/* Y-axis labels */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: chartHeight,
            width: 40,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingRight: 8,
          }}
        >
          <Text type="secondary" style={{ fontSize: 10, textAlign: "right" }}>
            {maxValue}
          </Text>
          <Text type="secondary" style={{ fontSize: 10, textAlign: "right" }}>
            {Math.round((maxValue + minValue) / 2)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10, textAlign: "right" }}>
            {minValue}
          </Text>
        </div>

        {/* SVG Chart */}
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          style={{
            width: "calc(100% - 50px)",
            height: chartHeight,
            marginLeft: 50,
          }}
        >
          {/* Grid lines */}
          <line
            x1="0"
            y1={chartHeight / 2}
            x2={chartWidth}
            y2={chartHeight / 2}
            stroke="#2a2a4e"
            strokeDasharray="4,4"
          />

          {/* Predicted line */}
          <polyline
            points={predictedPoints}
            fill="none"
            stroke="#4a90d9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Actual line */}
          <polyline
            points={actualPoints}
            fill="none"
            stroke="#52c41a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points - Predicted */}
          {data.map((d, i) => (
            <circle
              key={`pred-${i}`}
              cx={(i / (data.length - 1)) * chartWidth}
              cy={getY(d.predicted)}
              r="3"
              fill="#4a90d9"
            />
          ))}

          {/* Data points - Actual */}
          {data.map((d, i) => (
            <circle
              key={`actual-${i}`}
              cx={(i / (data.length - 1)) * chartWidth}
              cy={getY(d.actual)}
              r="3"
              fill="#52c41a"
            />
          ))}
        </svg>

        {/* X-axis labels */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginLeft: 50,
            marginTop: 8,
          }}
        >
          {data.map((d, i) => (
            <Text
              key={i}
              type="secondary"
              style={{
                fontSize: 10,
                flex: 1,
                textAlign: i === 0 ? "left" : i === data.length - 1 ? "right" : "center",
              }}
            >
              {d.date}
            </Text>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 24,
          marginTop: 16,
        }}
      >
        <Space>
          <div
            style={{
              width: 20,
              height: 3,
              backgroundColor: "#4a90d9",
              borderRadius: 2,
            }}
          />
          <Text type="secondary">Predicted</Text>
        </Space>
        <Space>
          <div
            style={{
              width: 20,
              height: 3,
              backgroundColor: "#52c41a",
              borderRadius: 2,
            }}
          />
          <Text type="secondary">Actual</Text>
        </Space>
      </div>

      {/* Metrics */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-around",
          marginTop: 16,
          padding: 16,
          backgroundColor: "#16213e",
          borderRadius: 8,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            Avg Difference
          </Text>
          <Text style={{ color: "#fff", fontSize: 18 }}>
            {avgDifference.toFixed(1)} orders
          </Text>
        </div>
        <div style={{ textAlign: "center" }}>
          <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            MAPE
          </Text>
          <Text
            style={{
              color: mape < 10 ? "#52c41a" : mape < 15 ? "#faad14" : "#ef4444",
              fontSize: 18,
            }}
          >
            {mape.toFixed(1)}%
          </Text>
        </div>
        <div style={{ textAlign: "center" }}>
          <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            Data Points
          </Text>
          <Text style={{ color: "#fff", fontSize: 18 }}>{data.length}</Text>
        </div>
      </div>
    </div>
  );
};
