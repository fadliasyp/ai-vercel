import test from "node:test";
import assert from "node:assert/strict";

import {
  renderObservabilityMarkdown,
  summarizeChatFeedback,
  summarizeChatMetrics,
} from "../lib/chatbot/observabilityReport.js";

test("summarizes chatbot reliability, latency, and model usage", () => {
  const rows = [
    {
      status: "success",
      intent: "price_promo",
      intent_score: 0.9,
      assistant_provider: "groq",
      assistant_model: "openai/gpt-oss-20b",
      router_provider: "groq",
      router_model: "openai/gpt-oss-20b",
      latency_ms: 100,
      product_count: 3,
      error_code: "none",
    },
    {
      status: "success",
      intent: "price_promo",
      intent_score: 0.7,
      assistant_provider: "template",
      assistant_model: "unknown",
      router_provider: "local_rules_ml",
      router_model: "unknown",
      latency_ms: 200,
      product_count: 1,
      error_code: "none",
    },
    {
      status: "error",
      intent: "price_promo",
      intent_score: null,
      assistant_provider: "none",
      assistant_model: "unknown",
      router_provider: "unknown",
      router_model: "unknown",
      latency_ms: 500,
      product_count: 0,
      error_code: "aborterror",
    },
    {
      status: "success",
      intent: "general",
      intent_score: 1,
      assistant_provider: "groq",
      assistant_model: "openai/gpt-oss-20b",
      router_provider: "local_rules_ml",
      router_model: "unknown",
      latency_ms: 300,
      product_count: 0,
      error_code: "none",
    },
    {
      status: "success",
      intent: "greeting",
      intent_score: 1,
      assistant_provider: "groq",
      assistant_model: "openai/gpt-oss-20b",
      router_provider: "local_rules_ml",
      router_model: "unknown",
      latency_ms: 900,
      product_count: 0,
      error_code: "none",
    },
  ];

  const report = summarizeChatMetrics(rows);

  assert.equal(report.requests, 4);
  assert.equal(report.excludedGreetings, 1);
  assert.equal(report.errors, 1);
  assert.equal(report.successRate, 0.75);
  assert.equal(report.averageLatencyMs, 275);
  assert.equal(report.p95LatencyMs, 500);
  assert.equal(report.productsReturned, 4);
  assert.equal(report.byIntent[0].name, "price_promo");
  assert.equal(report.byIntent[0].averageConfidence, 0.8);
  assert.equal(report.byAssistant[0].name, "groq/openai/gpt-oss-20b");
  assert.equal(report.byError[0].name, "aborterror");
});

test("returns a stable empty report", () => {
  const report = summarizeChatMetrics([]);
  assert.equal(report.requests, 0);
  assert.equal(report.excludedGreetings, 0);
  assert.equal(report.successRate, 0);
  assert.deepEqual(report.byIntent, []);
});

test("summarizes customer satisfaction without conversation content", () => {
  const feedback = summarizeChatFeedback([
    {
      rating: "helpful",
      intent: "price_promo",
      response_type: "products",
      assistant_provider: "groq",
      assistant_reason: "success",
      question: "teks pelanggan tidak boleh masuk laporan",
    },
    {
      rating: "unhelpful",
      intent: "price_promo",
      response_type: "products",
      assistant_provider: "template",
      assistant_reason: "timeout",
    },
    {
      rating: "helpful",
      intent: "shipping_transaction",
      response_type: "text",
      assistant_provider: "groq",
      assistant_reason: "success",
    },
    { rating: "invalid", intent: "general" },
  ]);

  assert.equal(feedback.responses, 3);
  assert.equal(feedback.helpful, 2);
  assert.equal(feedback.unhelpful, 1);
  assert.equal(feedback.helpfulRate, 2 / 3);
  assert.equal(feedback.byIntent[0].name, "price_promo");
  assert.equal(feedback.byIntent[0].helpfulRate, 0.5);
  assert.equal("question" in feedback, false);
  assert.doesNotMatch(JSON.stringify(feedback), /teks pelanggan/);
});

test("renders a stable readable Markdown report", () => {
  const report = summarizeChatMetrics([
    {
      status: "success",
      intent: "price_promo",
      intent_score: 0.9,
      assistant_provider: "groq",
      assistant_model: "openai/gpt-oss-20b",
      router_provider: "local_rules_ml",
      router_model: "unknown",
      latency_ms: 250,
      product_count: 2,
      error_code: "none",
    },
  ]);
  const feedback = summarizeChatFeedback([
    {
      rating: "helpful",
      intent: "price_promo",
      response_type: "products",
      assistant_provider: "groq",
      assistant_reason: "success",
    },
  ]);

  const markdown = renderObservabilityMarkdown(report, feedback, {
    days: 7,
    generatedAt: new Date("2026-08-12T00:00:00.000Z"),
  });

  assert.match(markdown, /^# Laporan Observability Chatbot/);
  assert.match(markdown, /2026-08-12T00:00:00\.000Z/);
  assert.match(markdown, /\| Success rate \| 100\.0% \|/);
  assert.match(markdown, /\| Greeting otomatis diabaikan \| 0 \|/);
  assert.match(markdown, /\| price_promo \| 1 \| 0 \| 100\.0% \| 250 ms \| 0\.90 \|/);
  assert.match(markdown, /## Kepuasan Pelanggan/);
  assert.match(markdown, /\| Helpful rate \| 100\.0% \|/);
});
