import test from "node:test";
import assert from "node:assert/strict";

import {
  applyControlledFollowUpPolicy,
  buildBudgetOptions,
  buildControlledActions,
  buildStandaloneAffirmationResponse,
  isOptionalFollowUpType,
} from "../lib/chatbot/followUpClosings.js";

const products = [
  { id: 1, name: "Robot A" },
  { id: 2, name: "Robot B" },
];

test("recognizes only optional offer states as optional follow-ups", () => {
  assert.equal(isOptionalFollowUpType("offer_check_stock"), true);
  assert.equal(isOptionalFollowUpType("ask_city"), false);
  assert.equal(isOptionalFollowUpType(""), false);
});

test("provides explicit budget choices for recommendation clarification", () => {
  assert.deepEqual(buildBudgetOptions(), [
    { label: "Di bawah 500 ribu", value: "Di bawah 500 ribu" },
    { label: "500 ribu - 1 juta", value: "500 ribu - 1 juta" },
    { label: "1 juta - 2 juta", value: "1 juta - 2 juta" },
    { label: "Di atas 2 juta", value: "Di atas 2 juta" },
  ]);
});

test("adds contextual choices only to explicitly completed information", () => {
  const result = applyControlledFollowUpPolicy(
    {
      type: "text",
      message: "Pembayaran tersedia melalui transfer bank.",
      _actionContext: "payment_methods",
    },
    { intent: "shipping_transaction" },
  );

  assert.deepEqual(result.actions, [
    "Bagaimana cara membeli produk?",
    "Apakah bisa bayar COD?",
    "Cek ongkir ke kota tujuan",
  ]);
  assert.equal("_actionContext" in result, false);
});

test("offers issue choices before directing a generic return claim", () => {
  assert.deepEqual(
    buildControlledActions("return_product", {
      _actionContext: "return_issue_selection",
    }),
    [
      "Retur: barang rusak atau cacat",
      "Retur: part atau aksesori kurang",
      "Retur: barang salah atau tidak sesuai",
    ],
  );

  assert.deepEqual(
    buildControlledActions("return_product", {
      _actionContext: "return_claim_help",
    }),
    [
      "Apa bukti yang perlu disiapkan untuk retur?",
      "Berapa lama proses refund?",
      "Bagaimana menghubungi admin untuk retur?",
    ],
  );

  assert.deepEqual(
    buildControlledActions("return_product", {
      _actionContext: "return_refund_next",
    }),
    [
      "Bagaimana status pengajuan retur saya?",
      "Bagaimana menghubungi admin untuk retur?",
      "Apa bukti yang perlu disiapkan untuk retur?",
    ],
  );
});

test("does not force choices onto a required shipping clarification", () => {
  const result = applyControlledFollowUpPolicy(
    {
      type: "text",
      message: "Sebutkan nama kecamatan tujuan.",
    },
    { intent: "shipping_transaction" },
  );

  assert.equal("actions" in result, false);
});

test("replaces an optional closing with explicit product actions", () => {
  const result = applyControlledFollowUpPolicy(
    {
      type: "products",
      products,
      closing: "Kalau mau, aku bisa bantu filter lagi.",
      _followUpType: "offer_cheaper_refine",
      _followUpMeta: { source: "recommendation" },
    },
    { intent: "recommendation" },
  );

  assert.equal("closing" in result, false);
  assert.equal("_followUpType" in result, false);
  assert.deepEqual(result.actions, [
    "Urutkan hasil sebelumnya dari harga termurah",
    "Tampilkan produk yang ready stock dari hasil sebelumnya",
    "Tampilkan detail Robot A",
  ]);
});

test("rotates actions away from the suggestions shown previously", () => {
  const first = buildControlledActions("recommendation", { products });
  const second = buildControlledActions(
    "recommendation",
    { products },
    { recentActions: first },
  );

  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.notDeepEqual(second, first);
  assert.equal(second.some((action) => first.includes(action)), false);
});

test("compare actions contain both product names and a clear command", () => {
  assert.deepEqual(buildControlledActions("compare", { products }), [
    "Dari Robot A dan Robot B, mana yang paling worth it?",
    "Bandingkan Robot A dengan Robot B dari sisi harga",
    "Bandingkan Robot A dengan Robot B dari sisi stok",
  ]);
});

test("removes only a trailing optional invitation from message text", () => {
  const result = applyControlledFollowUpPolicy(
    {
      type: "text",
      message:
        "Pengiriman berasal dari Jakarta.\n\nKalau mau, sebutkan kota tujuan agar aku cek ongkirnya.",
    },
    { intent: "shipping_origin" },
  );

  assert.equal(result.message, "Pengiriman berasal dari Jakarta.");
  assert.equal("actions" in result, false);
});

test("standalone affirmation without a required field returns choices", () => {
  const result = buildStandaloneAffirmationResponse({
    lastIntent: "recommendation",
    lastProducts: products,
    lastBotQuestionType: "offer_budget_refine",
  });

  assert.equal(result.type, "suggestions");
  assert.equal(result.suggestions.length, 3);
  assert.match(result.suggestions[0], /harga termurah/i);
});

test("standalone affirmation keeps required shipping input explicit", () => {
  const result = buildStandaloneAffirmationResponse({
    lastIntent: "shipping_transaction",
    pending: {
      type: "shipping_quote",
      stage: "need_district",
    },
  });

  assert.equal(result.type, "text");
  assert.match(result.message, /kecamatan/i);
});

test("standalone affirmation asks for an order ID in transaction flow", () => {
  const result = buildStandaloneAffirmationResponse({
    lastIntent: "transaction_status",
    pending: {
      type: "transaction_status",
      stage: "need_order_id",
    },
  });

  assert.equal(result.type, "text");
  assert.match(result.message, /Order ID/i);
});
