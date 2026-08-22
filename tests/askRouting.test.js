import test from "node:test";
import assert from "node:assert/strict";

const PRODUCTS = [
  product({
    id: 1,
    name: "SOC Bandai 50th Anniversary Godmars",
    price: "5250000",
    stockQuantity: 3,
  }),
  product({
    id: 2,
    name: "Fewture Models EX Gokin Getter Robo Black Version",
    price: "5000000",
    regularPrice: "6000000",
    salePrice: "5000000",
    stockQuantity: 7,
  }),
  product({
    id: 3,
    name: "Action Toys Ideon",
    price: "4500000",
    regularPrice: "5000000",
    salePrice: "4500000",
    stockQuantity: 4,
  }),
  product({
    id: 4,
    name: "Jumbo Machinder Mazinger Z",
    price: "7000000",
    stockQuantity: 2,
    description:
      "Kondisi BIB. Material die-cast dan ABS. Kelengkapan sesuai foto.",
  }),
  product({
    id: 5,
    name: "Robot Damashii Voltes V Legacy",
    price: "3500000",
    stockQuantity: 5,
    dimensions: { length: "18", width: "12", height: "17" },
  }),
  product({
    id: 6,
    name: "Shokugan Modeling Project Voltes V Legacy : Lets Volt In Set",
    price: "4200000",
    stockQuantity: 3,
    dimensions: { length: "24", width: "16", height: "21" },
  }),
  product({
    id: 7,
    name: "Shokugan Modeling Project Voltes V Legacy",
    price: "2800000",
    stockQuantity: 4,
    dimensions: { length: "20", width: "14", height: "19" },
  }),
  product({
    id: 8,
    name: "Super Robot Wars Action Robo Part 3 Voltes V White Color",
    price: "1800000",
    stockQuantity: 1,
    description:
      "Part koleksi dengan informasi kondisi JUNK, bagian rusak, dan syarat retur.",
  }),
  product({
    id: 9,
    name: "Shokugan Modeling Project Grendizer U",
    price: "650000",
    stockQuantity: 2,
    description:
      "Kondisi BIB, bukan JUNK. Kelengkapan part sesuai foto dan tidak ada part yang hilang.",
  }),
  product({
    id: 10,
    name: "Comparison Robot Alpha",
    price: "10000000",
    stockQuantity: 2,
    description:
      "Kelebihan: fungsi normal dan aksesori lengkap. Kekurangan: sudut box sedikit penyok.",
  }),
  product({
    id: 11,
    name: "Comparison Robot Beta",
    price: "2000000",
    stockQuantity: 2,
    description:
      "Kelebihan: kondisi mulus dan tidak ada part hilang. Kekurangan: artikulasi terbatas.",
  }),
];

function product({
  id,
  name,
  price,
  regularPrice = price,
  salePrice = "",
  stockQuantity,
  description = "Kondisi BIB dan kelengkapan sesuai foto.",
  dimensions = { length: "30", width: "20", height: "40" },
}) {
  return {
    id,
    name,
    type: "simple",
    permalink: `https://catalog.test/product/${id}`,
    price,
    regular_price: regularPrice,
    sale_price: salePrice,
    stock_status: "instock",
    stock_quantity: stockQuantity,
    images: [],
    categories: [{ id: 1, name: "Chogokin" }],
    description,
    short_description: description,
    meta_data: [{ key: "condition", value: "BIB" }],
    weight: "1000",
    dimensions,
    total_sales: 10,
    average_rating: "5",
    rating_count: 2,
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      return null;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };
}

function productNames(payload = {}) {
  return (payload.products || []).map((item) => item.name);
}

test("routes real customer turns without stale products or fallback collisions", async () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  process.env.WC_KEY = "test-key";
  process.env.WC_SECRET = "test-secret";
  process.env.WC_PRODUCTS_URL = "https://catalog.test/products";
  process.env.GROQ_ROUTER_ENABLED = "false";
  process.env.GROQ_NATURALIZER_ENABLED = "false";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.INTENT_API_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  global.fetch = async (url) => {
    const requestUrl = new URL(String(url));
    if (requestUrl.hostname === "catalog.test") {
      return new Response(JSON.stringify(PRODUCTS), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (
      requestUrl.hostname === "fadli.site" &&
      requestUrl.pathname.includes("/wp-json/wp/v2/pages")
    ) {
      return new Response(
        JSON.stringify([
          {
            content: {
              rendered:
                '<ol><li>Pilih produk yang ingin dibeli.</li><li>Tambahkan produk ke keranjang lalu checkout.</li></ol><img src="https://fadli.site/how-to-buy-step.jpg">',
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected network request: ${url}`);
  };

  try {
    const { default: handler } = await import("../api/ask.js");
    const sessionId = `routing_test_${Date.now()}`;
    const ask = async (question, pageContext = null, request = {}) => {
      const response = createResponse();
      await handler(
        {
          method: "POST",
          url: "/api/ask",
          headers: { "x-session-id": sessionId },
          body: { question, history: [], pageContext, ...request },
        },
        response,
      );
      assert.equal(response.statusCode, 200, JSON.stringify(response.payload));
      return response.payload;
    };

    const greeting = await ask("halo", null, { isBootstrap: true });
    assert.equal(greeting.intent, "greeting");
    assert.deepEqual(greeting.actions, [
      "Cari robot yang ready stock",
      "Minta rekomendasi robot sesuai budget",
      "Lihat produk yang sedang promo",
      "Bagaimana cara membeli produk?",
      "Cari produk kategori Chogokin",
      "Cari produk kategori Vintage",
    ]);
    assert.equal(greeting.actions_metadata.length, 6);

    const recommendation = await ask(
      "Rekomendasikan robot yang paling worth it dan ready stock",
    );
    assert.equal(recommendation.intent, "recommendation");
    assert.equal(recommendation.type, "products");
    assert.ok(productNames(recommendation).length > 0);
    assert.match(recommendation.intro, /rekomendasi|pilih/i);
    assert.match(recommendation.reasoning_text, /bukan JUNK/i);
    assert.match(recommendation.reasoning_text, /tidak ada part yang hilang/i);
    assert.doesNotMatch(recommendation.reasoning_text, /\.\.\.|…$/);

    const internationalQuestion =
      "Ini Voltes V Legacy ukurannya berapa cm ya tingginya? Kalau kirim ke Malaysia ongkirnya berapa dan total harganya jadi berapa USD?";
    const productChoice = await ask(internationalQuestion);
    assert.equal(productChoice.type, "options");
    assert.equal(productChoice.options.length, 3);
    assert.equal(
      (productChoice.intro.match(/Aku menemukan beberapa produk/gi) || [])
        .length,
      1,
    );
    assert.doesNotMatch(productChoice.intro, /Sebutkan nama atau kode/i);
    assert.match(productChoice.intro, /tinggi produk/i);
    assert.match(productChoice.intro, /harga dan total dalam USD/i);
    assert.match(productChoice.intro, /ongkir ke Malaysia/i);
    assert.match(productChoice.intro, /setelah itu/i);

    const selectedProduct = productChoice.options[0];
    const internationalAnswer = await ask(selectedProduct.value, null, {
      isSuggestionClick: true,
      suggestedAction: selectedProduct,
    });
    const internationalText = [
      internationalAnswer.intro,
      internationalAnswer.message,
      internationalAnswer.reasoning_text,
    ]
      .filter(Boolean)
      .join("\n");
    assert.equal(internationalAnswer.intent, "shipping_transaction");
    assert.match(internationalText, /Robot Damashii Voltes V Legacy/);
    assert.match(internationalText, /T: 17 cm/);
    assert.match(internationalText, /Malaysia/);
    assert.match(internationalText, /Total dalam USD/);
    assert.doesNotMatch(internationalText, /kota\/kabupaten|kecamatan tujuan/i);
    assert.ok(internationalAnswer.admin_handoff);

    const manualProductChoice = await ask(internationalQuestion);
    assert.equal(manualProductChoice.type, "options");
    const manuallySelectedProduct = manualProductChoice.options[1];
    const manualInternationalAnswer = await ask(
      manuallySelectedProduct.label,
    );
    const manualInternationalText = [
      manualInternationalAnswer.intro,
      manualInternationalAnswer.message,
      manualInternationalAnswer.reasoning_text,
    ]
      .filter(Boolean)
      .join("\n");
    assert.ok(manualInternationalText.includes(manuallySelectedProduct.label));
    assert.match(manualInternationalText, /T: 21 cm/);
    assert.match(manualInternationalText, /Malaysia/);
    assert.ok(manualInternationalAnswer.admin_handoff);

    const godmars = await ask("Cari produk Godmars");
    assert.equal(godmars.intent, "product_discovery");
    assert.deepEqual(productNames(godmars), [
      "SOC Bandai 50th Anniversary Godmars",
    ]);

    const getter = await ask(
      "Halo, ada Getter Robo yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs sih",
    );
    assert.equal(getter.intent, "price_promo");
    assert.deepEqual(productNames(getter), [
      "Fewture Models EX Gokin Getter Robo Black Version",
    ]);
    assert.equal(getter.products[0].stockQuantity, 7);
    assert.equal(getter.admin_handoff, undefined);
    assert.deepEqual(getter.assistant_meta.answer_coverage.requested, [
      "stock",
      "promo",
    ]);

    const mazinger = await ask(
      "Mau tanya detail bahan buat Mazinger Z yang Jumbo Machinder, itu full die-cast ngga? Harganya berapa nett-nya?",
    );
    assert.ok(
      productNames(mazinger).some((name) => /Jumbo Machinder Mazinger Z/i.test(name)),
      JSON.stringify(mazinger),
    );
    assert.ok(
      productNames(mazinger).every((name) => !/Godmars|Getter Robo/i.test(name)),
    );
    assert.deepEqual(mazinger.assistant_meta.answer_coverage.requested, [
      "material",
      "price",
    ]);

    const grendizerReturn = await ask(
      "Ini Grendizer U part-nya lengkap kan ya, bukan barang JUNK yang kondisinya rusak parah? Kalau pas sampai ternyata part ada yang hilang, syarat retur-nya gimana?",
    );
    const grendizerReturnText = [
      grendizerReturn.intro,
      grendizerReturn.message,
      grendizerReturn.reasoning_text,
    ]
      .filter(Boolean)
      .join("\n");
    assert.equal(grendizerReturn.intent, "return_product");
    assert.match(
      grendizerReturnText,
      /Shokugan Modeling Project Grendizer U/,
    );
    assert.match(grendizerReturnText, /bukan JUNK/i);
    assert.match(grendizerReturnText, /syarat|klaim|retur/i);
    assert.doesNotMatch(grendizerReturnText, /belum bisa dipastikan dari katalog/i);

    const mazingerFromGetterPage = await ask(
      "Mau tanya detail bahan buat Mazinger Z yang Jumbo Machinder, itu full die-cast ngga? Harganya berapa nett-nya?",
      {
        productId: 2,
        productName: "Fewture Models EX Gokin Getter Robo Black Version",
        url: "https://catalog.test/product/2",
      },
    );
    assert.deepEqual(productNames(mazingerFromGetterPage), [
      "Jumbo Machinder Mazinger Z",
    ]);
    assert.notEqual(
      mazingerFromGetterPage.product_match?.reason,
      "verified_page_context",
    );
    assert.match(mazingerFromGetterPage.reasoning_text, /die-cast dan ABS/i);

    const implicitGetterPageQuestion = await ask("harganya berapa?", {
      productId: 2,
      productName: "Fewture Models EX Gokin Getter Robo Black Version",
      url: "https://catalog.test/product/2",
    });
    assert.deepEqual(productNames(implicitGetterPageQuestion), [
      "Fewture Models EX Gokin Getter Robo Black Version",
    ]);
    assert.equal(
      implicitGetterPageQuestion.product_match?.reason,
      "verified_page_context",
    );

    const ideon = await ask(
      "halo, ada ideon yang lagi diskon ngga? kalau ada ready stock sisa berapa PCS?",
    );
    assert.equal(ideon.intent, "price_promo");
    assert.deepEqual(productNames(ideon), ["Action Toys Ideon"]);
    assert.equal(ideon.products[0].stockQuantity, 4);

    const detailPrompt = await ask("detail produk");
    assert.equal(detailPrompt.intent, "product_detail");
    assert.match(detailPrompt.message, /nama atau kode produk/i);
    assert.equal(detailPrompt.admin_handoff, undefined);

    const ideonDetail = await ask("Action Toys Ideon");
    assert.equal(ideonDetail.intent, "product_detail");
    assert.deepEqual(productNames(ideonDetail), ["Action Toys Ideon"]);

    const admin = await ask("Boleh minta nomor admin?");
    assert.equal(admin.intent, "general");
    assert.ok(admin.admin_handoff);
    assert.doesNotMatch(admin.message, /sebutkan nama produk/i);

    const howToBuy = await ask(
      "Langkah checkout di website ini seperti apa?",
    );
    assert.equal(howToBuy.type, "how_to_buy");
    assert.equal(howToBuy.steps.length, 2);
    assert.match(howToBuy.intro, /step-by-step/i);
    assert.match(howToBuy.steps[0].text, /Pilih produk/i);

    const comparison = await ask(
      "Bandingkan Comparison Robot Alpha dengan Comparison Robot Beta",
    );
    assert.equal(comparison.type, "compare_reasoned");
    assert.equal(comparison.winner, null);
    assert.match(comparison.reasoning_text, /aksesori lengkap/i);
    assert.match(comparison.reasoning_text, /box sedikit penyok/i);
    assert.match(comparison.reasoning_text, /tidak ada part hilang/i);
    assert.match(comparison.reasoning_text, /artikulasi terbatas/i);
    assert.match(comparison.reasoning_text, /tidak ada pemenang mutlak/i);
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});
