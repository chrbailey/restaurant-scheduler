import { useState } from "react";
import { useCustom, useGetIdentity, useList } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Table,
  Tag,
  Avatar,
  Progress,
  Input,
  Select,
  Button,
  Tooltip,
  Rate,
} from "antd";
import {
  TeamOutlined,
  SearchOutlined,
  DownloadOutlined,
  WarningOutlined,
  StarFilled,
  RiseOutlined,
  FallOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router";
import { ChurnRiskIndicator } from "../../components/analytics/ChurnRiskIndicator";

const { Title, Text } = Typography;

export const WorkerAnalytics = () => {
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [searchText, setSearchText] = useState("");
  const [riskFilter, setRiskFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>("performance");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Fetch worker analytics
  const { data: analyticsData, isLoading } = useCustom({
    url: `/analytics/${identity?.restaurantId}/workers`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const analytics = analyticsData?.data as any;

  // Mock worker data for demonstration
  const workers = analytics?.workers || [
    {
      id: "1",
      firstName: "Sarah",
      lastName: "Johnson",
      positions: ["SERVER", "HOST"],
      performanceScore: 94,
      reliabilityScore: 0.96,
      engagementScore: 88,
      churnRisk: "low",
      shiftsCompleted: 156,
      avgRating: 4.8,
      hoursThisMonth: 142,
      trend: "up",
    },
    {
      id: "2",
      firstName: "Michael",
      lastName: "Chen",
      positions: ["LINE_COOK"],
      performanceScore: 87,
      reliabilityScore: 0.92,
      engagementScore: 72,
      churnRisk: "medium",
      shiftsCompleted: 98,
      avgRating: 4.5,
      hoursThisMonth: 168,
      trend: "stable",
    },
    {
      id: "3",
      firstName: "John",
      lastName: "Smith",
      positions: ["BARTENDER"],
      performanceScore: 78,
      reliabilityScore: 0.75,
      engagementScore: 45,
      churnRisk: "high",
      shiftsCompleted: 67,
      avgRating: 4.2,
      hoursThisMonth: 85,
      trend: "down",
    },
    {
      id: "4",
      firstName: "Emily",
      lastName: "Davis",
      positions: ["SERVER"],
      performanceScore: 91,
      reliabilityScore: 0.94,
      engagementScore: 82,
      churnRisk: "low",
      shiftsCompleted: 203,
      avgRating: 4.7,
      hoursThisMonth: 156,
      trend: "up",
    },
    {
      id: "5",
      firstName: "David",
      lastName: "Wilson",
      positions: ["PREP_COOK", "DISHWASHER"],
      performanceScore: 82,
      reliabilityScore: 0.88,
      engagementScore: 65,
      churnRisk: "medium",
      shiftsCompleted: 112,
      avgRating: 4.3,
      hoursThisMonth: 148,
      trend: "stable",
    },
  ];

  // Filter and sort workers
  const filteredWorkers = workers
    .filter((worker: any) => {
      const matchesSearch =
        !searchText ||
        `${worker.firstName} ${worker.lastName}`
          .toLowerCase()
          .includes(searchText.toLowerCase());
      const matchesRisk = !riskFilter || worker.churnRisk === riskFilter;
      return matchesSearch && matchesRisk;
    })
    .sort((a: any, b: any) => {
      const aValue = a[sortField] || 0;
      const bValue = b[sortField] || 0;
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });

  const handleExport = () => {
    // In real implementation, this would generate a CSV/Excel file
    const csvContent = [
      ["Name", "Performance", "Reliability", "Engagement", "Churn Risk", "Shifts", "Rating"],
      ...filteredWorkers.map((w: any) => [
        `${w.firstName} ${w.lastName}`,
        w.performanceScore,
        (w.reliabilityScore * 100).toFixed(0),
        w.engagementScore,
        w.churnRisk,
        w.shiftsCompleted,
        w.avgRating,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "worker_analytics.csv";
    a.click();
  };

  const columns = [
    {
      title: "Worker",
      key: "worker",
      render: (_: any, record: any) => (
        <Space>
          <Avatar
            style={{
              backgroundColor:
                record.churnRisk === "high"
                  ? "#ef4444"
                  : record.churnRisk === "medium"
                  ? "#faad14"
                  : "#4a90d9",
            }}
          >
            {record.firstName?.[0]}
            {record.lastName?.[0]}
          </Avatar>
          <div>
            <Text
              strong
              style={{ color: "#fff", cursor: "pointer" }}
              onClick={() => navigate(`/analytics/workers/${record.id}`)}
            >
              {record.firstName} {record.lastName}
            </Text>
            <br />
            <Space size={4}>
              {record.positions?.map((pos: string) => (
                <Tag key={pos} color="blue" style={{ fontSize: 10 }}>
                  {pos.replace(/_/g, " ")}
                </Tag>
              ))}
            </Space>
          </div>
        </Space>
      ),
    },
    {
      title: "Performance",
      dataIndex: "performanceScore",
      key: "performanceScore",
      sorter: true,
      render: (score: number, record: any) => (
        <Space>
          <Progress
            type="circle"
            percent={score}
            size={40}
            strokeColor={score >= 90 ? "#52c41a" : score >= 75 ? "#4a90d9" : "#faad14"}
            format={(p) => <span style={{ fontSize: 11 }}>{p}</span>}
          />
          {record.trend === "up" && (
            <RiseOutlined style={{ color: "#52c41a" }} />
          )}
          {record.trend === "down" && (
            <FallOutlined style={{ color: "#ef4444" }} />
          )}
        </Space>
      ),
    },
    {
      title: "Reliability",
      dataIndex: "reliabilityScore",
      key: "reliabilityScore",
      sorter: true,
      render: (score: number) => (
        <div style={{ width: 80 }}>
          <Progress
            percent={Math.round(score * 100)}
            size="small"
            status={score >= 0.9 ? "success" : score >= 0.75 ? "normal" : "exception"}
          />
        </div>
      ),
    },
    {
      title: "Engagement",
      dataIndex: "engagementScore",
      key: "engagementScore",
      sorter: true,
      render: (score: number) => (
        <Progress
          type="circle"
          percent={score}
          size={40}
          strokeColor={score >= 80 ? "#52c41a" : score >= 60 ? "#faad14" : "#ef4444"}
          format={(p) => <span style={{ fontSize: 11 }}>{p}</span>}
        />
      ),
    },
    {
      title: "Churn Risk",
      dataIndex: "churnRisk",
      key: "churnRisk",
      render: (risk: string) => <ChurnRiskIndicator risk={risk} />,
    },
    {
      title: "Shifts",
      dataIndex: "shiftsCompleted",
      key: "shiftsCompleted",
      sorter: true,
      render: (count: number) => (
        <Text style={{ color: "#fff" }}>{count}</Text>
      ),
    },
    {
      title: "Rating",
      dataIndex: "avgRating",
      key: "avgRating",
      sorter: true,
      render: (rating: number) => (
        <Space>
          <Rate disabled value={rating} style={{ fontSize: 12 }} />
          <Text type="secondary">({rating.toFixed(1)})</Text>
        </Space>
      ),
    },
    {
      title: "Hours/Month",
      dataIndex: "hoursThisMonth",
      key: "hoursThisMonth",
      sorter: true,
      render: (hours: number) => (
        <Space>
          <ClockCircleOutlined style={{ color: "#4a90d9" }} />
          <Text style={{ color: "#fff" }}>{hours}h</Text>
        </Space>
      ),
    },
  ];

  // Summary stats
  const totalWorkers = workers.length;
  const highRiskCount = workers.filter((w: any) => w.churnRisk === "high").length;
  const avgPerformance =
    workers.reduce((sum: number, w: any) => sum + w.performanceScore, 0) / totalWorkers;
  const avgEngagement =
    workers.reduce((sum: number, w: any) => sum + w.engagementScore, 0) / totalWorkers;

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <Space align="center">
            <TeamOutlined style={{ fontSize: 28, color: "#4a90d9" }} />
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              Worker Analytics
            </Title>
          </Space>
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            Performance metrics, engagement, and retention insights
          </Text>
        </div>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>
          Export Report
        </Button>
      </div>

      {/* Summary Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <TeamOutlined style={{ fontSize: 32, color: "#4a90d9" }} />
              <Text type="secondary">Total Workers</Text>
              <Text style={{ color: "#fff", fontSize: 24 }}>{totalWorkers}</Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <TrophyOutlined style={{ fontSize: 32, color: "#52c41a" }} />
              <Text type="secondary">Avg Performance</Text>
              <Text style={{ color: "#52c41a", fontSize: 24 }}>
                {avgPerformance.toFixed(0)}%
              </Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <StarFilled style={{ fontSize: 32, color: "#faad14" }} />
              <Text type="secondary">Avg Engagement</Text>
              <Text style={{ color: "#faad14", fontSize: 24 }}>
                {avgEngagement.toFixed(0)}%
              </Text>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{
              backgroundColor: highRiskCount > 0 ? "#2a1a1a" : "#1a1a2e",
              borderColor: highRiskCount > 0 ? "#ef4444" : "#2a2a4e",
            }}
          >
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <WarningOutlined
                style={{ fontSize: 32, color: highRiskCount > 0 ? "#ef4444" : "#52c41a" }}
              />
              <Text type="secondary">High Churn Risk</Text>
              <Text
                style={{
                  color: highRiskCount > 0 ? "#ef4444" : "#52c41a",
                  fontSize: 24,
                }}
              >
                {highRiskCount}
              </Text>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
      >
        <Space wrap>
          <Input
            placeholder="Search workers..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
          />
          <Select
            placeholder="Filter by risk"
            allowClear
            value={riskFilter}
            onChange={setRiskFilter}
            style={{ width: 150 }}
            options={[
              { label: "High Risk", value: "high" },
              { label: "Medium Risk", value: "medium" },
              { label: "Low Risk", value: "low" },
            ]}
          />
          <Select
            value={sortField}
            onChange={setSortField}
            style={{ width: 150 }}
            options={[
              { label: "Sort by Performance", value: "performanceScore" },
              { label: "Sort by Reliability", value: "reliabilityScore" },
              { label: "Sort by Engagement", value: "engagementScore" },
              { label: "Sort by Shifts", value: "shiftsCompleted" },
              { label: "Sort by Rating", value: "avgRating" },
            ]}
          />
          <Select
            value={sortOrder}
            onChange={setSortOrder}
            style={{ width: 120 }}
            options={[
              { label: "Descending", value: "desc" },
              { label: "Ascending", value: "asc" },
            ]}
          />
        </Space>
      </Card>

      {/* Workers Table */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
        bodyStyle={{ padding: 0 }}
      >
        <Table
          dataSource={filteredWorkers}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          onRow={(record) => ({
            onClick: () => navigate(`/analytics/workers/${record.id}`),
            style: { cursor: "pointer" },
          })}
          rowClassName={(record) =>
            record.churnRisk === "high" ? "high-risk-row" : ""
          }
        />
      </Card>

      <style>{`
        .high-risk-row {
          background-color: #2a1a1a !important;
        }
        .high-risk-row:hover > td {
          background-color: #3a2a2a !important;
        }
      `}</style>
    </div>
  );
};
