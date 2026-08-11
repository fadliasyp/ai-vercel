function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentile(values = [], percent = 0.95) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * percent) - 1];
}

function groupRows(rows, keySelector) {
  const groups = new Map();
  for (const row of rows) {
    const key = keySelector(row) || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function summarizeGroups(rows, keySelector) {
  return [...groupRows(rows, keySelector)].map(([name, items]) => {
    const scores = items
      .map((item) => item.intent_score)
      .filter(
        (score) =>
          score !== null && score !== "" && Number.isFinite(Number(score)),
      )
      .map(Number);
    const latencies = items.map((item) => Number(item.latency_ms) || 0);
    const errors = items.filter((item) => item.status === "error").length;

    return {
      name,
      requests: items.length,
      errors,
      successRate: (items.length - errors) / items.length,
      averageLatencyMs: Math.round(average(latencies)),
      averageConfidence: scores.length ? average(scores) : null,
    };
  }).sort((a, b) => b.requests - a.requests || a.name.localeCompare(b.name));
}

export function summarizeChatMetrics(rows = []) {
  const validRows = Array.isArray(rows) ? rows : [];
  const latencies = validRows.map((row) => Number(row.latency_ms) || 0);
  const errors = validRows.filter((row) => row.status === "error").length;

  return {
    requests: validRows.length,
    errors,
    successRate: validRows.length
      ? (validRows.length - errors) / validRows.length
      : 0,
    averageLatencyMs: Math.round(average(latencies)),
    p95LatencyMs: percentile(latencies),
    productsReturned: validRows.reduce(
      (total, row) => total + (Number(row.product_count) || 0),
      0,
    ),
    byIntent: summarizeGroups(validRows, (row) => row.intent),
    byAssistant: summarizeGroups(
      validRows,
      (row) => `${row.assistant_provider || "unknown"}/${row.assistant_model || "unknown"}`,
    ),
    byRouter: summarizeGroups(
      validRows,
      (row) => `${row.router_provider || "unknown"}/${row.router_model || "unknown"}`,
    ),
    byError: summarizeGroups(
      validRows.filter((row) => row.status === "error"),
      (row) => row.error_code,
    ),
  };
}

function summarizeFeedbackGroups(rows, keySelector) {
  return [...groupRows(rows, keySelector)].map(([name, items]) => {
    const helpful = items.filter((item) => item.rating === "helpful").length;
    return {
      name,
      responses: items.length,
      helpful,
      unhelpful: items.length - helpful,
      helpfulRate: helpful / items.length,
    };
  }).sort(
    (a, b) =>
      b.responses - a.responses ||
      a.helpfulRate - b.helpfulRate ||
      a.name.localeCompare(b.name),
  );
}

export function summarizeChatFeedback(rows = []) {
  const validRows = Array.isArray(rows)
    ? rows.filter((row) => ["helpful", "unhelpful"].includes(row?.rating))
    : [];
  const helpful = validRows.filter((row) => row.rating === "helpful").length;

  return {
    responses: validRows.length,
    helpful,
    unhelpful: validRows.length - helpful,
    helpfulRate: validRows.length ? helpful / validRows.length : 0,
    byIntent: summarizeFeedbackGroups(validRows, (row) => row.intent),
    byAssistant: summarizeFeedbackGroups(
      validRows,
      (row) =>
        `${row.assistant_provider || "unknown"}/${row.assistant_reason || "unknown"}`,
    ),
    byResponseType: summarizeFeedbackGroups(
      validRows,
      (row) => row.response_type,
    ),
  };
}
