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

function summarizeCoverage(rows) {
  const tracked = rows.filter(
    (row) => Array.isArray(row.coverage_requested) && row.coverage_requested.length,
  );
  const scores = (key) =>
    tracked
      .map((row) => row[key])
      .filter((value) => value !== null && Number.isFinite(Number(value)))
      .map(Number);
  const facets = (key) => tracked.flatMap((row) => row[key] || []);
  const unresolved = facets("coverage_unresolved");
  const byUnresolvedFacet = [...groupRows(unresolved, (facet) => facet)]
    .map(([name, items]) => ({ name, occurrences: items.length }))
    .sort(
      (a, b) =>
        b.occurrences - a.occurrences || a.name.localeCompare(b.name),
    );
  const before = scores("answer_coverage_before");
  const after = scores("answer_coverage_after");

  return {
    requests: tracked.length,
    averageBefore: before.length ? average(before) : null,
    averageAfter: after.length ? average(after) : null,
    fullyCovered: tracked.filter(
      (row) =>
        Number(row.answer_coverage_after) === 1 &&
        !(row.coverage_unresolved || []).length,
    ).length,
    repairedFacets: facets("coverage_repaired").length,
    clarifiedFacets: facets("coverage_clarified").length,
    unresolvedFacets: unresolved.length,
    byUnresolvedFacet,
  };
}

export function summarizeChatMetrics(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const excludedGreetings = sourceRows.filter(
    (row) => row?.intent === "greeting",
  ).length;
  const validRows = sourceRows.filter((row) => row?.intent !== "greeting");
  const latencies = validRows.map((row) => Number(row.latency_ms) || 0);
  const errors = validRows.filter((row) => row.status === "error").length;

  return {
    requests: validRows.length,
    excludedGreetings,
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
    coverage: summarizeCoverage(validRows),
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

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function markdownCell(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function metricsTable(groups, includeConfidence = false) {
  if (!groups.length) return "_Belum ada data._";
  const headers = ["Nama", "Request", "Error", "Sukses", "Latency rata-rata"];
  if (includeConfidence) headers.push("Confidence rata-rata");

  const lines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
  ];

  for (const group of groups) {
    const cells = [
      markdownCell(group.name),
      group.requests,
      group.errors,
      percent(group.successRate),
      `${group.averageLatencyMs} ms`,
    ];
    if (includeConfidence) {
      cells.push(
        group.averageConfidence === null
          ? "-"
          : group.averageConfidence.toFixed(2),
      );
    }
    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

function feedbackTable(groups) {
  if (!groups.length) return "_Belum ada data._";
  const lines = [
    "| Nama | Penilaian | Membantu | Belum membantu | Helpful rate |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const group of groups) {
    lines.push(
      `| ${markdownCell(group.name)} | ${group.responses} | ${group.helpful} | ${group.unhelpful} | ${percent(group.helpfulRate)} |`,
    );
  }

  return lines.join("\n");
}

function unresolvedCoverageTable(groups) {
  if (!groups.length) return "_Tidak ada facet coverage yang belum terjawab._";
  return [
    "| Facet | Jumlah |",
    "| --- | --- |",
    ...groups.map(
      (group) => `| ${markdownCell(group.name)} | ${group.occurrences} |`,
    ),
  ].join("\n");
}

export function renderObservabilityMarkdown(
  report,
  feedback,
  { days = 7, generatedAt = new Date() } = {},
) {
  return `# Laporan Observability Chatbot

Terakhir diperbarui: ${generatedAt.toISOString()}  
Periode: ${days} hari terakhir

## Ringkasan Teknis

| Metrik | Nilai |
| --- | --- |
| Request | ${report.requests} |
| Greeting otomatis diabaikan | ${report.excludedGreetings} |
| Success rate | ${report.requests ? percent(report.successRate) : "-"} |
| Error | ${report.errors} |
| Latency rata-rata | ${report.averageLatencyMs} ms |
| Latency p95 | ${report.p95LatencyMs} ms |
| Produk ditampilkan | ${report.productsReturned} |

## Answer Coverage

| Metrik | Nilai |
| --- | --- |
| Request dengan facet terdeteksi | ${report.coverage.requests} |
| Coverage sebelum auto-repair | ${report.coverage.averageBefore === null ? "-" : percent(report.coverage.averageBefore)} |
| Coverage setelah auto-repair | ${report.coverage.averageAfter === null ? "-" : percent(report.coverage.averageAfter)} |
| Jawaban tercakup penuh | ${report.coverage.fullyCovered} |
| Facet diperbaiki otomatis | ${report.coverage.repairedFacets} |
| Facet diklarifikasi | ${report.coverage.clarifiedFacets} |
| Facet belum terjawab | ${report.coverage.unresolvedFacets} |

### Facet Belum Terjawab

${unresolvedCoverageTable(report.coverage.byUnresolvedFacet)}

## Per Intent

${metricsTable(report.byIntent, true)}

## Editor Jawaban

${metricsTable(report.byAssistant)}

## Router Intent

${metricsTable(report.byRouter)}

## Kode Error

${metricsTable(report.byError)}

## Kepuasan Pelanggan

| Metrik | Nilai |
| --- | --- |
| Penilaian | ${feedback.responses} |
| Membantu | ${feedback.helpful} |
| Belum membantu | ${feedback.unhelpful} |
| Helpful rate | ${percent(feedback.helpfulRate)} |

### Feedback Per Intent

${feedbackTable(feedback.byIntent)}

### Feedback Per Editor

${feedbackTable(feedback.byAssistant)}

### Feedback Per Tipe Respons

${feedbackTable(feedback.byResponseType)}
`;
}
