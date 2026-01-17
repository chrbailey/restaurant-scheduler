import { Typography, Space, Tooltip, Empty } from "antd";
import { CloudOutlined, SunOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface ForecastDataPoint {
  hour: string;
  dineIn: number;
  delivery: number;
  opportunity?: boolean;
  weather?: string;
  actual?: {
    dineIn?: number;
    delivery?: number;
  };
}

interface ForecastChartProps {
  data: ForecastDataPoint[];
  compact?: boolean;
  showActuals?: boolean;
}

export const ForecastChart = ({
  data,
  compact = false,
  showActuals = true,
}: ForecastChartProps) => {
  if (!data || data.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Text type="secondary">No forecast data available</Text>}
      />
    );
  }

  const maxValue = Math.max(
    ...data.flatMap((d) => [
      d.dineIn,
      d.delivery,
      d.actual?.dineIn || 0,
      d.actual?.delivery || 0,
    ])
  );

  const chartHeight = compact ? 120 : 200;
  const barWidth = compact ? 8 : 16;
  const groupGap = compact ? 4 : 8;

  const getBarHeight = (value: number) => {
    if (maxValue === 0) return 0;
    return Math.max(4, (value / maxValue) * (chartHeight - 40));
  };

  return (
    <div>
      {/* Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 16,
          marginBottom: 12,
        }}
      >
        <Space size={4}>
          <div
            style={{
              width: 12,
              height: 12,
              backgroundColor: "#4a90d9",
              borderRadius: 2,
            }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Dine-In
          </Text>
        </Space>
        <Space size={4}>
          <div
            style={{
              width: 12,
              height: 12,
              backgroundColor: "#52c41a",
              borderRadius: 2,
            }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Delivery
          </Text>
        </Space>
        {showActuals && (
          <Space size={4}>
            <div
              style={{
                width: 12,
                height: 3,
                backgroundColor: "#722ed1",
                borderRadius: 2,
              }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Actual
            </Text>
          </Space>
        )}
      </div>

      {/* Chart */}
      <div
        style={{
          position: "relative",
          height: chartHeight,
          display: "flex",
          alignItems: "flex-end",
          gap: groupGap,
          padding: "0 8px",
          borderBottom: "1px solid #2a2a4e",
        }}
      >
        {/* Y-axis labels */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 20,
            width: 30,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <Text type="secondary" style={{ fontSize: 10 }}>
            {maxValue}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {Math.round(maxValue / 2)}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            0
          </Text>
        </div>

        {/* Grid lines */}
        <div
          style={{
            position: "absolute",
            left: 35,
            right: 0,
            top: 0,
            bottom: 20,
            pointerEvents: "none",
          }}
        >
          {[0, 0.5, 1].map((ratio, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: `${ratio * 100}%`,
                borderTop: "1px dashed #2a2a4e",
              }}
            />
          ))}
        </div>

        {/* Bars */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: groupGap,
            marginLeft: 35,
            flex: 1,
            justifyContent: "space-between",
          }}
        >
          {data.map((point, i) => (
            <Tooltip
              key={i}
              title={
                <div>
                  <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                    {point.hour}
                  </div>
                  <div>Dine-In: {point.dineIn}</div>
                  <div>Delivery: {point.delivery}</div>
                  {point.actual && (
                    <>
                      <div style={{ marginTop: 4, borderTop: "1px solid #444", paddingTop: 4 }}>
                        <div>Actual Dine-In: {point.actual.dineIn || "-"}</div>
                        <div>Actual Delivery: {point.actual.delivery || "-"}</div>
                      </div>
                    </>
                  )}
                  {point.opportunity && (
                    <div
                      style={{
                        marginTop: 4,
                        color: "#52c41a",
                        fontWeight: "bold",
                      }}
                    >
                      Ghost Kitchen Opportunity
                    </div>
                  )}
                </div>
              }
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  position: "relative",
                }}
              >
                {/* Opportunity highlight */}
                {point.opportunity && (
                  <div
                    style={{
                      position: "absolute",
                      top: -chartHeight + 20,
                      left: -4,
                      right: -4,
                      bottom: -20,
                      backgroundColor: "#52c41a10",
                      borderRadius: 4,
                      border: "1px dashed #52c41a40",
                    }}
                  />
                )}

                {/* Bar group */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 2,
                    marginBottom: 4,
                  }}
                >
                  {/* Dine-In bar */}
                  <div
                    style={{
                      width: barWidth,
                      height: getBarHeight(point.dineIn),
                      backgroundColor: "#4a90d9",
                      borderRadius: "2px 2px 0 0",
                      position: "relative",
                    }}
                  >
                    {/* Actual overlay for dine-in */}
                    {showActuals && point.actual?.dineIn !== undefined && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: getBarHeight(point.actual.dineIn),
                          backgroundColor: "#722ed1",
                          borderRadius: "2px 2px 0 0",
                          opacity: 0.7,
                        }}
                      />
                    )}
                  </div>

                  {/* Delivery bar */}
                  <div
                    style={{
                      width: barWidth,
                      height: getBarHeight(point.delivery),
                      backgroundColor: "#52c41a",
                      borderRadius: "2px 2px 0 0",
                      position: "relative",
                    }}
                  >
                    {/* Actual overlay for delivery */}
                    {showActuals && point.actual?.delivery !== undefined && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: getBarHeight(point.actual.delivery),
                          backgroundColor: "#722ed1",
                          borderRadius: "2px 2px 0 0",
                          opacity: 0.7,
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Hour label */}
                {!compact && (
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 10,
                      transform: "rotate(-45deg)",
                      transformOrigin: "top left",
                      whiteSpace: "nowrap",
                      marginTop: 4,
                    }}
                  >
                    {point.hour}
                  </Text>
                )}
              </div>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* X-axis labels for compact view */}
      {compact && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 4,
            marginLeft: 35,
          }}
        >
          <Text type="secondary" style={{ fontSize: 10 }}>
            {data[0]?.hour}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {data[Math.floor(data.length / 2)]?.hour}
          </Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {data[data.length - 1]?.hour}
          </Text>
        </div>
      )}

      {/* Summary stats */}
      {!compact && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            marginTop: 24,
            padding: "12px 0",
            borderTop: "1px solid #2a2a4e",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              Peak Dine-In
            </Text>
            <Text style={{ color: "#4a90d9", fontSize: 18 }}>
              {Math.max(...data.map((d) => d.dineIn))}
            </Text>
            <Text type="secondary" style={{ display: "block", fontSize: 10 }}>
              @{data.find((d) => d.dineIn === Math.max(...data.map((d) => d.dineIn)))?.hour}
            </Text>
          </div>
          <div style={{ textAlign: "center" }}>
            <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              Peak Delivery
            </Text>
            <Text style={{ color: "#52c41a", fontSize: 18 }}>
              {Math.max(...data.map((d) => d.delivery))}
            </Text>
            <Text type="secondary" style={{ display: "block", fontSize: 10 }}>
              @{data.find((d) => d.delivery === Math.max(...data.map((d) => d.delivery)))?.hour}
            </Text>
          </div>
          <div style={{ textAlign: "center" }}>
            <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
              Opportunities
            </Text>
            <Text style={{ color: "#faad14", fontSize: 18 }}>
              {data.filter((d) => d.opportunity).length}
            </Text>
            <Text type="secondary" style={{ display: "block", fontSize: 10 }}>
              windows
            </Text>
          </div>
        </div>
      )}
    </div>
  );
};
