import test from "node:test";
import assert from "node:assert/strict";

import {
  buildQuestionUnderstanding,
  compactQuestionUnderstanding,
  resolveContextualIntent,
} from "../lib/chatbot/questionUnderstanding.js";

test("separates store background, manufacturing origin, and shipping origin", () => {
  assert.deepEqual(
    buildQuestionUnderstanding("Kamu tau asal usul Robot Jadul engga?", {
      explicitIntent: "general",
    }),
    {
      subject_type: "store",
      domain_question_type: "store_background",
      reference_scope: "store",
      required_facts: ["store_background"],
      confidence: 0.95,
      needs_clarification: false,
      clarification_kind: "",
    },
  );

  const manufacturing = buildQuestionUnderstanding(
    "Robot ini dibuat atau diproduksi di negara mana?",
    { explicitIntent: "product_detail", hasPageProduct: true },
  );
  assert.equal(manufacturing.subject_type, "product");
  assert.equal(
    manufacturing.domain_question_type,
    "product_manufacturing_origin",
  );
  assert.deepEqual(manufacturing.required_facts, ["product_description"]);

  const shipping = buildQuestionUnderstanding("Barang dikirim dari mana?", {
    explicitIntent: "shipping_origin",
  });
  assert.equal(shipping.subject_type, "shipping");
  assert.equal(shipping.domain_question_type, "shipping_origin");
  assert.equal(shipping.needs_clarification, false);
});

test("marks a genuinely ambiguous product-origin question for clarification", () => {
  const result = buildQuestionUnderstanding("Asal robotnya dari mana?", {
    hasRecentProducts: true,
  });

  assert.equal(result.subject_type, "product");
  assert.equal(result.domain_question_type, "unknown");
  assert.equal(result.needs_clarification, true);
  assert.equal(result.clarification_kind, "origin_meaning");
  assert.ok(result.confidence <= 0.6);
});

test("resolves natural pronoun follow-ups to recent products", () => {
  const result = buildQuestionUnderstanding("Yang paling worth it mana?", {
    explicitIntent: "recommendation",
    hasRecentProducts: true,
  });

  assert.equal(result.subject_type, "product");
  assert.equal(result.domain_question_type, "product_recommendation");
  assert.equal(result.reference_scope, "previous_products");
});

test("keeps an explicitly named product separate from previous results", () => {
  for (const question of [
    "Halo, ada Getter Robbo yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs?",
    "Mau tanya detail bahan buat Mazinger Z yang Jumbo Machinder, itu full die-cast ngga? Harganya berapa nett-nya?",
  ]) {
    const result = buildQuestionUnderstanding(question, {
      hasRecentProducts: true,
    });

    assert.equal(result.subject_type, "product");
    assert.equal(result.reference_scope, "specific_product");
  }
});

test("still resolves genuinely anaphoric product follow-ups", () => {
  for (const question of [
    "Yang ready stock saja",
    "Kalau produk itu kondisinya bagaimana?",
    "Produk itu bahannya full die-cast atau plastik?",
    "Mana yang paling worth it?",
  ]) {
    assert.equal(
      buildQuestionUnderstanding(question, {
        hasRecentProducts: true,
      }).reference_scope,
      "previous_products",
    );
  }
});

test("keeps the compact frame bounded for LLM context", () => {
  const compact = compactQuestionUnderstanding(
    buildQuestionUnderstanding("Ada promo robot yang ready?", {
      explicitIntent: "price_promo",
    }),
  );

  assert.equal(compact.domain_question_type, "price_or_promotion");
  assert.deepEqual(compact.required_facts, ["catalog_price"]);
  assert.ok(JSON.stringify(compact).length < 300);
});

test("keeps a typed budget inside the recommendation conversation", () => {
  assert.deepEqual(
    resolveContextualIntent("Diatas 7 juta dibawah 9,5 juta", {
      explicitIntent: "price_promo",
      lastIntent: "recommendation",
      lastBotQuestionType: "ask_budget_value",
    }),
    {
      intent: "recommendation",
      method: "context_expected_budget_rule",
      confidence: 1,
      is_follow_up: true,
      expected_answer_type: "budget",
    },
  );

  assert.equal(
    resolveContextualIntent("ada promo di budget 7 juta?", {
      explicitIntent: "price_promo",
      lastIntent: "recommendation",
      lastBotQuestionType: "ask_budget_value",
    }),
    null,
  );

  assert.equal(
    resolveContextualIntent("7 juta sampai 9,5 juta", {
      explicitIntent: "price_promo",
    }),
    null,
  );
});

test("resolves expected product names and previous-result questions", () => {
  assert.equal(
    resolveContextualIntent("Vintage Gashapon Sasuraiger", {
      lastBotQuestionType: "ask_product_name",
      lastBotQuestionMeta: { source: "detail" },
    })?.intent,
    "product_detail",
  );

  assert.equal(
    resolveContextualIntent("kalau pembayarannya bisa QRIS?", {
      explicitIntent: "shipping_transaction",
      lastBotQuestionType: "ask_product_name",
      lastBotQuestionMeta: { source: "detail" },
    }),
    null,
  );

  assert.equal(
    resolveContextualIntent("dari tiga tadi paling worth it mana?", {
      hasRecentProducts: true,
      lastIntent: "product_discovery",
      productQueryScope: "previous",
    })?.intent,
    "recommendation",
  );

  assert.equal(
    resolveContextualIntent("ada yang lain dari hasil tadi?", {
      hasRecentProducts: true,
      lastIntent: "recommendation",
      productQueryScope: "previous",
    })?.intent,
    "recommendation",
  );
});
