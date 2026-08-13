import test from "node:test";
import assert from "node:assert/strict";

import {
  detectRequestedAnswerFacets,
  evaluateAnswerCoverage,
  repairAnswerCoverage,
} from "../lib/chatbot/answerCoverage.js";
import { buildTransactionPolicyMessage } from "../lib/chatbot/transactionIntent.js";

test("detects every requested facet in compound customer questions", () => {
  assert.deepEqual(
    detectRequestedAnswerFacets(
      "Bisa COD dan bayar pakai apa? Pengirimannya pakai asuransi serta packing kayu?",
    ),
    ["insurance", "packing", "cod", "payment_methods"],
  );
  assert.deepEqual(
    detectRequestedAnswerFacets(
      "Kondisinya bagaimana, kelengkapannya apa, dan stoknya ready?",
    ),
    ["product_condition", "completeness", "stock"],
  );
});

test("marks composed transaction policy sections as answered", () => {
  const question =
    "Bisa COD, metode pembayarannya apa, pakai asuransi dan packing kayu?";
  const payload = {
    type: "text",
    message: buildTransactionPolicyMessage(question),
  };
  const coverage = evaluateAnswerCoverage(question, payload);

  assert.equal(coverage.passed, true);
  assert.deepEqual(coverage.missing, []);
  assert.equal(coverage.coverage, 1);
});

test("reports unanswered parts instead of accepting a partial response", () => {
  const coverage = evaluateAnswerCoverage(
    "Stoknya ready dan sedang diskon? Bisa dikirim hari ini?",
    { type: "text", message: "Produk masih ready." },
  );

  assert.deepEqual(coverage.answered, ["stock"]);
  assert.deepEqual(coverage.missing, ["promo", "same_day"]);
  assert.equal(coverage.passed, false);
});

test("accepts a precise shipping clarification as satisfied", () => {
  const coverage = evaluateAnswerCoverage("Cek ongkir ke Tangerang", {
    type: "text",
    message: "Sebutkan kota/kabupaten dan kecamatan tujuan ya.",
  });

  assert.deepEqual(coverage.clarified, ["shipping_quote"]);
  assert.equal(coverage.passed, true);
});

test("checks budget against returned product prices", () => {
  const coverage = evaluateAnswerCoverage(
    "Rekomendasikan robot untuk pajangan di bawah 2 juta",
    {
      type: "products",
      intro: "Berikut pilihan yang cocok untuk pajangan.",
      products: [
        { name: "A", numericPrice: 1500000, stock: "instock" },
        { name: "B", numericPrice: 2100000, stock: "instock" },
      ],
    },
  );

  assert.equal(coverage.status.recommendation, "answered");
  assert.equal(coverage.status.budget, "missing");
});

test("repairs missing factual sections and records the repaired facets", () => {
  const result = repairAnswerCoverage(
    "Bagaimana kondisi dan kelengkapannya?",
    {
      type: "products",
      products: [{ name: "Robot A", condition: "BIB" }],
    },
    {
      answerSections: {
        product_condition: "Kondisi: **BIB**.",
        completeness: "Kelengkapan belum tercantum secara rinci di katalog.",
      },
    },
  );

  assert.equal(result.after.passed, true);
  assert.deepEqual(result.repaired, ["product_condition", "completeness"]);
  assert.match(result.payload.reasoning_text, /Kondisi: \*\*BIB\*\*/);
  assert.match(result.payload.reasoning_text, /Kelengkapan belum tercantum/);
});

test("turns an unanswerable missing facet into a precise clarification", () => {
  const result = repairAnswerCoverage(
    "Berapa ongkirnya?",
    { type: "text", message: "Aku bantu cek." },
    {
      clarificationSections: {
        shipping_quote:
          "Untuk melengkapi cek ongkir, sebutkan kota/kabupaten dan kecamatan tujuan.",
      },
    },
  );

  assert.equal(result.after.passed, true);
  assert.deepEqual(result.clarified, ["shipping_quote"]);
  assert.deepEqual(result.unresolved, []);
});

test("keeps unsupported repairs visible as unresolved instead of inventing facts", () => {
  const result = repairAnswerCoverage(
    "Ada promo dan bisa COD?",
    { type: "text", message: "Aku belum punya datanya." },
  );

  assert.equal(result.after.passed, false);
  assert.deepEqual(result.unresolved, ["promo", "cod"]);
  assert.deepEqual(result.repaired, []);
});
