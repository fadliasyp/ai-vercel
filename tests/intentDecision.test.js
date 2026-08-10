import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseHybridIntent,
  DEFAULT_INTENT_ML_MIN_CONFIDENCE,
  resolveIntentMlMinConfidence,
} from "../lib/chatbot/intentDecision.js";

const shippingRule = {
  intent: "shipping_transaction",
  method: "transaction_info_override_rule",
  score: 0.99,
};

test("uses the rule when ML confidence is below the default threshold", () => {
  const result = chooseHybridIntent({
    ml: {
      intent: "product_detail",
      confidence: 0.414,
      is_low_confidence: true,
    },
    rule: shippingRule,
  });

  assert.equal(result.intent, "shipping_transaction");
  assert.equal(result.score, 0.99);
  assert.equal(result.ml_intent, "product_detail");
  assert.equal(result.ml_confidence, 0.414);
});

test("accepts a supported high-confidence ML prediction", () => {
  const result = chooseHybridIntent({
    ml: {
      intent: "product_detail",
      confidence: 0.82,
      is_low_confidence: false,
      method: "tfidf_logreg",
    },
    rule: shippingRule,
  });

  assert.equal(result.intent, "product_detail");
  assert.equal(result.method, "tfidf_logreg");
  assert.equal(result.score, 0.82);
});

test("honors the API low-confidence flag even when its numeric score is high", () => {
  const result = chooseHybridIntent({
    ml: {
      intent: "product_detail",
      confidence: 0.75,
      is_low_confidence: true,
    },
    rule: shippingRule,
  });

  assert.equal(result.intent, "shipping_transaction");
  assert.equal(result.ml_is_low_confidence, true);
});

test("rejects labels that are not part of the chatbot intent contract", () => {
  const result = chooseHybridIntent({
    ml: {
      intent: "unknown_new_label",
      confidence: 0.95,
      is_low_confidence: false,
    },
    rule: shippingRule,
  });

  assert.equal(result.intent, "shipping_transaction");
  assert.equal(result.ml_is_low_confidence, true);
});

test("keeps the API top-three predictions for diagnostics", () => {
  const top3 = [
    { intent: "product_detail", prob: 0.42 },
    { intent: "shipping_transaction", prob: 0.38 },
  ];
  const result = chooseHybridIntent({
    ml: {
      intent: "product_detail",
      confidence: 0.42,
      top3,
    },
    rule: shippingRule,
  });

  assert.deepEqual(result.ml_top3, top3);
});

test("uses 0.6 when the configured threshold is missing or invalid", () => {
  assert.equal(
    resolveIntentMlMinConfidence(undefined),
    DEFAULT_INTENT_ML_MIN_CONFIDENCE,
  );
  assert.equal(
    resolveIntentMlMinConfidence("not-a-number"),
    DEFAULT_INTENT_ML_MIN_CONFIDENCE,
  );
  assert.equal(resolveIntentMlMinConfidence("0.7"), 0.7);
});
