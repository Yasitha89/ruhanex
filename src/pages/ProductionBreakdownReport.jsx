import { useMemo, useRef, useState } from 'react';
import { Button, Card, Col, DatePicker, Empty, Row, Select, Space, Table, Typography, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { getProductionBreakdownReport } from '../api/productionDashboardApi';
import { PRODUCTION_CATEGORIES } from '../utils/productionBreakdownReport';
import { colomboNow, formatColomboApiTime, toApiIso } from '../utils/energyTime';

const fmt = (value, digits = 2) => value === null ? '—' : Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits });
const options = values => values.map(value => ({ value, label: value }));
export default function ProductionBreakdownReport() {
  const [category, setCategory] = useState('green');
  const [lines, setLines] = useState(PRODUCTION_CATEGORIES.green.lines);
  const [range, setRange] = useState([colomboNow().startOf('month'), colomboNow()]);
  const [grouping, setGrouping] = useState('size');
  const [sizes, setSizes] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const invalidate = () => { requestId.current++; setResult(null); setLoading(false); setSizes([]); setDesigns([]); };
  const load = async () => {
    if (!lines.length || !range?.[0] || !range?.[1]) { message.warning('Select at least one line and a date range.'); return; }
    const fromTime = toApiIso(range[0]), toTime = toApiIso(range[1]);
    if (Date.parse(toTime) <= Date.parse(fromTime) || Date.parse(toTime) - Date.parse(fromTime) > 366 * 86400000) { message.warning('Select an end time after the start, with a period of at most 366 days.'); return; }
    const id = ++requestId.current;
    setLoading(true); setResult(null);
    try {
      const data = await getProductionBreakdownReport({ category, lines, fromTime, toTime });
      if (data?.success !== true || !Array.isArray(data.rowsBySize) || !Array.isArray(data.rowsByDesign)) throw Error(data?.error || 'Invalid production report response');
      if (id !== requestId.current) return;
      setResult({ ...data, errors: (data.unavailableLines || []).map(line => `${line}: counter is not configured`), from: formatColomboApiTime(data.fromTime, 'YYYY-MM-DD HH:mm'), to: formatColomboApiTime(data.toTime, 'YYYY-MM-DD HH:mm') });
    } catch (error) {
      if (id === requestId.current) message.error(error.response?.data?.error || error.message || 'Unable to load report');
    } finally { if (id === requestId.current) setLoading(false); }
  };
  const breakdown = useMemo(() => ({ rows: result ? (grouping === 'design' ? result.rowsByDesign : result.rowsBySize) : [], warnings: result?.warnings || [] }), [result, grouping]);
  const sizeOptions = useMemo(() => options([...new Set(breakdown.rows.map(row => row.tileSize))].sort()), [breakdown]);
  const designOptions = useMemo(() => options([...new Set(breakdown.rows.map(row => row.designCode).filter(Boolean))].sort()), [breakdown]);
  const rows = useMemo(() => breakdown.rows.filter(row => (!sizes.length || sizes.includes(row.tileSize)) && (grouping !== 'design' || !designs.length || designs.includes(row.designCode))), [breakdown, sizes, grouping, designs]);
  const total = rows.reduce((sum, row) => sum + row.production, 0);
  const tiles = rows.every(row => row.tileCount !== null) ? rows.reduce((sum, row) => sum + row.tileCount, 0) : null;
  const chart = useMemo(() => {
    const categories = [...new Set(rows.map(row => `${row.month} · ${row.tileSize}${grouping === 'design' ? ` · ${row.designCode}` : ''}`))];
    const chartLines = [...new Set(rows.map(row => row.line))];
    const values = new Map(rows.map(row => [`${row.line}|${row.month} · ${row.tileSize}${grouping === 'design' ? ` · ${row.designCode}` : ''}`, row.production]));
    return { color: ['#1677ff', '#13a8a8', '#9254de'], tooltip: { trigger: 'axis', confine: true }, legend: { type: 'scroll', top: 0 },
      grid: { top: 50, left: 70, right: 20, bottom: 100 },
      xAxis: { type: 'category', data: categories, axisLabel: { rotate: 35, hideOverlap: true } },
      yAxis: { type: 'value', name: 'Production (m²)' },
      dataZoom: [{ type: 'slider', bottom: 4, start: 0, end: Math.min(100, 12 / Math.max(1, categories.length) * 100) }, { type: 'inside' }],
      series: chartLines.map(line => ({ name: line, type: 'bar', stack: 'production', barMaxWidth: 40, data: categories.map(key => Number((values.get(`${line}|${key}`) || 0).toFixed(2))) })),
    };
  }, [rows, grouping]);
  const columns = [
    { title: 'Start Time', dataIndex: 'intervalStart', width: 180, render: value => formatColomboApiTime(value, 'YYYY-MM-DD HH:mm') || '—' },
    { title: 'End Time', dataIndex: 'intervalEnd', width: 180, render: value => formatColomboApiTime(value, 'YYYY-MM-DD HH:mm') || '—' },
    { title: 'Line', dataIndex: 'line', width: 140 },
    { title: 'Tile Size', dataIndex: 'tileSize', width: 110 },
    ...(grouping === 'design' ? [{ title: 'Design Code', dataIndex: 'designCode', width: 160 }] : []),
    { title: 'Tiles', dataIndex: 'tileCount', align: 'right', render: value => fmt(value, 0) },
    { title: 'Production (m²)', dataIndex: 'production', align: 'right', render: value => fmt(value), sorter: (a, b) => a.production - b.production },
  ];
  return <Card title="Production by Size & Design">
    <Row gutter={[12, 16]} align="bottom" style={{ marginBottom: 16 }}>
      <Col xs={24} md={12} xl={5}>
        <Typography.Text strong style={{ display: 'block' }}>Production category</Typography.Text>
        <Select style={{ width: '100%', marginTop: 6 }} value={category} options={Object.entries(PRODUCTION_CATEGORIES).map(([value, item]) => ({ value, label: item.label }))} onChange={value => { invalidate(); setCategory(value); setLines([...PRODUCTION_CATEGORIES[value].lines]); }} />
      </Col>
      <Col xs={24} md={12} xl={6}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 22 }}>
          <Typography.Text strong>Lines</Typography.Text>
          <Button type="link" size="small" style={{ height: 22, padding: 0 }} onClick={() => { invalidate(); setLines([...PRODUCTION_CATEGORIES[category].lines]); }}>Select all</Button>
        </div>
        <Select mode="multiple" style={{ width: '100%', marginTop: 6 }} value={lines} options={options(PRODUCTION_CATEGORIES[category].lines)} onChange={value => { invalidate(); setLines(value); }} maxTagCount="responsive" />
      </Col>
      <Col xs={24} md={19} xl={10}>
        <Typography.Text strong style={{ display: 'block' }}>Period (Sri Lanka date &amp; time)</Typography.Text>
        <DatePicker.RangePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: '100%', marginTop: 6 }} value={range} onChange={value => { invalidate(); setRange(value); }} disabledDate={date => date.isAfter(dayjs(), 'day')} />
      </Col>
      <Col xs={24} md={5} xl={3}>
        <Button block type="primary" icon={<SearchOutlined />} loading={loading} onClick={load}>Load Data</Button>
      </Col>
    </Row>
    <Row gutter={[12, 16]} align="bottom">
      <Col xs={24} sm={8}>
        <Typography.Text strong style={{ display: 'block' }}>Breakdown</Typography.Text>
        <Select disabled={!result || loading} style={{ width: '100%', marginTop: 6 }} value={grouping} options={[{ value: 'size', label: 'Size-wise' }, { value: 'design', label: 'Design-wise (with size)' }]} onChange={value => { setGrouping(value); setDesigns([]); }} />
      </Col>
      <Col xs={24} sm={8}>
        <Typography.Text strong style={{ display: 'block' }}>Tile sizes</Typography.Text>
        <Select disabled={!result || loading} mode="multiple" allowClear placeholder="All sizes" style={{ width: '100%', marginTop: 6 }} value={sizes} options={sizeOptions} onChange={setSizes} maxTagCount="responsive" />
      </Col>
      <Col xs={24} sm={8}>
        <Typography.Text strong style={{ display: 'block' }}>Design codes</Typography.Text>
        <Select disabled={!result || loading || grouping !== 'design'} mode="multiple" allowClear showSearch placeholder="All designs" style={{ width: '100%', marginTop: 6 }} value={designs} options={designOptions} onChange={setDesigns} maxTagCount="responsive" />
      </Col>
    </Row>
    <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>Empty size/design selections include all options. Times use Sri Lankan time. Start is inclusive; end is exclusive. Columns show the selected portion of each calendar month.</Typography.Paragraph>
    {result && <Space wrap style={{ marginBottom: 16 }}><Typography.Text strong>{PRODUCTION_CATEGORIES[result.category].label}: {result.from} to {result.to}</Typography.Text><Typography.Text strong>Total: {fmt(total)} m² · {fmt(tiles, 0)} tiles</Typography.Text></Space>}
    <Card size="small" title="Production comparison" style={{ marginBottom: 16 }} loading={loading}>{rows.length ? <ReactECharts option={chart} notMerge style={{ height: 380 }} /> : <Empty description={result ? 'No matching production records' : 'Select a period and load data'} />}</Card>
    <Table rowKey="key" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1000 }} pagination={{ pageSize: 20, showSizeChanger: true }} summary={() => <Table.Summary.Row><Table.Summary.Cell index={0} colSpan={grouping === 'design' ? 5 : 4}><strong>Total (all matching rows)</strong></Table.Summary.Cell><Table.Summary.Cell index={1} align="right"><strong>{fmt(tiles, 0)}</strong></Table.Summary.Cell><Table.Summary.Cell index={2} align="right"><strong>{fmt(total)}</strong></Table.Summary.Cell></Table.Summary.Row>} />
  </Card>;
}
