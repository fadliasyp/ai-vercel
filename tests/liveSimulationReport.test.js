import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLiveSimulationReport,
  renderLiveSimulationMarkdown,
} from "../lib/chatbot/liveSimulationReport.js";

test("combines text and image customer simulations into one report", () => {
  const report = buildLiveSimulationReport(
    {
      results: [
        {
          id: "junk_detail_transparency",
          passed: true,
          expectedIntent: "product_detail",
          actualIntent: "product_detail",
          preview: "Kondisi JUNK dijelaskan.",
        },
        {
          id: "return_policy",
          passed: false,
          expectedIntent: "return_product",
          actualIntent: "general",
          preview: "Jawaban belum sesuai.",
        },
      ],
    },
    {
      results: [
        {
          id: "internet-full-5387-mazinkaiser-01",
          correct: true,
          expected: { product_name: "Mazinkaiser Max Gokin" },
          candidates: [{ name: "Mazinkaiser Max Gokin" }],
          expected_rank: 1,
          confidence_level: "high",
          constraints_correct: true,
        },
      ],
    },
    {
      generatedAt: new Date("2026-08-12T00:00:00.000Z"),
      endpoint: "https://example.test/api/ask",
    },
  );

  assert.equal(report.total, 3);
  assert.equal(report.passed, 2);
  assert.equal(report.failed, 1);
  assert.equal(report.results[1].channel, "foto");

  const markdown = renderLiveSimulationMarkdown(report);
  assert.match(markdown, /Benchmark Live Simulasi Pelanggan/);
  assert.match(markdown, /Nostalgia dan pencarian visual/);
  assert.match(markdown, /Retur produk cacat \| teks \| FAIL/);
});
