const chartContract = (function chartResponseContract() {
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
})();
return (function inspectModel(msg) {
  const fail = (error) => {
    msg.statusCode = 502;
    msg.payload = { success: false, error };
    msg.headers = { 'Content-Type': 'application/json' };
    return [null, msg];
  };
  if (Number(msg.statusCode) < 200 || Number(msg.statusCode) >= 300) return fail('AI provider request failed. Check server configuration, credits and model access.');
  const result = msg.payload;
  if (result?.status !== 'completed' || !Array.isArray(result.output)) return fail('AI response was incomplete. Try a narrower question.');
  // Preserve reasoning and function-call items, not only text.
  msg.aiChat.input.push(...result.output);
  const calls = result.output.filter((item) => item.type === 'function_call');
  if (calls.length) {
    msg.aiChat.rounds += 1;
    msg.aiChat.calls += calls.length;
    if (msg.aiChat.forceFinal) return fail('AI returned a tool call after the final-answer instruction. Please narrow the question.');
    if (msg.aiChat.rounds > msg.aiChat.maxRounds || msg.aiChat.calls > msg.aiChat.maxCalls) {
      msg.aiChat.forceFinal = true;
      // Complete all call IDs even when this round is not executed.
      for (const call of calls) msg.aiChat.input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ success: false, error: 'Tool budget reached; answer with existing data and state incomplete coverage.' }) });
      msg.aiChat.queue = [];
      return [msg, null];
    }
    msg.aiChat.queue = calls;
    return [msg, null];
  }
  const contents = result.output.filter((item) => item.type === 'message').flatMap((item) => item.content || []);
  const refusal = contents.filter((item) => item.type === 'refusal').map((item) => item.refusal || '').join('\n');
  const text = result.output.filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '').join('\n');
  let structured;
  try {
    structured = refusal.trim() ? { answer: refusal.trim(), charts: [], chartWarnings: [] } : chartContract.parse(text, msg.aiChat.sources);
  } catch {
    return fail('The AI returned an invalid answer format. Please retry; the model must support Structured Outputs.');
  }
  msg.statusCode = 200;
  msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  msg.payload = { success: true, ...structured, asOf: new Date().toISOString(), sources: msg.aiChat.sources };
  delete msg.aiChat;
  return [null, msg];
})(msg, env);