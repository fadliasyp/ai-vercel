import test from "node:test";
import assert from "node:assert/strict";

import {
  extractBudgetRange,
  extractRecommendationBudgetAnswer,
  isRecommendationBudgetFollowUp,
} from "../lib/chatbot/priceIntent.js";

test("extracts natural maximum-budget phrases", () => {
  assert.deepEqual(extractBudgetRange("maks budget saya 500rb, dapet apa"), {
    detected: true,
    min: null,
    max: 500000,
  });
  assert.deepEqual(extractBudgetRange("budget aku sekitar 1 jutaan"), {
    detected: true,
    min: null,
    max: 1000000,
  });
  assert.deepEqual(extractBudgetRange("under 2 jt ada apa"), {
    detected: true,
    min: null,
    max: 2000000,
  });
});

test("extracts lower bounds and price ranges", () => {
  assert.deepEqual(extractBudgetRange("minimal 700 ribu"), {
    detected: true,
    min: 700000,
    max: null,
  });
  assert.deepEqual(extractBudgetRange("antara 500 ribu sampai 2 juta"), {
    detected: true,
    min: 500000,
    max: 2000000,
  });
  assert.deepEqual(
    extractBudgetRange("Diatas 5 juta dibawah 7 juta"),
    {
      detected: true,
      min: 5000000,
      max: 7000000,
    },
  );
  assert.deepEqual(
    extractBudgetRange("di bawah 7 juta dan di atas 5 juta"),
    {
      detected: true,
      min: 5000000,
      max: 7000000,
    },
  );
});

test("treats a free-form range as the awaited recommendation budget", () => {
  assert.equal(
    isRecommendationBudgetFollowUp(
      "ask_budget_value",
      "Diatas 5 juta dibawah 7 juta",
    ),
    true,
  );
  assert.equal(
    isRecommendationBudgetFollowUp("ask_product_name", "5 sampai 7 juta"),
    false,
  );
  assert.deepEqual(extractRecommendationBudgetAnswer("6 juta"), {
    detected: true,
    min: null,
    max: 6000000,
  });
  assert.deepEqual(extractRecommendationBudgetAnswer("Rp6.000.000"), {
    detected: true,
    min: null,
    max: 6000000,
  });
  assert.equal(
    isRecommendationBudgetFollowUp("ask_budget_value", "6 juta"),
    true,
  );
});

test("does not treat unrelated numbers as a budget", () => {
  assert.deepEqual(extractBudgetRange("cek pesanan nomor 97531"), {
    detected: false,
    min: null,
    max: null,
  });
});
