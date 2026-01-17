import { useState } from "react";
import { useCustom, useGetIdentity } from "@refinedev/core";
import {
  Card,
  Col,
  Row,
  Typography,
  Space,
  Button,
  Tag,
  Empty,
  Checkbox,
  Alert,
  Spin,
  Divider,
  message,
} from "antd";
import {
  RobotOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { format, parseISO } from "date-fns";
import { WorkerSuggestionCard } from "../../components/ai/WorkerSuggestionCard";

const { Title, Text, Paragraph } = Typography;

interface OpenShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  position: string;
  suggestions: WorkerSuggestion[];
  selected?: string; // Selected worker ID
}

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

export const AISuggestions = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [isAssigning, setIsAssigning] = useState(false);

  // Fetch open shifts with AI suggestions
  const { data: suggestionsData, isLoading, refetch } = useCustom({
    url: `/ai-scheduling/${identity?.restaurantId}/suggestions`,
    method: "get",
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const openShifts: OpenShift[] = suggestionsData?.data?.shifts || [
    {
      id: "shift-1",
      date: "2024-01-20",
      startTime: "2024-01-20T06:00:00",
      endTime: "2024-01-20T14:00:00",
      position: "LINE_COOK",
      suggestions: [
        {
          workerId: "w1",
          firstName: "Michael",
          lastName: "Chen",
          matchScore: 94,
          reasons: [
            "Certified for this position",
            "Strong morning availability",
            "High reliability score (92%)",
            "4 similar shifts completed this month",
          ],
          availability: "confirmed",
          reliabilityScore: 0.92,
          previousShiftsInPosition: 45,
        },
        {
          workerId: "w2",
          firstName: "David",
          lastName: "Wilson",
          matchScore: 82,
          reasons: [
            "Secondary position: LINE_COOK",
            "Available based on preferences",
            "Good reliability (88%)",
          ],
          availability: "likely",
          reliabilityScore: 0.88,
          previousShiftsInPosition: 12,
        },
        {
          workerId: "w3",
          firstName: "James",
          lastName: "Brown",
          matchScore: 71,
          reasons: [
            "Cross-trained for position",
            "Morning availability",
          ],
          availability: "unknown",
          reliabilityScore: 0.85,
          previousShiftsInPosition: 5,
        },
      ],
    },
    {
      id: "shift-2",
      date: "2024-01-20",
      startTime: "2024-01-20T17:00:00",
      endTime: "2024-01-20T23:00:00",
      position: "SERVER",
      suggestions: [
        {
          workerId: "w4",
          firstName: "Sarah",
          lastName: "Johnson",
          matchScore: 97,
          reasons: [
            "Top performer in this role",
            "Excellent reliability (96%)",
            "Specifically requested evening shifts",
            "High customer ratings",
          ],
          availability: "confirmed",
          reliabilityScore: 0.96,
          previousShiftsInPosition: 156,
        },
        {
          workerId: "w5",
          firstName: "Emily",
          lastName: "Davis",
          matchScore: 89,
          reasons: [
            "Primary position: SERVER",
            "Evening availability confirmed",
            "Good track record",
          ],
          availability: "confirmed",
          reliabilityScore: 0.94,
          previousShiftsInPosition: 98,
        },
      ],
    },
    {
      id: "shift-3",
      date: "2024-01-21",
      startTime: "2024-01-21T11:00:00",
      endTime: "2024-01-21T19:00:00",
      position: "BARTENDER",
      suggestions: [
        {
          workerId: "w6",
          firstName: "John",
          lastName: "Smith",
          matchScore: 76,
          reasons: [
            "Primary position: BARTENDER",
            "Weekend availability",
          ],
          availability: "likely",
          reliabilityScore: 0.75,
          previousShiftsInPosition: 67,
        },
      ],
    },
  ];

  const handleSelectWorker = (shiftId: string, workerId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [shiftId]: workerId,
    }));
    setSelectedShifts((prev) => new Set([...prev, shiftId]));
  };

  const handleToggleShift = (shiftId: string, checked: boolean) => {
    const newSelected = new Set(selectedShifts);
    if (checked) {
      newSelected.add(shiftId);
    } else {
      newSelected.delete(shiftId);
      const newAssignments = { ...assignments };
      delete newAssignments[shiftId];
      setAssignments(newAssignments);
    }
    setSelectedShifts(newSelected);
  };

  const handleAssignSelected = async () => {
    if (selectedShifts.size === 0) {
      message.warning("Please select at least one shift to assign");
      return;
    }

    const shiftsWithoutWorker = Array.from(selectedShifts).filter(
      (shiftId) => !assignments[shiftId]
    );
    if (shiftsWithoutWorker.length > 0) {
      message.warning("Please select a worker for all selected shifts");
      return;
    }

    setIsAssigning(true);
    try {
      // In real implementation, this would call the API
      await new Promise((resolve) => setTimeout(resolve, 1500));
      message.success(`Successfully assigned ${selectedShifts.size} shifts`);
      setSelectedShifts(new Set());
      setAssignments({});
      refetch();
    } catch (error) {
      message.error("Failed to assign shifts");
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAutoSelectBest = () => {
    const newAssignments: Record<string, string> = {};
    const newSelected = new Set<string>();

    openShifts.forEach((shift) => {
      if (shift.suggestions.length > 0) {
        // Select the worker with highest match score
        const bestSuggestion = shift.suggestions.reduce((best, current) =>
          current.matchScore > best.matchScore ? current : best
        );
        newAssignments[shift.id] = bestSuggestion.workerId;
        newSelected.add(shift.id);
      }
    });

    setAssignments(newAssignments);
    setSelectedShifts(newSelected);
  };

  const totalOpenShifts = openShifts.length;
  const shiftsWithSuggestions = openShifts.filter(
    (s) => s.suggestions.length > 0
  ).length;

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
            <RobotOutlined style={{ fontSize: 28, color: "#722ed1" }} />
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              AI Scheduling Assistant
            </Title>
          </Space>
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            Smart suggestions for filling open shifts based on worker
            availability, skills, and performance
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            Refresh
          </Button>
        </Space>
      </div>

      {/* Summary Card */}
      <Card
        style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
      >
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={8}>
            <Space direction="vertical">
              <Text type="secondary">Open Shifts</Text>
              <Space>
                <CalendarOutlined style={{ color: "#faad14", fontSize: 24 }} />
                <Text style={{ color: "#fff", fontSize: 24 }}>
                  {totalOpenShifts}
                </Text>
                <Text type="secondary">need coverage</Text>
              </Space>
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space direction="vertical">
              <Text type="secondary">AI Suggestions Ready</Text>
              <Space>
                <ThunderboltOutlined style={{ color: "#722ed1", fontSize: 24 }} />
                <Text style={{ color: "#722ed1", fontSize: 24 }}>
                  {shiftsWithSuggestions}
                </Text>
                <Text type="secondary">shifts with matches</Text>
              </Space>
            </Space>
          </Col>
          <Col xs={24} md={8} style={{ textAlign: "right" }}>
            <Space>
              <Button
                icon={<ThunderboltOutlined />}
                onClick={handleAutoSelectBest}
                disabled={openShifts.length === 0}
              >
                Auto-Select Best
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleAssignSelected}
                loading={isAssigning}
                disabled={selectedShifts.size === 0}
                style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
              >
                Assign Selected ({selectedShifts.size})
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          <div style={{ textAlign: "center", padding: 48 }}>
            <Spin size="large" />
            <br />
            <Text type="secondary" style={{ marginTop: 16 }}>
              Analyzing schedules and finding best matches...
            </Text>
          </div>
        </Card>
      )}

      {/* No Open Shifts */}
      {!isLoading && openShifts.length === 0 && (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space direction="vertical">
                <Text style={{ color: "#52c41a", fontSize: 18 }}>
                  <CheckOutlined /> All shifts are covered!
                </Text>
                <Text type="secondary">
                  There are no open shifts requiring coverage at this time.
                </Text>
              </Space>
            }
          />
        </Card>
      )}

      {/* Open Shifts List */}
      {!isLoading && openShifts.length > 0 && (
        <Space direction="vertical" style={{ width: "100%" }} size={16}>
          {openShifts.map((shift) => (
            <Card
              key={shift.id}
              style={{
                backgroundColor: selectedShifts.has(shift.id)
                  ? "#1a2a3e"
                  : "#1a1a2e",
                borderColor: selectedShifts.has(shift.id) ? "#4a90d9" : "#2a2a4e",
                transition: "all 0.3s",
              }}
              headStyle={{ borderColor: "#2a2a4e" }}
              title={
                <Space>
                  <Checkbox
                    checked={selectedShifts.has(shift.id)}
                    onChange={(e) =>
                      handleToggleShift(shift.id, e.target.checked)
                    }
                  />
                  <CalendarOutlined style={{ color: "#4a90d9" }} />
                  <Text style={{ color: "#fff" }}>
                    {format(parseISO(shift.date), "EEEE, MMM d, yyyy")}
                  </Text>
                  <Tag color="blue">{shift.position.replace(/_/g, " ")}</Tag>
                </Space>
              }
              extra={
                <Space>
                  <ClockCircleOutlined style={{ color: "#666" }} />
                  <Text type="secondary">
                    {format(parseISO(shift.startTime), "h:mm a")} -{" "}
                    {format(parseISO(shift.endTime), "h:mm a")}
                  </Text>
                </Space>
              }
            >
              {shift.suggestions.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  message="No suitable workers found"
                  description="Consider posting this shift to the shift pool or network."
                  action={
                    <Button size="small" type="primary">
                      Post to Pool
                    </Button>
                  }
                  style={{ backgroundColor: "#2a2a1a", border: "1px solid #faad14" }}
                />
              ) : (
                <Row gutter={[16, 16]}>
                  {shift.suggestions.map((suggestion, index) => (
                    <Col key={suggestion.workerId} xs={24} md={12} lg={8}>
                      <WorkerSuggestionCard
                        suggestion={suggestion}
                        rank={index + 1}
                        isSelected={assignments[shift.id] === suggestion.workerId}
                        onSelect={() =>
                          handleSelectWorker(shift.id, suggestion.workerId)
                        }
                      />
                    </Col>
                  ))}
                </Row>
              )}
            </Card>
          ))}
        </Space>
      )}

      {/* Help Text */}
      <Card
        style={{
          backgroundColor: "#16213e",
          borderColor: "#4a90d940",
          marginTop: 24,
        }}
      >
        <Space>
          <RobotOutlined style={{ color: "#722ed1" }} />
          <Text type="secondary">
            AI suggestions are based on worker availability, skills, past
            performance, reliability scores, and scheduling preferences. Click on
            a worker card to select them, then use "Assign Selected" to confirm.
          </Text>
        </Space>
      </Card>
    </div>
  );
};
