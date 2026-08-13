import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActiveConversationGoal,
  focusActiveConversationGoal,
  resolveConversationTurn,
} from "../lib/chatbot/conversationGoal.js";

const products = [
  { id: 11, name: "Robot Alpha", numericPrice: 9000000 },
  { id: 22, name: "Robot Beta", numericPrice: 7000000 },
  { id: 33, name: "Robot Gamma", numericPrice: 8000000 },
];

test("resolves ordinal and ranked product references", () => {
  const second = resolveConversationTurn("yang kedua ready?", {
    lastProducts: products,
  });
  assert.equal(second.question, "Robot Beta ready?");
  assert.deepEqual(second.referencedProducts, [products[1]]);

  const last = resolveConversationTurn("cek kondisi produk terakhir", {
    lastProducts: products,
  });
  assert.equal(last.question, "cek kondisi Robot Gamma");

  const cheapest = resolveConversationTurn("kondisi yang termurah gimana?", {
    lastProducts: products,
  });
  assert.equal(cheapest.question, "kondisi Robot Beta gimana?");
});

test("resolves two previous products without losing comparison wording", () => {
  const result = resolveConversationTurn(
    "bandingkan yang pertama dengan yang ketiga",
    { lastProducts: products },
  );

  assert.equal(
    result.question,
    "bandingkan Robot Alpha dengan Robot Gamma",
  );
  assert.deepEqual(result.referencedProducts, [products[0], products[2]]);
});

test("uses the corrected value and ignores the rejected budget", () => {
  const result = resolveConversationTurn(
    "bukan 5 juta, maksud saya 7 juta",
    {
      lastIntent: "recommendation",
      activeGoal: { intent: "recommendation", category: "chogokin" },
    },
  );

  assert.equal(result.question, "rekomendasi chogokin budget 7 juta");
  assert.deepEqual(result.correction, {
    type: "budget",
    min: null,
    max: 7000000,
  });

  assert.equal(
    resolveConversationTurn("7,5 juta mksdnya", {
      activeGoal: { intent: "recommendation" },
    }).question,
    "rekomendasi robot budget 7,5 juta",
  );
});

test("uses the corrected product and keeps the active intent", () => {
  const result = resolveConversationTurn(
    "bukan yang pertama, maksudnya yang kedua",
    {
      lastProducts: products,
      activeGoal: { intent: "product_detail" },
    },
  );

  assert.equal(result.question, "detail Robot Beta");
  assert.deepEqual(result.correction, { type: "product", productId: 22 });
});

test("does not confuse a product model number with an ordinal reference", () => {
  const result = resolveConversationTurn("Getter 2 ready?", {
    lastProducts: products,
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.referencedProducts, []);
});

test("keeps a compact product goal and preserves it across shipping", () => {
  const goal = buildActiveConversationGoal(null, {
    intent: "recommendation",
    products,
    slots: { budgetMin: 7000000, budgetMax: 9500000 },
    filters: { stockOnly: true },
  });

  assert.equal(goal.intent, "recommendation");
  assert.deepEqual(goal.productNames, products.map((product) => product.name));
  assert.equal(goal.constraints.budgetMax, 9500000);
  assert.equal(goal.focusedProductName, null);
  assert.equal(
    buildActiveConversationGoal(goal, { intent: "shipping_transaction" }),
    goal,
  );

  const focused = focusActiveConversationGoal(goal, products[1]);
  assert.equal(focused.focusedProductName, "Robot Beta");

  const narrowed = buildActiveConversationGoal(focused, {
    intent: "product_detail",
    products: [products[1]],
  });
  assert.equal(narrowed.products.length, 3);

  const counterpart = resolveConversationTurn("cek kondisi yang satunya", {
    activeGoal: {
      ...narrowed,
      products: narrowed.products.slice(0, 2),
    },
    lastProducts: [products[1]],
  });
  assert.equal(counterpart.question, "cek kondisi Robot Alpha");
});
