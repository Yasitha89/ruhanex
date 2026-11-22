import { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Typography } from 'antd';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { getOverviewMonthlyQuality } from '../api/dashboardApi';

const COLORS = { first: '#16a34a', normalDamage: '#faad14', cutDamage: '#ef4444', other: '#94a3b8' };

export default function MonthlyQualityChart({ month }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await getOverviewMonthlyQuality(month, controller.signal);
        if (data?.success !== true || !Array.isArray(data.pie?.data)) throw new Error('Invalid quality response');
        if (active) { setResult(data); setError(false); }
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 300000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [month]);

  const data = (result?.pie?.data || []).map(item => ({ ...item, itemStyle: { color: COLORS[item.key] } }));
  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} tiles ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{ type: 'pie', radius: '67%', center: ['50%', '45%'],
      label: { formatter: '{b}\n{d}%', fontSize: 12 },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.15)' } }, data }],
  };
  const sizes = (result?.sizeWiseQuality || []).filter(size => size.totalTiles > 0);
  const series = [
    ['First quality', 'firstQuality', 'firstTiles', COLORS.first],
    ['Normal damages', 'normalDamageQuality', 'normalDamageTiles', COLORS.normalDamage],
    ['Cut damages', 'cutDamageQuality', 'cutDamageTiles', COLORS.cutDamage],
    ...(sizes.some(size => size.otherQuality > 0) ? [['Undetected / unclassified', 'otherQuality', null, COLORS.other]] : []),
  ];
  const sizeOption = {
    tooltip: { trigger: 'item', valueFormatter: value => `${value}%` },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 12, right: 18, top: 22, bottom: 58, containLabel: true },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: sizes.map(size => size.tileSize), inverse: true },
    series: series.map(([name, field, count, color]) => ({
      name, type: 'bar', stack: 'quality', barMaxWidth: 32, itemStyle: { color },
      label: { show: true, position: 'inside', formatter: ({ value }) => value >= 8 ? `${value}%` : '' },
      data: sizes.map(size => ({ value: size[field], tiles: count ? size[count] : size.undetectedTiles + size.unclassifiedTiles })),
      tooltip: { formatter: params => `${name}: ${params.value}% (${Number(params.data.tiles).toLocaleString()} tiles)` },
    })),
  };

  return (
    <Card className="overview-chart-card" title="Quality"
      extra={<Typography.Text type="secondary">{dayjs(`${month}-01`).format('MMMM YYYY')}</Typography.Text>}
      loading={loading}>
      {error ? <Alert type="warning" showIcon title={result ? 'Quality update unavailable. Showing the last loaded data.' : 'Monthly quality data is temporarily unavailable.'} /> : null}
      {data.length ? <Row gutter={[16, 16]}>
        <Col xs={24} md={12}><ReactECharts option={option} notMerge style={{ height: 280 }} /></Col>
        <Col xs={24} md={12}>
          <Typography.Text strong>Quality by Size</Typography.Text>
          {sizes.length ? <ReactECharts option={sizeOption} notMerge style={{ height: Math.max(260, sizes.length * 40 + 90) }} /> : (
            <div className="overview-empty">No size-wise quality data</div>
          )}
        </Col>
      </Row> : !error ? (
        <div className="overview-empty">No saved quality data for this month</div>
      ) : null}
      {result?.totalTiles > 0 ? <Typography.Text strong style={{ display: 'block', marginTop: 8 }}>
        Total out tiles: {result.totalTiles.toLocaleString()} · No of boxes: {result.totalBoxes.toLocaleString()}
      </Typography.Text> : null}
    </Card>
  );
}
