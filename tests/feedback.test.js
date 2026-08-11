import test from "node:test";
import assert from "node:assert/strict";

import { buildFeedbackEvent } from "../lib/chatbot/feedback.js";

test("builds privacy-safe feedback metadata without conversation text", () => {
  const event = buildFeedbackEvent(
    {
      rating: "helpful",
      sessionId: "session-123456",
      intent: "price_promo",
      responseType: "products",
      assistantProvider: "groq",
      assistantReason: "success",
      question: "email saya pelanggan@example.com",
    },
    {
      salt: "test-salt",
      now: () => new Date("2026-08-11T00:00:00.000Z"),
      uuid: () => "feedback-id",
    },
  );

  assert.equal(event.id, "feedback-id");
  assert.equal(event.rating, "helpful");
  assert.equal(event.intent, "price_promo");
  assert.equal(event.session_hash.length, 64);
  assert.equal(event.created_at, "2026-08-11T00:00:00.000Z");
  assert.equal("question" in event, false);
  assert.doesNotMatch(JSON.stringify(event), /pelanggan@example\.com/);
});

test("rejects invalid ratings and sessions", () => {
  assert.throws(
    () => buildFeedbackEvent({ rating: "maybe", sessionId: "session-123" }),
    /INVALID_RATING/,
  );
  assert.throws(
    () => buildFeedbackEvent({ rating: "helpful", sessionId: "short" }),
    /INVALID_SESSION/,
  );
});
