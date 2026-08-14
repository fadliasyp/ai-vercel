import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeCompoundQuestion,
  appendAnswerSections,
  answerPlanIncludes,
  buildAnswerPlan,
  compactAnswerPlan,
  compactCompoundQuestionAnalysis,
  prependAnswerSections,
  productMatchesCompoundConstraints,
} from "../lib/chatbot/compoundQuestion.js";

const products = [
  {
    id: 1,
    name: "Robot Alpha",
    numericPrice: 7500000,
    stock: "instock",
    condition: "Bagus dan lengkap",
    discountPercent: 10,
  },
  {
    id: 2,
    name: "Robot Beta",
    numericPrice: 6500000,
    stock: "outofstock",
    condition: "Bagus",
    discountPercent: 0,
  },
  {
    id: 3,
    name: "Robot Gamma",
    numericPrice: 7000000,
    stock: "instock",
    condition: "JUNK, ada part patah",
    discountPercent: 15,
  },
];

test("decomposes a compound recommendation into independent constraints", () => {
  const result = analyzeCompoundQuestion(
    "Carikan yang ready, di bawah 8 juta, kondisinya bagus, dan cocok untuk hadiah",
  );

  assert.equal(result.isCompound, true);
  assert.equal(result.primaryIntent, "recommendation");
  assert.equal(result.needsClarification, false);
  assert.ok(result.confidence >= 0.9);
  assert.deepEqual(result.constraints, {
    budgetMin: null,
    budgetMax: 8000000,
    stock: "ready",
    condition: "good",
    purposes: ["gift"],
    promoOnly: false,
  });
  assert.ok(result.facets.includes("stock"));
  assert.ok(result.facets.includes("budget"));
  assert.ok(result.facets.includes("product_condition"));
});

test("understands abbreviated conversational Indonesian", () => {
  const result = analyzeCompoundQuestion(
    "yg ready dibawah 8jt, kondisi bagus, bwt kado",
  );

  assert.equal(result.primaryIntent, "recommendation");
  assert.equal(result.constraints.budgetMax, 8000000);
  assert.equal(result.constraints.stock, "ready");
  assert.deepEqual(result.constraints.purposes, ["gift"]);

  const selection = analyzeCompoundQuestion(
    "carikan yang ready di bawah 8 juta dan kondisinya mulus",
  );
  assert.equal(selection.primaryIntent, "recommendation");
});

test("asks for clarification only when a previous-product reference is unresolved", () => {
  const ambiguous = analyzeCompoundQuestion("Jelaskan kondisi produk itu", {
    recentProducts: products,
  });

  assert.equal(ambiguous.needsClarification, true);
  assert.equal(
    ambiguous.clarificationKind,
    "ambiguous_product_reference",
  );
  assert.equal(ambiguous.clarificationOptions.length, 3);
  assert.equal(
    ambiguous.clarificationOptions[1].value,
    "Jelaskan kondisi Robot Beta",
  );
  assert.ok(ambiguous.confidence <= 0.5);

  const focused = analyzeCompoundQuestion("Jelaskan kondisi produk itu", {
    recentProducts: products,
    focusedProductName: "Robot Beta",
  });
  assert.equal(focused.needsClarification, false);
});

test("does not reuse old products when a compound question names a new product", () => {
  const previousProducts = [
    { id: 1, name: "Vintage Godaikin Godmars" },
    { id: 2, name: "Action Gokin Godmars By Action Toys" },
  ];

  for (const question of [
    "Halo, ada Getter Robo yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs?",
    "Mau tanya detail bahan buat Mazinger Z yang Jumbo Machinder, itu full die-cast ngga? Harganya berapa nett-nya?",
  ]) {
    const result = analyzeCompoundQuestion(question, {
      recentProducts: previousProducts,
    });

    assert.equal(result.needsClarification, false);
    assert.notEqual(result.clarificationKind, "ambiguous_product_reference");
  }
});

test("keeps a material pronoun question attached to the previous product", () => {
  const result = analyzeCompoundQuestion(
    "Produk itu bahannya full die-cast atau plastik dan kondisinya bagus?",
    {
      recentProducts: [
        { id: 1, name: "Robot Alpha" },
        { id: 2, name: "Robot Beta" },
      ],
    },
  );

  assert.equal(result.needsClarification, true);
  assert.equal(result.clarificationKind, "ambiguous_product_reference");
});

test("asks for a corrected budget when minimum exceeds maximum", () => {
  const result = analyzeCompoundQuestion(
    "Carikan robot di atas 8 juta dan di bawah 5 juta untuk hadiah",
  );

  assert.equal(result.needsClarification, true);
  assert.equal(result.clarificationKind, "conflicting_budget");
  assert.ok(result.clarificationQuestion.includes("budget"));
});

test("keeps every hard recommendation constraint during product filtering", () => {
  const analysis = analyzeCompoundQuestion(
    "Carikan yang ready, di bawah 8 juta, kondisinya bagus, promo, untuk hadiah",
  );

  assert.equal(productMatchesCompoundConstraints(products[0], analysis), true);
  assert.equal(productMatchesCompoundConstraints(products[1], analysis), false);
  assert.equal(productMatchesCompoundConstraints(products[2], analysis), false);

  assert.equal(
    productMatchesCompoundConstraints(
      {
        name: "Robot Delta",
        numericPrice: 6000000,
        stock: "instock",
        description: "Kondisi barang masih bagus dan fungsi normal.",
        discountPercent: 5,
      },
      analysis,
    ),
    true,
  );
});

test("compacts the compound frame before sending it to an LLM", () => {
  const compact = compactCompoundQuestionAnalysis(
    analyzeCompoundQuestion(
      "Carikan yang ready di bawah 8 juta, kondisi bagus, untuk hadiah",
    ),
  );

  assert.equal(compact.primary_intent, "recommendation");
  assert.equal(compact.constraints.stock, "ready");
  assert.ok(JSON.stringify(compact).length < 500);
});

test("plans product facts and shipping quote as ordered answer sections", () => {
  const plan = buildAnswerPlan(
    analyzeCompoundQuestion(
      "Cek kondisi produk ini, ada promo, dan ongkir ke Bandung berapa?",
    ),
  );

  assert.equal(plan.isMultiSection, true);
  assert.equal(plan.requiresProduct, true);
  assert.deepEqual(
    plan.sections.map((section) => section.key),
    ["product_facts", "shipping_quote"],
  );
  assert.equal(answerPlanIncludes(plan, "shipping_quote"), true);
  assert.ok(JSON.stringify(compactAnswerPlan(plan)).length < 400);

  const threeSections = buildAnswerPlan(
    analyzeCompoundQuestion(
      "Cek kondisi dan promo produk ini, bisa COD, lalu cek ongkir ke Bandung",
    ),
  );
  assert.deepEqual(
    threeSections.sections.map((section) => section.key),
    ["product_facts", "transaction_policy", "shipping_quote"],
  );
});

test("keeps price and stock together in one product-facts plan", () => {
  const analysis = analyzeCompoundQuestion(
    "Hrg Getter Robo brp, masih redy?",
  );
  const plan = buildAnswerPlan(analysis);

  assert.equal(analysis.primaryIntent, "price_promo");
  assert.deepEqual(analysis.facets, ["price", "stock"]);
  assert.deepEqual(plan.sections, [
    { key: "product_facts", facets: ["price", "stock"] },
  ]);
});

test("plans material and price as product facts", () => {
  const analysis = analyzeCompoundQuestion(
    "Mazinger Z Jumbo Machinder ini full die-cast nggak? Harganya berapa?",
  );
  const plan = buildAnswerPlan(analysis);

  assert.equal(analysis.primaryIntent, "product_detail");
  assert.deepEqual(analysis.facets, ["material", "price"]);
  assert.deepEqual(plan.sections, [
    { key: "product_facts", facets: ["material", "price"] },
  ]);
});

test("plans dimensions before an international shipping quote", () => {
  const analysis = analyzeCompoundQuestion(
    "Voltes V Legacy tingginya berapa cm dan ongkir ke Malaysia berapa?",
  );
  const plan = buildAnswerPlan(analysis);

  assert.deepEqual(analysis.facets, ["dimensions", "shipping_quote"]);
  assert.deepEqual(plan.sections, [
    { key: "product_facts", facets: ["dimensions"] },
    { key: "shipping_quote", facets: ["shipping_quote"] },
  ]);
});

test("keeps recommendation primary across payment and shipping clauses", () => {
  const analysis = analyzeCompoundQuestion(
    "Ada rekomendasi robot jadul budget di bawah 2 juta? Sama ongkir ke Bandung kena berapa dan bisa bayar pakai apa aja",
  );
  const plan = buildAnswerPlan(analysis);

  assert.equal(analysis.primaryIntent, "recommendation");
  assert.equal(analysis.constraints.budgetMax, 2000000);
  assert.deepEqual(
    plan.sections.map((section) => section.key),
    ["recommendation", "transaction_policy", "shipping_quote"],
  );
});

test("plans product facts before return policy in a compound concern", () => {
  const analysis = analyzeCompoundQuestion(
    "Ini DX Chogokin Getter Robo part-nya lengkap kan ya, bukan barang JUNK yang kondisinya rusak parah? Kalau pas sampai ternyata part ada yang hilang, syarat retur-nya gimana?",
  );
  const plan = buildAnswerPlan(analysis);

  assert.equal(analysis.primaryIntent, "return_product");
  assert.deepEqual(analysis.facets, [
    "product_condition",
    "completeness",
    "return_policy",
  ]);
  assert.deepEqual(
    plan.sections.map((section) => section.key),
    ["product_facts", "return_policy"],
  );
});

test("does not invent a catalog lookup for an implicit post-purchase issue", () => {
  const analysis = analyzeCompoundQuestion(
    "Pas dibuka ternyata ada part yang hilang, ngurusnya gimana?",
  );
  const plan = buildAnswerPlan(analysis);

  assert.equal(analysis.primaryIntent, "return_product");
  assert.deepEqual(analysis.facets, ["return_policy"]);
  assert.deepEqual(
    plan.sections.map((section) => section.key),
    ["return_policy"],
  );
});

test("prepends completed answer sections without changing response controls", () => {
  const payload = prependAnswerSections(
    {
      type: "options",
      intro: "Pilih kecamatan tujuan:",
      options: [{ label: "Coblong", value: "Coblong" }],
    },
    ["**Informasi produk**\n- Kondisi: bagus\n- Promo: aktif"],
  );

  assert.match(payload.intro, /Informasi produk/);
  assert.match(payload.intro, /Pilih kecamatan tujuan/);
  assert.equal(payload.options.length, 1);
});

test("appends supporting sections after the primary recommendation", () => {
  const payload = appendAnswerSections(
    {
      type: "products",
      intro: "Ini rekomendasi di bawah 2 juta:",
      products: [{ name: "Robot Alpha" }],
    },
    ["Metode pembayaran: QRIS.", "Sebutkan kecamatan tujuan."],
  );

  assert.ok(payload.intro.indexOf("rekomendasi") < payload.intro.indexOf("QRIS"));
  assert.ok(payload.intro.indexOf("QRIS") < payload.intro.indexOf("kecamatan"));
  assert.equal(payload.products.length, 1);
});
