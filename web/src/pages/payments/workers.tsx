import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Table,
  Tag,
  Avatar,
  Input,
  Button,
  Switch,
  Modal,
  Form,
  InputNumber,
  message,
  Empty,
  Popconfirm,
  Tooltip,
} from "antd";
import {
  UserOutlined,
  SearchOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  BankOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SettingOutlined,
  WalletOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { format, parseISO } from "date-fns";

const { Title, Text } = Typography;

interface WorkerPayStatus {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  enrolled: boolean;
  enrolledAt?: string;
  bankConnected: boolean;
  earnedBalance: number;
  availableBalance: number;
  pendingTransfer?: number;
  totalTransferred: number;
  transferCount: number;
  lastTransfer?: string;
  maxAdvancePercent: number;
}

interface TransferRequest {
  id: string;
  workerId: string;
  workerName: string;
  amount: number;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  processedAt?: string;
}

export const PaymentsWorkers = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [searchText, setSearchText] = useState("");
  const [enrollmentFilter, setEnrollmentFilter] = useState<
    "all" | "enrolled" | "not-enrolled"
  >("all");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerPayStatus | null>(
    null
  );

  const [form] = Form.useForm();

  // Fetch workers pay status
  const { data: workersData, isLoading, refetch } = useCustom({
    url: `/payments/${identity?.restaurantId}/workers`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const workers: WorkerPayStatus[] = workersData?.data?.workers || [
    {
      id: "w1",
      firstName: "Sarah",
      lastName: "Johnson",
      email: "sarah.j@email.com",
      enrolled: true,
      enrolledAt: "2023-10-15",
      bankConnected: true,
      earnedBalance: 485.0,
      availableBalance: 242.5,
      totalTransferred: 1250.0,
      transferCount: 18,
      lastTransfer: "2024-01-17",
      maxAdvancePercent: 50,
    },
    {
      id: "w2",
      firstName: "Michael",
      lastName: "Chen",
      email: "m.chen@email.com",
      enrolled: true,
      enrolledAt: "2023-11-20",
      bankConnected: true,
      earnedBalance: 320.0,
      availableBalance: 160.0,
      pendingTransfer: 80.0,
      totalTransferred: 890.0,
      transferCount: 12,
      lastTransfer: "2024-01-18",
      maxAdvancePercent: 50,
    },
    {
      id: "w3",
      firstName: "John",
      lastName: "Smith",
      email: "john.smith@email.com",
      enrolled: true,
      enrolledAt: "2024-01-05",
      bankConnected: false,
      earnedBalance: 185.0,
      availableBalance: 0,
      totalTransferred: 0,
      transferCount: 0,
      maxAdvancePercent: 50,
    },
    {
      id: "w4",
      firstName: "Emily",
      lastName: "Davis",
      email: "emily.d@email.com",
      enrolled: false,
      bankConnected: false,
      earnedBalance: 420.0,
      availableBalance: 0,
      totalTransferred: 0,
      transferCount: 0,
      maxAdvancePercent: 50,
    },
    {
      id: "w5",
      firstName: "David",
      lastName: "Wilson",
      email: "d.wilson@email.com",
      enrolled: true,
      enrolledAt: "2023-09-01",
      bankConnected: true,
      earnedBalance: 560.0,
      availableBalance: 280.0,
      totalTransferred: 2150.0,
      transferCount: 28,
      lastTransfer: "2024-01-16",
      maxAdvancePercent: 50,
    },
  ];

  const recentTransfers: TransferRequest[] =
    workersData?.data?.recentTransfers || [
      {
        id: "t1",
        workerId: "w2",
        workerName: "Michael Chen",
        amount: 80.0,
        requestedAt: "2024-01-18T10:30:00",
        status: "pending",
      },
      {
        id: "t2",
        workerId: "w1",
        workerName: "Sarah Johnson",
        amount: 65.0,
        requestedAt: "2024-01-17T15:45:00",
        status: "approved",
        processedAt: "2024-01-17T15:48:00",
      },
      {
        id: "t3",
        workerId: "w5",
        workerName: "David Wilson",
        amount: 100.0,
        requestedAt: "2024-01-16T09:00:00",
        status: "approved",
        processedAt: "2024-01-16T09:02:00",
      },
    ];

  // Filter workers
  const filteredWorkers = workers.filter((worker) => {
    const matchesSearch =
      !searchText ||
      `${worker.firstName} ${worker.lastName}`
        .toLowerCase()
        .includes(searchText.toLowerCase()) ||
      worker.email.toLowerCase().includes(searchText.toLowerCase());

    const matchesEnrollment =
      enrollmentFilter === "all" ||
      (enrollmentFilter === "enrolled" && worker.enrolled) ||
      (enrollmentFilter === "not-enrolled" && !worker.enrolled);

    return matchesSearch && matchesEnrollment;
  });

  const handleEnrollmentToggle = async (workerId: string, enroll: boolean) => {
    try {
      // In real implementation, call API
      await new Promise((resolve) => setTimeout(resolve, 500));
      message.success(
        enroll
          ? "Worker enrolled in Instant Pay"
          : "Worker removed from Instant Pay"
      );
      refetch();
    } catch (error) {
      message.error("Failed to update enrollment");
    }
  };

  const handleOpenSettings = (worker: WorkerPayStatus) => {
    setSelectedWorker(worker);
    form.setFieldsValue({
      maxAdvancePercent: worker.maxAdvancePercent,
    });
    setShowSettingsModal(true);
  };

  const handleSaveSettings = async () => {
    try {
      const values = await form.validateFields();
      // In real implementation, call API
      await new Promise((resolve) => setTimeout(resolve, 500));
      message.success("Settings saved");
      setShowSettingsModal(false);
      refetch();
    } catch (error) {
      // Validation error
    }
  };

  const workersColumns = [
    {
      title: "Worker",
      key: "worker",
      render: (_: any, record: WorkerPayStatus) => (
        <Space>
          <Avatar style={{ backgroundColor: record.enrolled ? "#52c41a" : "#666" }}>
            {record.firstName[0]}
            {record.lastName[0]}
          </Avatar>
          <div>
            <Text style={{ color: "#fff" }}>
              {record.firstName} {record.lastName}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: 150,
      render: (_: any, record: WorkerPayStatus) => (
        <Space direction="vertical" size={4}>
          {record.enrolled ? (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              Enrolled
            </Tag>
          ) : (
            <Tag color="default" icon={<CloseCircleOutlined />}>
              Not Enrolled
            </Tag>
          )}
          {record.enrolled && !record.bankConnected && (
            <Tag color="orange" icon={<ExclamationCircleOutlined />}>
              Bank Not Connected
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Earned Balance",
      dataIndex: "earnedBalance",
      key: "earnedBalance",
      sorter: (a: WorkerPayStatus, b: WorkerPayStatus) =>
        a.earnedBalance - b.earnedBalance,
      render: (balance: number) => (
        <Text style={{ color: "#fff" }}>${balance.toFixed(2)}</Text>
      ),
    },
    {
      title: "Available",
      key: "availableBalance",
      render: (_: any, record: WorkerPayStatus) => (
        <Space direction="vertical" size={0}>
          <Text style={{ color: record.availableBalance > 0 ? "#52c41a" : "#666" }}>
            ${record.availableBalance.toFixed(2)}
          </Text>
          {record.pendingTransfer && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              ${record.pendingTransfer.toFixed(2)} pending
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: "Total Transferred",
      dataIndex: "totalTransferred",
      key: "totalTransferred",
      sorter: (a: WorkerPayStatus, b: WorkerPayStatus) =>
        a.totalTransferred - b.totalTransferred,
      render: (total: number, record: WorkerPayStatus) => (
        <Space direction="vertical" size={0}>
          <Text style={{ color: "#fff" }}>${total.toFixed(2)}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.transferCount} transfers
          </Text>
        </Space>
      ),
    },
    {
      title: "Last Transfer",
      dataIndex: "lastTransfer",
      key: "lastTransfer",
      render: (date: string) =>
        date ? (
          <Text type="secondary">{format(parseISO(date), "MMM d, yyyy")}</Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 150,
      render: (_: any, record: WorkerPayStatus) => (
        <Space>
          <Tooltip title={record.enrolled ? "Disable Instant Pay" : "Enable Instant Pay"}>
            <Switch
              checked={record.enrolled}
              onChange={(checked) => handleEnrollmentToggle(record.id, checked)}
              size="small"
            />
          </Tooltip>
          {record.enrolled && (
            <Button
              icon={<SettingOutlined />}
              size="small"
              onClick={() => handleOpenSettings(record)}
            >
              Settings
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const transferColumns = [
    {
      title: "Worker",
      dataIndex: "workerName",
      key: "workerName",
      render: (name: string) => <Text style={{ color: "#fff" }}>{name}</Text>,
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
        const config: Record<string, { color: string; icon: React.ReactNode }> = {
          pending: { color: "gold", icon: <ClockCircleOutlined /> },
          approved: { color: "green", icon: <CheckCircleOutlined /> },
          rejected: { color: "red", icon: <CloseCircleOutlined /> },
        };
        return (
          <Tag color={config[status]?.color} icon={config[status]?.icon}>
            {status.toUpperCase()}
          </Tag>
        );
      },
    },
  ];

  // Stats
  const enrolledCount = workers.filter((w) => w.enrolled).length;
  const withBalanceCount = workers.filter((w) => w.availableBalance > 0).length;
  const pendingCount = recentTransfers.filter((t) => t.status === "pending").length;

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <UserOutlined style={{ fontSize: 28, color: "#4a90d9" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Worker Pay Status
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          Manage worker enrollment and view earned wage balances
        </Text>
      </div>

      {/* Summary Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space>
              <WalletOutlined style={{ fontSize: 24, color: "#52c41a" }} />
              <div>
                <Text type="secondary">Enrolled</Text>
                <br />
                <Text style={{ color: "#fff", fontSize: 20 }}>
                  {enrolledCount} / {workers.length}
                </Text>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space>
              <DollarOutlined style={{ fontSize: 24, color: "#4a90d9" }} />
              <div>
                <Text type="secondary">With Available Balance</Text>
                <br />
                <Text style={{ color: "#fff", fontSize: 20 }}>
                  {withBalanceCount} workers
                </Text>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space>
              <ClockCircleOutlined style={{ fontSize: 24, color: "#faad14" }} />
              <div>
                <Text type="secondary">Pending Requests</Text>
                <br />
                <Text style={{ color: "#faad14", fontSize: 20 }}>
                  {pendingCount}
                </Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Workers Table */}
      <Card
        title={
          <Space>
            <UserOutlined />
            <span>Workers</span>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
        headStyle={{ borderColor: "#2a2a4e" }}
        extra={
          <Space>
            <Input
              placeholder="Search workers..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              type={enrollmentFilter === "enrolled" ? "primary" : "default"}
              onClick={() =>
                setEnrollmentFilter(
                  enrollmentFilter === "enrolled" ? "all" : "enrolled"
                )
              }
            >
              Enrolled Only
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={filteredWorkers}
          columns={workersColumns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Recent Transfers */}
      <Card
        title={
          <Space>
            <HistoryOutlined style={{ color: "#722ed1" }} />
            <span>Recent Transfer Requests</span>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
        headStyle={{ borderColor: "#2a2a4e" }}
      >
        {recentTransfers.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Text type="secondary">No recent transfers</Text>}
          />
        ) : (
          <Table
            dataSource={recentTransfers}
            columns={transferColumns}
            rowKey="id"
            pagination={false}
            size="small"
          />
        )}
      </Card>

      {/* Settings Modal */}
      <Modal
        title={
          <Space>
            <SettingOutlined />
            <span>
              Instant Pay Settings - {selectedWorker?.firstName}{" "}
              {selectedWorker?.lastName}
            </span>
          </Space>
        }
        open={showSettingsModal}
        onOk={handleSaveSettings}
        onCancel={() => setShowSettingsModal(false)}
        okText="Save Settings"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="maxAdvancePercent"
            label="Maximum Advance Percentage"
            extra="Percentage of earned wages the worker can access instantly"
            rules={[{ required: true, message: "Please enter a percentage" }]}
          >
            <InputNumber
              min={10}
              max={100}
              step={5}
              formatter={(value) => `${value}%`}
              parser={(value) => value!.replace("%", "") as any}
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Space direction="vertical" style={{ width: "100%" }}>
            <Text type="secondary">Current Status</Text>
            <div
              style={{
                backgroundColor: "#16213e",
                padding: 16,
                borderRadius: 8,
              }}
            >
              <Row gutter={[16, 8]}>
                <Col span={12}>
                  <Text type="secondary">Earned Balance:</Text>
                </Col>
                <Col span={12} style={{ textAlign: "right" }}>
                  <Text style={{ color: "#fff" }}>
                    ${selectedWorker?.earnedBalance.toFixed(2)}
                  </Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Available Balance:</Text>
                </Col>
                <Col span={12} style={{ textAlign: "right" }}>
                  <Text style={{ color: "#52c41a" }}>
                    ${selectedWorker?.availableBalance.toFixed(2)}
                  </Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">Bank Connected:</Text>
                </Col>
                <Col span={12} style={{ textAlign: "right" }}>
                  {selectedWorker?.bankConnected ? (
                    <Tag color="green">Yes</Tag>
                  ) : (
                    <Tag color="orange">No</Tag>
                  )}
                </Col>
              </Row>
            </div>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};
