// Embedded into Node-RED Function nodes; no runtime imports are required.
export function chartResponseContract() {
  const schema = {
    type: 'object', additionalProperties: false, required: ['answer', 'charts'],
    properties: {
      answer: { type: 'string' },
      charts: {
        type: 'array', maxItems: 3,
        items: {
          type: 'object', additionalProperties: false,
          required: ['type', 'title', 'unit', 'labels', 'series', 'sourceTools'],
          properties: {
            type: { type: 'string', enum: ['bar', 'line', 'pie'] },
            title: { type: 'string' }, unit: { type: 'string' },
            labels: { type: 'array', minItems: 1, maxItems: 60, items: { type: 'string' } },
            series: {
              type: 'array', minItems: 1, maxItems: 4,
              items: {
                type: 'object', additionalProperties: false, required: ['name', 'values'],
                properties: { name: { type: 'string' }, values: { type: 'array', minItems: 1, maxItems: 60, items: { type: ['number', 'null'] } } },
              },
            },
            sourceTools: { type: 'array', minItems: 1, maxItems: 17, items: { type: 'string' } },
          },
        },
      },
    },
  };
  function parse(text, sources) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed.answer !== 'string' || !parsed.answer.trim() || !Array.isArray(parsed.charts) || parsed.charts.length > 3) throw new Error('Invalid structured answer.');
    const available = new Set(sources.filter((source) => source.success === true).map((source) => source.tool));
    const charts = []; const chartWarnings = [];
    const string = (value, max) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
    for (const [index, chart] of parsed.charts.entries()) {
      const valid = chart && ['bar', 'line', 'pie'].includes(chart.type)
        && string(chart.title, 160) && string(chart.unit, 40)
        && Array.isArray(chart.labels) && chart.labels.length > 0 && chart.labels.length <= 60 && chart.labels.every((label) => string(label, 160))
        && Array.isArray(chart.sourceTools) && chart.sourceTools.length > 0 && chart.sourceTools.length <= 17 && chart.sourceTools.every((name) => available.has(name))
        && Array.isArray(chart.series) && chart.series.length > 0 && chart.series.length <= 4
        && chart.series.every((series) => series && string(series.name, 120) && Array.isArray(series.values)
          && series.values.length === chart.labels.length
          && series.values.every((value) => value === null || (typeof value === 'number' && Number.isFinite(value))))
        && chart.series.some((series) => series.values.some((value) => value !== null))
        && (chart.type !== 'pie' || (chart.series.length === 1 && chart.series[0].values.every((value) => value !== null && value >= 0) && chart.series[0].values.some((value) => value > 0)));
      if (!valid) { chartWarnings.push(`Chart ${index + 1} omitted: invalid chart data or no matching successful data source.`); continue; }
      // Copy only the allowed fields. Never return generated HTML, JS or chart options.
      charts.push({ type: chart.type, title: chart.title, unit: chart.unit, labels: chart.labels,
        series: chart.series.map(({ name, values }) => ({ name, values })), sourceTools: [...new Set(chart.sourceTools)] });
    }
    return { answer: parsed.answer.trim(), charts, chartWarnings };
  }
  return { schema, parse };
}
