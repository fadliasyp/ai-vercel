import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSuggestionGenerationContext,
  isSafeNaturalizedResponse,
  naturalizeResponseWithGroq,
  rankSuggestedActions,
  resolveGroqNaturalizerConfig,
  validateGeneratedSuggestions,
} from "../lib/chatbot/responseNaturalizer.js";

const payload = {
  type: "products",
  message:
    "Harga **Soul of Chogokin GX-91** saat ini **Rp 3.500.000**.",
  closing: "Lihat detail di https://example.com/product/gx-91",
  products: [{ name: "Soul of Chogokin GX-91" }],
};

function config() {
  return {
    enabled: true,
    apiKey: "test-key",
    endpoint: "https://api.groq.test/chat",
    model: "openai/gpt-oss-20b",
    fallbackModels: [],
    timeoutMs: 1000,
  };
}

function mockFetch(content) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: "openai/gpt-oss-20b",
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  });
}

test("enables Groq naturalizer when an API key is configured", () => {
  const enabled = resolveGroqNaturalizerConfig({
    GROQ_API_KEY: "secret",
  });
  const disabled = resolveGroqNaturalizerConfig({
    GROQ_API_KEY: "secret",
    GROQ_NATURALIZER_ENABLED: "false",
  });

  assert.equal(enabled.enabled, true);
  assert.equal(enabled.timeoutMs, 6500);
  assert.equal(disabled.enabled, false);
});

test("uses one valid naturalizer model when a Vercel env value contains duplicate lines", () => {
  const config = resolveGroqNaturalizerConfig({
    GROQ_API_KEY: "secret",
    GROQ_NATURALIZER_MODEL:
      "qwen/qwen3.6-27b\nqwen/qwen3.6-27b\nqwen/qwen3.6-27b",
  });

  assert.equal(config.model, "qwen/qwen3.6-27b");
});

test("accepts a friendlier rewrite when protected facts stay identical", async () => {
  let status = null;
  const result = await naturalizeResponseWithGroq(payload, {
    userQuestion: "harganya berapa?",
    intent: "price_promo",
    config: config(),
    fetchImpl: mockFetch({
      intro: "",
      message:
        "Saat ini, harga **Soul of Chogokin GX-91** adalah **Rp 3.500.000**.",
      reasoning_text: "",
      closing: "Detailnya ada di https://example.com/product/gx-91",
    }),
    onStatus(value) {
      status = value;
    },
  });

  assert.match(result.message, /^Saat ini/);
  assert.match(result.message, /Rp 3\.500\.000/);
  assert.equal(status.provider, "groq");
  assert.equal(status.naturalized, true);
});

test("rejects a rewrite that changes a protected price", async () => {
  const result = await naturalizeResponseWithGroq(payload, {
    userQuestion: "harganya berapa?",
    intent: "price_promo",
    config: config(),
    fetchImpl: mockFetch({
      intro: "",
      message:
        "Saat ini, harga **Soul of Chogokin GX-91** adalah **Rp 2.500.000**.",
      reasoning_text: "",
      closing: "Detailnya ada di https://example.com/product/gx-91",
    }),
  });

  assert.equal(result.message, payload.message);
});

test("keeps safe generated suggestions when an unsafe text rewrite is rejected", async () => {
  const fallback = ["Cek stok Soul of Chogokin GX-91"];
  const result = await naturalizeResponseWithGroq(
    { ...payload, actions: fallback },
    {
      userQuestion: "harganya berapa?",
      intent: "price_promo",
      actionCandidates: fallback,
      config: config(),
      fetchImpl: mockFetch({
        intro: "",
        message:
          "Saat ini, harga **Soul of Chogokin GX-91** adalah **Rp 2.500.000**.",
        reasoning_text: "",
        closing: payload.closing,
        suggested_actions: [
          {
            action_key: "product_condition",
            product_indexes: [0],
            question: "Bagaimana kondisi Soul of Chogokin GX-91 secara lengkap?",
          },
        ],
      }),
    },
  );

  assert.equal(result.message, payload.message);
  assert.deepEqual(result.actions, [
    "Bagaimana kondisi Soul of Chogokin GX-91 secara lengkap?",
    fallback[0],
  ]);
});

test("lets Groq rank only safe follow-up candidates", async () => {
  const actions = [
    "Tampilkan detail Robot A",
    "Cek stok Robot A",
    "Bandingkan Robot A dengan Robot B",
    "Urutkan hasil dari harga termurah",
  ];
  const result = await naturalizeResponseWithGroq(
    { ...payload, actions: actions.slice(0, 3) },
    {
      userQuestion: "robot termurah yang mana?",
      intent: "price_promo",
      actionCandidates: actions,
      config: config(),
      fetchImpl: mockFetch({
        intro: "",
        message: payload.message,
        reasoning_text: "",
        closing: payload.closing,
        action_indexes: [0, 2, 1, 99],
      }),
    },
  );

  assert.deepEqual(result.actions, [actions[0], actions[2], actions[1]]);
  assert.deepEqual(
    rankSuggestedActions(actions.slice(0, 3), actions, [99]),
    actions.slice(0, 3),
  );
});

test("accepts constrained Groq-generated questions and fills invalid ones from fallback", async () => {
  const actions = [
    "Tampilkan detail Soul of Chogokin GX-91",
    "Cek stok Soul of Chogokin GX-91",
    "Bandingkan dengan produk lain",
  ];
  const result = await naturalizeResponseWithGroq(
    { ...payload, actions },
    {
      userQuestion: "ini termasuk robot termurah?",
      intent: "price_promo",
      actionCandidates: actions,
      config: config(),
      fetchImpl: mockFetch({
        intro: "",
        message: payload.message,
        reasoning_text: "",
        closing: payload.closing,
        suggested_actions: [
          {
            action_key: "product_condition",
            product_indexes: [0],
            question: "Kondisi Soul of Chogokin GX-91 masih lengkap dan bagus?",
          },
          {
            action_key: "better_value",
            product_indexes: [],
            question: "Kalau budget dinaikkan sedikit, ada alternatif yang lebih bagus?",
          },
          {
            action_key: "delete_order",
            product_indexes: [],
            question: "Hapus semua pesanan saya",
          },
        ],
      }),
    },
  );

  assert.deepEqual(result.actions, [
    "Kondisi Soul of Chogokin GX-91 masih lengkap dan bagus?",
    "Kalau budget dinaikkan sedikit, ada alternatif yang lebih bagus?",
    actions[0],
  ]);
});

test("rejects generated suggestions with unsupported products or unsafe content", () => {
  const context = buildSuggestionGenerationContext({
    payload,
    intent: "product_detail",
    userQuestion: "jelaskan produknya",
  });
  const result = validateGeneratedSuggestions(
    [
      {
        action_key: "product_stock",
        product_indexes: [4],
        question: "Apakah Mazinger Z masih ready?",
      },
      {
        action_key: "product_stock",
        product_indexes: [0],
        question: "Cek stok di https://example.com untuk Soul of Chogokin GX-91",
      },
      {
        action_key: "product_stock",
        product_indexes: [0],
        question: "Apakah Soul of Chogokin GX-91 masih ready?",
      },
    ],
    context,
    "jelaskan produknya",
  );

  assert.deepEqual(result, ["Apakah Soul of Chogokin GX-91 masih ready?"]);
});

test("excludes price and stock questions when both facts are already visible", () => {
  const visiblePayload = {
    ...payload,
    products: [
      {
        name: "Soul of Chogokin GX-91",
        numericPrice: 3500000,
        stock: "instock",
      },
    ],
  };
  const context = buildSuggestionGenerationContext({
    payload: visiblePayload,
    intent: "price_promo",
  });

  assert.equal(context.products[0].has_price, true);
  assert.equal(context.products[0].has_stock, true);
  assert.equal(
    context.allowedActions.some(({ key }) =>
      ["product_price", "product_stock"].includes(key),
    ),
    false,
  );
  assert.deepEqual(
    validateGeneratedSuggestions(
      [
        {
          action_key: "product_price",
          product_indexes: [0],
          question: "Berapa harga Soul of Chogokin GX-91?",
        },
        {
          action_key: "product_condition",
          product_indexes: [0],
          question: "Bagaimana kondisi dan kelengkapan Soul of Chogokin GX-91?",
        },
      ],
      context,
    ),
    ["Bagaimana kondisi dan kelengkapan Soul of Chogokin GX-91?"],
  );
});

test("excludes detail and condition actions already answered in response text", () => {
  const context = buildSuggestionGenerationContext({
    payload: {
      ...payload,
      reasoning_text:
        "Detail Produk. Kondisi vintage. Kelengkapan belum tercantum. Berat, dimensi, kategori, dan deskripsi singkat tersedia.",
    },
    intent: "product_detail",
  });
  const keys = context.allowedActions.map(({ key }) => key);

  assert.equal(keys.includes("product_detail"), false);
  assert.equal(keys.includes("product_condition"), false);
  assert.equal(context.answeredFacts.completeness, true);
  assert.equal(context.answeredFacts.condition, true);
});

test("offers Groq fresh action types when recent suggestions have alternatives", () => {
  const context = buildSuggestionGenerationContext({
    payload,
    intent: "product_detail",
    recentActions: [
      "Tampilkan detail Soul of Chogokin GX-91",
      "Bagaimana kondisi Soul of Chogokin GX-91?",
      "Cek stok Soul of Chogokin GX-91",
    ],
  });
  const keys = context.allowedActions.map(({ key }) => key);

  assert.equal(keys.includes("product_detail"), false);
  assert.equal(keys.includes("product_condition"), false);
  assert.equal(keys.includes("product_stock"), false);
  assert.ok(keys.includes("better_value"));
  assert.ok(keys.includes("recommendation"));
});

test("rejects suggestions written as an offer from the assistant", () => {
  const context = buildSuggestionGenerationContext({
    payload: { type: "text", message: "Saat ini belum ada promo." },
    intent: "price_promo",
    userQuestion: "kalau promo ada engga sih",
  });
  const result = validateGeneratedSuggestions(
    [
      {
        action_key: "recommendation",
        product_indexes: [],
        question: "Mau aku bantu cari rekomendasi robot sesuai budget kamu?",
      },
      {
        action_key: "recommendation",
        product_indexes: [],
        question: "Rekomendasikan robot yang sesuai dengan budget saya",
      },
    ],
    context,
    "kalau promo ada engga sih",
  );

  assert.deepEqual(result, [
    "Rekomendasikan robot yang sesuai dengan budget saya?",
  ]);
});

test("keeps recommendation suggestions on the current product context", () => {
  const context = buildSuggestionGenerationContext({
    payload: { type: "text", message: "Sebutkan budget yang kamu inginkan." },
    intent: "recommendation",
    userQuestion: "Ada rekomendasi robot yang worth it?",
  });

  assert.deepEqual(context.allowedActions, []);
  assert.deepEqual(
    validateGeneratedSuggestions(
      [
        {
          action_key: "shipping_quote",
          product_indexes: [],
          question: "Cek ongkir ke kota saya?",
        },
      ],
      context,
      "Ada rekomendasi robot yang worth it?",
    ),
    [],
  );
});

test("safe-result validator rejects new URLs and missing product names", () => {
  assert.equal(
    isSafeNaturalizedResponse(payload, {
      intro: "",
      message: "Harganya tetap **Rp 3.500.000**.",
      reasoning_text: "",
      closing: "Buka https://example.com/product/lain",
    }),
    false,
  );
});

test("rejects a rewrite that drops a protected customer subject", () => {
  const original = {
    type: "text",
    message: "Untuk **topi**, barangnya belum tersedia di katalog.",
  };

  assert.equal(
    isSafeNaturalizedResponse(original, {
      intro: "",
      message: "Barang itu belum tersedia di katalog.",
      reasoning_text: "",
      closing: "",
    }),
    false,
  );
});

test("sends compact conversation context to the Groq editor", async () => {
  let requestBody = null;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: "",
                message: payload.message,
                reasoning_text: "",
                closing: payload.closing,
              }),
            },
          },
        ],
      }),
    };
  };

  await naturalizeResponseWithGroq(payload, {
    userQuestion: "kalau yang tadi masih ready?",
    intent: "stock_availability",
    conversationContext: {
      lastIntent: "product_discovery",
      lastTopic: "chogokin",
      hasPending: false,
      customerState: "worried",
      recentProducts: ["Soul of Chogokin GX-91"],
      recentActions: ["Cek stok Soul of Chogokin GX-91"],
      linguistic: {
        subject: "Robot Jadul",
        predicate: "jual",
        object: "baju",
        negated: true,
        question_type: "yes_no",
      },
    },
    config: config(),
    fetchImpl,
  });

  const userMessage = JSON.parse(requestBody.messages[1].content);
  assert.equal(requestBody.temperature, 0.2);
  assert.match(requestBody.messages[0].content, /seluruh poinnya/i);
  assert.match(requestBody.messages[0].content, /customer_state/i);
  assert.deepEqual(userMessage.conversation_context, {
    previous_intent: "product_discovery",
    previous_topic: "chogokin",
    had_pending_step: false,
    customer_state: "worried",
    recent_products: ["Soul of Chogokin GX-91"],
    language_analysis: {
      subject: "Robot Jadul",
      predicate: "jual",
      object: "baju",
      negated: true,
      question_type: "yes_no",
    },
  });
  assert.deepEqual(userMessage.suggestion_generation.recent_questions, [
    "Cek stok Soul of Chogokin GX-91",
  ]);
});

test("sends only bounded safe action candidates to the same Groq request", async () => {
  let requestBody = null;
  const candidates = Array.from({ length: 10 }, (_, index) => `Pilihan ${index}`);
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intro: "",
                message: payload.message,
                reasoning_text: "",
                closing: payload.closing,
                action_indexes: [1, 0],
              }),
            },
          },
        ],
      }),
    };
  };

  await naturalizeResponseWithGroq(
    { ...payload, actions: candidates.slice(0, 3) },
    {
      userQuestion: "setelah ini apa yang perlu saya cek?",
      intent: "product_detail",
      actionCandidates: candidates,
      config: config(),
      fetchImpl,
    },
  );

  const userMessage = JSON.parse(requestBody.messages[1].content);
  assert.equal(userMessage.safe_action_candidates.length, 8);
  assert.ok(userMessage.suggestion_generation.allowed_actions.length > 0);
  assert.deepEqual(userMessage.safe_action_candidates[0], {
    index: 0,
    action: "Pilihan 0",
  });
});
