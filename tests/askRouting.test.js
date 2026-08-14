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
];

function product({
  id,
  name,
  price,
  regularPrice = price,
  salePrice = "",
  stockQuantity,
  description = "Kondisi BIB dan kelengkapan sesuai foto.",
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
    dimensions: { length: "30", width: "20", height: "40" },
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
    if (new URL(String(url)).hostname === "catalog.test") {
      return new Response(JSON.stringify(PRODUCTS), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected network request: ${url}`);
  };

  try {
    const { default: handler } = await import("../api/ask.js");
    const sessionId = `routing_test_${Date.now()}`;
    const ask = async (question, pageContext = null) => {
      const response = createResponse();
      await handler(
        {
          method: "POST",
          url: "/api/ask",
          headers: { "x-session-id": sessionId },
          body: { question, history: [], pageContext },
        },
        response,
      );
      assert.equal(response.statusCode, 200, JSON.stringify(response.payload));
      return response.payload;
    };

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
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});
