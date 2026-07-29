import { Table, Tag, Tooltip } from "antd";

function formatNumber(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getStatusColor(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "running") {
    return "success";
  }

  if (normalizedStatus === "stopped") {
    return "error";
  }

  if (normalizedStatus === "completed") {
    return "blue";
  }

  return "default";
}

export default function HistoricalTable({ data = [], loading = false }) {
  const columns = [
    {
      title: "Date",
      dataIndex: "shiftDate",
      key: "shiftDate",
      fixed: "left",
      width: 115,
      sorter: (a, b) =>
        new Date(a.shiftDate).getTime() - new Date(b.shiftDate).getTime(),
    },
    {
      title: "Shift",
      dataIndex: "shift",
      key: "shift",
      width: 90,
      filters: [
        {
          text: "06-14",
          value: "06-14",
        },
        {
          text: "14-22",
          value: "14-22",
        },
        {
          text: "22-06",
          value: "22-06",
        },
      ],
      onFilter: (value, record) => record.shift === value,
    },
    // {
    //   title: "Status",
    //   dataIndex: "status",
    //   key: "status",
    //   width: 100,
    //   render: (status) => (
    //     <Tag color={getStatusColor(status)}>{status || "Unknown"}</Tag>
    //   ),
    // },
    {
      title: "Tile Count",
      dataIndex: "tileCount",
      key: "tileCount",
      width: 120,
      align: "right",
      sorter: (a, b) => Number(a.tileCount || 0) - Number(b.tileCount || 0),
      render: (value) => formatNumber(value, 0),
    },
    {
      title: "Production",
      dataIndex: "production",
      key: "production",
      width: 130,
      align: "right",
      sorter: (a, b) => Number(a.production || 0) - Number(b.production || 0),
      render: (value, record) =>
        `${formatNumber(value)} ${record.productionUnit || ""}`,
    },
    {
      title: "Downtime",
      dataIndex: "totalDowntimeMinutes",
      key: "totalDowntimeMinutes",
      width: 135,
      align: "right",
      sorter: (a, b) =>
        Number(a.totalDowntimeMinutes || 0) -
        Number(b.totalDowntimeMinutes || 0),
      render: (value, record) => (
        <Tooltip title={`${formatNumber(value)} minutes`}>
          <span>
            {record.formattedDowntime || `${formatNumber(value)} min`}
          </span>
        </Tooltip>
      ),
    },
    {
      title: "Stops",
      dataIndex: "completedStops",
      key: "completedStops",
      width: 85,
      align: "right",
      sorter: (a, b) =>
        Number(a.completedStops || 0) - Number(b.completedStops || 0),
      render: (value) => formatNumber(value, 0),
    },
    {
      title: "OLE",
      dataIndex: "ole",
      key: "ole",
      width: 90,
      align: "right",
      sorter: (a, b) => Number(a.ole || 0) - Number(b.ole || 0),
      render: (value) => `${formatNumber(value)}%`,
    },
    {
      title: "Availability",
      dataIndex: "availability",
      key: "availability",
      width: 120,
      align: "right",
      sorter: (a, b) =>
        Number(a.availability || 0) - Number(b.availability || 0),
      render: (value) => `${formatNumber(value)}%`,
    },
    {
      title: "Performance",
      dataIndex: "performance",
      key: "performance",
      width: 120,
      align: "right",
      sorter: (a, b) => Number(a.performance || 0) - Number(b.performance || 0),
      render: (value) => `${formatNumber(value)}%`,
    },
    {
      title: "Quality",
      dataIndex: "quality",
      key: "quality",
      width: 90,
      align: "right",
      sorter: (a, b) => Number(a.quality || 0) - Number(b.quality || 0),
      render: (value) => `${formatNumber(value)}%`,
    },
    {
      title: "Operating Time",
      dataIndex: "actualOperatingMinutes",
      key: "actualOperatingMinutes",
      width: 145,
      align: "right",
      sorter: (a, b) =>
        Number(a.actualOperatingMinutes || 0) -
        Number(b.actualOperatingMinutes || 0),
      render: (value) => `${formatNumber(value)} min`,
    },
  ];

  return (
    <Table
      rowKey="key"
      columns={columns}
      dataSource={data}
      loading={loading}
      bordered
      size="middle"
      pagination={{
        pageSize: 15,
        showSizeChanger: true,
        pageSizeOptions: [10, 15, 25, 50, 100],
        showTotal: (total) => `${total} shift records`,
      }}
      scroll={{
        x: 1350,
      }}
      locale={{
        emptyText: "Select a date range and load historical data",
      }}
    />
  );
}
