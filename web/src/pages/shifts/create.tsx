import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, TimePicker, InputNumber, Switch, Space, Typography } from "antd";
import dayjs from "dayjs";

const { TextArea } = Input;
const { Text } = Typography;

export const ShiftCreate = () => {
  const { formProps, saveButtonProps } = useForm({
    redirect: "list",
  });

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
      status: values.publishImmediately ? "PUBLISHED_UNASSIGNED" : "DRAFT",
    };

    delete submitData.date;
    delete submitData.publishImmediately;

    formProps.onFinish?.(submitData);
  };

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical" onFinish={onFinish}>
        <Form.Item
          label="Date"
          name="date"
          rules={[{ required: true, message: "Please select a date" }]}
        >
          <DatePicker
            style={{ width: "100%" }}
            disabledDate={(current) =>
              current && current < dayjs().startOf("day")
            }
          />
        </Form.Item>

        <Space size="large" style={{ display: "flex" }}>
          <Form.Item
            label="Start Time"
            name="startTime"
            rules={[{ required: true, message: "Please select start time" }]}
          >
            <TimePicker format="h:mm A" minuteStep={15} use12Hours />
          </Form.Item>

          <Form.Item
            label="End Time"
            name="endTime"
            rules={[{ required: true, message: "Please select end time" }]}
          >
            <TimePicker format="h:mm A" minuteStep={15} use12Hours />
          </Form.Item>
        </Space>

        <Form.Item
          label="Position"
          name="position"
          rules={[{ required: true, message: "Please select a position" }]}
        >
          <Select options={positionOptions} placeholder="Select position" />
        </Form.Item>

        <Form.Item
          label="Assign Worker (Optional)"
          name="assignedWorkerId"
          tooltip="Leave empty to post as an open shift"
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
          initialValue={1}
          tooltip="How many workers needed for this shift"
        >
          <InputNumber min={1} max={10} />
        </Form.Item>

        <Form.Item label="Notes" name="notes">
          <TextArea
            rows={3}
            placeholder="Any special instructions or notes for this shift"
          />
        </Form.Item>

        <Form.Item
          name="publishImmediately"
          valuePropName="checked"
          initialValue={false}
        >
          <Space>
            <Switch />
            <Text>Publish immediately (make visible to workers)</Text>
          </Space>
        </Form.Item>
      </Form>
    </Create>
  );
};
