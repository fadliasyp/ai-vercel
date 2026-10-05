import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProductOpinionReasoning,
  buildRecommendationReasoning,
  extractRecommendationNeeds,
  pickRecommendedProducts,
} from "../lib/chatbot/productRecommendation.js";
import { explainBestRuleBased } from "../lib/chatbot/productRanking.js";
import { humanizeResponse } from "../lib/chatbot/responsePresentation.js";

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

test("keeps complete recommendation reasoning outside the short intro", () => {
  const reasoning = buildRecommendationReasoning(products, {
    wantsCollection: true,
  });
  const response = humanizeResponse(
    {
      type: "products",
      intro: "Ini rekomendasi terbaik yang aku temukan:",
      reasoning_text: reasoning,
      products,
      _noTruncateReasoning: true,
    },
    { intent: "recommendation" },
  );

  assert.equal(response.intro, "Ini rekomendasi terbaik yang aku temukan:");
  assert.equal(response.reasoning_text, reasoning);
  assert.match(response.reasoning_text, /artikulasi terbatas/i);
});

test("treats a stated product price as a recommendation target, not a maximum budget", () => {
  const candidates = [
    {
      id: 1,
      name: "Promo murah",
      numericPrice: 3000000,
      stock: "instock",
      discountPercent: 25,
    },
    {
      id: 2,
      name: "Dekat tujuh",
      numericPrice: 6250000,
      stock: "instock",
    },
    {
      id: 3,
      name: "Tepat tujuh",
      numericPrice: 7000000,
      stock: "instock",
    },
    {
      id: 4,
      name: "Dekat empat",
      numericPrice: 4200000,
      stock: "instock",
    },
  ];
  const sevenMillionNeeds = extractRecommendationNeeds(
    "Rekomendasi dong yang harga 7 jutaan",
  );
  const fourMillionNeeds = extractRecommendationNeeds(
    "Rekomendasi dong yang harga sekitar 4 juta",
  );

  assert.equal(sevenMillionNeeds.targetPrice, 7000000);
  assert.equal(sevenMillionNeeds.budgetMax, null);
  assert.deepEqual(
    pickRecommendedProducts(candidates, sevenMillionNeeds, 3).map(
      (product) => product.id,
    ),
    [3, 2],
  );
  assert.deepEqual(
    pickRecommendedProducts(candidates, fourMillionNeeds, 3).map(
      (product) => product.id,
    ),
    [4],
  );
});

test("keeps explicit recommendation budgets as hard limits", () => {
  const needs = extractRecommendationNeeds(
    "Rekomendasi dong dengan budget maksimal 7 juta",
  );
  const rangeNeeds = extractRecommendationNeeds(
    "Rekomendasi dengan harga 5 juta sampai 7 juta",
  );

  assert.equal(needs.targetPrice, null);
  assert.equal(needs.budgetMax, 7000000);
  assert.equal(rangeNeeds.targetPrice, null);
  assert.equal(rangeNeeds.budgetMin, 5000000);
  assert.equal(rangeNeeds.budgetMax, 7000000);
});

test("treats an approximate budget as a price target and maximum", () => {
  const needs = extractRecommendationNeeds(
    "Bang, rekomendasiin robot yang bagus dong, budget sekitar 12 jutaan",
  );
  const recommendations = pickRecommendedProducts(
    [
      {
        id: 1,
        name: "Promo jauh lebih murah",
        numericPrice: 3000000,
        stock: "instock",
        discountPercent: 25,
      },
      {
        id: 2,
        name: "Dekat target",
        numericPrice: 10000000,
        stock: "instock",
      },
      {
        id: 3,
        name: "Di atas budget",
        numericPrice: 13000000,
        stock: "instock",
      },
    ],
    needs,
    3,
  );

  assert.equal(needs.targetPrice, 12000000);
  assert.equal(needs.budgetMax, 12000000);
  assert.deepEqual(recommendations.map((product) => product.id), [2]);
});

test("uses bare recommendation amounts as targets without distant fallback", () => {
  const variants = [
    "rekomen cok robot 19 jutaan",
    "rekomendasiin robot 19 jutaan dong",
    "ada rekomendasi robot kisaran 19 juta?",
  ];

  for (const question of variants) {
    const needs = extractRecommendationNeeds(question);
    assert.equal(needs.targetPrice, 19000000, question);
    assert.equal(needs.budgetMax, null, question);
  }

  const needs = extractRecommendationNeeds(variants[0]);
  assert.deepEqual(
    pickRecommendedProducts(
      [
        {
          id: 1,
          name: "Promo tiga juta",
          numericPrice: 3000000,
          stock: "instock",
          discountPercent: 25,
        },
        {
          id: 2,
          name: "Dekat sembilan belas juta",
          numericPrice: 18500000,
          stock: "instock",
        },
        {
          id: 3,
          name: "Sembilan juta",
          numericPrice: 9000000,
          stock: "instock",
        },
      ],
      needs,
      3,
    ).map((product) => product.id),
    [2],
  );
  assert.deepEqual(
    pickRecommendedProducts(
      [
        {
          id: 1,
          name: "Promo tiga juta",
          numericPrice: 3000000,
          stock: "instock",
        },
        {
          id: 3,
          name: "Sembilan juta",
          numericPrice: 9000000,
          stock: "instock",
        },
      ],
      needs,
      3,
    ),
    [],
  );
});
