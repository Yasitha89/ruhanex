import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from "antd";
import {
  AppstoreAddOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

import {
  getDesignCodes,
  getMachines,
  saveDesignCode,
  saveMachine,
} from "../api/settingsApi";
import {
  PRODUCTION_LINE_OPTIONS,
  TILE_SIZE_OPTIONS,
} from "../utils/constants";
import "./ProductionMasterData.css";

const { Title, Text } = Typography;

const DEFAULT_MACHINE = {
  line: PRODUCTION_LINE_OPTIONS[0]?.value || "",
  machineCode: "",
  machineName: "",
  active: true,
};

const DEFAULT_DESIGN = {
  tileSize: TILE_SIZE_OPTIONS[0]?.value || "",
  designCode: "",
  description: "",
  active: true,
};

export default function ProductionMasterData() {
  const [machineForm] = Form.useForm();
  const [designForm] = Form.useForm();

  const [activeTab, setActiveTab] = useState("machines");
  const [machineLine, setMachineLine] = useState(
    PRODUCTION_LINE_OPTIONS[0]?.value || "",
  );
  const [designTileSize, setDesignTileSize] = useState(
    TILE_SIZE_OPTIONS[0]?.value || "",
  );

  const [machines, setMachines] = useState([]);
  const [designCodes, setDesignCodes] = useState([]);
  const [machineLoading, setMachineLoading] = useState(false);
  const [designLoading, setDesignLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [designModalOpen, setDesignModalOpen] = useState(false);

  const loadMachines = useCallback(async () => {
    if (!machineLine) return;
    setMachineLoading(true);
    setError("");
    try {
      const result = await getMachines({ line: machineLine });
      setMachines(Array.isArray(result?.machines) ? result.machines : []);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Unable to load machines.";
      setError(text);
      message.error(text);
    } finally {
      setMachineLoading(false);
    }
  }, [machineLine]);

  const loadDesignCodes = useCallback(async () => {
    if (!designTileSize) return;
    setDesignLoading(true);
    setError("");
    try {
      const result = await getDesignCodes({ tileSize: designTileSize });
      setDesignCodes(
        Array.isArray(result?.designCodes) ? result.designCodes : [],
      );
    } catch (err) {
      const text =
        err instanceof Error ? err.message : "Unable to load design codes.";
      setError(text);
      message.error(text);
    } finally {
      setDesignLoading(false);
    }
  }, [designTileSize]);

  useEffect(() => {
    loadMachines();
  }, [loadMachines]);

  useEffect(() => {
    loadDesignCodes();
  }, [loadDesignCodes]);

  const openMachineModal = () => {
    machineForm.setFieldsValue({
      ...DEFAULT_MACHINE,
      line: machineLine || DEFAULT_MACHINE.line,
    });
    setMachineModalOpen(true);
  };

  const openDesignModal = () => {
    designForm.setFieldsValue({
      ...DEFAULT_DESIGN,
      tileSize: designTileSize || DEFAULT_DESIGN.tileSize,
    });
    setDesignModalOpen(true);
  };

  const handleSaveMachine = async () => {
    try {
      const values = await machineForm.validateFields();
      setSaving(true);

      const result = await saveMachine({
        line: values.line,
        machineCode: String(values.machineCode || "").trim(),
        machineName: String(values.machineName || "").trim(),
        active: true,
      });

      if (result?.success === false) {
        throw new Error(result.error || "Unable to save machine.");
      }

      message.success("Machine saved");
      setMachineModalOpen(false);
      setMachineLine(values.line);
      machineForm.resetFields();

      if (values.line === machineLine) {
        await loadMachines();
      }
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err instanceof Error ? err.message : "Unable to save machine.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDesign = async () => {
    try {
      const values = await designForm.validateFields();
      setSaving(true);

      const result = await saveDesignCode({
        tileSize: values.tileSize,
        designCode: String(values.designCode || "").trim(),
        description: String(values.description || "").trim(),
        active: true,
      });

      if (result?.success === false) {
        throw new Error(result.error || "Unable to save design code.");
      }

      message.success("Design code saved");
      setDesignModalOpen(false);
      setDesignTileSize(values.tileSize);
      designForm.resetFields();

      if (values.tileSize === designTileSize) {
        await loadDesignCodes();
      }
    } catch (err) {
      if (err?.errorFields) return;
      message.error(
        err instanceof Error ? err.message : "Unable to save design code.",
      );
    } finally {
      setSaving(false);
    }
  };

  const machineColumns = useMemo(
    () => [
      {
        title: "Machine Code",
        dataIndex: "machineCode",
        key: "machineCode",
        width: 180,
        render: (value) => value || "—",
      },
      {
        title: "Machine Name",
        dataIndex: "machineName",
        key: "machineName",
      },
      {
        title: "Line",
        dataIndex: "line",
        key: "line",
        width: 180,
      },
      {
        title: "Status",
        dataIndex: "active",
        key: "active",
        width: 110,
        render: (active) => (
          <Tag color={active === false ? "default" : "green"}>
            {active === false ? "Inactive" : "Active"}
          </Tag>
        ),
      },
    ],
    [],
  );

  const designColumns = useMemo(
    () => [
      {
        title: "Design Code",
        dataIndex: "designCode",
        key: "designCode",
        width: 220,
      },
      {
        title: "Tile Size",
        dataIndex: "tileSize",
        key: "tileSize",
        width: 150,
      },
      {
        title: "Description",
        dataIndex: "description",
        key: "description",
        render: (value) => value || "—",
      },
      {
        title: "Status",
        dataIndex: "active",
        key: "active",
        width: 110,
        render: (active) => (
          <Tag color={active === false ? "default" : "green"}>
            {active === false ? "Inactive" : "Active"}
          </Tag>
        ),
      },
    ],
    [],
  );

  const items = [
    {
      key: "machines",
      label: "Machine Master",
      children: (
        <>
          <div className="production-master-toolbar">
            <Select
              value={machineLine}
              options={PRODUCTION_LINE_OPTIONS}
              onChange={setMachineLine}
              className="production-master-filter"
              placeholder="Select production line"
            />
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadMachines}
                loading={machineLoading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openMachineModal}
              >
                Add Machine
              </Button>
            </Space>
          </div>

          <Table
            rowKey={(row) => row.id || row._id || `${row.line}-${row.machineName}`}
            columns={machineColumns}
            dataSource={machines}
            loading={machineLoading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 700 }}
            locale={{ emptyText: "No machines registered for this line" }}
          />
        </>
      ),
    },
    {
      key: "designs",
      label: "Design Code Master",
      children: (
        <>
          <div className="production-master-toolbar">
            <Select
              value={designTileSize}
              options={TILE_SIZE_OPTIONS}
              onChange={setDesignTileSize}
              className="production-master-filter"
              placeholder="Select tile size"
            />
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadDesignCodes}
                loading={designLoading}
              >
                Refresh
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openDesignModal}
              >
                Add Design Code
              </Button>
            </Space>
          </div>

          <Table
            rowKey={(row) =>
              row.id || row._id || `${row.tileSize}-${row.designCode}`
            }
            columns={designColumns}
            dataSource={designCodes}
            loading={designLoading}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 720 }}
            locale={{ emptyText: "No design codes registered for this tile size" }}
          />
        </>
      ),
    },
  ];

  return (
    <div className="production-master-page">
      <div className="production-master-header">
        <div>
          <Title level={3}>
            <AppstoreAddOutlined /> Production Master Data
          </Title>
          <Text type="secondary">
            Maintain the approved machine list and production design codes.
          </Text>
        </div>
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          onClose={() => setError("")}
          className="production-master-alert"
        />
      ) : null}

      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />
      </Card>

      <Modal
        title="Add Machine"
        open={machineModalOpen}
        onOk={handleSaveMachine}
        onCancel={() => setMachineModalOpen(false)}
        confirmLoading={saving}
        okText="Save Machine"
        destroyOnHidden
      >
        <Form form={machineForm} layout="vertical">
          <Form.Item
            label="Production Line"
            name="line"
            rules={[{ required: true, message: "Select a production line" }]}
          >
            <Select options={PRODUCTION_LINE_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="Machine Code"
            name="machineCode"
            extra="Optional equipment or asset code."
          >
            <Input maxLength={60} placeholder="e.g. P-01" />
          </Form.Item>

          <Form.Item
            label="Machine Name"
            name="machineName"
            rules={[
              { required: true, message: "Enter the machine name" },
              { max: 120, message: "Maximum 120 characters" },
            ]}
          >
            <Input maxLength={120} placeholder="e.g. Glaze Pump 01" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Add Design Code"
        open={designModalOpen}
        onOk={handleSaveDesign}
        onCancel={() => setDesignModalOpen(false)}
        confirmLoading={saving}
        okText="Save Design Code"
        destroyOnHidden
      >
        <Form form={designForm} layout="vertical">
          <Form.Item
            label="Tile Size"
            name="tileSize"
            rules={[{ required: true, message: "Select a tile size" }]}
          >
            <Select options={TILE_SIZE_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="Design Code"
            name="designCode"
            rules={[
              { required: true, message: "Enter the design code" },
              { max: 100, message: "Maximum 100 characters" },
            ]}
          >
            <Input maxLength={100} placeholder="Enter design code" />
          </Form.Item>

          <Form.Item label="Description" name="description">
            <Input maxLength={160} placeholder="Optional description" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
