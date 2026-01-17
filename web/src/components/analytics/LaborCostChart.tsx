import { Typography, Tooltip } from "antd";

const { Text } = Typography;

interface LaborCostData {
  day: string;
  cost: number;
  hours: number;
  regular?: number;
  overtime?: number;
}

interface LaborCostChartProps {
  data: LaborCostData[];
  height?: number;
}

export const LaborCostChart = ({ data, height = 200 }: LaborCostChartProps) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 24 }}>
        <Text type="secondary">No labor cost data available</Text>
      </div>
    );
  }

  const maxCost = Math.max(...data.map((d) => d.cost));
  const totalCost = data.reduce((sum, d) => sum + d.cost, 0);
  const totalHours = data.reduce((sum, d) => sum + d.hours, 0);

  return (
    <div>
      {/* Bar Chart */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          height: height,
          gap: 8,
          padding: "0 8px",
        }}
      >
        {data.map((item, index) => {
          const barHeight = (item.cost / maxCost) * (height - 40);
          const regularHeight = item.regular
            ? (item.regular / item.cost) * barHeight
            : barHeight;
          const overtimeHeight = item.overtime
            ? (item.overtime / item.cost) * barHeight
            : 0;

          return (
            <Tooltip
              key={index}
              title={
                <div>
                  <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                    {item.day}
                  </div>
                  <div>Total: ${item.cost.toFixed(2)}</div>
                  {item.regular !== undefined && (
                    <div>Regular: ${item.regular.toFixed(2)}</div>
                  )}
                  {item.overtime !== undefined && item.overtime > 0 && (
                    <div style={{ color: "#faad14" }}>
                      Overtime: ${item.overtime.toFixed(2)}
                    </div>
                  )}
                  <div>Hours: {item.hours}h</div>
                </div>
              }
            >
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                {/* Stacked Bar */}
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                  }}
                >
                  {/* Overtime portion (if any) */}
                  {overtimeHeight > 0 && (
                    <div
                      style={{
                        height: overtimeHeight,
                        backgroundColor: "#faad14",
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                  )}
                  {/* Regular portion */}
                  <div
                    style={{
                      height: regularHeight,
                      backgroundColor: "#4a90d9",
                      borderRadius:
                        overtimeHeight > 0 ? "0" : "4px 4px 0 0",
                    }}
                  />
                </div>
                {/* Day Label */}
                <Text
                  type="secondary"
                  style={{
                    fontSize: 11,
                    marginTop: 8,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.day.slice(0, 3)}
                </Text>
              </div>
            </Tooltip>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 24,
          marginTop: 16,
          paddingTop: 16,
          borderTop: "1px solid #2a2a4e",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 12,
              height: 12,
              backgroundColor: "#4a90d9",
              borderRadius: 2,
            }}
          />
          <Text type="secondary">Regular Pay</Text>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 12,
              height: 12,
              backgroundColor: "#faad14",
              borderRadius: 2,
            }}
          />
          <Text type="secondary">Overtime</Text>
        </div>
      </div>

      {/* Summary */}
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
            Total Cost
          </Text>
          <Text style={{ color: "#fff", fontSize: 18 }}>
            ${totalCost.toFixed(2)}
          </Text>
        </div>
        <div style={{ textAlign: "center" }}>
          <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            Total Hours
          </Text>
          <Text style={{ color: "#fff", fontSize: 18 }}>{totalHours}h</Text>
        </div>
        <div style={{ textAlign: "center" }}>
          <Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            Avg Cost/Hour
          </Text>
          <Text style={{ color: "#fff", fontSize: 18 }}>
            ${(totalCost / totalHours).toFixed(2)}
          </Text>
        </div>
      </div>
    </div>
  );
};
