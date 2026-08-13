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
  const unresolvedRequests = tracked.filter(
    (row) => (row.coverage_unresolved || []).length,
  ).length;
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
    fullyCoveredRate: tracked.length
      ? (tracked.length - unresolvedRequests) / tracked.length
      : 0,
    unresolvedRequests,
    unresolvedRequestRate: tracked.length
      ? unresolvedRequests / tracked.length
      : 0,
    repairedFacets: facets("coverage_repaired").length,
    clarifiedFacets: facets("coverage_clarified").length,
    unresolvedFacets: unresolved.length,
    byUnresolvedFacet,
  };
}

function finiteSetting(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function assessCoverageDrift(
  current = {},
  previous = {},
  options = {},
) {
  const thresholds = {
    minSamples: Math.max(1, Math.round(finiteSetting(options.minSamples, 30))),
    minimumCoverageAfter: finiteSetting(options.minimumCoverageAfter, 0.85),
    maximumUnresolvedRate: finiteSetting(options.maximumUnresolvedRate, 0.15),
    maximumCoverageDrop: finiteSetting(options.maximumCoverageDrop, 0.08),
    maximumUnresolvedRateIncrease: finiteSetting(
      options.maximumUnresolvedRateIncrease,
      0.08,
    ),
  };
  const currentReady = Number(current.requests || 0) >= thresholds.minSamples;
  const previousReady = Number(previous.requests || 0) >= thresholds.minSamples;
  const coverageDelta =
    current.averageAfter === null || previous.averageAfter === null
      ? null
      : Number(current.averageAfter) - Number(previous.averageAfter);
  const unresolvedRateDelta =
    Number(current.unresolvedRequestRate || 0) -
    Number(previous.unresolvedRequestRate || 0);
  const alerts = [];

  if (currentReady) {
    if (
      current.averageAfter !== null &&
      Number(current.averageAfter) < thresholds.minimumCoverageAfter
    ) {
      alerts.push({
        code: "coverage_below_minimum",
        actual: Number(current.averageAfter),
        threshold: thresholds.minimumCoverageAfter,
      });
    }
    if (
      Number(current.unresolvedRequestRate || 0) >
      thresholds.maximumUnresolvedRate
    ) {
      alerts.push({
        code: "unresolved_rate_above_maximum",
        actual: Number(current.unresolvedRequestRate || 0),
        threshold: thresholds.maximumUnresolvedRate,
      });
    }
  }

  if (currentReady && previousReady) {
    if (
      coverageDelta !== null &&
      coverageDelta < -thresholds.maximumCoverageDrop
    ) {
      alerts.push({
        code: "coverage_regressed",
        actual: coverageDelta,
        threshold: -thresholds.maximumCoverageDrop,
      });
    }
    if (
      unresolvedRateDelta > thresholds.maximumUnresolvedRateIncrease
    ) {
      alerts.push({
        code: "unresolved_rate_increased",
        actual: unresolvedRateDelta,
        threshold: thresholds.maximumUnresolvedRateIncrease,
      });
    }
  }

  return {
    status: !currentReady
      ? "insufficient_data"
      : alerts.length
        ? "alert"
        : previousReady
          ? "healthy"
          : "monitoring",
    currentSamples: Number(current.requests || 0),
    previousSamples: Number(previous.requests || 0),
    coverageDelta,
    unresolvedRateDelta,
    thresholds,
    alerts,
  };
}

const REPLAY_FACET_QUESTIONS = Object.freeze({
  product_condition: "Bagaimana kondisi produknya?",
  completeness: "Apa saja kelengkapan produknya?",
  stock: "Apakah produknya masih ready stock?",
  promo: "Apakah ada promo untuk produk ini?",
  shipping_quote: "Berapa ongkirnya ke kota tujuan?",
  insurance: "Apakah pengirimannya memakai asuransi?",
  packing: "Apakah tersedia packing kayu?",
  shipping_estimate: "Berapa lama estimasi pengirimannya?",
  same_day: "Apakah bisa dikirim hari ini?",
  store_location: "Di mana lokasi toko fisiknya?",
  store_hours: "Jam operasional tokonya sampai kapan?",
  cod: "Apakah pembayaran COD tersedia?",
  payment_methods: "Metode pembayarannya apa saja?",
  return_policy: "Bagaimana kebijakan retur produknya?",
  refund: "Bagaimana proses refundnya?",
  recommendation: "Produk mana yang paling direkomendasikan?",
  budget: "Produk mana yang sesuai dengan budget saya?",
});

export function buildCoverageReplayCandidates(rows = [], limit = 20) {
  const groups = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const unresolved = [...new Set(row?.coverage_unresolved || [])]
      .filter((facet) => REPLAY_FACET_QUESTIONS[facet])
      .sort();
    if (!unresolved.length) continue;
    const requested = [...new Set(row?.coverage_requested || [])]
      .filter((facet) => REPLAY_FACET_QUESTIONS[facet])
      .sort();
    const intent = String(row?.intent || "general");
    const responseType = String(row?.response_type || "text");
    const key = [intent, responseType, requested.join("+"), unresolved.join("+")].join(
      ":",
    );
    const existing = groups.get(key) || {
      intent,
      response_type: responseType,
      requested,
      unresolved,
      occurrences: 0,
    };
    existing.occurrences += 1;
    groups.set(key, existing);
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.occurrences - a.occurrences ||
        a.intent.localeCompare(b.intent) ||
        a.unresolved.join("+").localeCompare(b.unresolved.join("+")),
    )
    .slice(0, Math.max(0, Math.round(Number(limit) || 0)))
    .map((candidate, index) => ({
      id: `coverage-candidate-${index + 1}`,
      scenario: `Pola unresolved produksi (${candidate.occurrences}x)`,
      synthetic_question: candidate.unresolved
        .map((facet) => REPLAY_FACET_QUESTIONS[facet])
        .join(" "),
      ...candidate,
    }));
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

function coverageDriftSection(drift) {
  if (!drift) return "";
  const alertText = drift.alerts.length
    ? drift.alerts.map((alert) => `- \`${alert.code}\``).join("\n")
    : "_Tidak ada alert._";
  return `## Coverage Drift

| Metrik | Nilai |
| --- | --- |
| Status | ${drift.status} |
| Sampel periode ini | ${drift.currentSamples} |
| Sampel periode sebelumnya | ${drift.previousSamples} |
| Perubahan coverage | ${drift.coverageDelta === null ? "-" : percent(drift.coverageDelta)} |
| Perubahan unresolved rate | ${percent(drift.unresolvedRateDelta)} |

${alertText}

`;
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
| Full coverage rate | ${percent(report.coverage.fullyCoveredRate)} |
| Facet diperbaiki otomatis | ${report.coverage.repairedFacets} |
| Facet diklarifikasi | ${report.coverage.clarifiedFacets} |
| Facet belum terjawab | ${report.coverage.unresolvedFacets} |
| Request masih unresolved | ${report.coverage.unresolvedRequests} |

### Facet Belum Terjawab

${unresolvedCoverageTable(report.coverage.byUnresolvedFacet)}

${coverageDriftSection(report.coverageDrift)}
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
