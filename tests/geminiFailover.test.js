import test from "node:test";
import assert from "node:assert/strict";

import { classifyCommerceWithGemini } from "../lib/chatbot/gemini.js";

test("Gemini fallback returns the same structured semantic contract", async () => {
  const route = await classifyCommerceWithGemini({
    question: "Getter Robo lagi promo dan stoknya berapa?",
    context: { lastIntent: "general" },
    generateImpl: async () => ({
      model: "gemini-test",
      response: {
        text: JSON.stringify({
          scope: "in_scope",
          intent: "price_promo",
          intents: ["price_promo", "stock_availability"],
          goals: ["promo", "stock"],
          confidence: 0.96,
          entities: {
            product_names: ["Getter Robo"],
            budget_min: null,
            budget_max: null,
            location: null,
            order_id: null,
            tracking_number: null,
          },
          requires_product: true,
          topic_relation: "new_topic",
          needs_clarification: false,
          clarification_question: null,
        }),
      },
    }),
  });

  assert.equal(route.provider, "gemini");
  assert.equal(route.model, "gemini-test");
  assert.equal(route.intent, "price_promo");
  assert.deepEqual(route.goals, ["promo", "stock"]);
  assert.deepEqual(route.entities.product_names, ["Getter Robo"]);
});
