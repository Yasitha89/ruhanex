import { Table, Tag } from "antd";
import dayjs from "dayjs";

function formatValue(value, decimals = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "-";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getStatusColor(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "online") {
    return "success";
  }

  if (normalizedStatus === "offline") {
    return "error";
  }

  return "default";
}

export default function EnergyHistoricalTable({ data = [], loading = false }) {
  const columns = [
    {
      title: "Timestamp",
      dataIndex: "timestamp",
      key: "timestamp",
      fixed: "left",
      width: 175,

      render: (value) => {
        if (!value) {
          return "-";
        }

        return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
      },

      sorter: (a, b) => {
        return (
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      },

      defaultSortOrder: "ascend",
    },

    {
      title: "Panel",
      dataIndex: "panel",
      key: "panel",
      width: 90,

      filters: Array.from(
        new Set(data.map((record) => record.panel).filter(Boolean)),
      ).map((panel) => ({
        text: panel,
        value: panel,
      })),

      onFilter: (value, record) => {
        return record.panel === value;
      },

      render: (value) => value || "-",
    },

    {
      title: "Device ID",
      dataIndex: "device_id",
      key: "device_id",
      width: 95,
      align: "center",

      render: (value) => {
        return value ?? "-";
      },
    },

    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 95,
      align: "center",

      filters: [
        {
          text: "Online",
          value: "Online",
        },
        {
          text: "Offline",
          value: "Offline",
        },
      ],

      onFilter: (value, record) => {
        return (
          String(record.status).toLowerCase() === String(value).toLowerCase()
        );
      },

      render: (status) => (
        <Tag color={getStatusColor(status)}>{status || "Unknown"}</Tag>
      ),
    },

    {
      title: "Current",
      children: [
        {
          title: "L1",
          dataIndex: "current_l1_a",
          key: "current_l1_a",
          width: 100,
          align: "right",

          sorter: (a, b) => {
            return Number(a.current_l1_a || 0) - Number(b.current_l1_a || 0);
          },

          render: (value) => {
            return `${formatValue(value)} A`;
          },
        },

        {
          title: "L2",
          dataIndex: "current_l2_a",
          key: "current_l2_a",
          width: 100,
          align: "right",

          sorter: (a, b) => {
            return Number(a.current_l2_a || 0) - Number(b.current_l2_a || 0);
          },

          render: (value) => {
            return `${formatValue(value)} A`;
          },
        },

        {
          title: "L3",
          dataIndex: "current_l3_a",
          key: "current_l3_a",
          width: 100,
          align: "right",

          sorter: (a, b) => {
            return Number(a.current_l3_a || 0) - Number(b.current_l3_a || 0);
          },

          render: (value) => {
            return `${formatValue(value)} A`;
          },
        },

        {
          title: "Average",
          dataIndex: "current_avg_a",
          key: "current_avg_a",
          width: 115,
          align: "right",

          sorter: (a, b) => {
            return Number(a.current_avg_a || 0) - Number(b.current_avg_a || 0);
          },

          render: (value) => {
            return `${formatValue(value)} A`;
          },
        },
      ],
    },

    {
      title: "Line-Line Voltage",
      children: [
        {
          title: "L1-L2",
          dataIndex: "voltage_l1_l2_v",
          key: "voltage_l1_l2_v",
          width: 110,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_l1_l2_v || 0) - Number(b.voltage_l1_l2_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },

        {
          title: "L2-L3",
          dataIndex: "voltage_l2_l3_v",
          key: "voltage_l2_l3_v",
          width: 110,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_l2_l3_v || 0) - Number(b.voltage_l2_l3_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },

        {
          title: "L3-L1",
          dataIndex: "voltage_l3_l1_v",
          key: "voltage_l3_l1_v",
          width: 110,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_l3_l1_v || 0) - Number(b.voltage_l3_l1_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },

        {
          title: "Average",
          dataIndex: "voltage_ll_avg_v",
          key: "voltage_ll_avg_v",
          width: 115,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_ll_avg_v || 0) - Number(b.voltage_ll_avg_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },
      ],
    },

    {
      title: "Line-Neutral Voltage",
      children: [
        {
          title: "L1-N",
          dataIndex: "voltage_l1_n_v",
          key: "voltage_l1_n_v",
          width: 110,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_l1_n_v || 0) - Number(b.voltage_l1_n_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },

        {
          title: "L2-N",
          dataIndex: "voltage_l2_n_v",
          key: "voltage_l2_n_v",
          width: 110,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_l2_n_v || 0) - Number(b.voltage_l2_n_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },

        {
          title: "L3-N",
          dataIndex: "voltage_l3_n_v",
          key: "voltage_l3_n_v",
          width: 110,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_l3_n_v || 0) - Number(b.voltage_l3_n_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },

        {
          title: "Average",
          dataIndex: "voltage_ln_avg_v",
          key: "voltage_ln_avg_v",
          width: 115,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.voltage_ln_avg_v || 0) - Number(b.voltage_ln_avg_v || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value)} V`;
          },
        },
      ],
    },

    {
      title: "Power",
      children: [
        {
          title: "Active",
          dataIndex: "power_active_kw",
          key: "power_active_kw",
          width: 120,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.power_active_kw || 0) - Number(b.power_active_kw || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value, 3)} kW`;
          },
        },

        {
          title: "Reactive",
          dataIndex: "power_reactive_kvar",
          key: "power_reactive_kvar",
          width: 135,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.power_reactive_kvar || 0) -
              Number(b.power_reactive_kvar || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value, 3)} kvar`;
          },
        },

        {
          title: "Apparent",
          dataIndex: "power_apparent_kva",
          key: "power_apparent_kva",
          width: 135,
          align: "right",

          sorter: (a, b) => {
            return (
              Number(a.power_apparent_kva || 0) -
              Number(b.power_apparent_kva || 0)
            );
          },

          render: (value) => {
            return `${formatValue(value, 3)} kVA`;
          },
        },
      ],
    },

    {
      title: "Power Factor",
      dataIndex: "power_power_factor",
      key: "power_power_factor",
      width: 115,
      align: "right",

      sorter: (a, b) => {
        return (
          Number(a.power_power_factor || 0) - Number(b.power_power_factor || 0)
        );
      },

      render: (value) => {
        return formatValue(value, 3);
      },
    },

    {
      title: "Frequency",
      dataIndex: "power_frequency_hz",
      key: "power_frequency_hz",
      width: 115,
      align: "right",

      sorter: (a, b) => {
        return (
          Number(a.power_frequency_hz || 0) - Number(b.power_frequency_hz || 0)
        );
      },

      render: (value) => {
        return `${formatValue(value)} Hz`;
      },
    },
  ];

  return (
    <Table
      rowKey={(record) =>
        record.key || `${record.panel}-${record.device_id}-${record.timestamp}`
      }
      columns={columns}
      dataSource={data}
      loading={loading}
      bordered
      size="small"
      sticky
      scroll={{
        x: 2400,
        y: 500,
      }}
      pagination={{
        defaultPageSize: 20,
        showSizeChanger: true,
        pageSizeOptions: ["10", "20", "50", "100"],

        showTotal: (total, range) => {
          return `${range[0]}-${range[1]} of ${total} records`;
        },
      }}
      locale={{
        emptyText: "Select a panel and date range, then load electricity data",
      }}
    />
  );
}
