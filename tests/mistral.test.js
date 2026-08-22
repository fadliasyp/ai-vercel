import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyCommerceWithMistral,
  naturalizeWithMistral,
  resolveMistralConfig,
} from "../lib/chatbot/mistral.js";

function response(content, model = "mistral-small-latest") {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      model,
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  };
}

test("keeps Mistral disabled until its API key is configured", () => {
  assert.equal(resolveMistralConfig({}).enabled, false);
  assert.deepEqual(
    resolveMistralConfig({
      MISTRAL_API_KEY: "test-key",
      MISTRAL_MODEL: "mistral-small-latest",
      MISTRAL_FALLBACK_MODELS: "mistral-medium-latest",
    }),
    {
      enabled: true,
      apiKey: "test-key",
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      model: "mistral-small-latest",
      fallbackModels: ["mistral-medium-latest"],
      timeoutMs: 4500,
    },
  );
});

test("Mistral returns the shared semantic router contract", async () => {
  let requestBody = null;
  const route = await classifyCommerceWithMistral({
    question: "Getter Robo lagi promo dan stoknya berapa?",
    context: {},
    config: resolveMistralConfig({ MISTRAL_API_KEY: "test-key" }),
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response({
        scope: "in_scope",
        intent: "price_promo",
        intents: ["price_promo", "stock_availability"],
        goals: ["promo", "stock"],
        confidence: 0.96,
        entities: { product_names: ["Getter Robo"] },
        requires_product: true,
        topic_relation: "new_topic",
        needs_clarification: false,
      });
    },
  });

  assert.equal(requestBody.response_format.type, "json_object");
  assert.equal(route.provider, "mistral");
  assert.equal(route.intent, "price_promo");
  assert.deepEqual(route.goals, ["promo", "stock"]);
});

test("Mistral composer changes only editable text fields", async () => {
  const original = {
    type: "products",
    message: "Getter Robo harganya Rp 5.500.000 dan stoknya 12 pcs.",
    products: [{ id: 42, name: "Getter Robo" }],
  };
  let status = null;
  const result = await naturalizeWithMistral(
    original,
    "Harga dan stok Getter Robo?",
    {
      config: resolveMistralConfig({ MISTRAL_API_KEY: "test-key" }),
      fetchImpl: async () =>
        response({
          intro: "",
          message:
            "Getter Robo tersedia 12 pcs dengan harga Rp 5.500.000.",
          reasoning_text: "",
          closing: "",
        }),
      onStatus(value) {
        status = value;
      },
    },
  );

  assert.deepEqual(result.products, original.products);
  assert.match(result.message, /tersedia 12 pcs/);
  assert.equal(status.provider, "mistral");
  assert.equal(status.naturalized, true);
});
