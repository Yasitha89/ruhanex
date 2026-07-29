import { Table } from "antd";
import dayjs from "dayjs";

function formatNumber(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function EnergyUsageTable({ data = [], loading = false }) {
  const columns = [
    {
      title: "Start",
      dataIndex: "intervalStart",
      key: "intervalStart",
      fixed: "left",
      width: 175,

      render: (value) =>
        value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-",
    },
    {
      title: "End",
      dataIndex: "intervalEnd",
      key: "intervalEnd",
      width: 175,

      render: (value) =>
        value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-",
    },
    {
      title: "First Reading",
      dataIndex: "firstEnergyKwh",
      key: "firstEnergyKwh",
      width: 150,
      align: "right",

      render: (value) => `${formatNumber(value)} kWh`,
    },
    {
      title: "Last Reading",
      dataIndex: "lastEnergyKwh",
      key: "lastEnergyKwh",
      width: 150,
      align: "right",

      render: (value) => `${formatNumber(value)} kWh`,
    },
    {
      title: "Energy Usage",
      dataIndex: "energyUsageKwh",
      key: "energyUsageKwh",
      width: 155,
      align: "right",

      sorter: (a, b) =>
        Number(a.energyUsageKwh || 0) - Number(b.energyUsageKwh || 0),

      render: (value) => <strong>{formatNumber(value)} kWh</strong>,
    },
  ];

  return (
    <Table
      rowKey="key"
      columns={columns}
      dataSource={data}
      loading={loading}
      bordered
      size="small"
      scroll={{
        x: 850,
      }}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],

        showTotal: (total) => `${total} energy intervals`,
      }}
      summary={(records) => {
        if (!records.length) {
          return null;
        }

        const total = records.reduce(
          (sum, record) => sum + (Number(record.energyUsageKwh) || 0),
          0,
        );

        return (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={4} align="right">
              <strong>Total Energy Usage</strong>
            </Table.Summary.Cell>

            <Table.Summary.Cell index={4} align="right">
              <strong>{formatNumber(total)} kWh</strong>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        );
      }}
      locale={{
        emptyText: "Select an interval and load energy usage",
      }}
    />
  );
}
