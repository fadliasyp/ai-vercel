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
