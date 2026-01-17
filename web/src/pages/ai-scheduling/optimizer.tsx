import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Button,
  Table,
  Tag,
  Progress,
  Statistic,
  Alert,
  Spin,
  Divider,
  Collapse,
  List,
  message,
  Modal,
} from "antd";
import {
  ThunderboltOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  ExclamationCircleOutlined,
  RobotOutlined,
  CalendarOutlined,
  TeamOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { format, parseISO, addDays } from "date-fns";

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface OptimizationResult {
  totalSavings: number;
  efficiencyGain: number;
  changes: ScheduleChange[];
  summary: {
    shiftsOptimized: number;
    hoursReduced: number;
    overtimeEliminated: number;
    coverageImproved: number;
  };
}

interface ScheduleChange {
  id: string;
  type: "swap" | "reduce" | "extend" | "reassign";
  shiftId: string;
  date: string;
  position: string;
  currentWorker: { id: string; name: string };
  suggestedWorker?: { id: string; name: string };
  currentTime: { start: string; end: string };
  suggestedTime?: { start: string; end: string };
  reason: string;
  savings: number;
  impact: "high" | "medium" | "low";
}

export const ScheduleOptimizer = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResult | null>(null);
  const [selectedChanges, setSelectedChanges] = useState<Set<string>>(new Set());
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Fetch current schedule summary
  const { data: scheduleData, isLoading } = useCustom({
    url: `/ai-scheduling/${identity?.restaurantId}/schedule-summary`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const schedule = scheduleData?.data as any;

  // Mock current schedule stats
  const currentStats = schedule || {
    totalHours: 485,
    totalCost: 7850,
    efficiency: 78,
    overtimeHours: 24,
    coverageGaps: 3,
    overstaffedPeriods: 5,
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Mock optimization result
      const mockResult: OptimizationResult = {
        totalSavings: 342,
        efficiencyGain: 12,
        changes: [
          {
            id: "c1",
            type: "swap",
            shiftId: "s1",
            date: format(addDays(new Date(), 2), "yyyy-MM-dd"),
            position: "SERVER",
            currentWorker: { id: "w1", name: "John Smith" },
            suggestedWorker: { id: "w2", name: "Sarah Johnson" },
            currentTime: { start: "17:00", end: "23:00" },
            reason:
              "Sarah has higher performance for evening shifts and John is approaching overtime",
            savings: 45,
            impact: "high",
          },
          {
            id: "c2",
            type: "reduce",
            shiftId: "s2",
            date: format(addDays(new Date(), 3), "yyyy-MM-dd"),
            position: "LINE_COOK",
            currentWorker: { id: "w3", name: "Michael Chen" },
            currentTime: { start: "06:00", end: "15:00" },
            suggestedTime: { start: "07:00", end: "15:00" },
            reason:
              "Historical data shows low demand before 7 AM on this day",
            savings: 18,
            impact: "medium",
          },
          {
            id: "c3",
            type: "reassign",
            shiftId: "s3",
            date: format(addDays(new Date(), 4), "yyyy-MM-dd"),
            position: "HOST",
            currentWorker: { id: "w4", name: "Emily Davis" },
            suggestedWorker: { id: "w5", name: "Alex Taylor" },
            currentTime: { start: "11:00", end: "19:00" },
            reason:
              "Emily at overtime risk. Alex has availability and cross-trained for HOST",
            savings: 85,
            impact: "high",
          },
          {
            id: "c4",
            type: "reduce",
            shiftId: "s4",
            date: format(addDays(new Date(), 2), "yyyy-MM-dd"),
            position: "BARTENDER",
            currentWorker: { id: "w6", name: "David Wilson" },
            currentTime: { start: "14:00", end: "23:00" },
            suggestedTime: { start: "16:00", end: "23:00" },
            reason:
              "Bar traffic typically picks up after 4 PM on weekdays",
            savings: 34,
            impact: "low",
          },
          {
            id: "c5",
            type: "swap",
            shiftId: "s5",
            date: format(addDays(new Date(), 5), "yyyy-MM-dd"),
            position: "SERVER",
            currentWorker: { id: "w7", name: "Lisa Brown" },
            suggestedWorker: { id: "w8", name: "Chris Martinez" },
            currentTime: { start: "11:00", end: "17:00" },
            reason:
              "Chris prefers daytime shifts and has better lunch service ratings",
            savings: 0,
            impact: "medium",
          },
        ],
        summary: {
          shiftsOptimized: 5,
          hoursReduced: 8,
          overtimeEliminated: 24,
          coverageImproved: 2,
        },
      };

      setOptimizationResult(mockResult);
      setSelectedChanges(new Set(mockResult.changes.map((c) => c.id)));
    } catch (error) {
      message.error("Failed to optimize schedule");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApplyChanges = async () => {
    if (selectedChanges.size === 0) {
      message.warning("Please select at least one change to apply");
      return;
    }

    setShowConfirmModal(false);
    setIsApplying(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      message.success(`Successfully applied ${selectedChanges.size} optimizations`);
      setOptimizationResult(null);
      setSelectedChanges(new Set());
    } catch (error) {
      message.error("Failed to apply changes");
    } finally {
      setIsApplying(false);
    }
  };

  const toggleChange = (id: string) => {
    const newSelected = new Set(selectedChanges);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedChanges(newSelected);
  };

  const getChangeTypeIcon = (type: string) => {
    switch (type) {
      case "swap":
        return <SwapOutlined style={{ color: "#4a90d9" }} />;
      case "reduce":
        return <ClockCircleOutlined style={{ color: "#faad14" }} />;
      case "extend":
        return <ClockCircleOutlined style={{ color: "#52c41a" }} />;
      case "reassign":
        return <TeamOutlined style={{ color: "#722ed1" }} />;
      default:
        return <CalendarOutlined />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case "high":
        return "green";
      case "medium":
        return "blue";
      case "low":
        return "default";
      default:
        return "default";
    }
  };

  const selectedSavings = optimizationResult?.changes
    .filter((c) => selectedChanges.has(c.id))
    .reduce((sum, c) => sum + c.savings, 0) || 0;

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center">
          <ThunderboltOutlined style={{ fontSize: 28, color: "#722ed1" }} />
          <Title level={2} style={{ color: "#fff", margin: 0 }}>
            Schedule Optimizer
          </Title>
        </Space>
        <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          AI-powered schedule optimization to reduce costs and improve efficiency
        </Text>
      </div>

      {/* Current Schedule Overview */}
      <Card
        title={
          <Space>
            <CalendarOutlined style={{ color: "#4a90d9" }} />
            <span>Current Schedule Overview (Next 7 Days)</span>
          </Space>
        }
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
        headStyle={{ borderColor: "#2a2a4e" }}
        loading={isLoading}
      >
        <Row gutter={[24, 24]}>
          <Col xs={12} md={4}>
            <Statistic
              title={<Text type="secondary">Total Hours</Text>}
              value={currentStats.totalHours}
              suffix="h"
              valueStyle={{ color: "#fff" }}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic
              title={<Text type="secondary">Labor Cost</Text>}
              value={currentStats.totalCost}
              prefix="$"
              valueStyle={{ color: "#fff" }}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic
              title={<Text type="secondary">Efficiency</Text>}
              value={currentStats.efficiency}
              suffix="%"
              valueStyle={{
                color: currentStats.efficiency >= 85 ? "#52c41a" : "#faad14",
              }}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic
              title={<Text type="secondary">Overtime Hours</Text>}
              value={currentStats.overtimeHours}
              suffix="h"
              valueStyle={{
                color: currentStats.overtimeHours > 0 ? "#ef4444" : "#52c41a",
              }}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic
              title={<Text type="secondary">Coverage Gaps</Text>}
              value={currentStats.coverageGaps}
              valueStyle={{
                color: currentStats.coverageGaps > 0 ? "#faad14" : "#52c41a",
              }}
            />
          </Col>
          <Col xs={12} md={4}>
            <Statistic
              title={<Text type="secondary">Overstaffed</Text>}
              value={currentStats.overstaffedPeriods}
              suffix=" periods"
              valueStyle={{
                color: currentStats.overstaffedPeriods > 0 ? "#faad14" : "#52c41a",
              }}
            />
          </Col>
        </Row>

        <Divider style={{ borderColor: "#2a2a4e" }} />

        <div style={{ textAlign: "center" }}>
          <Button
            type="primary"
            size="large"
            icon={<RobotOutlined />}
            onClick={handleOptimize}
            loading={isOptimizing}
            style={{
              backgroundColor: "#722ed1",
              borderColor: "#722ed1",
              height: 48,
              paddingLeft: 32,
              paddingRight: 32,
            }}
          >
            {isOptimizing ? "Analyzing Schedule..." : "Optimize Schedule"}
          </Button>
          <br />
          <Text type="secondary" style={{ marginTop: 8, display: "inline-block" }}>
            AI will analyze your schedule and suggest improvements
          </Text>
        </div>
      </Card>

      {/* Optimization Results */}
      {optimizationResult && (
        <>
          {/* Savings Summary */}
          <Card
            style={{
              backgroundColor: "#1a2a1a",
              borderColor: "#52c41a",
              marginBottom: 24,
            }}
          >
            <Row gutter={[24, 24]} align="middle">
              <Col xs={24} md={6}>
                <Space direction="vertical" align="center" style={{ width: "100%" }}>
                  <TrophyOutlined style={{ fontSize: 48, color: "#52c41a" }} />
                  <Text style={{ color: "#52c41a", fontSize: 18 }}>
                    Optimization Complete!
                  </Text>
                </Space>
              </Col>
              <Col xs={12} md={4}>
                <Statistic
                  title={<Text type="secondary">Potential Savings</Text>}
                  value={optimizationResult.totalSavings}
                  prefix="$"
                  valueStyle={{ color: "#52c41a", fontSize: 28 }}
                />
              </Col>
              <Col xs={12} md={4}>
                <Statistic
                  title={<Text type="secondary">Efficiency Gain</Text>}
                  value={optimizationResult.efficiencyGain}
                  suffix="%"
                  valueStyle={{ color: "#52c41a", fontSize: 28 }}
                />
              </Col>
              <Col xs={12} md={4}>
                <Statistic
                  title={<Text type="secondary">Shifts Optimized</Text>}
                  value={optimizationResult.summary.shiftsOptimized}
                  valueStyle={{ color: "#fff", fontSize: 28 }}
                />
              </Col>
              <Col xs={12} md={6} style={{ textAlign: "right" }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckCircleOutlined />}
                  onClick={() => setShowConfirmModal(true)}
                  loading={isApplying}
                  disabled={selectedChanges.size === 0}
                >
                  Apply Selected (${selectedSavings})
                </Button>
              </Col>
            </Row>
          </Card>

          {/* Before/After Comparison */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={12}>
              <Card
                title="Current Schedule"
                style={{ backgroundColor: "#2a1a1a", borderColor: "#ef444440" }}
                headStyle={{ borderColor: "#ef444440" }}
              >
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Labor Cost</Text>}
                      value={currentStats.totalCost}
                      prefix="$"
                      valueStyle={{ color: "#fff" }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Overtime</Text>}
                      value={currentStats.overtimeHours}
                      suffix="h"
                      valueStyle={{ color: "#ef4444" }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Efficiency</Text>}
                      value={currentStats.efficiency}
                      suffix="%"
                      valueStyle={{ color: "#faad14" }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Coverage Gaps</Text>}
                      value={currentStats.coverageGaps}
                      valueStyle={{ color: "#faad14" }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card
                title="After Optimization"
                style={{ backgroundColor: "#1a2a1a", borderColor: "#52c41a40" }}
                headStyle={{ borderColor: "#52c41a40" }}
              >
                <Row gutter={[16, 16]}>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Labor Cost</Text>}
                      value={currentStats.totalCost - selectedSavings}
                      prefix="$"
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Overtime</Text>}
                      value={Math.max(
                        0,
                        currentStats.overtimeHours -
                          optimizationResult.summary.overtimeEliminated
                      )}
                      suffix="h"
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Efficiency</Text>}
                      value={
                        currentStats.efficiency + optimizationResult.efficiencyGain
                      }
                      suffix="%"
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title={<Text type="secondary">Coverage Gaps</Text>}
                      value={Math.max(
                        0,
                        currentStats.coverageGaps -
                          optimizationResult.summary.coverageImproved
                      )}
                      valueStyle={{ color: "#52c41a" }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          {/* Suggested Changes */}
          <Card
            title={
              <Space>
                <SwapOutlined style={{ color: "#4a90d9" }} />
                <span>Suggested Changes</span>
                <Tag color="blue">{optimizationResult.changes.length} changes</Tag>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
          >
            <List
              dataSource={optimizationResult.changes}
              renderItem={(change) => (
                <List.Item
                  style={{
                    backgroundColor: selectedChanges.has(change.id)
                      ? "#1a2a3e"
                      : "transparent",
                    borderColor: "#2a2a4e",
                    padding: 16,
                    marginBottom: 8,
                    borderRadius: 8,
                    cursor: "pointer",
                    border: selectedChanges.has(change.id)
                      ? "1px solid #4a90d9"
                      : "1px solid #2a2a4e",
                  }}
                  onClick={() => toggleChange(change.id)}
                >
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          backgroundColor: "#16213e",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                        }}
                      >
                        {getChangeTypeIcon(change.type)}
                      </div>
                    }
                    title={
                      <Space>
                        <Text style={{ color: "#fff" }}>
                          {format(parseISO(change.date), "EEE, MMM d")}
                        </Text>
                        <Tag color="blue">{change.position.replace(/_/g, " ")}</Tag>
                        <Tag color={getImpactColor(change.impact)}>
                          {change.impact.toUpperCase()} IMPACT
                        </Tag>
                        {change.savings > 0 && (
                          <Tag color="green">Save ${change.savings}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
                        <div>
                          {change.type === "swap" && (
                            <Text type="secondary">
                              Swap {change.currentWorker.name}{" "}
                              <ArrowRightOutlined />{" "}
                              {change.suggestedWorker?.name}
                            </Text>
                          )}
                          {change.type === "reduce" && (
                            <Text type="secondary">
                              Reduce shift from {change.currentTime.start}-
                              {change.currentTime.end} to{" "}
                              {change.suggestedTime?.start}-
                              {change.suggestedTime?.end}
                            </Text>
                          )}
                          {change.type === "reassign" && (
                            <Text type="secondary">
                              Reassign from {change.currentWorker.name}{" "}
                              <ArrowRightOutlined />{" "}
                              {change.suggestedWorker?.name}
                            </Text>
                          )}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {change.reason}
                        </Text>
                      </Space>
                    }
                  />
                  <div>
                    <CheckCircleOutlined
                      style={{
                        fontSize: 24,
                        color: selectedChanges.has(change.id)
                          ? "#52c41a"
                          : "#2a2a4e",
                      }}
                    />
                  </div>
                </List.Item>
              )}
            />
          </Card>
        </>
      )}

      {/* Confirmation Modal */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: "#faad14" }} />
            <span>Confirm Schedule Changes</span>
          </Space>
        }
        open={showConfirmModal}
        onOk={handleApplyChanges}
        onCancel={() => setShowConfirmModal(false)}
        okText={`Apply ${selectedChanges.size} Changes`}
        okButtonProps={{
          style: { backgroundColor: "#52c41a", borderColor: "#52c41a" },
        }}
      >
        <Paragraph>
          You are about to apply {selectedChanges.size} schedule changes:
        </Paragraph>
        <ul>
          <li>Estimated savings: ${selectedSavings}</li>
          <li>
            Workers will be notified of any changes to their assigned shifts
          </li>
          <li>This action cannot be automatically undone</li>
        </ul>
        <Paragraph>Are you sure you want to proceed?</Paragraph>
      </Modal>
    </div>
  );
};
