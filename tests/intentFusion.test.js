import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseSemanticIntent,
  detectExplicitIntentOverride,
  semanticRouteToLegacy,
  shouldUseSemanticRouter,
} from "../lib/chatbot/intentFusion.js";

const local = {
  intent: "product_discovery",
  method: "fallback_rule_low_confidence",
  score: 0.2,
};

function semantic(intent, overrides = {}) {
  return {
    scope: "in_scope",
    intent,
    confidence: 0.92,
    entities: {
      product_names: [],
      budget_min: null,
      budget_max: null,
    },
    model: "openai/gpt-oss-20b",
    ...overrides,
  };
}

test("clear local out-of-scope rejection wins over an LLM commerce guess", () => {
  const result = chooseSemanticIntent({
    question: "1 + 1 berapa?",
    localScope: "out_of_scope",
    local,
    semantic: semantic("price_promo"),
  });

  assert.equal(result.intent, "general");
  assert.equal(result.scope, "out_of_scope");
  assert.equal(result.method, "out_of_scope_guard");
});

test("high-confidence semantic intent wins over a weak local fallback", () => {
  const result = chooseSemanticIntent({
    question: "tolong bantu satu robot untuk saya",
    localScope: "ambiguous",
    local,
    semantic: semantic("recommendation"),
  });

  assert.equal(result.intent, "recommendation");
  assert.equal(result.scope, "in_scope");
  assert.match(result.method, /^groq_semantic:/);
});

test("keeps the fallback provider visible in semantic routing metadata", () => {
  const result = chooseSemanticIntent({
    question: "Getter Robo lagi promo?",
    localScope: "ambiguous",
    local,
    semantic: semantic("price_promo", {
      provider: "gemini",
      model: "gemini-test",
    }),
  });

  assert.equal(result.intent, "price_promo");
  assert.equal(result.method, "gemini_semantic:gemini-test");
});

test("explicit rules resolve recommendation, compare, store, and insurance boundaries", () => {
  assert.equal(
    detectExplicitIntentOverride("Ada alternatif yang lebih worth it?").intent,
    "recommendation",
  );
  assert.equal(
    detectExplicitIntentOverride("dari 3 itu paling worth it mana?").intent,
    "recommendation",
  );
  assert.equal(
    detectExplicitIntentOverride(
      "mending ambil yang mana kalau budget 1 jutaan",
    ).intent,
    "recommendation",
  );
  assert.equal(
    detectExplicitIntentOverride("GX 47 sama GX 48 beda apa").intent,
    "compare",
  );
  assert.equal(
    detectExplicitIntentOverride("ada cabang toko di luar Jakarta?").intent,
    "general",
  );
  assert.equal(
    detectExplicitIntentOverride("robot jadul buka jam berapa sih?").intent,
    "general",
  );
  assert.equal(
    detectExplicitIntentOverride("toko buka dari jam berapa?").intent,
    "general",
  );
  assert.equal(
    detectExplicitIntentOverride("chatbot ini bisaa apa aja?").intent,
    "general",
  );
  assert.equal(
    detectExplicitIntentOverride("Kamu tau asal usul Robot Jadul engga?")
      .intent,
    "general",
  );
  assert.equal(
    detectExplicitIntentOverride("barang ini bisa diasuransikan?").intent,
    "shipping_transaction",
  );
  assert.equal(
    detectExplicitIntentOverride(
      "robotnya diproduksi sendiri atau import dari luar?",
    ).intent,
    "product_detail",
  );
  assert.equal(
    detectExplicitIntentOverride(
      "Tampilkan detail Soul of Chogogokin GX-31 Voltes V Bandai 2006",
    ).intent,
    "product_detail",
  );
  assert.equal(
    detectExplicitIntentOverride("Bro apa aja stok yg ada").intent,
    "stock_availability",
  );
  assert.equal(
    detectExplicitIntentOverride("produknya ada berapa macam?").intent,
    "product_discovery",
  );
});

test("does not reinterpret an Indonesian place-name correction as a promo", () => {
  assert.equal(
    detectExplicitIntentOverride("Iyaaa kotanya Kulon Progo"),
    null,
  );
});

test("separates catalog condition questions from implicit return problems", () => {
  assert.equal(
    detectExplicitIntentOverride(
      "Produk Getter Robo ini ada cacat atau rusak parah engga?",
    )?.intent,
    "product_detail",
  );
  assert.equal(
    detectExplicitIntentOverride(
      "Kalau sampai barangnya beda dari foto harus gimana?",
    )?.intent,
    "return_product",
  );
  assert.equal(
    detectExplicitIntentOverride(
      "Pas dibuka ternyata ada part yang hilang, ngurusnya gimana?",
    )?.intent,
    "return_product",
  );
});

test("separates payment, coverage, and quote subtopics inside shipping", () => {
  assert.equal(
    detectExplicitIntentOverride("Woi jut bayarnya bisa make paylater ga?")
      ?.method,
    "explicit_payment_methods_rule",
  );
  assert.equal(
    detectExplicitIntentOverride("Pembayaran bisa apa aja emang?")?.method,
    "explicit_payment_methods_rule",
  );
  assert.equal(
    detectExplicitIntentOverride("Bisa kirim ke Surabaya?")?.method,
    "explicit_shipping_coverage_rule",
  );
  assert.equal(
    detectExplicitIntentOverride("Cek ongkir ke Surabaya")?.method,
    "explicit_shipping_quote_rule",
  );
});

test("local commerce scope protects valid store questions from false rejection", () => {
  const result = chooseSemanticIntent({
    question: "barang ini bisa diasuransikan?",
    localScope: "in_scope",
    local: { intent: "shipping_transaction", method: "keyword", score: 1 },
    semantic: semantic("general", {
      scope: "out_of_scope",
      confidence: 0.95,
    }),
  });

  assert.equal(result.intent, "shipping_transaction");
  assert.equal(result.scope, "in_scope");
});

test("low semantic confidence falls back to the existing local decision", () => {
  const result = chooseSemanticIntent({
    question: "ada barang yang itu?",
    localScope: "ambiguous",
    local,
    semantic: semantic("recommendation", { confidence: 0.4 }),
  });

  assert.equal(result.intent, "product_discovery");
  assert.match(result.method, /^local_low_semantic_confidence:/);
});

test("LLM-led mode does not let a local scope rule overwrite a confident interpretation", () => {
  const result = chooseSemanticIntent({
    question: "kalau beli 3 barang total 10 juta ada diskon?",
    localScope: "out_of_scope",
    local: { intent: "general", method: "out_of_scope_guard", score: 1 },
    semantic: semantic("price_promo", {
      confidence: 0.94,
      goals: ["bulk_discount"],
    }),
    llmLed: true,
  });

  assert.equal(result.intent, "price_promo");
  assert.match(result.method, /^groq_semantic:/);
});

test("maps semantic entities into the legacy recommendation shape", () => {
  const legacy = semanticRouteToLegacy(
    semantic("compare", {
      entities: {
        product_names: ["GX-47", "GX-48"],
        budget_min: null,
        budget_max: 1000000,
      },
    }),
  );

  assert.equal(legacy.compare_product_a, "GX-47");
  assert.equal(legacy.compare_product_b, "GX-48");
  assert.match(legacy.budget_text, /1000000/);
});

test("routes every nontrivial commerce question through semantic understanding", () => {
  assert.equal(
    shouldUseSemanticRouter({
      enabled: true,
      localScope: "in_scope",
      question: "cek stok Mazinger Z",
    }),
    true,
  );
  assert.equal(
    shouldUseSemanticRouter({
      enabled: true,
      localScope: "out_of_scope",
      question: "jam berapa sekarang?",
    }),
    false,
  );
  assert.equal(
    shouldUseSemanticRouter({
      enabled: true,
      localScope: "ambiguous",
      question: "ditoko ini jual baju juga ga",
    }),
    true,
  );
});

test("normalizes informal spelling before explicit intent rules", () => {
  assert.equal(
    detectExplicitIntentOverride("stooook Chogokinn masih adaaa?")?.intent,
    "stock_availability",
  );
  assert.equal(
    detectExplicitIntentOverride("rekomndasi robot buat hadiaah")?.intent,
    "recommendation",
  );
  assert.equal(
    detectExplicitIntentOverride("brp hargaaa produk2 itu?")?.intent,
    "price_promo",
  );
});

test("uses Indonesian morphology for implied inflected intents", () => {
  assert.equal(
    detectExplicitIntentOverride(
      "dua robot ini kalau dibandingkan lebih bagus mana?",
    )?.intent,
    "compare",
  );
  assert.equal(
    detectExplicitIntentOverride(
      "boleh direkomendasikan yang cocok untuk hadiah?",
    )?.intent,
    "recommendation",
  );
  assert.equal(
    detectExplicitIntentOverride("paketnya sedang dilacak")?.intent,
    "shipment_tracking",
  );
});
