import test from "node:test";
import assert from "node:assert/strict";

import {
  assessProductSearchConfidence,
  buildProductSearchClarification,
  buildProductSearchOptions,
  findBestSingleProductMatch,
  findBestProductForCompoundRequest,
  findVerifiedPageProduct,
  extractProductSearchTokens,
  extractRequestedCatalogTerm,
  hasSpecificProductSearchTerms,
  looksLikeCurrentProductDetailQuestion,
  looksLikeCurrentProductReference,
  looksLikeCatalogAvailabilityQuestion,
  looksLikeSpecificCatalogAvailabilityQuestion,
  searchProductsForDiscovery,
} from "../lib/chatbot/productSearch.js";

const products = [
  {
    id: 1,
    name: "Soul of Chogokin GX-31 Voltes V",
    category: "Chogokin",
    description: "Robot die-cast Voltes V untuk koleksi.",
    stock: "instock",
  },
  {
    id: 2,
    name: "Super Robot Chogokin Mazinger Z",
    category: "Mazinger",
    description: "Figur robot Mazinger Z.",
    stock: "instock",
  },
];

test("does not return an unrelated ready product for an unknown robot", () => {
  assert.deepEqual(
    searchProductsForDiscovery("ada robot Ultraman di toko?", products),
    [],
  );
  assert.equal(
    findBestSingleProductMatch("cek stok Ultraman", products),
    null,
  );
});

test("finds a catalog product from a specific robot name", () => {
  const result = findBestSingleProductMatch(
    "cari barang Voltes V",
    products,
  );

  assert.equal(result?.id, 1);
  assert.deepEqual(
    extractRequestedCatalogTerm("cari GX-47").split(" "),
    ["gx", "47"],
  );
});

test("ignores conversational connectors after an exact product name", () => {
  const catalog = [
    {
      id: 4691,
      name: "Soul of Chogokin Voltes V 40th Anniversary",
      category: "Chogokin",
      stock: "instock",
    },
    {
      id: 4603,
      name: "Soul of Chogokin GX-31V Voltes V",
      category: "Chogokin",
      stock: "instock",
    },
  ];

  for (const connector of ["terus", "trus", "lalu", "kemudian"]) {
    const result = assessProductSearchConfidence(
      `Min, Soul of Chogokin Voltes V harganya berapa ya? Masih ready stock ngga barangnya, ${connector} kondisinya gimana?`,
      catalog,
    );

    assert.equal(result.status, "matched");
    assert.equal(result.product?.id, 4691);
    assert.deepEqual(result.queryTokens, [
      "soul",
      "of",
      "chogokin",
      "voltes",
      "v",
    ]);
  }
});

test("finds catalog products despite safe customer typos", () => {
  const knownSeriesTypo = findBestSingleProductMatch(
    "cari Chogokinn Maajingerr Z",
    products,
  );
  const catalogOnlyTypo = findBestSingleProductMatch(
    "cari barang Voltess V",
    products,
  );

  assert.equal(knownSeriesTypo?.id, 2);
  assert.equal(catalogOnlyTypo?.id, 1);
});

test("separates confident, ambiguous, and partial product matches", () => {
  const expandedProducts = [
    ...products,
    {
      id: 3,
      name: "Mazinger Z Infinity",
      category: "Mazinger",
      description: "Versi lain Mazinger Z.",
      stock: "instock",
    },
  ];

  const exact = assessProductSearchConfidence(
    "Soul of Chogokin GX-31 Voltes V",
    expandedProducts,
  );
  const typo = assessProductSearchConfidence(
    "Chogokinn GX-31 Voltess V",
    expandedProducts,
  );
  const ambiguous = assessProductSearchConfidence(
    "cek stok Mazinger Z",
    expandedProducts,
  );
  const partial = assessProductSearchConfidence(
    "cari Mazinger Ultraman",
    expandedProducts,
  );

  assert.equal(exact.status, "matched");
  assert.equal(exact.product?.id, 1);
  assert.equal(typo.status, "matched");
  assert.equal(typo.product?.id, 1);
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.product, null);
  assert.ok(ambiguous.candidates.length >= 2);
  assert.match(buildProductSearchClarification(ambiguous), /beberapa produk/i);
  assert.doesNotMatch(
    buildProductSearchClarification(ambiguous),
    /Mazinger Z Infinity/,
  );
  assert.deepEqual(buildProductSearchOptions(ambiguous, "stock_availability"), [
    {
      label: "Super Robot Chogokin Mazinger Z",
      value: "Cek stok Super Robot Chogokin Mazinger Z",
      action_key: "stock_availability",
      required_fields: [],
      product_id: 2,
      product_name: "Super Robot Chogokin Mazinger Z",
    },
    {
      label: "Mazinger Z Infinity",
      value: "Cek stok Mazinger Z Infinity",
      action_key: "stock_availability",
      required_fields: [],
      product_id: 3,
      product_name: "Mazinger Z Infinity",
    },
  ]);
  assert.deepEqual(
    buildProductSearchOptions(ambiguous, "product_detail").map((option) => ({
      action_key: option.action_key,
      product_id: option.product_id,
      product_name: option.product_name,
    })),
    [
      {
        action_key: "product_detail",
        product_id: 2,
        product_name: "Super Robot Chogokin Mazinger Z",
      },
      {
        action_key: "product_detail",
        product_id: 3,
        product_name: "Mazinger Z Infinity",
      },
    ],
  );
  assert.equal(partial.status, "not_found");
  assert.equal(partial.reason, "partial_query_match");
  assert.equal(partial.product, null);
});

test("treats generic product, robot, and stock words as non-specific", () => {
  assert.equal(
    hasSpecificProductSearchTerms("robot atau produk ready apa saja"),
    false,
  );
  assert.equal(
    hasSpecificProductSearchTerms(
      "carikan rekomendasi robot murah untuk anak",
    ),
    false,
  );
  assert.equal(
    hasSpecificProductSearchTerms("carikan Ultraman yang bagus"),
    true,
  );
  assert.equal(
    hasSpecificProductSearchTerms(
      "saya bingung mau cari robot mana, kira-kira kamu punya yang terbaik engga sih?",
    ),
    false,
  );
});

test("ignores conversational action words while matching a product", () => {
  const result = findBestSingleProductMatch(
    "cari produk yang mirip dengan Mazinger Z",
    products,
  );

  assert.equal(result?.id, 2);
});

test("matches a product name embedded in a generated detail action", () => {
  const catalog = [
    {
      id: 9,
      name: "Vintage Gashapon Sasuraiger",
      stock: "instock",
    },
  ];
  const result = assessProductSearchConfidence(
    "Jelaskan kelengkapan Vintage Gashapon Sasuraiger",
    catalog,
  );

  assert.equal(result.status, "matched");
  assert.equal(result.product?.id, 9);
});

test("ignores predictive shopping language around an exact product name", () => {
  const catalog = [
    {
      id: 9,
      name: "Vintage Gashapon Sasuraiger",
      stock: "instock",
    },
  ];

  for (const question of [
    "Apa kelebihan dan kekurangan Vintage Gashapon Sasuraiger sebelum dibeli?",
    "Apa yang perlu diperhatikan sebelum membeli Vintage Gashapon Sasuraiger?",
    "Apakah Vintage Gashapon Sasuraiger cocok dijadikan hadiah?",
  ]) {
    assert.equal(
      assessProductSearchConfidence(question, catalog).product?.id,
      9,
    );
  }
});

test("ignores transaction clauses while matching a product", () => {
  const result = findBestSingleProductMatch(
    "Mazinger Z yang promo masih ready? Kalau dibayar sekarang bisa langsung dikirim hari ini?",
    products,
  );

  assert.equal(result?.id, 2);
});

test("ignores product-fact clauses in compound catalog questions", () => {
  const catalog = [
    ...products,
    {
      id: 3,
      name: "Soul of Chogokin GX-47T Energer Z Test Type",
      category: "Chogokin",
      stock: "instock",
    },
  ];

  const detail = assessProductSearchConfidence(
    "Soul of Chogokin GX-47T Energer Z Test Type kondisinya bagaimana, kelengkapannya apa saja, dan stoknya masih ready?",
    catalog,
  );
  const promo = assessProductSearchConfidence(
    "Soul of Chogokin GX-47T Energer Z Test Type sedang promo dan stoknya ready? Kalau bayar sekarang bisa dikirim hari ini?",
    catalog,
    { preferPromo: false },
  );
  const junkDetail = assessProductSearchConfidence(
    "Popy ST Dynaman ini kondisi dan kelengkapannya gimana? Ada bagian yang hilang atau rusak?",
    [
      {
        id: 4,
        name: "Popy ST Dynaman",
        category: "Vintage",
        stock: "instock",
      },
    ],
  );

  assert.equal(detail.status, "matched");
  assert.equal(detail.product?.id, 3);
  assert.equal(promo.status, "matched");
  assert.equal(promo.product?.id, 3);
  assert.equal(junkDetail.status, "matched");
  assert.equal(junkDetail.product?.id, 4);
});

test("matches an exact catalog name before long return-policy clauses", () => {
  const product = {
    id: 10,
    name: "DX Chogokin Getter Robo",
    category: "Chogokin",
    stock: "instock",
  };
  const result = assessProductSearchConfidence(
    "Ini DX Chogokin Getter Robo part-nya lengkap kan ya, bukan barang JUNK yang kondisinya rusak parah? Kalau pas sampai ternyata part ada yang hilang, syarat retur-nya gimana?",
    [product],
  );

  assert.equal(result.status, "matched");
  assert.equal(result.reason, "exact_catalog_name_mention");
  assert.equal(result.product?.id, 10);
});

test("matches a product family mentioned in the middle of catalog names", () => {
  const question =
    "Halo, ada Getter Robo yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs?";
  const catalog = [
    {
      id: 11,
      name: "Fewture Models EX Gokin Getter Robo Black Version",
      stock: "instock",
      isPromo: true,
    },
    {
      id: 12,
      name: "Sky x Studio Getter Robo G Getter Dragon",
      stock: "instock",
      isPromo: false,
    },
  ];

  assert.deepEqual(extractProductSearchTokens(question), ["getter", "robo"]);

  const result = assessProductSearchConfidence(question, catalog, {
    preferPromo: true,
  });
  assert.equal(result.status, "matched");
  assert.equal(result.product?.id, 11);
});

test("matches short product-name typos without depending on capitalization", () => {
  const catalog = [
    {
      id: 14,
      name: "Fewture Models EX Gokin Getter Robo Black Version",
      stock: "instock",
    },
    {
      id: 15,
      name: "Soul of Chogokin GX-92 IDEON Full Action",
      stock: "instock",
    },
  ];

  const typo = assessProductSearchConfidence(
    "Halo, ada Getter Robbo yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs?",
    catalog,
  );
  const lowerCase = assessProductSearchConfidence(
    "cek harga soul of chogokin gx-92 ideon full action",
    catalog,
  );

  assert.equal(typo.status, "matched");
  assert.equal(typo.product?.id, 14);
  assert.equal(lowerCase.status, "matched");
  assert.equal(lowerCase.product?.id, 15);
});

test("selects a newly named product instead of stale prior candidates", () => {
  const result = assessProductSearchConfidence(
    "Mau tanya detail bahan buat Mazinger Z yang Jumbo Machinder, itu full die-cast ngga? Harganya berapa nett-nya?",
    [
      { id: 21, name: "Vintage Godaikin Godmars", stock: "instock" },
      {
        id: 22,
        name: "Jumbo Machinder Mazinger Z",
        stock: "instock",
        description: "Material plastik dan die-cast untuk koleksi.",
      },
      { id: 23, name: "Action Gokin Godmars", stock: "instock" },
    ],
  );

  assert.equal(result.status, "matched");
  assert.equal(result.product?.id, 22);
  assert.deepEqual(result.candidates.map((product) => product.id), [22]);
});

test("uses catalog name phrases without treating unknown detail words as the product", () => {
  const catalog = [
    {
      id: 13,
      name: "Fewture Models EX Gokin Getter Robo Black Version",
      stock: "instock",
    },
  ];
  const result = assessProductSearchConfidence(
    "Min, Getter Robo ini bonus stand bawaannya ada dan kondisinya mulus?",
    catalog,
  );

  assert.equal(result.status, "matched");
  assert.equal(result.reason, "catalog_name_phrase_match");
  assert.equal(result.product?.id, 13);
});

test("finds a non-promo catalog product before evaluating its promotion", () => {
  const catalog = [
    {
      id: 92,
      name: "Soul of Chogokin GX-92 Ideon Full Action",
      stock: "instock",
      stockQuantity: 2,
      isPromo: false,
    },
    {
      id: 99,
      name: "Unrelated Robot Promo",
      stock: "instock",
      isPromo: true,
    },
  ];
  const matches = searchProductsForDiscovery(
    "Halo, ada Ideon yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs?",
    catalog,
  );

  assert.deepEqual(matches.map((product) => product.id), [92]);
  assert.equal(matches[0].stockQuantity, 2);
  assert.equal(matches[0].isPromo, false);
});

test("prefers the matching promo product for a compound request", () => {
  const result = findBestProductForCompoundRequest(
    "Mazinger Z yang promonya masih ready dan bisa dikirim hari ini?",
    [
      { ...products[1], id: 3, name: "Mazinger Z Standard", isPromo: false },
      { ...products[1], id: 4, name: "Mazinger Z Promo", isPromo: true },
    ],
  );

  assert.equal(result?.id, 4);
});

test("treats Robot Jadul as the store name and keeps the requested item", () => {
  assert.equal(
    hasSpecificProductSearchTerms("di Robot Jadul ini jual apaaaa aja?"),
    false,
  );
  assert.equal(
    extractRequestedCatalogTerm("jual topi juga enggaa sih luy?"),
    "topi",
  );
});

test("extracts the merchandise object instead of the store context", () => {
  assert.equal(
    extractRequestedCatalogTerm("ditoko ini jual baju juga ga"),
    "baju",
  );
  assert.equal(
    extractRequestedCatalogTerm("apakah di toko ini tersedia kaos?"),
    "kaos",
  );
  assert.equal(
    extractRequestedCatalogTerm("Voltes V ada engga?"),
    "voltes v",
  );
  assert.equal(
    looksLikeCatalogAvailabilityQuestion("ditoko ini jual baju juga ga"),
    true,
  );
  assert.equal(
    looksLikeCatalogAvailabilityQuestion("tolong carikan Mazinger Z"),
    false,
  );
  assert.equal(
    looksLikeSpecificCatalogAvailabilityQuestion(
      "apakah ada Soul of Chogokin Ultraman Hyper X?",
    ),
    true,
  );
  assert.equal(
    looksLikeSpecificCatalogAvailabilityQuestion("stok Mazinger Z masih ada?"),
    false,
  );
  assert.equal(
    looksLikeSpecificCatalogAvailabilityQuestion(
      "Popy ST Dynaman ini kondisinya bagaimana, ada bagian yang hilang atau rusak?",
    ),
    false,
  );
  assert.equal(
    looksLikeSpecificCatalogAvailabilityQuestion(
      "Ada alternatif yang lebih worth it?",
    ),
    false,
  );
});

test("recognizes current-page product references and separates detail from retur", () => {
  assert.equal(looksLikeCurrentProductReference("stok produk ini masih ada?"), true);
  assert.equal(looksLikeCurrentProductReference("harganya berapa?"), true);
  assert.equal(
    looksLikeCurrentProductDetailQuestion("produk ini JUNK, bagian mana rusak?"),
    true,
  );
  assert.equal(
    looksLikeCurrentProductDetailQuestion(
      "produk ini datang rusak, bisa refund?",
    ),
    false,
  );
});

test("uses page context only when it matches the official catalog", () => {
  const catalog = products.map((product) => ({
    ...product,
    link: `https://fadli.site/product/${product.id === 1 ? "voltes-v" : "mazinger-z"}/`,
  }));

  assert.equal(
    findVerifiedPageProduct(
      { productId: 2, productName: "Nama palsu", url: "https://evil.test/x" },
      catalog,
    )?.id,
    2,
  );
  assert.equal(
    findVerifiedPageProduct(
      { url: "https://fadli.site/product/voltes-v/?utm_source=test" },
      catalog,
    )?.id,
    1,
  );
  assert.equal(
    findVerifiedPageProduct({ productName: "Produk Tidak Ada" }, catalog),
    null,
  );
});
