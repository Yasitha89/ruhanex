import { useEffect, useState } from 'react';
import { Spin } from 'antd';
import ZoomableShiftChart from './ZoomableShiftChart';
import { getProductionQualityTrend } from '../api/productionDashboardApi';

const clock = value => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));
const definitions = [
  { name: 'First quality', field: 'firstQuality', color: '#16a34a' },
  { name: 'Normal damages', field: 'normalDamageQuality', color: '#faad14' },
  { name: 'Cut damages', field: 'cutDamageQuality', color: '#ef4444' },
];

export default function ShiftQualityTrendChart({ line, date, shift, refreshKey = 0, current = false }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let busy = false;
    let timer;
    const controller = new AbortController();
    const load = async () => {
      if (busy) return;
      busy = true;
      let failed = false;
      try {
        const data = await getProductionQualityTrend({ line, date, shift, signal: controller.signal });
        if (data?.success !== true || !Array.isArray(data.points)) throw new Error('Invalid trend response');
        if (active) setResult(data);
      } catch {
        failed = true;
      } finally {
        busy = false;
        if (active) {
          setLoading(false);
          if (current || failed) timer = window.setTimeout(load, failed ? 30000 : 15000);
        }
      }
    };
    load();
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [line, date, shift, refreshKey, current]);

  const points = (result?.points || []).filter(p => Number.isFinite(Date.parse(p.time)));
  const devices = [...new Set(points.map(p => p.device || 'sensor'))];
  const series = devices.flatMap(device => definitions.map(definition => {
    const samples = points.filter(p => (p.device || 'sensor') === device).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const data = [];
    for (const point of samples) {
      const time = Date.parse(point.time);
      const value = point[definition.field];
      data.push([time, value != null && Number.isFinite(Number(value)) ? Number(value) : null]);
    }
    return { name: devices.length > 1 ? `${definition.name} (${device})` : definition.name,
      type: 'line', showSymbol: false, connectNulls: false,
      lineStyle: { width: 2, type: 'solid' }, itemStyle: { color: definition.color }, data };
  }));
  const option = {
    animation: false,
    legend: { top: 0, type: 'scroll' },
    grid: { left: 15, right: 20, top: 45, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, axisPointer: { type: 'line' },
      valueFormatter: value => value == null ? '—' : `${Number(value).toFixed(2)}%` },
    xAxis: { type: 'time', min: result?.from ? Date.parse(result.from) : undefined,
      max: result?.to ? Date.parse(result.to) : undefined, axisLabel: { formatter: clock, hideOverlap: true },
      axisPointer: { label: { formatter: params => clock(params.value) } } },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#eef2f7' } } },
    series,
  };

  return (
    <div>
      {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div> : points.length ? (
        <ZoomableShiftChart option={option} notMerge style={{ height: 310 }} />
      ) : <div className="overview-empty">No tracked quality tiles for this shift.</div>}
    </div>
  );
}
