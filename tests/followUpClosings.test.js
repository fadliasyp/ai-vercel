import test from "node:test";
import assert from "node:assert/strict";

import {
  applyControlledFollowUpPolicy,
  buildBudgetOptions,
  buildControlledActions,
  buildSuggestedActionMetadata,
  buildSuggestedActionMetadataList,
  buildStandaloneAffirmationResponse,
  isOptionalFollowUpType,
  isRequiredClarificationPayload,
  serializeSuggestedActions,
  suggestedActionIntent,
  validateSuggestedActionSelection,
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

test("adds trusted required-field metadata to every suggestion", () => {
  const actions = buildSuggestedActionMetadataList([
    "Minta rekomendasi robot sesuai budget",
    "Cek ongkir ke kota tujuan",
    "Cek status pesanan saya",
    "Bagaimana melacak paket pesanan saya?",
    "Tampilkan detail Robot A",
    "Lihat metode pembayaran",
    "Tanyakan hal lain",
  ]);

  assert.equal(actions.length, 7);
  assert.deepEqual(actions[0].required_fields, ["budget"]);
  assert.deepEqual(actions[1].required_fields, ["destination"]);
  assert.deepEqual(actions[2].required_fields, ["order_id"]);
  assert.deepEqual(actions[3].required_fields, ["tracking_number"]);
  assert.deepEqual(actions[4].required_fields, ["product_name"]);
  assert.deepEqual(actions[5].required_fields, []);
  assert.equal(actions[6].action_key, "follow_up");
  assert.equal(suggestedActionIntent(actions[1]), "shipping_transaction");
});

test("maps informational suggestion families without requiring extra input", () => {
  const actions = buildSuggestedActionMetadataList([
    "Pengiriman diproses dari mana?",
    "Apakah bisa kirim ke luar pulau?",
    "Chatbot ini bisa membantu apa saja?",
    "Bagaimana menghubungi admin terkait pesanan?",
    "Kenapa Robot A paling mirip dengan foto?",
  ]);

  assert.deepEqual(
    actions.map((action) => action.action_key),
    [
      "shipping_origin",
      "shipping_coverage",
      "assistant_capabilities",
      "admin_handoff",
      "image_match_reason",
    ],
  );
  assert.deepEqual(actions[0].required_fields, []);
  assert.deepEqual(actions[4].required_fields, ["product_name"]);
});

test("recomputes suggestion metadata and rejects client-side tampering", () => {
  const action = buildSuggestedActionMetadata(
    "Minta rekomendasi robot sesuai budget",
  );
  assert.deepEqual(
    validateSuggestedActionSelection(action, action.value),
    action,
  );
  assert.equal(
    validateSuggestedActionSelection(
      { ...action, required_fields: [] },
      action.value,
    ),
    null,
  );
  assert.deepEqual(
    validateSuggestedActionSelection(null, "Cek ongkir ke kota tujuan"),
    buildSuggestedActionMetadata("Cek ongkir ke kota tujuan"),
  );
});

test("keeps suggestion text backward compatible while attaching metadata", () => {
  const result = serializeSuggestedActions({
    type: "text",
    actions: [
      "Minta rekomendasi robot sesuai budget",
      "Cek ongkir ke kota tujuan",
    ],
  });

  assert.deepEqual(result.actions, [
    "Minta rekomendasi robot sesuai budget",
    "Cek ongkir ke kota tujuan",
  ]);
  assert.deepEqual(
    result.actions_metadata.map((action) => action.required_fields),
    [["budget"], ["destination"]],
  );
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

test("provides grounded follow-up choices for every completed intent", () => {
  const intents = [
    "greeting",
    "product_discovery",
    "product_detail",
    "price_promo",
    "stock_availability",
    "recommendation",
    "compare",
    "shipping_transaction",
    "shipping_origin",
    "return_product",
    "transaction_status",
    "shipment_tracking",
    "image_product_search",
    "general",
  ];

  for (const intent of intents) {
    const result = applyControlledFollowUpPolicy(
      { type: "text", message: "Informasi sudah lengkap." },
      { intent },
    );
    assert.ok(result.actions?.length >= 2, `${intent} tidak punya saran`);
    assert.ok(result.actions.length <= 3, `${intent} terlalu banyak saran`);
  }
});

test("suppresses unrelated choices while required customer data is missing", () => {
  const clarification = {
    type: "text",
    message: "Untuk melanjutkan, tulis nomor resinya.",
  };

  assert.equal(isRequiredClarificationPayload(clarification), true);
  assert.equal(
    "actions" in
      applyControlledFollowUpPolicy(clarification, {
        intent: "shipment_tracking",
      }),
    false,
  );
});

test("grounds image-search choices in actual product candidates", () => {
  assert.deepEqual(
    buildControlledActions("image_product_search", { products }),
    [
      "Tampilkan detail Robot A",
      "Cek stok Robot A",
      "Cek harga Robot A",
    ],
  );
});

test("does not suggest repeating a completed cheapest-price request", () => {
  const actions = buildControlledActions(
    "price_promo",
    { products },
    { userQuestion: "Robot apa yang paling termurah di toko ini?" },
  );

  assert.equal(actions.some((action) => /termurah/i.test(action)), false);
  assert.match(actions[0], /tampilkan detail/i);
  assert.ok(actions.some((action) => /stok|bandingkan|detail/i.test(action)));
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

test("replaces a trailing optional invitation with correlated choices", () => {
  const result = applyControlledFollowUpPolicy(
    {
      type: "text",
      message:
        "Pengiriman berasal dari Jakarta.\n\nKalau mau, sebutkan kota tujuan agar aku cek ongkirnya.",
    },
    { intent: "shipping_origin" },
  );

  assert.equal(result.message, "Pengiriman berasal dari Jakarta.");
  assert.deepEqual(result.actions, [
    "Cek ongkir ke kota tujuan",
    "Apakah bisa kirim ke luar pulau?",
    "Berapa lama estimasi pengiriman?",
  ]);
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
