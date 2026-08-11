import test from "node:test";
import assert from "node:assert/strict";

import {
  isSafeNaturalizedResponse,
  naturalizeResponseWithGroq,
  rankSuggestedActions,
  resolveGroqNaturalizerConfig,
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
  assert.equal(requestBody.temperature, 0);
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
  assert.deepEqual(userMessage.safe_action_candidates[0], {
    index: 0,
    action: "Pilihan 0",
  });
});
