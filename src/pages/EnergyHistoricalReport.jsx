import { useMemo, useState } from "react";
import dayjs from "dayjs";

import {
  Button,
  Card,
  Col,
  DatePicker,
  InputNumber,
  message,
  Row,
  Select,
  Tabs,
  Typography,
} from "antd";

import { DownloadOutlined, SearchOutlined } from "@ant-design/icons";


import {
  getHistoricalElectricityData,
  getHistoricalEnergyUsage,
} from "../api/energyApi";

import EnergyHistoricalTable from "../components/EnergyHistoricalTable";
import EnergyHistoricalChart from "../components/EnergyHistoricalChart";

import EnergyUsageTable from "../components/EnergyUsageTable";
import EnergyUsageChart from "../components/EnergyUsageChart";

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const panelOptions = [
  {
    label: "ATS1",
    value: "ATS1",
  },
  {
    label: "ATS2",
    value: "ATS2",
  },
  {
    label: "MSB1",
    value: "MSB1",
  },
];

const electricityMetricOptions = [
  {
    label: "L1 Current",
    value: "current_l1_a",
  },
  {
    label: "L2 Current",
    value: "current_l2_a",
  },
  {
    label: "L3 Current",
    value: "current_l3_a",
  },
  {
    label: "Average Current",
    value: "current_avg_a",
  },
  {
    label: "L1-L2 Voltage",
    value: "voltage_l1_l2_v",
  },
  {
    label: "L2-L3 Voltage",
    value: "voltage_l2_l3_v",
  },
  {
    label: "L3-L1 Voltage",
    value: "voltage_l3_l1_v",
  },
  {
    label: "Average Line Voltage",
    value: "voltage_ll_avg_v",
  },
  {
    label: "L1-N Voltage",
    value: "voltage_l1_n_v",
  },
  {
    label: "L2-N Voltage",
    value: "voltage_l2_n_v",
  },
  {
    label: "L3-N Voltage",
    value: "voltage_l3_n_v",
  },
  {
    label: "Average Phase Voltage",
    value: "voltage_ln_avg_v",
  },
  {
    label: "Active Power",
    value: "power_active_kw",
  },
  {
    label: "Reactive Power",
    value: "power_reactive_kvar",
  },
  {
    label: "Apparent Power",
    value: "power_apparent_kva",
  },
  {
    label: "Power Factor",
    value: "power_power_factor",
  },
  {
    label: "Frequency",
    value: "power_frequency_hz",
  },
];

const energyIntervalOptions = [
  {
    label: "Hourly",
    value: "1h",
  },
  {
    label: "Every 6 Hours",
    value: "6h",
  },
  {
    label: "Daily",
    value: "1d",
  },
  {
    label: "Monthly",
    value: "1mo",
  },
];

function normalizeElectricityRecord(record, index) {
  const timestamp =
    record.timestamp ||
    record.time ||
    record._time ||
    (record.timestamp_ms
      ? new Date(Number(record.timestamp_ms)).toISOString()
      : null);

  return {
    key:
      record._id ||
      record.id ||
      `${record.panel}-${record.device_id}-${timestamp}-${index}`,

    panel: record.panel,
    device_id: Number(record.device_id),
    timestamp,

    current_l1_a: record.current_l1_a ?? record.current?.l1_a ?? null,

    current_l2_a: record.current_l2_a ?? record.current?.l2_a ?? null,

    current_l3_a: record.current_l3_a ?? record.current?.l3_a ?? null,

    current_avg_a: record.current_avg_a ?? record.current?.avg_a ?? null,

    voltage_l1_l2_v: record.voltage_l1_l2_v ?? record.voltage?.l1_l2_v ?? null,

    voltage_l2_l3_v: record.voltage_l2_l3_v ?? record.voltage?.l2_l3_v ?? null,

    voltage_l3_l1_v: record.voltage_l3_l1_v ?? record.voltage?.l3_l1_v ?? null,

    voltage_ll_avg_v:
      record.voltage_ll_avg_v ?? record.voltage?.ll_avg_v ?? null,

    voltage_l1_n_v: record.voltage_l1_n_v ?? record.voltage?.l1_n_v ?? null,

    voltage_l2_n_v: record.voltage_l2_n_v ?? record.voltage?.l2_n_v ?? null,

    voltage_l3_n_v: record.voltage_l3_n_v ?? record.voltage?.l3_n_v ?? null,

    voltage_ln_avg_v:
      record.voltage_ln_avg_v ?? record.voltage?.ln_avg_v ?? null,

    power_active_kw: record.power_active_kw ?? record.power?.active_kw ?? null,

    power_reactive_kvar:
      record.power_reactive_kvar ?? record.power?.reactive_kvar ?? null,

    power_apparent_kva:
      record.power_apparent_kva ?? record.power?.apparent_kva ?? null,

    power_power_factor:
      record.power_power_factor ?? record.power?.power_factor ?? null,

    power_frequency_hz:
      record.power_frequency_hz ?? record.power?.frequency_hz ?? null,

    status: record.status || "Unknown",
  };
}

function normalizeEnergyUsageRecord(record, index) {
  const firstEnergy = Number(
    record.firstEnergyKwh ?? record.first_energy_kwh ?? record.first_kwh,
  );

  const lastEnergy = Number(
    record.lastEnergyKwh ?? record.last_energy_kwh ?? record.last_kwh,
  );

  const returnedUsage = Number(
    record.energyUsageKwh ?? record.energy_usage_kwh ?? record.usage_kwh,
  );

  const calculatedUsage =
    Number.isFinite(firstEnergy) && Number.isFinite(lastEnergy)
      ? Math.max(0, lastEnergy - firstEnergy)
      : 0;

  return {
    key: record._id || record.id || `${record.intervalStart}-${index}`,

    panel: record.panel,
    device_id: Number(record.device_id),

    intervalStart:
      record.intervalStart || record.interval_start || record._start,

    intervalEnd: record.intervalEnd || record.interval_end || record._stop,

    firstEnergyKwh: Number.isFinite(firstEnergy) ? firstEnergy : 0,

    lastEnergyKwh: Number.isFinite(lastEnergy) ? lastEnergy : 0,

    energyUsageKwh: Number.isFinite(returnedUsage)
      ? Math.max(0, returnedUsage)
      : calculatedUsage,
  };
}

export default function EnergyHistoricalReport() {
  const [activeTab, setActiveTab] = useState("electricity");

  const [panel, setPanel] = useState("ATS1");
  const [deviceId, setDeviceId] = useState(1);

  const [electricityDateRange, setElectricityDateRange] = useState([
    dayjs().subtract(1, "hour"),
    dayjs(),
  ]);

  const [energyDateRange, setEnergyDateRange] = useState([
    dayjs().subtract(1, "day").startOf("day"),
    dayjs().endOf("day"),
  ]);

  // Electricity tab states
  const [selectedElectricityMetrics, setSelectedElectricityMetrics] = useState([
    "power_active_kw",
    "current_avg_a",
    "voltage_ll_avg_v",
  ]);

  const [electricityData, setElectricityData] = useState([]);

  const [electricityAggregationWindow, setElectricityAggregationWindow] =
    useState("");

  const [electricityLoading, setElectricityLoading] = useState(false);

  // Energy tab states
  const [energyInterval, setEnergyInterval] = useState("1h");

  const [energyData, setEnergyData] = useState([]);
  const [energyLoading, setEnergyLoading] = useState(false);

  const validateCommonRequest = () => {
    if (!panel) {
      message.warning("Please select a panel");
      return null;
    }

    if (!Number.isFinite(Number(deviceId))) {
      message.warning("Please enter a valid device ID");
      return null;
    }

    return {
      panel,
      deviceId: Number(deviceId),
    };
  };

  const getElectricityRequestValues = () => {
    const common = validateCommonRequest();

    if (!common) {
      return null;
    }

    if (
      !Array.isArray(electricityDateRange) ||
      electricityDateRange.length !== 2 ||
      !electricityDateRange[0] ||
      !electricityDateRange[1]
    ) {
      message.warning("Please select a valid date and time range");
      return null;
    }

    const fromTime = electricityDateRange[0];
    const toTime = electricityDateRange[1];

    if (!fromTime.isBefore(toTime)) {
      message.warning("End date/time must be later than start date/time");
      return null;
    }

    return {
      ...common,
      fromTime: fromTime.toISOString(),
      toTime: toTime.toISOString(),
    };
  };

  const getEnergyRequestValues = () => {
    const common = validateCommonRequest();

    if (!common) {
      return null;
    }

    if (
      !Array.isArray(energyDateRange) ||
      energyDateRange.length !== 2 ||
      !energyDateRange[0] ||
      !energyDateRange[1]
    ) {
      message.warning("Please select a valid date range");
      return null;
    }

    return {
      ...common,
      fromTime: energyDateRange[0].startOf("day").toISOString(),
      toTime: energyDateRange[1].endOf("day").toISOString(),
    };
  };

  const loadElectricityData = async () => {
    const request = getElectricityRequestValues();

    if (!request) {
      return;
    }

    try {
      setElectricityLoading(true);

      const result = await getHistoricalElectricityData(request);

      const rawRecords = Array.isArray(result)
        ? result
        : result?.data || result?.records || [];

      const normalized = rawRecords
        .map(normalizeElectricityRecord)
        .filter((record) => record.timestamp)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      setElectricityData(normalized);

      setElectricityAggregationWindow(result?.aggregationWindow || "");

      if (!normalized.length) {
        message.info("No electricity data found");
      }
    } catch (error) {
      console.error("Electricity history error:", error);

      message.error(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to load electricity data",
      );

      setElectricityData([]);
    } finally {
      setElectricityLoading(false);
    }
  };

  const loadEnergyData = async () => {
    const request = getEnergyRequestValues();

    if (!request) {
      return;
    }

    try {
      setEnergyLoading(true);

      const result = await getHistoricalEnergyUsage({
        ...request,
        interval: energyInterval,
      });

      const rawRecords = Array.isArray(result)
        ? result
        : result?.data || result?.records || [];

      const normalized = rawRecords
        .map(normalizeEnergyUsageRecord)
        .filter((record) => record.intervalStart && record.intervalEnd)
        .sort(
          (a, b) =>
            new Date(a.intervalStart).getTime() -
            new Date(b.intervalStart).getTime(),
        );

      setEnergyData(normalized);

      if (!normalized.length) {
        message.info("No energy usage data found");
      }
    } catch (error) {
      console.error("Energy usage history error:", error);

      message.error(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to load energy usage",
      );

      setEnergyData([]);
    } finally {
      setEnergyLoading(false);
    }
  };

  const totalEnergyUsage = useMemo(() => {
    return energyData.reduce(
      (total, item) => total + (Number(item.energyUsageKwh) || 0),
      0,
    );
  }, [energyData]);

  const exportElectricityExcel = async () => {
    if (!electricityData.length) {
      message.warning("There is no electricity data to export");

      return;
    }

    const [excelModule, fileSaverModule] = await Promise.all([
      import("exceljs"),
      import("file-saver"),
    ]);
    const ExcelJS = excelModule.default || excelModule;
    const saveAs = fileSaverModule.saveAs || fileSaverModule.default;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Electricity");

    worksheet.columns = [
      {
        header: "Timestamp",
        key: "timestamp",
        width: 22,
      },
      {
        header: "Panel",
        key: "panel",
        width: 12,
      },
      {
        header: "Device ID",
        key: "device_id",
        width: 12,
      },
      {
        header: "L1 Current (A)",
        key: "current_l1_a",
        width: 16,
      },
      {
        header: "L2 Current (A)",
        key: "current_l2_a",
        width: 16,
      },
      {
        header: "L3 Current (A)",
        key: "current_l3_a",
        width: 16,
      },
      {
        header: "Average Current (A)",
        key: "current_avg_a",
        width: 20,
      },
      {
        header: "LL Average Voltage (V)",
        key: "voltage_ll_avg_v",
        width: 23,
      },
      {
        header: "LN Average Voltage (V)",
        key: "voltage_ln_avg_v",
        width: 23,
      },
      {
        header: "Active Power (kW)",
        key: "power_active_kw",
        width: 18,
      },
      {
        header: "Reactive Power (kvar)",
        key: "power_reactive_kvar",
        width: 21,
      },
      {
        header: "Apparent Power (kVA)",
        key: "power_apparent_kva",
        width: 21,
      },
      {
        header: "Power Factor",
        key: "power_power_factor",
        width: 15,
      },
      {
        header: "Frequency (Hz)",
        key: "power_frequency_hz",
        width: 16,
      },
      {
        header: "Status",
        key: "status",
        width: 12,
      },
    ];

    electricityData.forEach((record) => {
      worksheet.addRow({
        ...record,
        timestamp: dayjs(record.timestamp).format("YYYY-MM-DD HH:mm:ss"),
      });
    });

    worksheet.getRow(1).font = {
      bold: true,
    };

    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    const buffer = await workbook.xlsx.writeBuffer();

    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${panel}_Electricity_History.xlsx`,
    );
  };

  const exportEnergyExcel = async () => {
    if (!energyData.length) {
      message.warning("There is no energy data to export");

      return;
    }

    const [excelModule, fileSaverModule] = await Promise.all([
      import("exceljs"),
      import("file-saver"),
    ]);
    const ExcelJS = excelModule.default || excelModule;
    const saveAs = fileSaverModule.saveAs || fileSaverModule.default;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Energy Usage");

    worksheet.columns = [
      {
        header: "Interval Start",
        key: "intervalStart",
        width: 22,
      },
      {
        header: "Interval End",
        key: "intervalEnd",
        width: 22,
      },
      {
        header: "Panel",
        key: "panel",
        width: 12,
      },
      {
        header: "Device ID",
        key: "device_id",
        width: 12,
      },
      {
        header: "First Energy (kWh)",
        key: "firstEnergyKwh",
        width: 20,
      },
      {
        header: "Last Energy (kWh)",
        key: "lastEnergyKwh",
        width: 20,
      },
      {
        header: "Energy Usage (kWh)",
        key: "energyUsageKwh",
        width: 21,
      },
    ];

    energyData.forEach((record) => {
      worksheet.addRow({
        ...record,

        intervalStart: dayjs(record.intervalStart).format(
          "YYYY-MM-DD HH:mm:ss",
        ),

        intervalEnd: dayjs(record.intervalEnd).format("YYYY-MM-DD HH:mm:ss"),
      });
    });

    worksheet.addRow({});
    worksheet.addRow({
      intervalEnd: "Total Energy Usage",
      energyUsageKwh: totalEnergyUsage,
    });

    worksheet.getRow(1).font = {
      bold: true,
    };

    worksheet.views = [
      {
        state: "frozen",
        ySplit: 1,
      },
    ];

    const buffer = await workbook.xlsx.writeBuffer();

    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${panel}_Energy_Usage_${energyInterval}.xlsx`,
    );
  };

  const sharedPanelControl = (
    <>
      <Text strong>Panel</Text>
      <Select
        value={panel}
        options={panelOptions}
        onChange={(value) => {
          setPanel(value);
          setElectricityData([]);
          setEnergyData([]);
        }}
        style={{ width: "100%", marginTop: 6 }}
      />
    </>
  );

  const sharedDeviceControl = (
    <>
      <Text strong>Device ID</Text>
      <InputNumber
        value={deviceId}
        min={1}
        precision={0}
        onChange={(value) => {
          setDeviceId(Number(value));
          setElectricityData([]);
          setEnergyData([]);
        }}
        style={{ width: "100%", marginTop: 6 }}
      />
    </>
  );

  const electricityTab = (
    <div style={{ paddingTop: 8 }}>
      <Row gutter={[12, 12]} align="bottom">
        <Col xs={24} sm={12} md={4} xl={3}>
          {sharedPanelControl}
        </Col>

        <Col xs={24} sm={12} md={4} xl={3}>
          {sharedDeviceControl}
        </Col>

        <Col xs={24} md={16} lg={9} xl={10}>
          <Text strong>Date & time range</Text>
          <RangePicker
            value={electricityDateRange}
            showTime={{ format: "HH:mm" }}
            format="YYYY-MM-DD HH:mm"
            order={false}
            needConfirm
            onChange={(values) => {
              setElectricityDateRange(values || []);
              setElectricityData([]);
            }}
            allowClear
            style={{ width: "100%", marginTop: 6 }}
          />
        </Col>

        <Col flex="none">
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={electricityLoading}
            onClick={loadElectricityData}
          >
            Load Data
          </Button>
        </Col>

        <Col flex="none">
          <Button
            icon={<DownloadOutlined />}
            disabled={!electricityData.length}
            onClick={exportElectricityExcel}
          >
            Export
          </Button>
        </Col>

        {electricityAggregationWindow && (
          <Col flex="none">
            <Text type="secondary">
              Aggregation: {electricityAggregationWindow}
            </Text>
          </Col>
        )}
      </Row>

      <div style={{ marginTop: 16 }}>
      <EnergyHistoricalTable
        data={electricityData}
        loading={electricityLoading}
      />
      </div>

      <div style={{ marginTop: 24 }}>
        <Text
          strong
          style={{
            display: "block",
            marginBottom: 6,
          }}
        >
          Select measurements for chart
        </Text>

        <Select
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          value={selectedElectricityMetrics}
          options={electricityMetricOptions}
          onChange={setSelectedElectricityMetrics}
          placeholder="Select electrical measurements"
          style={{
            width: "100%",
            maxWidth: 950,
          }}
        />
      </div>

      <EnergyHistoricalChart
        data={electricityData}
        selectedMetrics={selectedElectricityMetrics}
        loading={electricityLoading}
      />
    </div>
  );

  const energyTab = (
    <div style={{ paddingTop: 8 }}>
      <Row gutter={[12, 12]} align="bottom">
        <Col xs={24} sm={12} md={4} xl={3}>
          {sharedPanelControl}
        </Col>

        <Col xs={24} sm={12} md={4} xl={3}>
          {sharedDeviceControl}
        </Col>

        <Col xs={24} md={10} lg={7} xl={7}>
          <Text strong>Date range</Text>
          <RangePicker
            value={energyDateRange}
            format="YYYY-MM-DD"
            onChange={(values) => {
              setEnergyDateRange(values || []);
              setEnergyData([]);
            }}
            allowClear
            style={{ width: "100%", marginTop: 6 }}
          />
        </Col>

        <Col xs={24} sm={12} md={6} lg={4} xl={3}>
          <Text strong>Interval</Text>
          <Select
            value={energyInterval}
            options={energyIntervalOptions}
            onChange={(value) => {
              setEnergyInterval(value);
              setEnergyData([]);
            }}
            style={{ width: "100%", marginTop: 6 }}
          />
        </Col>

        <Col flex="none">
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={energyLoading}
            onClick={loadEnergyData}
          >
            Load Data
          </Button>
        </Col>

        <Col flex="none">
          <Button
            icon={<DownloadOutlined />}
            disabled={!energyData.length}
            onClick={exportEnergyExcel}
          >
            Export
          </Button>
        </Col>

        {energyData.length > 0 && (
          <Col flex="none">
            <Text strong>
              Total: {totalEnergyUsage.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} kWh
            </Text>
          </Col>
        )}
      </Row>

      <div style={{ marginTop: 16 }}>
      <EnergyUsageTable data={energyData} loading={energyLoading} />
      </div>

      <EnergyUsageChart
        data={energyData}
        loading={energyLoading}
        interval={energyInterval}
      />
    </div>
  );

  const tabItems = [
    {
      key: "electricity",
      label: "Electricity",
      children: electricityTab,
    },
    {
      key: "energy",
      label: "Energy",
      children: energyTab,
    },
  ];

  return (
    <Card className="energy-history-page">
      <Title level={4}>Historical Energy Meter Report</Title>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        items={tabItems}
      />
    </Card>
  );
}
