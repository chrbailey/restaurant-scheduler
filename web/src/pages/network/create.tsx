import { Create, useForm } from "@refinedev/antd";
import {
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Divider,
  List,
  Avatar,
  Tag,
} from "antd";
import {
  GlobalOutlined,
  PlusOutlined,
  DeleteOutlined,
  MailOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { useState } from "react";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface InviteItem {
  key: string;
  restaurantName: string;
  email: string;
}

export const NetworkCreate = () => {
  const { formProps, saveButtonProps, form } = useForm({
    redirect: "show",
  });

  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [inviteRestaurantName, setInviteRestaurantName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const handleAddInvite = () => {
    if (inviteRestaurantName && inviteEmail) {
      const newInvite: InviteItem = {
        key: `${Date.now()}`,
        restaurantName: inviteRestaurantName,
        email: inviteEmail,
      };
      setInvites([...invites, newInvite]);
      setInviteRestaurantName("");
      setInviteEmail("");
    }
  };

  const handleRemoveInvite = (key: string) => {
    setInvites(invites.filter((i) => i.key !== key));
  };

  const onFinish = (values: any) => {
    // Include invites in the submission
    const submitData = {
      ...values,
      initialInvites: invites.map((i) => ({
        restaurantName: i.restaurantName,
        email: i.email,
      })),
      settings: {
        visibilityDelayHours: values.visibilityDelayHours || 24,
        priorityWindowHours: values.priorityWindowHours || 4,
        autoApproveCrossTraining: values.autoApproveCrossTraining || false,
        autoApproveMinRating: values.autoApproveMinRating || 4,
        autoApproveMinReliability: values.autoApproveMinReliability || 0.9,
        requireCertificationReview: values.requireCertificationReview !== false,
        allowDirectMessaging: values.allowDirectMessaging || false,
        shareWorkerRatings: values.shareWorkerRatings !== false,
      },
    };

    formProps.onFinish?.(submitData);
  };

  return (
    <Create
      saveButtonProps={{
        ...saveButtonProps,
        children: "Create Network",
      }}
      title={
        <Space>
          <GlobalOutlined style={{ color: "#4a90d9" }} />
          <span>Create Restaurant Network</span>
        </Space>
      }
    >
      <Form {...formProps} layout="vertical" onFinish={onFinish}>
        {/* Basic Info */}
        <Card
          title="Network Information"
          style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
          headStyle={{ borderColor: "#2a2a4e" }}
        >
          <Form.Item
            label="Network Name"
            name="name"
            rules={[{ required: true, message: "Please enter a network name" }]}
          >
            <Input placeholder="e.g., Downtown Restaurant Group" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
            extra="Describe the purpose of this network"
          >
            <TextArea
              rows={3}
              placeholder="A network for restaurants in the downtown area to share staff during busy periods..."
            />
          </Form.Item>
        </Card>

        {/* Initial Settings */}
        <Card
          title="Initial Settings"
          style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e", marginBottom: 24 }}
          headStyle={{ borderColor: "#2a2a4e" }}
        >
          <Title level={5} style={{ color: "#fff" }}>
            Shift Visibility
          </Title>
          <Paragraph type="secondary">
            Control when shifts from one restaurant become visible to workers at other
            network restaurants.
          </Paragraph>

          <Row gutter={[24, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Visibility Delay (hours)"
                name="visibilityDelayHours"
                initialValue={24}
                extra="Shifts are shown to network workers after this delay"
              >
                <InputNumber min={0} max={168} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Priority Window (hours)"
                name="priorityWindowHours"
                initialValue={4}
                extra="Home workers get first chance during this window"
              >
                <InputNumber min={0} max={72} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Title level={5} style={{ color: "#fff" }}>
            Cross-Training
          </Title>

          <Row gutter={[24, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Auto-Approve Cross-Training"
                name="autoApproveCrossTraining"
                valuePropName="checked"
                initialValue={false}
                extra="Automatically approve high-rated workers"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Require Certification Review"
                name="requireCertificationReview"
                valuePropName="checked"
                initialValue={true}
                extra="Managers must approve position certifications"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Divider />

          <Title level={5} style={{ color: "#fff" }}>
            Policies
          </Title>

          <Row gutter={[24, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Allow Direct Messaging"
                name="allowDirectMessaging"
                valuePropName="checked"
                initialValue={false}
                extra="Let managers contact workers from other restaurants"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Share Worker Ratings"
                name="shareWorkerRatings"
                valuePropName="checked"
                initialValue={true}
                extra="Share reputation scores across the network"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Invite Restaurants */}
        <Card
          title={
            <Space>
              <TeamOutlined />
              <span>Invite Restaurants (Optional)</span>
            </Space>
          }
          style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}
          headStyle={{ borderColor: "#2a2a4e" }}
        >
          <Paragraph type="secondary">
            Invite other restaurants to join your network. They will receive an email
            invitation once the network is created.
          </Paragraph>

          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={24} md={10}>
              <Input
                placeholder="Restaurant name"
                value={inviteRestaurantName}
                onChange={(e) => setInviteRestaurantName(e.target.value)}
              />
            </Col>
            <Col xs={24} md={10}>
              <Input
                placeholder="Manager email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onPressEnter={handleAddInvite}
              />
            </Col>
            <Col xs={24} md={4}>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={handleAddInvite}
                disabled={!inviteRestaurantName || !inviteEmail}
                style={{ width: "100%" }}
              >
                Add
              </Button>
            </Col>
          </Row>

          {invites.length > 0 && (
            <List
              dataSource={invites}
              renderItem={(item) => (
                <List.Item
                  style={{
                    backgroundColor: "#16213e",
                    marginBottom: 8,
                    padding: "12px 16px",
                    borderRadius: 8,
                    border: "1px solid #2a2a4e",
                  }}
                  actions={[
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemoveInvite(item.key)}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar
                        style={{ backgroundColor: "#4a90d9" }}
                        icon={<MailOutlined />}
                      />
                    }
                    title={
                      <Text strong style={{ color: "#fff" }}>
                        {item.restaurantName}
                      </Text>
                    }
                    description={
                      <Text type="secondary">{item.email}</Text>
                    }
                  />
                  <Tag color="blue">Pending</Tag>
                </List.Item>
              )}
            />
          )}

          {invites.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "24px",
                backgroundColor: "#16213e",
                borderRadius: 8,
                border: "1px dashed #2a2a4e",
              }}
            >
              <MailOutlined style={{ fontSize: 24, color: "#4a90d9", marginBottom: 8 }} />
              <br />
              <Text type="secondary">
                No invitations yet. Add restaurants above or invite them later.
              </Text>
            </div>
          )}
        </Card>
      </Form>
    </Create>
  );
};
