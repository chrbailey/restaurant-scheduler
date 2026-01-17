import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Statistic,
  DatePicker,
  Segmented,
  Table,
  Progress,
  Tooltip,
  Empty,
  Divider,
  List,
  Tag,
} from "antd";
import {
  DollarOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  FallOutlined,
  InfoCircleOutlined,
  BulbOutlined,
} from "@ant-design/icons";
import { format, subDays, startOfWeek, startOfMonth } from "date-fns";
import dayjs from "dayjs";
import { LaborCostChart } from "../../components/analytics/LaborCostChart";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// Heatmap component for staffing levels
const StaffingHeatmap = ({ data }: { data: any[][] }) => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 16 }, (_, i) => `${i + 6}:00`);

  const getColor = (value: number) => {
    if (value < -2) return "#ef4444"; // Understaffed
    if (value < 0) return "#faad14"; // Slightly understaffed
    if (value === 0) return "#52c41a"; // Optimal
    if (value <= 2) return "#4a90d9"; // Slightly overstaffed
    return "#722ed1"; // Overstaffed
  };

  const getLabel = (value: number) => {
    if (value < -2) return "Understaffed";
    if (value < 0) return "Slightly under";
    if (value === 0) return "Optimal";
    if (value <= 2) return "Slightly over";
    return "Overstaffed";
  };

  return (
    <div>
      {/* Legend */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          { color: "#ef4444", label: "Understaffed" },
          { color: "#faad14", label: "Slightly Under" },
          { color: "#52c41a", label: "Optimal" },
          { color: "#4a90d9", label: "Slightly Over" },
          { color: "#722ed1", label: "Overstaffed" },
        ].map((item) => (
          <Space key={item.label} size={4}>
            <div
              style={{
                width: 12,
                height: 12,
                backgroundColor: item.color,
                borderRadius: 2,
              }}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>
              {item.label}
            </Text>
          </Space>
        ))}
      </div>

      {/* Heatmap grid */}
      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `60px repeat(${hours.length}, 1fr)`,
            gap: 2,
            minWidth: 800,
          }}
        >
          {/* Header row */}
          <div />
          {hours.map((hour) => (
            <div
              key={hour}
              style={{
                textAlign: "center",
                fontSize: 10,
                color: "#888",
                padding: "4px 0",
              }}
            >
              {hour}
            </div>
          ))}

          {/* Data rows */}
          {days.map((day, dayIndex) => (
            <>
              <div
                key={`label-${day}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  fontSize: 12,
                  color: "#888",
                }}
              >
                {day}
              </div>
              {hours.map((_, hourIndex) => {
                const value = data?.[dayIndex]?.[hourIndex] || 0;
                return (
                  <Tooltip
                    key={`${day}-${hourIndex}`}
                    title={`${day} ${hours[hourIndex]}: ${getLabel(value)} (${value > 0 ? "+" : ""}${value})`}
                  >
                    <div
                      style={{
                        backgroundColor: getColor(value),
                        opacity: 0.7 + Math.abs(value) * 0.1,
                        height: 24,
                        borderRadius: 2,
                        cursor: "pointer",
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.opacity = String(
                          0.7 + Math.abs(value) * 0.1
                        );
                      }}
                    />
                  </Tooltip>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
};

export const LaborAnalytics = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [period, setPeriod] = useState<"week" | "month" | "custom">("week");
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(6, "day"),
    dayjs(),
  ]);

  const getDateRange = () => {
    switch (period) {
      case "week":
        return {
          startDate: format(subDays(new Date(), 6), "yyyy-MM-dd"),
          endDate: format(new Date(), "yyyy-MM-dd"),
        };
      case "month":
        return {
          startDate: format(startOfMonth(new Date()), "yyyy-MM-dd"),
          endDate: format(new Date(), "yyyy-MM-dd"),
        };
      case "custom":
        return {
          startDate: customRange[0].format("YYYY-MM-DD"),
          endDate: customRange[1].format("YYYY-MM-DD"),
        };
    }
  };

  const dateRange = getDateRange();

  // Fetch labor analytics
  const { data: laborData, isLoading } = useCustom({
    url: `/analytics/${identity?.restaurantId}/labor`,
    method: "get",
    config: {
      query: dateRange,
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const labor = laborData?.data as any;

  // Mock data for demonstration
  const costByPosition = labor?.costByPosition || [
    { position: "Server", cost: 1850, hours: 120, avgRate: 15.42 },
    { position: "Line Cook", cost: 1420, hours: 80, avgRate: 17.75 },
    { position: "Host", cost: 680, hours: 45, avgRate: 15.11 },
    { position: "Bartender", cost: 890, hours: 52, avgRate: 17.12 },
    { position: "Dishwasher", cost: 520, hours: 40, avgRate: 13.0 },
  ];

  const costByDay = labor?.costByDay || [
    { day: "Monday", cost: 580, hours: 38 },
    { day: "Tuesday", cost: 620, hours: 40 },
    { day: "Wednesday", cost: 640, hours: 42 },
    { day: "Thursday", cost: 720, hours: 48 },
    { day: "Friday", cost: 980, hours: 65 },
    { day: "Saturday", cost: 1100, hours: 72 },
    { day: "Sunday", cost: 720, hours: 48 },
  ];

  const staffingHeatmapData = labor?.staffingHeatmap || [
    [0, 0, -1, 0, 1, 2, 2, 1, 0, 0, -1, -2, -1, 0, 1, 0],
    [0, 1, 0, 0, 0, 1, 1, 0, 0, -1, -1, -2, -1, 0, 0, 0],
    [0, 0, 0, 1, 1, 2, 1, 0, 0, 0, -1, -1, 0, 0, 1, 0],
    [-1, 0, 0, 1, 2, 3, 2, 1, 0, 0, -1, -2, -2, -1, 0, 0],
    [-1, -1, 0, 1, 2, 3, 3, 2, 1, 0, 0, -1, -2, -1, 0, 0],
    [-2, -1, 0, 1, 2, 3, 3, 3, 2, 1, 0, -1, -2, -2, -1, 0],
    [-1, 0, 0, 1, 1, 2, 2, 1, 0, 0, -1, -1, 0, 0, 0, 0],
  ];

  const recommendations = labor?.recommendations || [
    {
      type: "savings",
      title: "Reduce Saturday afternoon staffing",
      description:
        "Data shows consistent overstaffing 2-5 PM on Saturdays. Consider reducing by 1 server.",
      impact: "$120/week potential savings",
    },
    {
      type: "warning",
      title: "Friday dinner understaffed",
      description:
        "Peak hours (6-9 PM) show consistent understaffing. Consider adding coverage.",
      impact: "Improve service quality",
    },
    {
      type: "insight",
      title: "Overtime trending up",
      description:
        "3 workers approaching overtime threshold. Redistribute hours to avoid premium pay.",
      impact: "$85 potential overtime cost",
    },
  ];

  const positionColumns = [
    {
      title: "Position",
      dataIndex: "position",
      key: "position",
      render: (pos: string) => <Tag color="blue">{pos}</Tag>,
    },
    {
      title: "Total Cost",
      dataIndex: "cost",
      key: "cost",
      render: (cost: number) => (
        <Text style={{ color: "#fff" }}>${cost.toFixed(2)}</Text>
      ),
      sorter: (a: any, b: any) => a.cost - b.cost,
    },
    {
      title: "Hours",
      dataIndex: "hours",
      key: "hours",
      render: (hours: number) => <Text type="secondary">{hours}h</Text>,
      sorter: (a: any, b: any) => a.hours - b.hours,
    },
    {
      title: "Avg Rate",
      dataIndex: "avgRate",
      key: "avgRate",
      render: (rate: number) => (
        <Text type="secondary">${rate.toFixed(2)}/hr</Text>
      ),
    },
    {
      title: "% of Total",
      key: "percent",
      render: (_: any, record: any) => {
        const total = costByPosition.reduce((sum: number, p: any) => sum + p.cost, 0);
        const percent = (record.cost / total) * 100;
        return (
          <Progress
            percent={percent}
            size="small"
            showInfo={false}
            strokeColor="#4a90d9"
            style={{ width: 80 }}
          />
        );
      },
    },
  ];

  const totalLabor = labor?.totalLabor || 5360;
  const regularPay = labor?.regularPay || 4980;
  const overtimePay = labor?.overtimePay || 280;
  const instantPayAdvances = labor?.instantPayAdvances || 100;
  const laborAsPercentOfRevenue = labor?.laborAsPercentOfRevenue || 28.5;

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <DollarOutlined style={{ fontSize: 28, color: "#4a90d9" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Labor Cost Analysis
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Detailed breakdown of labor costs and staffing efficiency
        </Text>
      </div>

      {/* Date Range Filter */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
      >
        <Space wrap>
          <Segmented
            value={period}
            onChange={(v) => setPeriod(v as any)}
            options={[
              { label: "This Week", value: "week" },
              { label: "This Month", value: "month" },
              { label: "Custom", value: "custom" },
            ]}
          />
          {period === "custom" && (
            <RangePicker
              value={customRange}
              onChange={(dates) => {
                if (dates && dates[0] && dates[1]) {
                  setCustomRange([dates[0], dates[1]]);
                }
              }}
            />
          )}
        </Space>
      </Card>

      {/* Summary Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Total Labor Cost</Text>}
              value={totalLabor}
              precision={2}
              prefix="$"
              valueStyle={{ color: "#fff", fontSize: 28 }}
            />
            <Divider style={{ margin: "16px 0", borderColor: "#2a2a4e" }} />
            <Space direction="vertical" style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text type="secondary">Regular Pay</Text>
                <Text style={{ color: "#fff" }}>${regularPay.toFixed(2)}</Text>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text type="secondary">Overtime</Text>
                <Text style={{ color: "#faad14" }}>${overtimePay.toFixed(2)}</Text>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <Text type="secondary">Instant Pay Advances</Text>
                <Text type="secondary">${instantPayAdvances.toFixed(2)}</Text>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={18}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: "#52c41a" }} />
                <span>Labor Cost Over Time</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <LaborCostChart data={costByDay} />
          </Card>
        </Col>
      </Row>

      {/* Labor % of Revenue */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Labor as % of Revenue</Text>}
              value={laborAsPercentOfRevenue}
              suffix="%"
              valueStyle={{
                color: laborAsPercentOfRevenue > 30 ? "#ef4444" : "#52c41a",
                fontSize: 32,
              }}
            />
            <Progress
              percent={laborAsPercentOfRevenue}
              strokeColor={laborAsPercentOfRevenue > 30 ? "#ef4444" : "#52c41a"}
              trailColor="#2a2a4e"
              showInfo={false}
              style={{ marginTop: 12 }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">
                Target: 25-30%{" "}
                {laborAsPercentOfRevenue <= 30 ? (
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                ) : (
                  <WarningOutlined style={{ color: "#ef4444" }} />
                )}
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card
            title="Cost by Position"
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Table
              dataSource={costByPosition}
              columns={positionColumns}
              pagination={false}
              size="small"
              rowKey="position"
            />
          </Card>
        </Col>
      </Row>

      {/* Staffing Heatmap */}
      <Card
        title={
          <Space>
            <InfoCircleOutlined style={{ color: "#722ed1" }} />
            <span>Staffing Levels Heatmap</span>
            <Tooltip title="Shows over/understaffing patterns. Green = optimal, Red = understaffed, Purple = overstaffed">
              <InfoCircleOutlined style={{ color: "#666" }} />
            </Tooltip>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
        headStyle={{ borderColor: "#2a2a4e" }}
        loading={isLoading}
      >
        <StaffingHeatmap data={staffingHeatmapData} />
      </Card>

      {/* Optimization Recommendations */}
      <Card
        title={
          <Space>
            <BulbOutlined style={{ color: "#faad14" }} />
            <span>Optimization Recommendations</span>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
        headStyle={{ borderColor: "#2a2a4e" }}
      >
        <List
          dataSource={recommendations}
          renderItem={(item: any) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  item.type === "savings" ? (
                    <FallOutlined style={{ fontSize: 24, color: "#52c41a" }} />
                  ) : item.type === "warning" ? (
                    <WarningOutlined style={{ fontSize: 24, color: "#faad14" }} />
                  ) : (
                    <RiseOutlined style={{ fontSize: 24, color: "#4a90d9" }} />
                  )
                }
                title={<Text style={{ color: "#fff" }}>{item.title}</Text>}
                description={
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">{item.description}</Text>
                    <Tag
                      color={
                        item.type === "savings"
                          ? "green"
                          : item.type === "warning"
                          ? "orange"
                          : "blue"
                      }
                    >
                      {item.impact}
                    </Tag>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};
