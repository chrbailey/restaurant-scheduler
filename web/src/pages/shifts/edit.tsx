import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, TimePicker, InputNumber, Space, Alert } from "antd";
import dayjs from "dayjs";

const { TextArea } = Input;

export const ShiftEdit = () => {
  const { formProps, saveButtonProps, queryResult } = useForm({
    redirect: "list",
  });

  const shiftData = queryResult?.data?.data;

  const { selectProps: workerSelectProps } = useSelect({
    resource: "workers",
    optionLabel: (item: any) => `${item.user.firstName} ${item.user.lastName}`,
    optionValue: "id",
  });

  const positionOptions = [
    { label: "Server", value: "SERVER" },
    { label: "Host", value: "HOST" },
    { label: "Bartender", value: "BARTENDER" },
    { label: "Line Cook", value: "LINE_COOK" },
    { label: "Prep Cook", value: "PREP_COOK" },
    { label: "Dishwasher", value: "DISHWASHER" },
    { label: "Manager", value: "MANAGER" },
    { label: "Delivery Pack", value: "DELIVERY_PACK" },
  ];

  const statusOptions = [
    { label: "Draft", value: "DRAFT" },
    { label: "Published (Unassigned)", value: "PUBLISHED_UNASSIGNED" },
    { label: "Published (Offered)", value: "PUBLISHED_OFFERED" },
    { label: "Published (Claimed)", value: "PUBLISHED_CLAIMED" },
    { label: "Confirmed", value: "CONFIRMED" },
    { label: "In Progress", value: "IN_PROGRESS" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Cancelled", value: "CANCELLED" },
    { label: "No Show", value: "NO_SHOW" },
  ];

  const onFinish = (values: any) => {
    // Combine date and time values
    const date = dayjs(values.date);
    const startTime = dayjs(values.startTime);
    const endTime = dayjs(values.endTime);

    const startDateTime = date
      .hour(startTime.hour())
      .minute(startTime.minute())
      .second(0)
      .toISOString();

    const endDateTime = date
      .hour(endTime.hour())
      .minute(endTime.minute())
      .second(0)
      .toISOString();

    const submitData = {
      ...values,
      startTime: startDateTime,
      endTime: endDateTime,
    };

    delete submitData.date;

    formProps.onFinish?.(submitData);
  };

  // Transform initial values for the form
  const initialValues = shiftData
    ? {
        ...shiftData,
        date: dayjs(shiftData.startTime),
        startTime: dayjs(shiftData.startTime),
        endTime: dayjs(shiftData.endTime),
      }
    : undefined;

  const isLocked = shiftData?.status === "IN_PROGRESS" || shiftData?.status === "COMPLETED";

  return (
    <Edit saveButtonProps={saveButtonProps}>
      {isLocked && (
        <Alert
          message="Limited Editing"
          description="This shift is in progress or completed. Some fields cannot be modified."
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Form
        {...formProps}
        layout="vertical"
        onFinish={onFinish}
        initialValues={initialValues}
      >
        <Form.Item
          label="Status"
          name="status"
          rules={[{ required: true }]}
        >
          <Select options={statusOptions} disabled={isLocked} />
        </Form.Item>

        <Form.Item
          label="Date"
          name="date"
          rules={[{ required: true, message: "Please select a date" }]}
        >
          <DatePicker style={{ width: "100%" }} disabled={isLocked} />
        </Form.Item>

        <Space size="large" style={{ display: "flex" }}>
          <Form.Item
            label="Start Time"
            name="startTime"
            rules={[{ required: true, message: "Please select start time" }]}
          >
            <TimePicker format="h:mm A" minuteStep={15} use12Hours disabled={isLocked} />
          </Form.Item>

          <Form.Item
            label="End Time"
            name="endTime"
            rules={[{ required: true, message: "Please select end time" }]}
          >
            <TimePicker format="h:mm A" minuteStep={15} use12Hours disabled={isLocked} />
          </Form.Item>
        </Space>

        <Form.Item
          label="Position"
          name="position"
          rules={[{ required: true, message: "Please select a position" }]}
        >
          <Select options={positionOptions} disabled={isLocked} />
        </Form.Item>

        <Form.Item
          label="Assigned Worker"
          name="assignedWorkerId"
        >
          <Select
            {...workerSelectProps}
            placeholder="Select worker or leave open"
            allowClear
          />
        </Form.Item>

        <Form.Item
          label="Required Workers"
          name="requiredCount"
        >
          <InputNumber min={1} max={10} disabled={isLocked} />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <TextArea rows={3} />
        </Form.Item>
      </Form>
    </Edit>
  );
};
