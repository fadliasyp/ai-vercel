import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImageBenchmarkMetrics,
  evaluateImageBenchmarkCase,
  validateImageBenchmarkDataset,
} from "../lib/chatbot/imageBenchmark.js";

function positiveCase(overrides = {}) {
  return {
    id: "internet-gx47t",
    enabled: true,
    image: "images/gx47t.jpg",
    source_type: "internet",
    view_type: "different_angle",
    question: "carikan produk ini",
    expected: {
      product_id: 3323,
      product_name: "Soul of Chogokin GX-47T Energer Z Test Type",
      acceptable_product_ids: [],
      acceptable_product_names: [],
    },
    ...overrides,
  };
}

test("validates positive, negative, and empty image datasets", () => {
  assert.deepEqual(
    validateImageBenchmarkDataset({ cases: [] }),
    { total: 0, enabled: 0, disabled: 0 },
  );

  const summary = validateImageBenchmarkDataset({
    cases: [
      positiveCase(),
      {
        id: "negative-one",
        image: "images/negative.jpg",
        source_type: "negative",
        view_type: "full",
        expected: { no_match: true },
      },
    ],
  });

  assert.equal(summary.enabled, 2);
  assert.throws(
    () =>
      validateImageBenchmarkDataset(
        { cases: [positiveCase(), positiveCase()] },
        { allowEmpty: false },
      ),
    /duplikat/i,
  );
});

test("evaluates expected product rank and protected confidence metadata", () => {
  const result = evaluateImageBenchmarkCase({
    testCase: positiveCase(),
    statusCode: 200,
    latencyMs: 1234,
    payload: {
      match_confidence: { level: "high", top_score: 92 },
      products: [
        { id: 100, name: "Produk lain", visualScore: 95 },
        {
          id: 3323,
          name: "Soul of Chogokin GX-47T Energer Z Test Type",
          visualScore: 92,
        },
      ],
    },
  });

  assert.equal(result.expected_rank, 2);
  assert.equal(result.top1_correct, false);
  assert.equal(result.top3_correct, true);
  assert.equal(result.false_confident, true);
});

test("treats a low-confidence negative result as a correct abstention", () => {
  const result = evaluateImageBenchmarkCase({
    testCase: {
      id: "negative-one",
      image: "images/negative.jpg",
      source_type: "negative",
      view_type: "full",
      expected: { no_match: true },
    },
    statusCode: 200,
    payload: {
      match_confidence: { level: "low" },
      products: [{ id: 100, name: "Kandidat yang tidak pasti" }],
    },
  });

  assert.equal(result.negative_correct, true);
  assert.equal(result.correct, true);
  assert.equal(result.false_confident, false);
});

test("builds top-k, false-confidence, source, and view metrics", () => {
  const top1 = evaluateImageBenchmarkCase({
    testCase: positiveCase(),
    statusCode: 200,
    latencyMs: 1000,
    payload: {
      match_confidence: { level: "high" },
      products: [
        {
          id: 3323,
          name: "Soul of Chogokin GX-47T Energer Z Test Type",
        },
      ],
    },
  });
  const top2 = evaluateImageBenchmarkCase({
    testCase: positiveCase({
      id: "crop-gx47t",
      source_type: "user",
      view_type: "crop",
    }),
    statusCode: 200,
    latencyMs: 2000,
    payload: {
      match_confidence: { level: "low" },
      products: [
        { id: 5, name: "Salah" },
        {
          id: 3323,
          name: "Soul of Chogokin GX-47T Energer Z Test Type",
        },
      ],
    },
  });

  const metrics = buildImageBenchmarkMetrics([top1, top2]);

  assert.equal(metrics.overall.top1_accuracy, 0.5);
  assert.equal(metrics.overall.top3_accuracy, 1);
  assert.equal(metrics.overall.false_confident_rate, 0);
  assert.equal(metrics.overall.latency_ms.average, 1500);
  assert.equal(metrics.by_source_type.internet.total, 1);
  assert.equal(metrics.by_view_type.crop.total, 1);
});
