import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Empty, Row, Select, Switch, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined, WifiOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { getTemperatureHistory, getTemperatureLatest, getTemperatureStatus } from '../api/temperatureApi';
import { mergeTemperatureSeries, temperatureNumber, temperatureChartPoints } from '../utils/temperatureSeries';
import { formatColomboApiTime } from '../utils/energyTime';
import './MillingTemperature.css';

const DRYERS = [{ id: 1, title: 'Spray Dryer 1' }, { id: 2, title: 'Spray Dryer 2' }];
const WINDOWS = { '5m': { ms: 300000, interval: '5s', bucket: 5000 }, '15m': { ms: 900000, interval: '5s', bucket: 5000 }, '1h': { ms: 3600000, interval: '30s', bucket: 30000 }, '6h': { ms: 21600000, interval: '1m', bucket: 60000 }, '24h': { ms: 86400000, interval: '5m', bucket: 300000 } };
const display = value => temperatureNumber(value) === null ? '—' : `${Number(value).toFixed(1)} °C`;
const EMPTY_ROWS = [];

// ECharts retains zoom internally; omit start/end so data refreshes cannot reset it.
const DryerGraph = memo(function DryerGraph({ rows, range }) {
  const option = useMemo(() => ({ animation: false, color: ['#1677ff', '#fa8c16'], legend: { top: 0 },
    tooltip: { trigger: 'axis', confine: true, formatter: items => `${formatColomboApiTime(items[0]?.axisValue, 'YYYY-MM-DD HH:mm:ss')}<br/>${items.map(item => `${item.marker}${item.seriesName}: ${display(item.value?.[1])}`).join('<br/>')}` },
    grid: { left: 58, right: 16, top: 55, bottom: 65 },
    xAxis: { type: 'time', axisLabel: { formatter: value => formatColomboApiTime(value, 'HH:mm'), hideOverlap: true } },
    yAxis: { type: 'value', name: 'Temperature (°C)', scale: true, min: values => Number.isFinite(values.min) && Number.isFinite(values.max) ? Math.floor(values.min - Math.max(1, (values.max - values.min) * 0.1)) : undefined },
    dataZoom: [{ id: 'temperature-inside', type: 'inside' }, { id: 'temperature-slider', type: 'slider', bottom: 8 }],
    series: [{ id: 'pv', name: 'Process value (PV)', type: 'line', showSymbol: false, connectNulls: false, data: temperatureChartPoints(rows, 'pv', WINDOWS[range].bucket) }, { id: 'sv', name: 'Set point (SV)', type: 'line', showSymbol: false, connectNulls: false, lineStyle: { type: 'solid' }, data: temperatureChartPoints(rows, 'sv', WINDOWS[range].bucket) }],
  }), [rows, range]);
  return rows.length ? <ReactECharts option={option} notMerge={false} style={{ height: 355, width: '100%' }} /> : <div className="milling-chart-empty"><Empty description="Waiting for temperature readings" /></div>;
});

function SprayDryerCard({ dryer, latest, communication, checkedAt }) {
  const [range, setRange] = useState('15m'), [paused, setPaused] = useState(false), [revision, setRevision] = useState(0);
  const history = useRef({ range: '', rows: [] });
  const [view, setView] = useState({ range: '', rows: [], error: '' });
  useEffect(() => {
    if (paused) return;
    const abort = new AbortController();
    let timer;
    const poll = async () => {
      const end = Date.now(), config = WINDOWS[range], start = end - config.ms;
      const previous = history.current.range === range ? history.current.rows : [];
      const cursor = previous.at(-1)?.timestamp;
      try {
        const result = await getTemperatureHistory({ slave_id: dryer.id, from_time: new Date(Math.max(start, cursor == null ? start : cursor - 2 * config.bucket)).toISOString(), to_time: new Date(end).toISOString(), interval: config.interval }, abort.signal);
        if (abort.signal.aborted) return;
        const rows = mergeTemperatureSeries(previous, result.data || [], start, end + config.bucket);
        history.current = { range, rows };
        setView({ range, rows, error: '' });
      } catch (error) {
        if (abort.signal.aborted) return;
        setView(previousView => ({ ...previousView, error: error.response?.data?.error || error.message }));
      }
      timer = setTimeout(poll, 5000);
    };
    poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [dryer.id, range, paused, revision]);
  const fresh = latest?.timestamp && checkedAt - Date.parse(latest.timestamp) <= 30000;
  const status = !fresh ? 'STALE / NO DATA' : communication?.stale ? 'STALE' : communication?.status || latest.status || 'Unknown';
  return <Card className="milling-dryer-card" title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{dryer.title}<Tag style={{ marginInlineEnd: 0 }} color={status === 'OK' ? 'green' : 'orange'}>{status}</Tag></span>} extra={
    <div className="milling-dryer-controls">
      <Select size="small" aria-label={`${dryer.title} live window`} value={range} options={Object.keys(WINDOWS).map(value => ({ value, label: value }))} onChange={setRange} style={{ width: 76 }} />
      <Badge color={paused ? '#94a3b8' : '#22c55e'} text={paused ? 'Paused' : 'Live'} />
      <Switch size="small" checked={!paused} onChange={value => setPaused(!value)} aria-label={`${dryer.title} live updates`} />
      <Tooltip title="Refresh"><Button size="small" disabled={paused} icon={<ReloadOutlined />} aria-label={`Refresh ${dryer.title}`} onClick={() => setRevision(value => value + 1)} /></Tooltip>
    </div>
  }>
    {view.error && <Alert type="error" showIcon title={view.error} style={{ marginBottom: 12 }} />}
    <div className="milling-dryer-metrics">
      <div className="milling-dryer-values"><div><Typography.Text type="secondary">Process value</Typography.Text><strong className="milling-pv">{display(latest?.pv)}</strong></div><div><Typography.Text type="secondary">Set point</Typography.Text><strong className="milling-sv">{display(latest?.sv)}</strong></div></div>
    </div>
    <DryerGraph key={range} range={range} rows={view.range === range ? view.rows : EMPTY_ROWS} />
  </Card>;
}

export default function MillingTemperature() {
  const [view, setView] = useState({ latest: [], status: null, error: '', checkedAt: 0 });
  useEffect(() => {
    const abort = new AbortController();
    let timer;
    const poll = async () => {
      const results = await Promise.allSettled([getTemperatureLatest(null, abort.signal), getTemperatureStatus(abort.signal)]);
      if (abort.signal.aborted) return;
      setView(previous => ({ latest: results[0].status === 'fulfilled' ? results[0].value.controllers || [] : previous.latest,
        status: results[1].status === 'fulfilled' ? results[1].value : null,
        error: results.filter(result => result.status === 'rejected').map(result => result.reason.response?.data?.error || result.reason.message).join(' '), checkedAt: Date.now() }));
      timer = setTimeout(poll, 5000);
    };
    poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, []);
  const gateway = String(view.status?.gateway?.status || 'unknown').toLowerCase();
  return <Card className="milling-monitor" title="Spray Dryer Process Data" extra={
    <Tooltip title={`Temperature gateway: ${gateway}`}><span className={`milling-wifi is-${gateway}`} role="img" aria-label={`Gateway Wi-Fi ${gateway}`}><WifiOutlined /></span></Tooltip>
  }>
    {view.error && <Alert type="error" showIcon title={view.error} style={{ marginBottom: 16 }} />}
    <Row gutter={[16, 16]}>{DRYERS.map(dryer => <Col xs={24} xl={12} key={dryer.id}>
      <SprayDryerCard dryer={dryer} latest={view.latest.find(item => Number(item.slave_id) === dryer.id)} communication={view.status?.controllers?.find(item => Number(item.slave_id) === dryer.id)} checkedAt={view.checkedAt} />
    </Col>)}</Row>
  </Card>;
}

