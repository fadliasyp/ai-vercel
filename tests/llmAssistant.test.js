import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLlmToolPlan,
  buildVerifiedFactPacket,
  resolveLlmAssistantConfig,
  runLlmAnswerComposer,
  shouldUseLlmUnderstanding,
  validateLlmComposedAnswer,
} from "../lib/chatbot/llmAssistant.js";

function config(mode) {
  return {
    mode,
    enabled: true,
    naturalizer: {
      enabled: true,
      apiKey: "test-key",
      endpoint: "https://api.groq.test/chat",
      model: "openai/gpt-oss-20b",
      fallbackModels: [],
      timeoutMs: 1000,
    },
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

function safeGeminiComposer(nextMessage) {
  return async (original, _question, { onStatus } = {}) => {
    onStatus?.({
      provider: "gemini",
      model: "gemini-test",
      naturalized: true,
      reason: "success",
    });
    return { ...original, message: nextMessage };
  };
}

const payload = {
  type: "products",
  message:
    "Harga **Getter Robo G** saat ini **Rp 5.500.000** dan stoknya **12 pcs**.",
  products: [
    {
      id: 42,
      name: "Getter Robo G",
      numericPrice: 5500000,
      stock: "instock",
      stockQuantity: 12,
      link: "https://example.com/getter-robo-g",
    },
  ],
};

test("keeps legacy as the safe default and enables explicit migration modes", () => {
  assert.equal(resolveLlmAssistantConfig({}).mode, "legacy");
  assert.equal(
    resolveLlmAssistantConfig({
      LLM_LED_ASSISTANT_MODE: "shadow",
      GROQ_API_KEY: "secret",
    }).enabled,
    true,
  );
  assert.equal(
    shouldUseLlmUnderstanding("harga dan stok Getter Robo?", {
      mode: "shadow",
      routerEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldUseLlmUnderstanding("halo", {
      mode: "active",
      routerEnabled: true,
    }),
    false,
  );
});

test("plans trusted data tools for every compound need", () => {
  assert.deepEqual(
    buildLlmToolPlan({
      scope: "in_scope",
      requires_product: true,
      goals: [
        "recommendation",
        "price",
        "stock",
        "shipping_quote",
        "payment_methods",
      ],
    }).map((step) => step.tool),
    ["woo_catalog", "shipping_quote", "store_policy"],
  );

  assert.deepEqual(
    buildLlmToolPlan(
      {
        scope: "in_scope",
        requires_product: true,
        goals: ["dimensions", "price", "shipping_quote"],
      },
      { internationalShipping: true },
    ).map((step) => step.tool),
    ["woo_catalog", "store_policy"],
  );

  assert.deepEqual(
    buildLlmToolPlan({
      scope: "in_scope",
      requires_product: false,
      goals: ["stock_policy"],
    }).map((step) => step.tool),
    ["woo_catalog", "store_policy"],
  );
});

test("builds a bounded packet from tool facts instead of the LLM interpretation", () => {
  assert.deepEqual(buildVerifiedFactPacket(payload), {
    response_type: "products",
    products: [
      {
        id: 42,
        name: "Getter Robo G",
        price: 5500000,
        regular_price: null,
        sale_price: null,
        stock: "instock",
        stock_quantity: 12,
        condition: null,
        dimensions: null,
        link: "https://example.com/getter-robo-g",
      },
    ],
    payment_methods: [],
    has_admin_handoff: false,
  });
});

test("shadow mode evaluates a safe answer but never serves it", async () => {
  const result = await runLlmAnswerComposer({
    payload,
    question: "Min, harga dan stok Getter Robo G berapa?",
    intent: "price_promo",
    config: config("shadow"),
    fetchImpl: mockFetch({
      intro: "",
      message:
        "Min, **Getter Robo G** harganya **Rp 5.500.000** dan stoknya masih **12 pcs**.",
      reasoning_text: "",
      closing: "",
    }),
  });

  assert.deepEqual(result.payload, payload);
  assert.equal(result.meta.status, "shadow_accepted");
  assert.equal(result.meta.accepted, true);
  assert.equal(result.meta.changed, true);
});

test("active mode serves only a fact-preserving composition", async () => {
  const safe = await runLlmAnswerComposer({
    payload,
    question: "harga dan stok Getter Robo G?",
    intent: "price_promo",
    config: config("active"),
    fetchImpl: mockFetch({
      intro: "",
      message:
        "**Getter Robo G** masih tersedia **12 pcs** dengan harga **Rp 5.500.000**.",
      reasoning_text: "",
      closing: "",
    }),
  });
  assert.match(safe.payload.message, /^\*\*Getter Robo G/);

  const unsafe = await runLlmAnswerComposer({
    payload,
    question: "harga dan stok Getter Robo G?",
    intent: "price_promo",
    config: config("active"),
    fetchImpl: mockFetch({
      intro: "",
      message:
        "**Getter Robo G** tersedia 9 pcs dengan harga **Rp 4.000.000**.",
      reasoning_text: "",
      closing: "",
    }),
  });
  assert.deepEqual(unsafe.payload, payload);
  assert.equal(unsafe.meta.accepted, false);
});

test("deterministic greeting bypasses every LLM answer composer", async () => {
  const greetingPayload = {
    type: "text",
    intent: "greeting",
    message: "Halo! Ada yang bisa saya bantu?",
  };
  let groqCalls = 0;
  let geminiCalls = 0;
  let mistralCalls = 0;

  const result = await runLlmAnswerComposer({
    payload: greetingPayload,
    question: "halo",
    intent: "greeting",
    config: {
      ...config("active"),
      geminiFallbackEnabled: true,
      mistral: {
        enabled: true,
        apiKey: "mistral-key",
        model: "mistral-small-latest",
      },
    },
    fetchImpl: async () => {
      groqCalls += 1;
      throw new Error("Groq must not be called for a deterministic greeting");
    },
    geminiNaturalizeImpl: async () => {
      geminiCalls += 1;
      throw new Error("Gemini must not be called for a deterministic greeting");
    },
    mistralNaturalizeImpl: async () => {
      mistralCalls += 1;
      throw new Error("Mistral must not be called for a deterministic greeting");
    },
  });

  assert.deepEqual(result.payload, greetingPayload);
  assert.equal(result.meta.status, "deterministic_intent");
  assert.equal(result.meta.provider, "template");
  assert.equal(result.meta.accepted, false);
  assert.equal(groqCalls, 0);
  assert.equal(geminiCalls, 0);
  assert.equal(mistralCalls, 0);
});

test("grounded restock response bypasses every LLM answer composer", async () => {
  let providerCalls = 0;
  const restockPayload = {
    type: "products",
    intent: "stock_availability",
    intro:
      "Berikut jadwal restock mendatang yang tercatat:\n\n- **Daitarn 3**: 1 Desember 2099 pukul 15.30 WIB",
    products: [{ id: 1, name: "Daitarn 3" }],
  };
  const mustNotRun = async () => {
    providerCalls += 1;
    throw new Error("LLM composer must not run for grounded restock answers");
  };

  const result = await runLlmAnswerComposer({
    payload: restockPayload,
    question: "Dari kemarin nunggu kapan restock sih",
    intent: "stock_availability",
    config: {
      ...config("active"),
      geminiFallbackEnabled: true,
      mistral: {
        enabled: true,
        apiKey: "mistral-key",
        model: "mistral-small-latest",
      },
    },
    fetchImpl: mustNotRun,
    geminiNaturalizeImpl: mustNotRun,
    mistralNaturalizeImpl: mustNotRun,
  });

  assert.deepEqual(result.payload, restockPayload);
  assert.equal(result.meta.status, "deterministic_intent");
  assert.equal(result.meta.provider, "template");
  assert.equal(providerCalls, 0);
});

test("falls back to Gemini when all Groq composer models are rate limited", async () => {
  const result = await runLlmAnswerComposer({
    payload,
    question: "harga dan stok Getter Robo G?",
    intent: "price_promo",
    config: { ...config("active"), geminiFallbackEnabled: true },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({ error: { message: "rate limited" } }),
    }),
    geminiNaturalizeImpl: safeGeminiComposer(
      "**Getter Robo G** masih tersedia **12 pcs** dengan harga **Rp 5.500.000**.",
    ),
  });

  assert.equal(result.meta.provider, "gemini");
  assert.equal(result.meta.status, "active_accepted");
  assert.equal(result.meta.accepted, true);
  assert.match(result.payload.message, /masih tersedia/);
});

test("uses Gemini directly after understanding already failed over from Groq", async () => {
  let groqCalls = 0;
  const result = await runLlmAnswerComposer({
    payload,
    question: "harga dan stok Getter Robo G?",
    intent: "price_promo",
    config: {
      ...config("active"),
      geminiFallbackEnabled: true,
      preferGemini: true,
    },
    fetchImpl: async () => {
      groqCalls += 1;
      throw new Error("Groq should not be called");
    },
    geminiNaturalizeImpl: safeGeminiComposer(
      "Harga **Getter Robo G** adalah **Rp 5.500.000**, dengan stok **12 pcs**.",
    ),
  });

  assert.equal(groqCalls, 0);
  assert.equal(result.meta.provider, "gemini");
  assert.equal(result.meta.accepted, true);
});

test("supports a Gemini-only LLM deployment", async () => {
  const geminiOnly = resolveLlmAssistantConfig({
    LLM_LED_ASSISTANT_MODE: "active",
    GEMINI_API_KEY: "gemini-key",
  });
  const result = await runLlmAnswerComposer({
    payload,
    question: "harga dan stok Getter Robo G?",
    intent: "price_promo",
    config: geminiOnly,
    geminiNaturalizeImpl: safeGeminiComposer(
      "Harga **Getter Robo G** adalah **Rp 5.500.000**, dengan stok **12 pcs**.",
    ),
  });

  assert.equal(geminiOnly.enabled, true);
  assert.equal(result.meta.provider, "gemini");
  assert.equal(result.meta.accepted, true);
});

test("falls back to Mistral after Groq and Gemini are rate limited", async () => {
  const result = await runLlmAnswerComposer({
    payload,
    question: "harga dan stok Getter Robo G?",
    intent: "price_promo",
    config: {
      ...config("active"),
      geminiFallbackEnabled: true,
      mistral: {
        enabled: true,
        apiKey: "mistral-key",
        model: "mistral-small-latest",
      },
    },
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({ error: { message: "rate limited" } }),
    }),
    geminiNaturalizeImpl: async (original, _question, { onStatus }) => {
      onStatus({
        provider: "gemini",
        naturalized: false,
        reason: "error_429",
      });
      return original;
    },
    mistralNaturalizeImpl: async (original, _question, { onStatus }) => {
      onStatus({
        provider: "mistral",
        model: "mistral-small-latest",
        naturalized: true,
        reason: "success",
      });
      return {
        ...original,
        message:
          "**Getter Robo G** masih tersedia **12 pcs** dengan harga **Rp 5.500.000**.",
      };
    },
  });

  assert.equal(result.meta.provider, "mistral");
  assert.equal(result.meta.status, "active_accepted");
  assert.equal(result.meta.accepted, true);
});

test("validator rejects lost coverage even when response structure is unchanged", () => {
  const original = {
    type: "text",
    message:
      "Bahan **Getter Robo G** adalah die-cast dan harganya **Rp 5.500.000**.",
  };
  const validation = validateLlmComposedAnswer(
    "Bahan dan harga Getter Robo G berapa?",
    original,
    {
      ...original,
      message: "**Getter Robo G** harganya **Rp 5.500.000**.",
    },
  );

  assert.equal(validation.coverage_before, 1);
  assert.ok(validation.coverage_after < 1);
  assert.equal(validation.accepted, false);
});
