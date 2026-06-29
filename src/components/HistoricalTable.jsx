import { Table } from "antd";

export default function HistoricalTable({ data }) {
  const columns = [
    {
      title: "Date",
      dataIndex: "date",
    },

    {
      title: "Shift",
      dataIndex: "shift",
    },

    {
      title: "Production",
      dataIndex: "production",
    },

    {
      title: "Downtime (min)",
      dataIndex: "downtime",
    },
  ];

  return (
    <Table
      rowKey={(record, index) => index}
      columns={columns}
      dataSource={data}
      pagination={{
        pageSize: 20,
      }}
    />
  );
}
