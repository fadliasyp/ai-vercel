import test from "node:test";
import assert from "node:assert/strict";

import {
  SEMANTIC_ROUTER_INTENTS,
  buildSemanticRouterMessages,
  parseSemanticRouterOutput,
} from "../lib/chatbot/semanticRouter.js";

function validOutput(overrides = {}) {
  return {
    scope: "in_scope",
    intent: "price_promo",
    confidence: 0.92,
    entities: {
      product_names: [],
      budget_min: null,
      budget_max: 500000,
      location: null,
      order_id: null,
      tracking_number: null,
    },
    needs_clarification: false,
    clarification_question: null,
    ...overrides,
  };
}

test("semantic router contract contains the chatbot 13 intents", () => {
  assert.equal(SEMANTIC_ROUTER_INTENTS.length, 13);
  assert.equal(new Set(SEMANTIC_ROUTER_INTENTS).size, 13);
  assert.ok(SEMANTIC_ROUTER_INTENTS.includes("compare"));
  assert.ok(SEMANTIC_ROUTER_INTENTS.includes("shipment_tracking"));
});

test("parses fenced JSON and normalizes entities", () => {
  const parsed = parseSemanticRouterOutput(
    `\`\`\`json
${JSON.stringify(
  validOutput({
    entities: {
      product_names: ["  Chogokin GX-47T  ", "Chogokin GX-47T"],
      budget_min: "100000",
      budget_max: "500000",
      location: "  Jakarta Selatan ",
      order_id: null,
      tracking_number: null,
    },
  }),
)}
\`\`\``,
  );

  assert.equal(parsed.intent, "price_promo");
  assert.deepEqual(parsed.entities.product_names, ["Chogokin GX-47T"]);
  assert.equal(parsed.entities.budget_min, 100000);
  assert.equal(parsed.entities.location, "Jakarta Selatan");
});

test("rejects unsupported intent and invalid confidence", () => {
  assert.throws(
    () => parseSemanticRouterOutput(validOutput({ intent: "payment_method" })),
    /Intent semantic router tidak didukung/,
  );
  assert.throws(
    () => parseSemanticRouterOutput(validOutput({ confidence: 1.5 })),
    /Confidence semantic router/,
  );
});

test("requires out-of-scope routes to use general intent", () => {
  assert.throws(
    () =>
      parseSemanticRouterOutput(
        validOutput({
          scope: "out_of_scope",
          intent: "product_discovery",
        }),
      ),
    /out_of_scope wajib memakai intent general/,
  );
});

test("builds compact messages with ecommerce context", () => {
  const messages = buildSemanticRouterMessages({
    question: "yang kedua ready?",
    context: {
      lastIntent: "product_discovery",
      lastTopic: "Chogokin",
      hasPending: false,
      recentProducts: ["Produk A", "Produk B"],
      linguistic: {
        subject: "Robot Jadul",
        predicate: "jual",
        object: "baju",
        negated: true,
        question_type: "yes_no",
        entities: { product_terms: ["baju"] },
      },
      understanding: {
        subject_type: "product",
        domain_question_type: "stock_availability",
        reference_scope: "previous_products",
        required_facts: ["catalog_stock"],
        confidence: 0.95,
        needs_clarification: false,
      },
      contextualTurn: {
        intent: "stock_availability",
        is_follow_up: true,
        expected_answer_type: "previous_products",
        confidence: 0.95,
      },
    },
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  const userPayload = JSON.parse(messages[1].content);
  assert.equal(userPayload.question, "yang kedua ready?");
  assert.deepEqual(userPayload.context.recent_products, [
    "Produk A",
    "Produk B",
  ]);
  assert.deepEqual(userPayload.context.language_analysis, {
    subject: "Robot Jadul",
    predicate: "jual",
    object: "baju",
    negated: true,
    question_type: "yes_no",
    product_terms: ["baju"],
  });
  assert.deepEqual(userPayload.context.question_understanding, {
    subject_type: "product",
    domain_question_type: "stock_availability",
    reference_scope: "previous_products",
    required_facts: ["catalog_stock"],
    confidence: 0.95,
    needs_clarification: false,
  });
  assert.deepEqual(userPayload.context.conversation_turn, {
    intent: "stock_availability",
    is_follow_up: true,
    expected_answer_type: "previous_products",
    confidence: 0.95,
  });
});

test("passes compact Indonesian morphology hints to the semantic router", () => {
  const messages = buildSemanticRouterMessages({
    question: "gimana pembayaran dan pengirimannya?",
    context: {
      linguistic: {
        predicate: "bayar",
        question_type: "wh",
        morphology_stems: ["bayar", "kirim"],
      },
    },
  });
  const payload = JSON.parse(messages[1].content);

  assert.deepEqual(payload.context.language_analysis.morphology_stems, [
    "bayar",
    "kirim",
  ]);
});

test("semantic prompt defines the risky intent boundaries", () => {
  const messages = buildSemanticRouterMessages({
    question: "maks budget 500 ribu dapat apa?",
  });
  const prompt = messages[0].content;

  assert.match(prompt, /tetap price_promo/);
  assert.match(prompt, /asuransi paket/);
  assert.match(prompt, /wajib memakai compare/);
  assert.match(
    prompt,
    /Jam buka, cabang toko, dan kontak admin memakai general/,
  );
  assert.match(prompt, /tidak menanyakan resi/);
  assert.match(prompt, /product_names \["baju"\]/);
  assert.match(prompt, /Robot Jadul adalah toko/);
  assert.match(prompt, /context\.language_analysis/);
  assert.match(prompt, /context\.question_understanding/);
  assert.match(prompt, /context\.conversation_turn/);
  assert.match(prompt, /jangan menebak salah satu makna/);
});
