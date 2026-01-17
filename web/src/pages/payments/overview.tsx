import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Statistic,
  Table,
  Tag,
  Progress,
  DatePicker,
  Segmented,
  Empty,
  Button,
} from "antd";
import {
  DollarOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  BankOutlined,
  RiseOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { format, subDays, startOfMonth, parseISO } from "date-fns";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Simple area chart component
const TransferChart = ({
  data,
}: {
  data: { date: string; amount: number }[];
}) => {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.amount));
  const height = 150;
  const width = 100;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - 10 - (d.amount / max) * (height - 20);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPath = `M 0,${height - 10} L ${points} L ${width},${height - 10} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height }}>
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#52c41a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#52c41a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGradient)" />
        <polyline
          points={points}
          fill="none"
          stroke="#52c41a"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <Text type="secondary" style={{ fontSize: 11 }}>
          {data[0]?.date}
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {data[data.length - 1]?.date}
        </Text>
      </div>
    </div>
  );
};

interface PendingTransfer {
  id: string;
  workerId: string;
  workerName: string;
  amount: number;
  earnedBalance: number;
  requestedAt: string;
  status: "pending" | "processing" | "completed" | "failed";
}

export const PaymentsOverview = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [period, setPeriod] = useState<"week" | "month" | "custom">("month");
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

  // Fetch payments data
  const { data: paymentsData, isLoading } = useCustom({
    url: `/payments/${identity?.restaurantId}/overview`,
    method: "get",
    config: {
      query: dateRange,
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const payments = paymentsData?.data as any;

  // Mock data for demonstration
  const enrolledWorkers = payments?.enrolledWorkers || 24;
  const totalWorkers = payments?.totalWorkers || 32;
  const totalTransferred = payments?.totalTransferred || 4850;
  const transferCount = payments?.transferCount || 67;
  const avgTransferAmount = payments?.avgTransferAmount || 72.39;
  const feeRevenue = payments?.feeRevenue || 145.5;

  const pendingTransfers: PendingTransfer[] = payments?.pendingTransfers || [
    {
      id: "pt1",
      workerId: "w1",
      workerName: "John Smith",
      amount: 85.0,
      earnedBalance: 185.0,
      requestedAt: "2024-01-18T14:30:00",
      status: "pending",
    },
    {
      id: "pt2",
      workerId: "w2",
      workerName: "Sarah Johnson",
      amount: 120.0,
      earnedBalance: 320.0,
      requestedAt: "2024-01-18T10:15:00",
      status: "processing",
    },
  ];

  const transferHistory = payments?.transferHistory || [
    { date: "Jan 12", amount: 450 },
    { date: "Jan 13", amount: 380 },
    { date: "Jan 14", amount: 520 },
    { date: "Jan 15", amount: 680 },
    { date: "Jan 16", amount: 590 },
    { date: "Jan 17", amount: 720 },
    { date: "Jan 18", amount: 850 },
  ];

  const pendingColumns = [
    {
      title: "Worker",
      key: "worker",
      render: (_: any, record: PendingTransfer) => (
        <Text style={{ color: "#fff" }}>{record.workerName}</Text>
      ),
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount: number) => (
        <Text style={{ color: "#52c41a" }}>${amount.toFixed(2)}</Text>
      ),
    },
    {
      title: "Earned Balance",
      dataIndex: "earnedBalance",
      key: "earnedBalance",
      render: (balance: number) => (
        <Text type="secondary">${balance.toFixed(2)}</Text>
      ),
    },
    {
      title: "Requested",
      dataIndex: "requestedAt",
      key: "requestedAt",
      render: (date: string) => (
        <Text type="secondary">{format(parseISO(date), "MMM d, h:mm a")}</Text>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status: string) => {
        const colors: Record<string, string> = {
          pending: "gold",
          processing: "blue",
          completed: "green",
          failed: "red",
        };
        return (
          <Tag color={colors[status] || "default"}>
            {status.toUpperCase()}
          </Tag>
        );
      },
    },
  ];

  const enrollmentRate = (enrolledWorkers / totalWorkers) * 100;

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
            <WalletOutlined style={{ fontSize: 28, color: "#52c41a" }} />
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              Instant Pay Overview
            </Title>
          </Space>
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            Manage earned wage access and instant pay transfers
          </Text>
        </div>
        <Button icon={<DownloadOutlined />}>Export Report</Button>
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
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Enrolled Workers</Text>}
              value={enrolledWorkers}
              suffix={`/ ${totalWorkers}`}
              prefix={<TeamOutlined style={{ color: "#4a90d9" }} />}
              valueStyle={{ color: "#fff" }}
            />
            <Progress
              percent={enrollmentRate}
              size="small"
              showInfo={false}
              strokeColor="#4a90d9"
              trailColor="#2a2a4e"
              style={{ marginTop: 8 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {enrollmentRate.toFixed(0)}% enrollment rate
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Total Transferred</Text>}
              value={totalTransferred}
              precision={2}
              prefix={<DollarOutlined style={{ color: "#52c41a" }} />}
              valueStyle={{ color: "#52c41a" }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>
              {transferCount} transfers this period
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Avg Transfer Amount</Text>}
              value={avgTransferAmount}
              precision={2}
              prefix="$"
              valueStyle={{ color: "#fff" }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>
              Per worker request
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={<Text type="secondary">Fee Revenue</Text>}
              value={feeRevenue}
              precision={2}
              prefix={<BankOutlined style={{ color: "#722ed1" }} />}
              valueStyle={{ color: "#722ed1" }}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: "block" }}>
              From processing fees
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Transfer Activity and Pending */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <RiseOutlined style={{ color: "#52c41a" }} />
                <span>Transfer Activity</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <TransferChart data={transferHistory} />

            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
              <Col span={12}>
                <Space direction="vertical" size={0}>
                  <Text type="secondary">Peak Day</Text>
                  <Text style={{ color: "#fff", fontSize: 16 }}>
                    {transferHistory.reduce(
                      (max: any, d: any) => (d.amount > max.amount ? d : max),
                      transferHistory[0]
                    )?.date || "-"}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    $
                    {Math.max(...transferHistory.map((d: any) => d.amount)).toFixed(
                      2
                    )}{" "}
                    transferred
                  </Text>
                </Space>
              </Col>
              <Col span={12}>
                <Space direction="vertical" size={0}>
                  <Text type="secondary">Daily Average</Text>
                  <Text style={{ color: "#fff", fontSize: 16 }}>
                    $
                    {(
                      transferHistory.reduce((sum: number, d: any) => sum + d.amount, 0) /
                      transferHistory.length
                    ).toFixed(2)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    per day
                  </Text>
                </Space>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: "#faad14" }} />
                <span>Pending Transfers</span>
                {pendingTransfers.length > 0 && (
                  <Tag color="gold">{pendingTransfers.length}</Tag>
                )}
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            {pendingTransfers.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <Space direction="vertical">
                    <CheckCircleOutlined style={{ fontSize: 32, color: "#52c41a" }} />
                    <Text type="secondary">No pending transfers</Text>
                  </Space>
                }
              />
            ) : (
              <Table
                dataSource={pendingTransfers}
                columns={pendingColumns}
                pagination={false}
                size="small"
                rowKey="id"
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* How It Works */}
      <Card
        title={
          <Space>
            <ThunderboltOutlined style={{ color: "#4a90d9" }} />
            <span>How Instant Pay Works</span>
          </Space>
        }
        style={{ backgroundColor: "#16213e", borderColor: "#2a2a4e", marginTop: 24 }}
        headStyle={{ borderColor: "#2a2a4e" }}
      >
        <Row gutter={[24, 16]}>
          <Col xs={24} md={6}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "#4a90d9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  color: "#fff",
                }}
              >
                1
              </div>
              <Text style={{ color: "#fff" }}>Worker Earns Wages</Text>
              <Text type="secondary" style={{ textAlign: "center", fontSize: 12 }}>
                Earnings are tracked in real-time as shifts are completed
              </Text>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "#52c41a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  color: "#fff",
                }}
              >
                2
              </div>
              <Text style={{ color: "#fff" }}>Request Transfer</Text>
              <Text type="secondary" style={{ textAlign: "center", fontSize: 12 }}>
                Workers can request up to 50% of earned wages via the app
              </Text>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "#722ed1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  color: "#fff",
                }}
              >
                3
              </div>
              <Text style={{ color: "#fff" }}>Instant Deposit</Text>
              <Text type="secondary" style={{ textAlign: "center", fontSize: 12 }}>
                Funds are deposited to their bank account within minutes
              </Text>
            </Space>
          </Col>
          <Col xs={24} md={6}>
            <Space direction="vertical" align="center" style={{ width: "100%" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  backgroundColor: "#faad14",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  color: "#fff",
                }}
              >
                4
              </div>
              <Text style={{ color: "#fff" }}>Payroll Deducted</Text>
              <Text type="secondary" style={{ textAlign: "center", fontSize: 12 }}>
                Transferred amounts are deducted from regular payroll
              </Text>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  );
};
