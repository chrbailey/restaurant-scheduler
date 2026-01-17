import { Show } from "@refinedev/antd";
import {
  useShow,
  useList,
  useCreate,
  useDelete,
  useUpdate,
  useGetIdentity,
  useInvalidate,
} from "@refinedev/core";
import {
  Typography,
  Tag,
  Descriptions,
  Card,
  Space,
  Avatar,
  Table,
  Row,
  Col,
  Statistic,
  Button,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Tabs,
  InputNumber,
  Switch,
  Divider,
  Empty,
} from "antd";
import {
  GlobalOutlined,
  TeamOutlined,
  CrownOutlined,
  MailOutlined,
  CheckOutlined,
  CloseOutlined,
  SettingOutlined,
  UserAddOutlined,
  DeleteOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import { format, parseISO } from "date-fns";

const { Title, Text, Paragraph } = Typography;

export const NetworkShow = () => {
  const { queryResult } = useShow();
  const { data, isLoading } = queryResult;
  const network = data?.data as any;
  const invalidate = useInvalidate();

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm] = Form.useForm();

  const { data: identity } = useGetIdentity<{
    restaurantId: string;
    restaurantName: string;
  }>();

  // Determine user's role in this network
  const myMembership = network?.members?.find(
    (m: any) => m.restaurantId === identity?.restaurantId
  );
  const isAdmin = myMembership?.role === "ADMIN" || myMembership?.role === "OWNER";
  const isOwner = myMembership?.role === "OWNER";

  // Fetch pending invitations
  const { data: invitationsData, isLoading: invitationsLoading } = useList({
    resource: "network-invitations",
    filters: network?.id
      ? [
          { field: "networkId", operator: "eq", value: network.id },
          { field: "status", operator: "eq", value: "PENDING" },
        ]
      : [],
    queryOptions: { enabled: !!network?.id && isAdmin },
  });

  const { mutate: createInvitation, isLoading: isInviting } = useCreate();
  const { mutate: updateInvitation, isLoading: isUpdatingInvite } = useUpdate();
  const { mutate: updateSettings, isLoading: isUpdatingSettings } = useUpdate();
  const { mutate: removeMember, isLoading: isRemoving } = useDelete();
  const { mutate: updateMemberRole, isLoading: isUpdatingRole } = useUpdate();

  const handleInvite = (values: any) => {
    createInvitation(
      {
        resource: "network-invitations",
        values: {
          networkId: network.id,
          inviteeEmail: values.email,
          inviteeRestaurantName: values.restaurantName,
          message: values.message,
        },
      },
      {
        onSuccess: () => {
          message.success("Invitation sent successfully");
          setIsInviteModalOpen(false);
          inviteForm.resetFields();
          invalidate({ resource: "network-invitations", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to send invitation");
        },
      }
    );
  };

  const handleCancelInvitation = (invitationId: string) => {
    updateInvitation(
      {
        resource: "network-invitations",
        id: invitationId,
        values: { status: "CANCELLED" },
      },
      {
        onSuccess: () => {
          message.success("Invitation cancelled");
          invalidate({ resource: "network-invitations", invalidates: ["list"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to cancel invitation");
        },
      }
    );
  };

  const handleRemoveMember = (memberId: string, restaurantName: string) => {
    removeMember(
      {
        resource: "network-memberships",
        id: memberId,
      },
      {
        onSuccess: () => {
          message.success(`${restaurantName} removed from network`);
          invalidate({ resource: "networks", invalidates: ["detail"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to remove member");
        },
      }
    );
  };

  const handleUpdateRole = (memberId: string, newRole: string) => {
    updateMemberRole(
      {
        resource: "network-memberships",
        id: memberId,
        values: { role: newRole },
      },
      {
        onSuccess: () => {
          message.success("Role updated successfully");
          invalidate({ resource: "networks", invalidates: ["detail"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to update role");
        },
      }
    );
  };

  const handleSaveSettings = (values: any) => {
    updateSettings(
      {
        resource: "networks",
        id: network.id,
        values: { settings: values },
      },
      {
        onSuccess: () => {
          message.success("Network settings saved");
          invalidate({ resource: "networks", invalidates: ["detail"] });
        },
        onError: (error: any) => {
          message.error(error.message || "Failed to save settings");
        },
      }
    );
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      OWNER: "gold",
      ADMIN: "purple",
      MEMBER: "blue",
    };
    return colors[role] || "default";
  };

  const memberColumns = [
    {
      title: "Restaurant",
      dataIndex: "restaurant",
      render: (restaurant: any) => (
        <Space>
          <Avatar style={{ backgroundColor: "#4a90d9" }}>
            {restaurant?.name?.[0] || "R"}
          </Avatar>
          <div>
            <Text strong style={{ color: "#fff" }}>
              {restaurant?.name}
            </Text>
            {restaurant?.address && (
              <>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {restaurant.address}
                </Text>
              </>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: "Role",
      dataIndex: "role",
      render: (role: string, record: any) => (
        <Space>
          <Tag color={getRoleColor(role)}>
            {role === "OWNER" && <CrownOutlined style={{ marginRight: 4 }} />}
            {role}
          </Tag>
          {isOwner && record.role !== "OWNER" && record.restaurantId !== identity?.restaurantId && (
            <Button
              type="link"
              size="small"
              onClick={() =>
                handleUpdateRole(record.id, role === "ADMIN" ? "MEMBER" : "ADMIN")
              }
              loading={isUpdatingRole}
            >
              {role === "ADMIN" ? "Demote" : "Promote"}
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: "Joined",
      dataIndex: "joinedAt",
      render: (value: string) => (
        <Text type="secondary">
          {value ? format(parseISO(value), "MMM d, yyyy") : "-"}
        </Text>
      ),
    },
    {
      title: "Cross-Trained Workers",
      dataIndex: "crossTrainedWorkerCount",
      render: (count: number) => <Text style={{ color: "#fff" }}>{count || 0}</Text>,
    },
    {
      title: "Actions",
      render: (_: any, record: any) =>
        isAdmin &&
        record.role !== "OWNER" &&
        record.restaurantId !== identity?.restaurantId && (
          <Popconfirm
            title="Remove this restaurant?"
            description="Their workers will lose cross-training certifications."
            onConfirm={() => handleRemoveMember(record.id, record.restaurant?.name)}
            okText="Remove"
            okButtonProps={{ danger: true }}
          >
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              loading={isRemoving}
            >
              Remove
            </Button>
          </Popconfirm>
        ),
    },
  ];

  const invitationColumns = [
    {
      title: "Restaurant",
      dataIndex: "inviteeRestaurantName",
      render: (name: string, record: any) => (
        <div>
          <Text strong style={{ color: "#fff" }}>
            {name}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.inviteeEmail}
          </Text>
        </div>
      ),
    },
    {
      title: "Invited By",
      dataIndex: "inviter",
      render: (inviter: any) => (
        <Text type="secondary">{inviter?.restaurant?.name || "-"}</Text>
      ),
    },
    {
      title: "Sent",
      dataIndex: "createdAt",
      render: (value: string) => (
        <Text type="secondary">
          {value ? format(parseISO(value), "MMM d, yyyy") : "-"}
        </Text>
      ),
    },
    {
      title: "Actions",
      render: (_: any, record: any) => (
        <Button
          size="small"
          danger
          onClick={() => handleCancelInvitation(record.id)}
          loading={isUpdatingInvite}
        >
          Cancel
        </Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: "members",
      label: (
        <Space>
          <TeamOutlined />
          <span>Members ({network?.members?.length || 0})</span>
        </Space>
      ),
      children: (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          {isAdmin && (
            <div style={{ marginBottom: 16 }}>
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                onClick={() => setIsInviteModalOpen(true)}
              >
                Invite Restaurant
              </Button>
            </div>
          )}
          <Table
            dataSource={network?.members || []}
            columns={memberColumns}
            rowKey="id"
            pagination={false}
            locale={{ emptyText: "No members" }}
          />
        </Card>
      ),
    },
    {
      key: "invitations",
      label: (
        <Space>
          <MailOutlined />
          <span>Pending Invitations ({invitationsData?.total || 0})</span>
        </Space>
      ),
      children: (
        <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
          {invitationsData?.data && invitationsData.data.length > 0 ? (
            <Table
              dataSource={invitationsData.data}
              columns={invitationColumns}
              rowKey="id"
              pagination={false}
              loading={invitationsLoading}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No pending invitations"
            />
          )}
        </Card>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: "settings",
            label: (
              <Space>
                <SettingOutlined />
                <span>Settings</span>
              </Space>
            ),
            children: (
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Form
                  layout="vertical"
                  initialValues={network?.settings}
                  onFinish={handleSaveSettings}
                >
                  <Title level={5} style={{ color: "#fff" }}>
                    Shift Visibility
                  </Title>
                  <Paragraph type="secondary">
                    Control when shifts become visible to workers from other network
                    restaurants.
                  </Paragraph>

                  <Row gutter={[24, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Visibility Delay (hours)"
                        name="visibilityDelayHours"
                        extra="How long before shifts are visible to network workers"
                      >
                        <InputNumber min={0} max={168} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Priority Window (hours)"
                        name="priorityWindowHours"
                        extra="Home restaurant workers get first chance to claim"
                      >
                        <InputNumber min={0} max={72} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider />

                  <Title level={5} style={{ color: "#fff" }}>
                    Cross-Training
                  </Title>
                  <Paragraph type="secondary">
                    Configure how workers can train and work at other network restaurants.
                  </Paragraph>

                  <Row gutter={[24, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Auto-Approve Cross-Training"
                        name="autoApproveCrossTraining"
                        valuePropName="checked"
                        extra="Automatically approve workers with high ratings"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Min Rating for Auto-Approve"
                        name="autoApproveMinRating"
                        extra="Minimum reputation score (0-5)"
                      >
                        <InputNumber
                          min={0}
                          max={5}
                          step={0.5}
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={[24, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Min Reliability for Auto-Approve"
                        name="autoApproveMinReliability"
                        extra="Minimum reliability score (0-1)"
                      >
                        <InputNumber
                          min={0}
                          max={1}
                          step={0.1}
                          style={{ width: "100%" }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Require Certification Review"
                        name="requireCertificationReview"
                        valuePropName="checked"
                        extra="Managers must approve position certifications"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider />

                  <Title level={5} style={{ color: "#fff" }}>
                    Network Policies
                  </Title>

                  <Row gutter={[24, 0]}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Allow Direct Messaging"
                        name="allowDirectMessaging"
                        valuePropName="checked"
                        extra="Let managers message workers from other restaurants"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Share Worker Ratings"
                        name="shareWorkerRatings"
                        valuePropName="checked"
                        extra="Share reputation data across the network"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={isUpdatingSettings}
                    >
                      Save Settings
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            ),
          },
        ]
      : []),
  ];

  return (
    <Show isLoading={isLoading}>
      {network && (
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* Network Header */}
          <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
            <Space size="large" align="start">
              <Avatar
                size={80}
                style={{ backgroundColor: "#4a90d9", fontSize: 32 }}
                icon={<GlobalOutlined />}
              />
              <div style={{ flex: 1 }}>
                <Title level={2} style={{ margin: 0, color: "#fff" }}>
                  {network.name}
                </Title>
                {network.description && (
                  <Paragraph type="secondary" style={{ marginTop: 8 }}>
                    {network.description}
                  </Paragraph>
                )}
                <Space style={{ marginTop: 12 }}>
                  <Tag color={getRoleColor(myMembership?.role)}>
                    {myMembership?.role === "OWNER" && (
                      <CrownOutlined style={{ marginRight: 4 }} />
                    )}
                    Your Role: {myMembership?.role || "MEMBER"}
                  </Tag>
                  <Tag color="blue">
                    Created {format(parseISO(network.createdAt), "MMMM d, yyyy")}
                  </Tag>
                </Space>
              </div>
            </Space>
          </Card>

          {/* Stats Row */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Member Restaurants</Text>}
                  value={network.members?.length || 0}
                  prefix={<TeamOutlined style={{ color: "#4a90d9" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Total Workers</Text>}
                  value={network.totalWorkers || 0}
                  prefix={<TeamOutlined style={{ color: "#52c41a" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Cross-Trained Workers</Text>}
                  value={network.crossTrainedWorkers || 0}
                  prefix={<SwapOutlined style={{ color: "#722ed1" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Card style={{ backgroundColor: "#1a1a2e", borderColor: "#2a2a4e" }}>
                <Statistic
                  title={<Text type="secondary">Shifts Filled This Month</Text>}
                  value={network.shiftsFillledThisMonth || 0}
                  prefix={<CheckOutlined style={{ color: "#faad14" }} />}
                  valueStyle={{ color: "#fff" }}
                />
              </Card>
            </Col>
          </Row>

          {/* Tabs */}
          <Tabs items={tabItems} />
        </Space>
      )}

      {/* Invite Modal */}
      <Modal
        title={
          <Space>
            <UserAddOutlined />
            <span>Invite Restaurant</span>
          </Space>
        }
        open={isInviteModalOpen}
        onCancel={() => setIsInviteModalOpen(false)}
        footer={null}
      >
        <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            label="Restaurant Name"
            name="restaurantName"
            rules={[{ required: true, message: "Please enter restaurant name" }]}
          >
            <Input placeholder="Enter the restaurant's name" />
          </Form.Item>

          <Form.Item
            label="Manager Email"
            name="email"
            rules={[
              { required: true, message: "Please enter email" },
              { type: "email", message: "Please enter a valid email" },
            ]}
          >
            <Input placeholder="manager@restaurant.com" />
          </Form.Item>

          <Form.Item label="Message (optional)" name="message">
            <Input.TextArea
              rows={3}
              placeholder="Add a personal message to the invitation"
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={isInviting}>
                Send Invitation
              </Button>
              <Button onClick={() => setIsInviteModalOpen(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Show>
  );
};
