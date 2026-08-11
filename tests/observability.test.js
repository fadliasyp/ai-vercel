import test from "node:test";
import assert from "node:assert/strict";

import { buildChatMetric } from "../lib/chatbot/observability.js";

test("builds bounded privacy-safe chatbot metrics", () => {
  const metric = buildChatMetric(
    {
      sessionId: "session-123456",
      status: "success",
      intent: "price_promo",
      intentMethod: "groq_router",
      intentScore: 1.7,
      responseType: "products",
      assistantProvider: "groq",
      assistantModel: "openai/gpt-oss-20b",
      assistantReason: "success",
      routerProvider: "groq",
      routerModel: "openai/gpt-oss-20b",
      latencyMs: 1250.8,
      productCount: 3,
      optionCount: -2,
      actionCount: 2,
      question: "email pelanggan@example.com dan 081234567890",
    },
    {
      salt: "test-salt",
      now: () => new Date("2026-08-11T00:00:00.000Z"),
      uuid: () => "metric-id",
    },
  );

  assert.equal(metric.id, "metric-id");
  assert.equal(metric.session_hash.length, 64);
  assert.equal(metric.intent_score, 1);
  assert.equal(metric.latency_ms, 1251);
  assert.equal(metric.option_count, 0);
  assert.equal(metric.assistant_model, "openai/gpt-oss-20b");
  assert.equal("question" in metric, false);
  assert.doesNotMatch(JSON.stringify(metric), /pelanggan@example\.com|081234567890/);
});

test("rejects invalid metric status and session", () => {
  assert.throws(
    () => buildChatMetric({ sessionId: "session", status: "pending" }),
    /INVALID_STATUS/,
  );
  assert.throws(
    () => buildChatMetric({ sessionId: "", status: "success" }),
    /INVALID_SESSION/,
  );
});
