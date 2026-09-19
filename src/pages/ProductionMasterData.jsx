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
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";

import {
  deleteDesignCode,
  deleteMachine,
  getDesignCodes,
  getMachines,
  saveDesignCode,
  saveMachine,
  updateDesignCode,
  updateMachine,
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
  const [editingMachine, setEditingMachine] = useState(null);
  const [editingDesign, setEditingDesign] = useState(null);

  const loadMachines = useCallback(async () => {
    if (!machineLine) return;
    setMachineLoading(true);
    setError("");
    try {
      const result = await getMachines({ line: machineLine });
      setMachines(Array.isArray(result?.machines) ? result.machines : []);
    } catch (err) {
      const text =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : "Unable to load machines.");
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
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : "Unable to load design codes.");
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
    setEditingMachine(null);
    machineForm.setFieldsValue({
      ...DEFAULT_MACHINE,
      line: machineLine || DEFAULT_MACHINE.line,
    });
    setMachineModalOpen(true);
  };

  const openEditMachine = (row) => {
    setEditingMachine(row);
    machineForm.setFieldsValue({
      line: row.line || machineLine,
      machineCode: row.machineCode || "",
      machineName: row.machineName || "",
      active: row.active !== false,
    });
    setMachineModalOpen(true);
  };

  const openDesignModal = () => {
    setEditingDesign(null);
    designForm.setFieldsValue({
      ...DEFAULT_DESIGN,
      tileSize: designTileSize || DEFAULT_DESIGN.tileSize,
    });
    setDesignModalOpen(true);
  };

  const openEditDesign = (row) => {
    setEditingDesign(row);
    designForm.setFieldsValue({
      tileSize: row.tileSize || designTileSize,
      designCode: row.designCode || "",
      description: row.description || "",
      active: row.active !== false,
    });
    setDesignModalOpen(true);
  };

  const handleSaveMachine = async () => {
    try {
      const values = await machineForm.validateFields();
      setSaving(true);

      const payload = {
        line: values.line,
        machineCode: String(values.machineCode || "").trim(),
        machineName: String(values.machineName || "").trim(),
        active: true,
      };

      const result = editingMachine
        ? await updateMachine({
            ...payload,
            oldLine: editingMachine.line,
            oldMachineName: editingMachine.machineName,
          })
        : await saveMachine(payload);

      if (result?.success === false) {
        throw new Error(result.error || "Unable to save machine.");
      }

      message.success(editingMachine ? "Machine updated" : "Machine saved");
      setMachineModalOpen(false);
      setEditingMachine(null);
      setMachineLine(values.line);
      machineForm.resetFields();

      if (values.line === machineLine) await loadMachines();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(
        err?.response?.data?.error ||
          (err instanceof Error ? err.message : "Unable to save machine."),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMachine = (row) => {
    Modal.confirm({
      title: "Delete machine?",
      content: `${row.machineCode ? `${row.machineCode} — ` : ""}${row.machineName}`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      async onOk() {
        try {
          const result = await deleteMachine({
            line: row.line,
            machineName: row.machineName,
          });
          if (result?.success === false) {
            throw new Error(result.error || "Unable to delete machine.");
          }
          message.success("Machine deleted");
          await loadMachines();
        } catch (err) {
          message.error(
            err?.response?.data?.error ||
              err?.message ||
              "Unable to delete machine.",
          );
          throw err;
        }
      },
    });
  };

  const handleSaveDesign = async () => {
    try {
      const values = await designForm.validateFields();
      setSaving(true);

      const payload = {
        tileSize: values.tileSize,
        designCode: String(values.designCode || "").trim(),
        description: String(values.description || "").trim(),
        active: true,
      };

      const result = editingDesign
        ? await updateDesignCode({
            ...payload,
            oldTileSize: editingDesign.tileSize,
            oldDesignCode: editingDesign.designCode,
          })
        : await saveDesignCode(payload);

      if (result?.success === false) {
        throw new Error(result.error || "Unable to save design code.");
      }

      message.success(editingDesign ? "Design code updated" : "Design code saved");
      setDesignModalOpen(false);
      setEditingDesign(null);
      setDesignTileSize(values.tileSize);
      designForm.resetFields();

      if (values.tileSize === designTileSize) await loadDesignCodes();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(
        err?.response?.data?.error ||
          (err instanceof Error ? err.message : "Unable to save design code."),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDesign = (row) => {
    Modal.confirm({
      title: "Delete design code?",
      content: `${row.designCode} (${row.tileSize})`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      async onOk() {
        try {
          const result = await deleteDesignCode({
            tileSize: row.tileSize,
            designCode: row.designCode,
          });
          if (result?.success === false) {
            throw new Error(result.error || "Unable to delete design code.");
          }
          message.success("Design code deleted");
          await loadDesignCodes();
        } catch (err) {
          message.error(
            err?.response?.data?.error ||
              err?.message ||
              "Unable to delete design code.",
          );
          throw err;
        }
      },
    });
  };

  const machineColumns = useMemo(
    () => [
      {
        title: "Machine Code",
        dataIndex: "machineCode",
        key: "machineCode",
        width: 160,
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
        width: 170,
      },
      {
        title: "Status",
        dataIndex: "active",
        key: "active",
        width: 100,
        render: (active) => (
          <Tag color={active === false ? "default" : "green"}>
            {active === false ? "Inactive" : "Active"}
          </Tag>
        ),
      },
      {
        title: "Actions",
        key: "actions",
        width: 110,
        fixed: "right",
        render: (_, row) => (
          <Space size={4}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              title="Edit machine"
              onClick={() => openEditMachine(row)}
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              title="Delete machine"
              onClick={() => handleDeleteMachine(row)}
            />
          </Space>
        ),
      },
    ],
    [loadMachines],
  );

  const designColumns = useMemo(
    () => [
      {
        title: "Design Code",
        dataIndex: "designCode",
        key: "designCode",
        width: 190,
      },
      {
        title: "Tile Size",
        dataIndex: "tileSize",
        key: "tileSize",
        width: 130,
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
        width: 100,
        render: (active) => (
          <Tag color={active === false ? "default" : "green"}>
            {active === false ? "Inactive" : "Active"}
          </Tag>
        ),
      },
      {
        title: "Actions",
        key: "actions",
        width: 110,
        fixed: "right",
        render: (_, row) => (
          <Space size={4}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              title="Edit design code"
              onClick={() => openEditDesign(row)}
            />
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              title="Delete design code"
              onClick={() => handleDeleteDesign(row)}
            />
          </Space>
        ),
      },
    ],
    [loadDesignCodes],
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
            scroll={{ x: 780 }}
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
            scroll={{ x: 780 }}
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
        title={editingMachine ? "Edit Machine" : "Add Machine"}
        open={machineModalOpen}
        onOk={handleSaveMachine}
        onCancel={() => {
          setMachineModalOpen(false);
          setEditingMachine(null);
        }}
        confirmLoading={saving}
        okText={editingMachine ? "Update Machine" : "Save Machine"}
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
        title={editingDesign ? "Edit Design Code" : "Add Design Code"}
        open={designModalOpen}
        onOk={handleSaveDesign}
        onCancel={() => {
          setDesignModalOpen(false);
          setEditingDesign(null);
        }}
        confirmLoading={saving}
        okText={editingDesign ? "Update Design Code" : "Save Design Code"}
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
