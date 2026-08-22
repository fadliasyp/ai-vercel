export const IMAGE_BENCHMARK_SOURCE_TYPES = new Set([
  "store",
  "internet",
  "user",
  "synthetic",
  "negative",
]);

export const IMAGE_BENCHMARK_VIEW_TYPES = new Set([
  "full",
  "crop",
  "different_angle",
  "box",
  "detail",
  "unknown",
]);

function cleanText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value = "") {
  return cleanText(value)
    .replace(/&amp;/gi, "&")
    .toLowerCase();
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values = [], percentage = 50) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentage / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

function expectedProductIds(testCase = {}) {
  const expected = testCase.expected || {};
  return [
    expected.product_id,
    ...(Array.isArray(expected.acceptable_product_ids)
      ? expected.acceptable_product_ids
      : []),
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function expectedProductNames(testCase = {}) {
  const expected = testCase.expected || {};
  return [
    expected.product_name,
    ...(Array.isArray(expected.acceptable_product_names)
      ? expected.acceptable_product_names
      : []),
  ]
    .map(normalizeName)
    .filter(Boolean);
}

function expectedMaxPrice(testCase = {}) {
  const value = Number(testCase.expected?.constraints?.max_price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isNegativeImageBenchmarkCase(testCase = {}) {
  return Boolean(testCase.expected?.no_match);
}

export function validateImageBenchmarkDataset(dataset, options = {}) {
  const allowEmpty = options.allowEmpty !== false;
  if (!dataset || !Array.isArray(dataset.cases)) {
    throw new Error("Dataset benchmark gambar harus memiliki array cases");
  }

  const ids = new Set();
  let enabledCount = 0;

  dataset.cases.forEach((testCase, index) => {
    const label = `case ke-${index + 1}`;
    const id = cleanText(testCase?.id);
    if (!id) throw new Error(`${label} tidak memiliki id`);
    if (ids.has(id)) throw new Error(`ID dataset duplikat: ${id}`);
    ids.add(id);

    if (testCase.enabled === false) return;
    enabledCount += 1;

    if (!cleanText(testCase.image)) {
      throw new Error(`${id} tidak memiliki path image`);
    }
    if (!IMAGE_BENCHMARK_SOURCE_TYPES.has(testCase.source_type)) {
      throw new Error(
        `${id} memiliki source_type tidak valid: ${testCase.source_type}`,
      );
    }
    if (!IMAGE_BENCHMARK_VIEW_TYPES.has(testCase.view_type)) {
      throw new Error(
        `${id} memiliki view_type tidak valid: ${testCase.view_type}`,
      );
    }

    const negative = isNegativeImageBenchmarkCase(testCase);
    const maxPrice = testCase.expected?.constraints?.max_price;
    if (
      maxPrice != null &&
      (!Number.isFinite(Number(maxPrice)) || Number(maxPrice) <= 0)
    ) {
      throw new Error(`${id} memiliki expected.constraints.max_price tidak valid`);
    }

    if (!negative) {
      const hasExpectedId = expectedProductIds(testCase).length > 0;
      const hasExpectedName = expectedProductNames(testCase).length > 0;
      if (!hasExpectedId && !hasExpectedName) {
        throw new Error(
          `${id} harus memiliki expected.product_id atau expected.product_name`,
        );
      }
    }
  });

  if (!allowEmpty && enabledCount === 0) {
    throw new Error(
      "Dataset belum memiliki case aktif. Tambahkan foto dengan npm run dataset:images.",
    );
  }

  return {
    total: dataset.cases.length,
    enabled: enabledCount,
    disabled: dataset.cases.length - enabledCount,
  };
}

export function evaluateImageBenchmarkCase({
  testCase,
  payload = null,
  statusCode = 0,
  latencyMs = 0,
  error = null,
} = {}) {
  const products = Array.isArray(payload?.products)
    ? payload.products.slice(0, 5)
    : [];
  const expectedIds = new Set(expectedProductIds(testCase));
  const expectedNames = new Set(expectedProductNames(testCase));
  const maxPrice = expectedMaxPrice(testCase);
  const negative = isNegativeImageBenchmarkCase(testCase);

  let expectedRank = null;
  const candidates = products.map((product, index) => {
    const id = String(product?.id ?? "").trim();
    const name = cleanText(product?.name);
    const numericPrice = Number(
      product?.numericPrice || product?.effectivePrice || product?.price || 0,
    );
    const matches =
      (!negative && expectedIds.has(id)) ||
      (!negative && expectedNames.has(normalizeName(name)));

    if (matches && expectedRank === null) expectedRank = index + 1;

    return {
      rank: index + 1,
      id: product?.id ?? null,
      name,
      numeric_price: Number.isFinite(numericPrice) ? numericPrice : null,
      visual_score: Number(product?.visualScore || 0) || null,
      lexical_score: Number(product?.imageMatchScore || 0) || null,
      confidence: cleanText(product?.visualConfidence) || null,
      matches_expected: matches,
    };
  });

  const confidenceLevel =
    cleanText(payload?.match_confidence?.level).toLowerCase() || "unknown";
  const visionEvaluated =
    payload?.match_confidence?.visually_reranked === true &&
    payload?.image_analysis?.analysis_fallback !== true;
  const highConfidence = confidenceLevel === "high";
  const abstained = confidenceLevel === "low";
  const apiSucceeded = !error && statusCode >= 200 && statusCode < 300;
  const top1Correct = !negative && expectedRank === 1;
  const negativeCorrect = negative && abstained;
  const constraintsCorrect =
    maxPrice == null ||
    candidates.every(
      (candidate) =>
        candidate.numeric_price > 0 && candidate.numeric_price <= maxPrice,
    );
  const caseCorrect = negative
    ? negativeCorrect
    : top1Correct && constraintsCorrect;
  const falseConfident =
    apiSucceeded &&
    highConfidence &&
    !caseCorrect;

  return {
    id: testCase.id,
    image: testCase.image,
    source_type: testCase.source_type,
    view_type: testCase.view_type,
    question: cleanText(testCase.question),
    expected: testCase.expected,
    negative,
    status_code: statusCode,
    api_succeeded: apiSucceeded,
    latency_ms: latencyMs,
    vision_evaluated: visionEvaluated,
    analysis_provider:
      cleanText(payload?.image_analysis?.analysis_provider) || "unknown",
    rerank_provider:
      cleanText(payload?.match_confidence?.rerank_provider) || "none",
    confidence_level: confidenceLevel,
    confidence: payload?.match_confidence || null,
    expected_rank: expectedRank,
    top1_correct: top1Correct,
    top3_correct: !negative && expectedRank !== null && expectedRank <= 3,
    top5_correct: !negative && expectedRank !== null && expectedRank <= 5,
    negative_correct: negativeCorrect,
    constraints_correct: constraintsCorrect,
    correct: caseCorrect,
    abstained,
    false_confident: falseConfident,
    candidates,
    response_intro: cleanText(payload?.intro),
    error: error
      ? {
          code: cleanText(error.code) || "UNKNOWN_ERROR",
          message: cleanText(error.message) || "Unknown error",
        }
      : null,
  };
}

function metricsForResults(results = []) {
  const positives = results.filter((result) => !result.negative);
  const negatives = results.filter((result) => result.negative);
  const successful = results.filter((result) => result.api_succeeded);
  const latencies = successful.map((result) => result.latency_ms);

  const countRate = (items, predicate) =>
    items.length
      ? round(items.filter(predicate).length / items.length)
      : 0;

  return {
    total: results.length,
    successes: successful.length,
    failures: results.length - successful.length,
    positive_cases: positives.length,
    negative_cases: negatives.length,
    top1_accuracy: countRate(positives, (result) => result.top1_correct),
    top3_accuracy: countRate(positives, (result) => result.top3_correct),
    top5_accuracy: countRate(positives, (result) => result.top5_correct),
    negative_rejection_accuracy: countRate(
      negatives,
      (result) => result.negative_correct,
    ),
    abstention_rate: countRate(
      successful,
      (result) => result.abstained,
    ),
    false_confident_count: successful.filter(
      (result) => result.false_confident,
    ).length,
    false_confident_rate: countRate(
      successful,
      (result) => result.false_confident,
    ),
    confidence_distribution: successful.reduce((distribution, result) => {
      const key = result.confidence_level || "unknown";
      distribution[key] = (distribution[key] || 0) + 1;
      return distribution;
    }, {}),
    latency_ms: {
      average: round(
        latencies.length
          ? latencies.reduce((sum, value) => sum + value, 0) /
              latencies.length
          : 0,
        2,
      ),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
  };
}

function groupedMetrics(results = [], key) {
  const groups = {};
  for (const result of results) {
    const group = cleanText(result[key]) || "unknown";
    if (!groups[group]) groups[group] = [];
    groups[group].push(result);
  }

  return Object.fromEntries(
    Object.entries(groups).map(([group, values]) => [
      group,
      metricsForResults(values),
    ]),
  );
}

export function buildImageBenchmarkMetrics(results = []) {
  return {
    overall: metricsForResults(results),
    by_source_type: groupedMetrics(results, "source_type"),
    by_view_type: groupedMetrics(results, "view_type"),
    by_analysis_provider: groupedMetrics(results, "analysis_provider"),
    by_rerank_provider: groupedMetrics(results, "rerank_provider"),
  };
}
