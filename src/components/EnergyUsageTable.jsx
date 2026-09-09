import { useMemo } from "react";
import { Table, Tag } from "antd";
import { formatColomboApiTime } from "../utils/energyTime";
import { getEnergyMeterKey, getEnergyMeters } from "../utils/energyMeter";

const DEVICE_COLORS = [
  "#1677ff",
  "#52c41a",
  "#fa8c16",
  "#722ed1",
  "#13c2c2",
  "#eb2f96",
  "#faad14",
  "#2f54eb",
];

function formatNumber(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getBucketKey(timestamp, interval) {
  if (!timestamp) return "";
  if (interval === "1y") return formatColomboApiTime(timestamp, "YYYY");
  if (interval === "1mo") return formatColomboApiTime(timestamp, "YYYY-MM");
  if (interval === "1d") return formatColomboApiTime(timestamp, "YYYY-MM-DD");

  if (interval === "6h") {
    const day = formatColomboApiTime(timestamp, "YYYY-MM-DD");
    const hour = Number(formatColomboApiTime(timestamp, "HH"));
    const bucketHour = Math.floor((Number.isFinite(hour) ? hour : 0) / 6) * 6;
    return `${day} ${String(bucketHour).padStart(2, "0")}:00`;
  }

  return formatColomboApiTime(timestamp, "YYYY-MM-DD HH");
}

function mergeRowsByInterval(data, interval) {
  const grouped = new Map();

  for (const record of data || []) {
    if (!record?.intervalStart) continue;

    const meterKey = getEnergyMeterKey(record);
    const bucketKey = getBucketKey(record.intervalStart, interval);
    if (!bucketKey) continue;

    if (!grouped.has(bucketKey)) {
      grouped.set(bucketKey, {
        key: bucketKey,
        intervalStart: record.intervalStart,
        intervalEnd: record.intervalEnd,
        meters: {},
        totalEnergyUsageKwh: 0,
      });
    }

    const row = grouped.get(bucketKey);
    const usage = Math.max(0, Number(record.energyUsageKwh) || 0);

    row.meters[meterKey] = Number(row.meters[meterKey] || 0) + usage;
    row.totalEnergyUsageKwh += usage;

    const currentEnd = new Date(row.intervalEnd || 0).getTime();
    const newEnd = new Date(record.intervalEnd || 0).getTime();
    if (Number.isFinite(newEnd) && newEnd > currentEnd) {
      row.intervalEnd = record.intervalEnd;
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) =>
      new Date(a.intervalStart).getTime() -
      new Date(b.intervalStart).getTime(),
  );
}

export default function EnergyUsageTable({
  data = [],
  loading = false,
  interval = "1h",
}) {
  const meters = useMemo(() => getEnergyMeters(data), [data]);
  const mergedData = useMemo(
    () => mergeRowsByInterval(data, interval),
    [data, interval],
  );

  const meterColorMap = useMemo(
    () =>
      new Map(
        meters.map((meter, index) => [
          meter.key,
          DEVICE_COLORS[index % DEVICE_COLORS.length],
        ]),
      ),
    [meters],
  );

  const columns = useMemo(() => {
    const meterColumns = meters.map((meter) => ({
      title: (
        <Tag color={meterColorMap.get(meter.key) || "default"}>
          {meter.label}
        </Tag>
      ),
      key: `meter-${meter.key}`,
      width: 170,
      align: "right",
      sorter: (a, b) =>
        Number(a.meters?.[meter.key] || 0) - Number(b.meters?.[meter.key] || 0),
      render: (_, record) => (
        <strong style={{ color: meterColorMap.get(meter.key) }}>
          {formatNumber(record.meters?.[meter.key] ?? 0)} kWh
        </strong>
      ),
    }));

    return [
      {
        title: "Start",
        dataIndex: "intervalStart",
        key: "intervalStart",
        fixed: "left",
        width: 175,
        render: (value) =>
          value ? formatColomboApiTime(value, "YYYY-MM-DD HH:mm:ss") : "-",
        sorter: (a, b) =>
          new Date(a.intervalStart).getTime() -
          new Date(b.intervalStart).getTime(),
        defaultSortOrder: "ascend",
      },
      {
        title: "End",
        dataIndex: "intervalEnd",
        key: "intervalEnd",
        width: 175,
        render: (value) =>
          value ? formatColomboApiTime(value, "YYYY-MM-DD HH:mm:ss") : "-",
      },
      ...meterColumns,
      {
        title: "Total",
        dataIndex: "totalEnergyUsageKwh",
        key: "totalEnergyUsageKwh",
        width: 155,
        align: "right",
        sorter: (a, b) =>
          Number(a.totalEnergyUsageKwh || 0) -
          Number(b.totalEnergyUsageKwh || 0),
        render: (value) => <strong>{formatNumber(value)} kWh</strong>,
      },
    ];
  }, [meters, meterColorMap]);

  return (
    <Table
      rowKey="key"
      columns={columns}
      dataSource={mergedData}
      loading={loading}
      bordered
      size="small"
      scroll={{ x: 350 + meters.length * 170 + 155 }}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        pageSizeOptions: [10, 20, 50, 100],
        showTotal: (total) => `${total} intervals`,
      }}
      summary={(records) => {
        if (!records.length) return null;

        const meterTotals = Object.fromEntries(
          meters.map((meter) => [
            meter.key,
            records.reduce(
              (sum, row) =>
                sum + Math.max(0, Number(row.meters?.[meter.key]) || 0),
              0,
            ),
          ]),
        );

        const grandTotal = records.reduce(
          (sum, row) =>
            sum + Math.max(0, Number(row.totalEnergyUsageKwh) || 0),
          0,
        );

        return (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={2} align="right">
              <strong>Total</strong>
            </Table.Summary.Cell>

            {meters.map((meter, index) => (
              <Table.Summary.Cell
                key={meter.key}
                index={index + 2}
                align="right"
              >
                <strong style={{ color: meterColorMap.get(meter.key) }}>
                  {formatNumber(meterTotals[meter.key])} kWh
                </strong>
              </Table.Summary.Cell>
            ))}

            <Table.Summary.Cell index={meters.length + 2} align="right">
              <strong>{formatNumber(grandTotal)} kWh</strong>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        );
      }}
      locale={{ emptyText: "Select an interval and load energy usage" }}
    />
  );
}
