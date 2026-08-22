import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProductOpinionReasoning,
  buildRecommendationReasoning,
} from "../lib/chatbot/productRecommendation.js";
import { explainBestRuleBased } from "../lib/chatbot/productRanking.js";

const products = [
  {
    id: 1,
    name: "Robot Alpha",
    numericPrice: 2500000,
    stock: "instock",
    condition: "BIB",
    recommendationReasons: ["ready stock", "menarik untuk koleksi"],
    description:
      "Kelebihan: fungsi normal dan aksesori lengkap. Kekurangan: sudut box sedikit penyok.",
  },
  {
    id: 2,
    name: "Robot Beta",
    numericPrice: 2000000,
    stock: "instock",
    condition: "OFC",
    description:
      "Kelebihan: kondisi mulus dan tidak ada part hilang. Kekurangan: artikulasi terbatas.",
  },
];

test("recommendation fallback includes catalog strengths and caveats", () => {
  const reasoning = buildRecommendationReasoning(products, {
    wantsCollection: true,
    readyOnly: true,
  });

  assert.match(reasoning, /Robot Alpha/);
  assert.match(reasoning, /aksesori lengkap/i);
  assert.match(reasoning, /box sedikit penyok/i);
  assert.match(reasoning, /Robot Beta/);
  assert.match(reasoning, /tidak ada part hilang/i);
  assert.match(reasoning, /artikulasi terbatas/i);
});

test("opinion and legacy ranking use the same WooCommerce description notes", () => {
  const opinion = buildProductOpinionReasoning(
    products[0],
    "Apa kelebihan dan kekurangannya untuk koleksi?",
  );
  const ranked = explainBestRuleBased(
    products[0],
    products,
    "Mana yang paling bagus dan worth it?",
  );

  for (const output of [opinion, ranked]) {
    assert.match(output, /aksesori lengkap/i);
    assert.match(output, /box sedikit penyok/i);
  }
  assert.match(ranked, /artikulasi terbatas/i);
});
