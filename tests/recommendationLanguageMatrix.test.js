import test from "node:test";
import assert from "node:assert/strict";

import { resolveConversationTurn } from "../lib/chatbot/conversationGoal.js";
import { detectExplicitIntentOverride } from "../lib/chatbot/intentFusion.js";
import { extractRecommendationNeeds } from "../lib/chatbot/productRecommendation.js";

const recommendationCases = [
  {
    question: "rekomen robot 7jtan dong",
    priceMode: "target",
    targetPrice: 7000000,
  },
  {
    question: "rekom robot budget max 7jt",
    priceMode: "maximum",
    budgetMax: 7000000,
  },
  {
    question: "nyari robot 5-8jt buat dipajang",
    priceMode: "range",
    budgetMin: 5000000,
    budgetMax: 8000000,
    wantsDisplay: true,
  },
  {
    question: "ada saran robot sekitar 3 jutaan",
    priceMode: "target",
    targetPrice: 3000000,
  },
  {
    question: "mnurut lu yg 4jtan bagus apa",
    priceMode: "target",
    targetPrice: 4000000,
  },
  {
    question: "gue punya dana max 6jt, ambil apa",
    priceMode: "maximum",
    budgetMax: 6000000,
  },
  {
    question: "duit gw cm 2jt enaknya beli robot apa",
    priceMode: "maximum",
    budgetMax: 2000000,
  },
  {
    question: "pengen yg 3 jutaan buat koleksi",
    priceMode: "target",
    targetPrice: 3000000,
    wantsCollection: true,
  },
  {
    question: "cari robot buat kado under 4jt ready",
    priceMode: "maximum",
    budgetMax: 4000000,
    wantsGift: true,
    readyOnly: true,
  },
  {
    question: "rekomen 19 jtaan",
    priceMode: "target",
    targetPrice: 19000000,
  },
  {
    question: "robot paling worth it dibawah 5jt",
    priceMode: "maximum",
    budgetMax: 5000000,
  },
  {
    question: "pilihin robot 6 jutaan",
    priceMode: "target",
    targetPrice: 6000000,
  },
  {
    question: "saran dong robot rentang 3 sd 6 juta",
    priceMode: "range",
    budgetMin: 3000000,
    budgetMax: 6000000,
  },
  {
    question: "robot 4 jutaan yang bagus apa",
    priceMode: "target",
    targetPrice: 4000000,
  },
];

test("understands a matrix of casual recommendation language", () => {
  for (const expected of recommendationCases) {
    assert.equal(
      detectExplicitIntentOverride(expected.question)?.intent,
      "recommendation",
      expected.question,
    );

    const needs = extractRecommendationNeeds(expected.question);
    for (const [field, value] of Object.entries(expected)) {
      if (field === "question") continue;
      assert.equal(needs[field], value, `${expected.question}: ${field}`);
    }
  }
});

test("keeps nearby non-recommendation language outside recommendation", () => {
  assert.equal(
    detectExplicitIntentOverride("cariin yg kisaran 6jt")?.intent,
    "price_promo",
  );
  assert.equal(
    detectExplicitIntentOverride("cek stok robot dibawah 3jt")?.intent,
    "stock_availability",
  );
  assert.equal(
    detectExplicitIntentOverride("harga Getter Robo 3 juta")?.intent,
    "price_promo",
  );
});

test("grounds LLM recommendation amounts written with casual price typos", () => {
  const needs = extractRecommendationNeeds("rekomen robot 7jtan dong", {
    intent: "recommendation",
    confidence: 0.95,
    recommendation_request: {
      price_mode: "target",
      target_price: 7000000,
      budget_min: null,
      budget_max: null,
      purposes: [],
      stock: null,
      condition: null,
      promo_only: false,
    },
  });

  assert.equal(needs.understandingSource, "llm");
  assert.equal(needs.targetPrice, 7000000);
  assert.equal(needs.priceMode, "target");
});

test("keeps abbreviated recommendation price follow-ups in context", () => {
  const context = {
    activeGoal: { intent: "recommendation", category: "robot" },
  };

  assert.equal(
    resolveConversationTurn("klo yg 4jtan ada gak?", context).question,
    "rekomendasi robot harga 4jtan",
  );
  assert.equal(
    resolveConversationTurn("kl yg 6 jtaan aja", context).question,
    "rekomendasi robot harga 6 jtaan aja",
  );
});
