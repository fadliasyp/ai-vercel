import test from "node:test";
import assert from "node:assert/strict";

import {
  extractBudgetRange,
  extractLatestRecommendationTargetPrice,
  extractRecommendationBudgetAnswer,
  isRecommendationBudgetFollowUp,
} from "../lib/chatbot/priceIntent.js";

test("extracts the latest explicit recommendation price alternative", () => {
  assert.equal(
    extractLatestRecommendationTargetPrice(
      "Cari robot antara 5 sampe 8 juta buat pajangan. Kalau yang 3 jutaan ada?",
    ),
    3000000,
  );
  assert.equal(
    extractLatestRecommendationTargetPrice(
      "Cari robot 5 sampai 8 juta, tapi harga sekitar 4 jutaan ada?",
    ),
    4000000,
  );
  assert.equal(
    extractLatestRecommendationTargetPrice("Kalau budget 3 juta ada?"),
    null,
  );
});

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
  assert.deepEqual(
    extractBudgetRange(
      "rekomen dong robot buat hadiah budget nya 3 juta sampe 6 jutaan deh",
    ),
    {
      detected: true,
      min: 3000000,
      max: 6000000,
    },
  );
  assert.deepEqual(extractBudgetRange("jangan lebih dari 6 juta"), {
    detected: true,
    min: null,
    max: 6000000,
  });
  assert.deepEqual(
    extractBudgetRange("di atas 6 juta tapi jangan lebih dari 8 juta"),
    {
      detected: true,
      min: 6000000,
      max: 8000000,
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
