import {
  List,
  useTable,
  DateField,
  TagField,
  ShowButton,
  EditButton,
  DeleteButton,
  FilterDropdown,
  CreateButton,
} from "@refinedev/antd";
import { Table, Space, Tag, Select, DatePicker, Input } from "antd";
import { format, parseISO } from "date-fns";

export const ShiftList = () => {
  const { tableProps, filters } = useTable({
    syncWithLocation: true,
    sorters: {
      initial: [{ field: "startTime", order: "asc" }],
    },
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: "default",
      PUBLISHED_UNASSIGNED: "orange",
      PUBLISHED_OFFERED: "gold",
      PUBLISHED_CLAIMED: "blue",
      CONFIRMED: "green",
      IN_PROGRESS: "cyan",
      COMPLETED: "purple",
      CANCELLED: "red",
      NO_SHOW: "magenta",
    };
    return colors[status] || "default";
  };

  return (
    <List
      headerButtons={({ createButtonProps }) => (
        <CreateButton {...createButtonProps} type="primary">
          Create Shift
        </CreateButton>
      )}
    >
      <Table {...tableProps} rowKey="id">
        <Table.Column
          dataIndex="startTime"
          title="Date"
          render={(value) => format(parseISO(value), "EEE, MMM d")}
          sorter
        />
        <Table.Column
          dataIndex="startTime"
          title="Time"
          render={(value, record: any) => (
            <>
              {format(parseISO(value), "h:mm a")} -{" "}
              {format(parseISO(record.endTime), "h:mm a")}
            </>
          )}
        />
        <Table.Column
          dataIndex="position"
          title="Position"
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select
                style={{ width: 200 }}
                placeholder="Select position"
                options={[
                  { label: "Server", value: "SERVER" },
                  { label: "Host", value: "HOST" },
                  { label: "Bartender", value: "BARTENDER" },
                  { label: "Line Cook", value: "LINE_COOK" },
                  { label: "Prep Cook", value: "PREP_COOK" },
                  { label: "Dishwasher", value: "DISHWASHER" },
                  { label: "Manager", value: "MANAGER" },
                ]}
              />
            </FilterDropdown>
          )}
        />
        <Table.Column
          dataIndex="assignedWorker"
          title="Assigned To"
          render={(worker) =>
            worker ? (
              `${worker.user.firstName} ${worker.user.lastName}`
            ) : (
              <Tag color="orange">Unassigned</Tag>
            )
          }
        />
        <Table.Column
          dataIndex="status"
          title="Status"
          render={(status) => (
            <Tag color={getStatusColor(status)}>
              {status.replace(/_/g, " ")}
            </Tag>
          )}
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select
                style={{ width: 200 }}
                placeholder="Select status"
                options={[
                  { label: "Draft", value: "DRAFT" },
                  { label: "Published (Unassigned)", value: "PUBLISHED_UNASSIGNED" },
                  { label: "Published (Claimed)", value: "PUBLISHED_CLAIMED" },
                  { label: "Confirmed", value: "CONFIRMED" },
                  { label: "In Progress", value: "IN_PROGRESS" },
                  { label: "Completed", value: "COMPLETED" },
                  { label: "Cancelled", value: "CANCELLED" },
                ]}
              />
            </FilterDropdown>
          )}
        />
        <Table.Column
          dataIndex="notes"
          title="Notes"
          ellipsis
          render={(notes) => notes || "-"}
        />
        <Table.Column
          title="Actions"
          render={(_, record: any) => (
            <Space>
              <ShowButton hideText size="small" recordItemId={record.id} />
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};
