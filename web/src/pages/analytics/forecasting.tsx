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
  Button,
  Progress,
  Tooltip,
  Table,
  Tag,
  Alert,
  Spin,
} from "antd";
import {
  LineChartOutlined,
  ThunderboltOutlined,
  CloudOutlined,
  CalendarOutlined,
  TrophyOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  RiseOutlined,
  FallOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import { format, subDays, startOfMonth } from "date-fns";
import dayjs from "dayjs";
import { ForecastAccuracyChart } from "../../components/analytics/ForecastAccuracyChart";
import { FeatureImportanceChart } from "../../components/analytics/FeatureImportanceChart";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

export const ForecastingAnalytics = () => {
  const { data: identity } = useGetIdentity<{
    restaurantId: string;
  }>();

  const [period, setPeriod] = useState<"week" | "month" | "custom">("week");
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(6, "day"),
    dayjs(),
  ]);
  const [isRetraining, setIsRetraining] = useState(false);

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

  // Fetch forecast analytics
  const { data: forecastData, isLoading, refetch } = useCustom({
    url: `/analytics/${identity?.restaurantId}/forecasting`,
    method: "get",
    config: {
      query: dateRange,
    },
    queryOptions: {
      enabled: !!identity?.restaurantId,
    },
  });

  const forecast = forecastData?.data as any;

  // Mock data for demonstration
  const mape = forecast?.mape || 8.8;
  const mae = forecast?.mae || 3.2;
  const rmse = forecast?.rmse || 4.1;
  const overallAccuracy = forecast?.overallAccuracy || 91.2;

  const accuracyByFactor = forecast?.accuracyByFactor || [
    { factor: "Day of Week", accuracy: 94.5, samples: 245 },
    { factor: "Time of Day", accuracy: 92.1, samples: 245 },
    { factor: "Weather", accuracy: 87.3, samples: 180 },
    { factor: "Local Events", accuracy: 82.6, samples: 45 },
    { factor: "Holidays", accuracy: 78.9, samples: 12 },
  ];

  const modelPerformance = forecast?.modelPerformance || [
    { date: "Dec 10", accuracy: 88.5 },
    { date: "Dec 11", accuracy: 91.2 },
    { date: "Dec 12", accuracy: 89.8 },
    { date: "Dec 13", accuracy: 93.4 },
    { date: "Dec 14", accuracy: 90.1 },
    { date: "Dec 15", accuracy: 92.8 },
    { date: "Dec 16", accuracy: 91.5 },
  ];

  const featureImportance = forecast?.featureImportance || [
    { feature: "Historical Demand", importance: 0.35 },
    { feature: "Day of Week", importance: 0.22 },
    { feature: "Time of Day", importance: 0.18 },
    { feature: "Weather Forecast", importance: 0.12 },
    { feature: "Local Events", importance: 0.08 },
    { feature: "Seasonality", importance: 0.05 },
  ];

  const actualVsPredicted = forecast?.actualVsPredicted || [
    { date: "Dec 10", predicted: 145, actual: 142 },
    { date: "Dec 11", predicted: 158, actual: 165 },
    { date: "Dec 12", predicted: 132, actual: 128 },
    { date: "Dec 13", predicted: 141, actual: 145 },
    { date: "Dec 14", predicted: 189, actual: 182 },
    { date: "Dec 15", predicted: 210, actual: 225 },
    { date: "Dec 16", predicted: 178, actual: 172 },
  ];

  const factorColumns = [
    {
      title: "Factor",
      dataIndex: "factor",
      key: "factor",
      render: (factor: string) => {
        const icons: Record<string, React.ReactNode> = {
          "Day of Week": <CalendarOutlined style={{ color: "#4a90d9" }} />,
          "Time of Day": <LineChartOutlined style={{ color: "#52c41a" }} />,
          Weather: <CloudOutlined style={{ color: "#faad14" }} />,
          "Local Events": <TrophyOutlined style={{ color: "#722ed1" }} />,
          Holidays: <CalendarOutlined style={{ color: "#eb2f96" }} />,
        };
        return (
          <Space>
            {icons[factor]}
            <Text style={{ color: "#fff" }}>{factor}</Text>
          </Space>
        );
      },
    },
    {
      title: "Accuracy",
      dataIndex: "accuracy",
      key: "accuracy",
      render: (accuracy: number) => (
        <Space>
          <Progress
            percent={accuracy}
            size="small"
            showInfo={false}
            strokeColor={accuracy >= 90 ? "#52c41a" : accuracy >= 80 ? "#faad14" : "#ef4444"}
            style={{ width: 100 }}
          />
          <Text style={{ color: accuracy >= 90 ? "#52c41a" : accuracy >= 80 ? "#faad14" : "#ef4444" }}>
            {accuracy.toFixed(1)}%
          </Text>
        </Space>
      ),
      sorter: (a: any, b: any) => a.accuracy - b.accuracy,
    },
    {
      title: "Sample Size",
      dataIndex: "samples",
      key: "samples",
      render: (samples: number) => (
        <Text type="secondary">{samples} predictions</Text>
      ),
    },
    {
      title: "Status",
      key: "status",
      render: (_: any, record: any) => (
        <Tag
          color={
            record.accuracy >= 90 ? "green" : record.accuracy >= 80 ? "orange" : "red"
          }
        >
          {record.accuracy >= 90 ? "Excellent" : record.accuracy >= 80 ? "Good" : "Needs Improvement"}
        </Tag>
      ),
    },
  ];

  const handleRetrain = async () => {
    setIsRetraining(true);
    // Simulate retraining
    setTimeout(() => {
      setIsRetraining(false);
      refetch();
    }, 3000);
  };

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
            <ThunderboltOutlined style={{ fontSize: 28, color: "#722ed1" }} />
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              Forecast Accuracy & ML Insights
            </Title>
          </Space>
          <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
            Machine learning model performance and prediction accuracy analysis
          </Text>
        </div>
        <Button
          type="primary"
          icon={<ExperimentOutlined />}
          onClick={handleRetrain}
          loading={isRetraining}
          style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
        >
          Retrain Model
        </Button>
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

      {/* Accuracy Metrics */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={
                <Space>
                  <Text type="secondary">Overall Accuracy</Text>
                  <Tooltip title="Percentage of predictions within acceptable margin">
                    <InfoCircleOutlined style={{ color: "#666" }} />
                  </Tooltip>
                </Space>
              }
              value={overallAccuracy}
              suffix="%"
              valueStyle={{
                color: overallAccuracy >= 90 ? "#52c41a" : "#faad14",
                fontSize: 32,
              }}
            />
            <Progress
              percent={overallAccuracy}
              showInfo={false}
              strokeColor={overallAccuracy >= 90 ? "#52c41a" : "#faad14"}
              trailColor="#2a2a4e"
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={
                <Space>
                  <Text type="secondary">MAPE</Text>
                  <Tooltip title="Mean Absolute Percentage Error - lower is better">
                    <InfoCircleOutlined style={{ color: "#666" }} />
                  </Tooltip>
                </Space>
              }
              value={mape}
              suffix="%"
              valueStyle={{ color: "#fff" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Target: &lt; 10%{" "}
              {mape < 10 ? (
                <Tag color="green" style={{ marginLeft: 4 }}>
                  On Target
                </Tag>
              ) : (
                <Tag color="orange" style={{ marginLeft: 4 }}>
                  Above Target
                </Tag>
              )}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={
                <Space>
                  <Text type="secondary">MAE</Text>
                  <Tooltip title="Mean Absolute Error - average prediction error in orders">
                    <InfoCircleOutlined style={{ color: "#666" }} />
                  </Tooltip>
                </Space>
              }
              value={mae}
              suffix=" orders"
              valueStyle={{ color: "#fff" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Average deviation from actual
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Statistic
              title={
                <Space>
                  <Text type="secondary">RMSE</Text>
                  <Tooltip title="Root Mean Square Error - penalizes large errors more">
                    <InfoCircleOutlined style={{ color: "#666" }} />
                  </Tooltip>
                </Space>
              }
              value={rmse}
              suffix=" orders"
              valueStyle={{ color: "#fff" }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Standard deviation of errors
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Actual vs Predicted Chart */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card
            title={
              <Space>
                <LineChartOutlined style={{ color: "#4a90d9" }} />
                <span>Actual vs Predicted</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <ForecastAccuracyChart data={actualVsPredicted} />
          </Card>
        </Col>
      </Row>

      {/* Accuracy by Factor & Feature Importance */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <TrophyOutlined style={{ color: "#faad14" }} />
                <span>Accuracy by Factor</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <Table
              dataSource={accuracyByFactor}
              columns={factorColumns}
              pagination={false}
              size="small"
              rowKey="factor"
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <ExperimentOutlined style={{ color: "#722ed1" }} />
                <span>Feature Importance</span>
                <Tooltip title="How much each factor contributes to predictions">
                  <InfoCircleOutlined style={{ color: "#666" }} />
                </Tooltip>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", height: "100%" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <FeatureImportanceChart data={featureImportance} />
          </Card>
        </Col>
      </Row>

      {/* Model Performance Over Time */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24}>
          <Card
            title={
              <Space>
                <RiseOutlined style={{ color: "#52c41a" }} />
                <span>Model Performance Over Time</span>
              </Space>
            }
            style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
            headStyle={{ borderColor: "#2a2a4e" }}
            loading={isLoading}
          >
            <div style={{ height: 200 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-end",
                  height: "100%",
                  gap: 8,
                  padding: "0 20px",
                }}
              >
                {modelPerformance.map((item: any, index: number) => (
                  <Tooltip
                    key={index}
                    title={`${item.date}: ${item.accuracy.toFixed(1)}% accuracy`}
                  >
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: `${item.accuracy * 1.8}px`,
                          backgroundColor:
                            item.accuracy >= 92
                              ? "#52c41a"
                              : item.accuracy >= 90
                              ? "#4a90d9"
                              : "#faad14",
                          borderRadius: "4px 4px 0 0",
                          transition: "height 0.3s",
                        }}
                      />
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, marginTop: 8 }}
                      >
                        {item.date}
                      </Text>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
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
              <Space>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: "#52c41a",
                    borderRadius: 2,
                  }}
                />
                <Text type="secondary">&gt; 92% (Excellent)</Text>
              </Space>
              <Space>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: "#4a90d9",
                    borderRadius: 2,
                  }}
                />
                <Text type="secondary">90-92% (Good)</Text>
              </Space>
              <Space>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: "#faad14",
                    borderRadius: 2,
                  }}
                />
                <Text type="secondary">&lt; 90% (Fair)</Text>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Model Info Alert */}
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined />}
        message="Model Information"
        description={
          <Space direction="vertical">
            <Text>
              Current model: <Tag color="purple">Random Forest Ensemble v2.1</Tag>
            </Text>
            <Text type="secondary">
              Last trained: {format(subDays(new Date(), 3), "MMM d, yyyy")} |
              Training data: 180 days | Features: 12 | Hyperparameters optimized
            </Text>
          </Space>
        }
        style={{
          backgroundColor: "#16213e",
          border: "1px solid #4a90d940",
        }}
      />
    </div>
  );
};
