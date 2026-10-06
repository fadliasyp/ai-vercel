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
  product({
    id: 12,
    name: "Fewture Getter Set 1,2,3 Black Version",
    price: "6250000",
    stockQuantity: 6,
  }),
  product({
    id: 13,
    name: "Soul of Chogokin Daitarn 3",
    price: "8500000",
    stockStatus: "outofstock",
    stockQuantity: 0,
    restockAt: "12/01/2099 03:30 pm",
  }),
  product({
    id: 14,
    name: "DX Chogokin Dairugger XV",
    price: "9200000",
    stockStatus: "outofstock",
    stockQuantity: 0,
    restockAt: "12/02/2099 09:00 am",
  }),
  product({
    id: 15,
    name: "Vintage Past Restock Robot",
    price: "1200000",
    stockStatus: "outofstock",
    stockQuantity: 0,
    restockAt: "01/01/2020 09:00 am",
  }),
];

function product({
  id,
  name,
  price,
  regularPrice = price,
  salePrice = "",
  stockQuantity,
  stockStatus = "instock",
  restockAt = "",
  description = "Kondisi BIB dan kelengkapan sesuai foto.",
  dimensions = { length: "30", width: "20", height: "40" },
}) {
  const metaData = [{ key: "condition", value: "BIB" }];
  if (restockAt) {
    metaData.push({
      key: "woopt_actions",
      value: {
        test_restock: {
          name: "Regression restock schedule",
          type: "product",
          action: "set_instock",
          action_val: { value: "0", base: "fa", visibility: "visible" },
          timer: {
            exact_time: { val: restockAt, type: "date_time_after" },
          },
          roles: ["woopt_all"],
        },
      },
    });
  }

  return {
    id,
    name,
    type: "simple",
    permalink: `https://catalog.test/product/${id}`,
    price,
    regular_price: regularPrice,
    sale_price: salePrice,
    stock_status: stockStatus,
    stock_quantity: stockQuantity,
    images: [],
    categories: [{ id: 1, name: "Chogokin" }],
    description,
    short_description: description,
    meta_data: metaData,
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
  let semanticRoute = null;

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
    if (requestUrl.hostname === "api.groq.com") {
      assert.ok(semanticRoute, "Unexpected Groq request");
      return new Response(
        JSON.stringify({
          model: "test-semantic-model",
          choices: [
            {
              message: {
                content: JSON.stringify(semanticRoute),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
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
      const { sessionId: requestSessionId, ...body } = request;
      const response = createResponse();
      await handler(
        {
          method: "POST",
          url: "/api/ask",
          headers: { "x-session-id": requestSessionId || sessionId },
          body: { question, history: [], pageContext, ...body },
        },
        response,
      );
      assert.equal(response.statusCode, 200, JSON.stringify(response.payload));
      return response.payload;
    };

    const greeting = await ask("halo", null, { isBootstrap: true });
    assert.equal(greeting.intent, "greeting");
    assert.equal(greeting.actions.length, 6);
    assert.equal(greeting.actions_metadata.length, 6);
    assert.equal(
      new Set(
        greeting.actions_metadata
          .slice(0, 4)
          .map((action) => action.action_key),
      ).size,
      4,
    );
    assert.deepEqual(
      greeting.actions_metadata
        .slice(4)
        .map((action) => action.action_key),
      ["product_discovery", "product_discovery"],
    );

    const readyAction = {
      label: "Tampilkan semua produk yang ready stock",
      value: "Tampilkan semua produk yang ready stock",
      action_key: "catalog_ready_stock",
      required_fields: [],
    };
    const readyCatalog = await ask(readyAction.value, null, {
      isSuggestionClick: true,
      suggestedAction: readyAction,
    });
    assert.equal(readyCatalog.intent, "stock_availability");
    assert.equal(readyCatalog.type, "products");
    assert.ok(productNames(readyCatalog).length > 1);
    assert.doesNotMatch(readyCatalog.intro, /mau cek stok produk apa/i);

    const catalogOverview = await ask("Barang apa aja yang dijual?", null, {
      sessionId: `catalog_overview_${Date.now()}`,
    });
    assert.equal(catalogOverview.intent, "product_discovery");
    assert.match(
      [catalogOverview.intro, catalogOverview.message]
        .filter(Boolean)
        .join(" "),
      /katalog Robot Jadul|kategori yang tersedia/i,
    );

    const allRestocks = await ask("kapan robot2 restock?", null, {
      sessionId: `all_restocks_${Date.now()}`,
    });
    assert.equal(allRestocks.intent, "stock_availability");
    assert.equal(allRestocks.type, "products");
    assert.deepEqual(productNames(allRestocks), [
      "Soul of Chogokin Daitarn 3",
      "DX Chogokin Dairugger XV",
    ]);
    assert.match(allRestocks.intro, /1 Desember 2099.*15\.30 WIB/is);
    assert.match(allRestocks.intro, /2 Desember 2099.*09\.00 WIB/is);
    assert.doesNotMatch(allRestocks.intro, /Vintage Past Restock Robot/i);

    for (const question of [
      "kapan restock sih udah nunggu lama nih?",
      "Kapan restock barang emang",
      "Dari kemarin nunggu kapan restock sih",
    ]) {
      const genericRestock = await ask(question, null, {
        sessionId: `generic_restock_${Date.now()}_${question.length}`,
      });
      assert.equal(genericRestock.intent, "stock_availability");
      assert.equal(genericRestock.type, "products");
      assert.deepEqual(productNames(genericRestock), [
        "Soul of Chogokin Daitarn 3",
        "DX Chogokin Dairugger XV",
      ]);
      assert.doesNotMatch(
        [genericRestock.message, genericRestock.intro]
          .filter(Boolean)
          .join(" "),
        /produk yang kamu tanyakan belum ditemukan/i,
      );
    }

    const specificRestock = await ask(
      "kapan Soul of Chogokin Daitarn 3 restock?",
      null,
      { sessionId: `specific_restock_${Date.now()}` },
    );
    assert.equal(specificRestock.intent, "stock_availability");
    assert.equal(specificRestock.type, "products");
    assert.deepEqual(productNames(specificRestock), [
      "Soul of Chogokin Daitarn 3",
    ]);
    assert.match(specificRestock.intro, /1 Desember 2099.*15\.30 WIB/is);
    assert.doesNotMatch(specificRestock.intro, /Dairugger|2 Desember/i);

    const casualSpecificRestock = await ask(
      "kalau Daitarn habis, kapan restok?",
      null,
      { sessionId: `casual_specific_restock_${Date.now()}` },
    );
    assert.equal(casualSpecificRestock.intent, "stock_availability");
    assert.equal(casualSpecificRestock.type, "products");
    assert.deepEqual(productNames(casualSpecificRestock), [
      "Soul of Chogokin Daitarn 3",
    ]);
    assert.match(casualSpecificRestock.intro, /1 Desember 2099.*15\.30 WIB/is);

    const unknownRestock = await ask(
      "kapan SOC Bandai 50th Anniversary Godmars restock?",
      null,
      { sessionId: `unknown_restock_${Date.now()}` },
    );
    assert.equal(unknownRestock.intent, "stock_availability");
    assert.equal(unknownRestock.type, "text");
    assert.match(unknownRestock.message, /belum ada jadwal restock/i);
    assert.ok(unknownRestock.admin_handoff);

    const promoAction = {
      label: "Lihat semua produk yang sedang promo",
      value: "Lihat semua produk yang sedang promo",
      action_key: "catalog_promo",
      required_fields: [],
    };
    const promoCatalog = await ask(promoAction.value, null, {
      isSuggestionClick: true,
      suggestedAction: promoAction,
    });
    assert.equal(promoCatalog.intent, "price_promo");
    assert.equal(promoCatalog.type, "products");
    assert.deepEqual(productNames(promoCatalog), [
      "Fewture Models EX Gokin Getter Robo Black Version",
      "Action Toys Ideon",
    ]);

    const warehouseStock = await ask(
      "Lagi nyari Fewture Getter Set 1,2,3 Black Version nih, sisa berapa pcs di gudang?",
    );
    assert.equal(warehouseStock.intent, "stock_availability");
    assert.deepEqual(productNames(warehouseStock), [
      "Fewture Getter Set 1,2,3 Black Version",
    ]);
    assert.equal(warehouseStock.products[0].stockQuantity, 6);
    assert.doesNotMatch(
      [warehouseStock.message, warehouseStock.intro]
        .filter(Boolean)
        .join(" "),
      /pengiriman diproses|jakarta selatan/i,
    );

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

    const giftBudgetRecommendation = await ask(
      "rekomen dong robot buat hadiah budget 4 juta sampe 12 jutaan?",
      null,
      { sessionId: `gift_budget_${Date.now()}` },
    );
    assert.equal(giftBudgetRecommendation.intent, "recommendation");
    assert.equal(giftBudgetRecommendation.type, "products");
    assert.ok(giftBudgetRecommendation.products.length > 0);
    assert.ok(
      giftBudgetRecommendation.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 4000000 && price <= 12000000;
      }),
    );
    assert.ok(
      productNames(giftBudgetRecommendation).every(
        (name) => !/JUNK|Part Only/i.test(name),
      ),
    );

    const approximateBudgetSession = `approximate_budget_12m_${Date.now()}`;
    const approximateBudgetRecommendation = await ask(
      "Bang, rekomendasiin robot yang bagus dong, budget sekitar 12 jutaan",
      null,
      { sessionId: approximateBudgetSession },
    );
    assert.equal(approximateBudgetRecommendation.intent, "recommendation");
    assert.equal(approximateBudgetRecommendation.type, "products");
    assert.ok(approximateBudgetRecommendation.products.length > 0);
    assert.ok(
      approximateBudgetRecommendation.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 9600000 && price <= 12000000;
      }),
    );
    assert.match(
      approximateBudgetRecommendation.reasoning_text,
      /Rp\s*12\.000\.000/,
    );

    const naturalBudgetFollowUp = await ask(
      "Kalau yang 6 jutaan ada apa aja?",
      null,
      { sessionId: approximateBudgetSession },
    );
    assert.equal(naturalBudgetFollowUp.intent, "recommendation");
    assert.equal(naturalBudgetFollowUp.type, "products");
    assert.ok(naturalBudgetFollowUp.products.length > 0);
    assert.ok(
      naturalBudgetFollowUp.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 4800000 && price <= 7200000;
      }),
    );
    assert.match(naturalBudgetFollowUp.reasoning_text, /Rp\s*6\.000\.000/);

    const bareTargetRecommendation = await ask(
      "rekomen cok robot 6 jutaan",
      null,
      { sessionId: `bare_target_6m_${Date.now()}` },
    );
    assert.equal(bareTargetRecommendation.intent, "recommendation");
    assert.equal(bareTargetRecommendation.type, "products");
    assert.ok(bareTargetRecommendation.products.length > 0);
    assert.ok(
      bareTargetRecommendation.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 4800000 && price <= 7200000;
      }),
    );
    assert.match(bareTargetRecommendation.reasoning_text, /Rp\s*6\.000\.000/);

    const sevenMillionSession = `target_price_7m_${Date.now()}`;
    const sevenMillionRecommendation = await ask(
      "Rekomendasi dong yg harga 7 jutaan",
      null,
      { sessionId: sevenMillionSession },
    );
    assert.equal(sevenMillionRecommendation.intent, "recommendation");
    assert.equal(sevenMillionRecommendation.type, "products");
    assert.deepEqual(productNames(sevenMillionRecommendation), [
      "Jumbo Machinder Mazinger Z",
      "Fewture Getter Set 1,2,3 Black Version",
    ]);
    assert.match(sevenMillionRecommendation.reasoning_text, /Rp\s*7\.000\.000/);

    const bothRecommendedProducts = await ask("keduanya ready gak?", null, {
      sessionId: sevenMillionSession,
    });
    assert.equal(bothRecommendedProducts.intent, "stock_availability");
    assert.deepEqual(
      productNames(bothRecommendedProducts),
      productNames(sevenMillionRecommendation),
    );

    const fourMillionRecommendation = await ask(
      "Rekomendasi dong yg harga 4 jutaan",
      null,
      { sessionId: `target_price_4m_${Date.now()}` },
    );
    assert.equal(fourMillionRecommendation.intent, "recommendation");
    assert.equal(fourMillionRecommendation.type, "products");
    assert.ok(
      productNames(fourMillionRecommendation).every(
        (name) => !productNames(sevenMillionRecommendation).includes(name),
      ),
    );

    const contextualPriceSession = `contextual_target_price_${Date.now()}`;
    const twelveMillionRecommendation = await ask(
      "Rekomendasi robot yang harga 12 jutaan",
      null,
      { sessionId: contextualPriceSession },
    );
    const threeMillionRecommendation = await ask("yg 3 jutaan", null, {
      sessionId: contextualPriceSession,
    });
    assert.equal(twelveMillionRecommendation.intent, "recommendation");
    assert.equal(threeMillionRecommendation.intent, "recommendation");
    assert.equal(threeMillionRecommendation.type, "products");
    assert.ok(
      threeMillionRecommendation.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 2400000 && price <= 3600000;
      }),
    );
    assert.ok(
      productNames(threeMillionRecommendation).every(
        (name) => !productNames(twelveMillionRecommendation).includes(name),
      ),
    );
    assert.match(threeMillionRecommendation.reasoning_text, /Rp\s*3\.000\.000/);

    const ordinalFollowUpSession = `ordinal_followup_${Date.now()}`;
    const ordinalRecommendation = await ask(
      "Rekomendasikan robot yang paling worth it dan ready stock",
      null,
      { sessionId: ordinalFollowUpSession },
    );
    assert.ok(ordinalRecommendation.products.length >= 2);
    const secondProductStock = await ask("yang kedua stoknya berapa?", null, {
      sessionId: ordinalFollowUpSession,
    });
    assert.equal(secondProductStock.intent, "stock_availability");
    assert.deepEqual(productNames(secondProductStock), [
      ordinalRecommendation.products[1].name,
    ]);

    const focusedProductSession = `focused_product_followup_${Date.now()}`;
    const focusedProductDetail = await ask(
      "Mau tanya bahan Jumbo Machinder Mazinger Z",
      null,
      { sessionId: focusedProductSession },
    );
    assert.deepEqual(productNames(focusedProductDetail), [
      "Jumbo Machinder Mazinger Z",
    ]);
    const focusedProductStock = await ask("masih ready gak?", null, {
      sessionId: focusedProductSession,
    });
    assert.equal(focusedProductStock.intent, "stock_availability");
    assert.deepEqual(productNames(focusedProductStock), [
      "Jumbo Machinder Mazinger Z",
    ]);

    const focusedProductPromo = await ask("ada diskon gak?", null, {
      sessionId: focusedProductSession,
    });
    assert.equal(focusedProductPromo.intent, "price_promo");
    assert.deepEqual(productNames(focusedProductPromo), [
      "Jumbo Machinder Mazinger Z",
    ]);

    const focusedProductPhoto = await ask("ada fotonya?", null, {
      sessionId: focusedProductSession,
    });
    assert.equal(focusedProductPhoto.intent, "product_detail");
    assert.deepEqual(productNames(focusedProductPhoto), [
      "Jumbo Machinder Mazinger Z",
    ]);

    const focusedProductMaterial = await ask("full die-cast nggak?", null, {
      sessionId: focusedProductSession,
    });
    assert.equal(focusedProductMaterial.intent, "product_detail");
    assert.deepEqual(productNames(focusedProductMaterial), [
      "Jumbo Machinder Mazinger Z",
    ]);

    const explicitProductSwitch = await ask(
      "Kalau Action Toys Ideon harganya berapa?",
      null,
      { sessionId: focusedProductSession },
    );
    assert.equal(explicitProductSwitch.intent, "price_promo");
    assert.deepEqual(productNames(explicitProductSwitch), [
      "Action Toys Ideon",
    ]);

    const switchedProductFollowUp = await ask("bahannya apa?", null, {
      sessionId: focusedProductSession,
    });
    assert.equal(switchedProductFollowUp.intent, "product_detail");
    assert.deepEqual(productNames(switchedProductFollowUp), [
      "Action Toys Ideon",
    ]);

    const restockTopicSwitchSession = `restock_topic_switch_${Date.now()}`;
    await ask("Rekomendasikan robot ready stock", null, {
      sessionId: restockTopicSwitchSession,
    });
    const restockTopicSwitch = await ask("kapan restock ya", null, {
      sessionId: restockTopicSwitchSession,
    });
    assert.equal(restockTopicSwitch.intent, "stock_availability");
    assert.deepEqual(productNames(restockTopicSwitch), [
      "Soul of Chogokin Daitarn 3",
      "DX Chogokin Dairugger XV",
    ]);

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

    const ideonFacts = await ask(
      "Ideon bahannya metal atau plastik, terus harganya berapa?",
      null,
      { sessionId: `ideon_grounding_${Date.now()}` },
    );
    assert.deepEqual(productNames(ideonFacts), ["Action Toys Ideon"]);
    assert.deepEqual(ideonFacts.assistant_meta.answer_coverage.requested, [
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

    const compareFollowUpSession = `compare_followup_${Date.now()}`;
    const comparePrompt = await ask(
      "Bandingkan Comparison Robot Alpha dengan produk lain",
      null,
      { sessionId: compareFollowUpSession },
    );
    assert.equal(comparePrompt.intent, "compare");
    assert.match(comparePrompt.message, /dibandingkan dengan produk apa/i);
    assert.match(comparePrompt.message, /Comparison Robot Alpha/i);

    const comparisonFollowUp = await ask(
      "bandingkan dengan robot Comparison Robot Beta",
      null,
      { sessionId: compareFollowUpSession },
    );
    assert.equal(comparisonFollowUp.type, "compare_reasoned");
    assert.deepEqual(productNames(comparisonFollowUp), [
      "Comparison Robot Alpha",
      "Comparison Robot Beta",
    ]);

    const compareTopicSwitchSession = `compare_topic_switch_${Date.now()}`;
    await ask(
      "Bandingkan Comparison Robot Alpha dengan produk lain",
      null,
      { sessionId: compareTopicSwitchSession },
    );
    const compareTopicSwitch = await ask("Berapa harga Action Toys Ideon?", null, {
      sessionId: compareTopicSwitchSession,
    });
    assert.equal(compareTopicSwitch.intent, "price_promo");
    assert.deepEqual(productNames(compareTopicSwitch), ["Action Toys Ideon"]);

    const activePromoFocusSession = `active_promo_focus_${Date.now()}`;
    await ask("Mau tanya bahan Jumbo Machinder Mazinger Z", null, {
      sessionId: activePromoFocusSession,
    });

    process.env.LLM_LED_ASSISTANT_MODE = "active";
    process.env.GROQ_ROUTER_ENABLED = "true";
    process.env.GROQ_API_KEY = "test-groq-key";
    semanticRoute = {
      scope: "in_scope",
      intent: "shipping_transaction",
      intents: ["shipping_transaction"],
      goals: ["payment_methods"],
      confidence: 0.95,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation: "Pelanggan menanyakan metode pembayaran yang tersedia.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmLockedPaymentMethods = await ask(
      "Kalau bayar bisa pakai apa aja?",
      null,
      { sessionId: `semantic_payment_${Date.now()}` },
    );
    assert.equal(llmLockedPaymentMethods.intent, "shipping_transaction");
    assert.equal(llmLockedPaymentMethods.type, "text");
    assert.match(
      llmLockedPaymentMethods.message,
      /Pilihan Pembayaran Tersedia/i,
    );
    assert.match(llmLockedPaymentMethods.message, /QRIS/i);
    assert.equal(
      llmLockedPaymentMethods.assistant_meta.llm_led.intent_source,
      "llm",
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "return_product",
      intents: ["return_product"],
      goals: ["return_policy", "return_incomplete"],
      confidence: 0.97,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      requires_product: false,
      customer_state: "frustrated",
      interpretation:
        "Pelanggan melaporkan part produk tidak lengkap setelah unboxing.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmIncompleteReturn = await ask(
      "Pas unboxing kok tangan robotnya ga ada, mesti gimana?",
      null,
      { sessionId: `llm_incomplete_return_${Date.now()}` },
    );
    assert.equal(llmIncompleteReturn.intent, "return_product");
    assert.equal(llmIncompleteReturn.type, "text");
    assert.match(
      llmIncompleteReturn.message,
      /part kurang atau barang tidak lengkap/i,
    );
    assert.match(llmIncompleteReturn.message, /2 x 24 jam/i);
    assert.equal(
      llmIncompleteReturn.assistant_meta.llm_led.intent_source,
      "llm",
    );

    semanticRoute = {
      ...semanticRoute,
      goals: ["refund", "refund_timing"],
      customer_state: "neutral",
      interpretation: "Pelanggan menanyakan durasi pencairan refund.",
    };

    const llmRefundTiming = await ask(
      "Duit baliknya biasanya nunggu brp lama?",
      null,
      { sessionId: `llm_refund_timing_${Date.now()}` },
    );
    assert.equal(llmRefundTiming.intent, "return_product");
    assert.equal(llmRefundTiming.type, "text");
    assert.match(llmRefundTiming.message, /Waktu refund dihitung/i);
    assert.match(llmRefundTiming.message, /3-7 hari kerja/i);

    semanticRoute = {
      scope: "in_scope",
      intent: "compare",
      intents: ["compare"],
      goals: ["comparison"],
      confidence: 0.97,
      entities: {
        product_names: [
          "Comparison Robot Alpha",
          "Comparison Robot Beta",
        ],
        budget_min: null,
        budget_max: null,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation:
        "Pelanggan ingin membandingkan Comparison Robot Alpha dan Comparison Robot Beta.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmGroundedComparison = await ask(
      "menurutmu dua ini enakan mana: Comparison Robot Alpha apa Comparison Robot Beta?",
      null,
      { sessionId: `llm_compare_${Date.now()}` },
    );
    assert.equal(llmGroundedComparison.intent, "compare");
    assert.equal(llmGroundedComparison.type, "compare_reasoned");
    assert.deepEqual(productNames(llmGroundedComparison), [
      "Comparison Robot Alpha",
      "Comparison Robot Beta",
    ]);
    assert.match(llmGroundedComparison.reasoning_text, /aksesori lengkap/i);
    assert.match(llmGroundedComparison.reasoning_text, /artikulasi terbatas/i);
    assert.equal(
      llmGroundedComparison.assistant_meta.llm_led.intent_source,
      "llm",
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "price_promo",
      intents: ["price_promo"],
      goals: ["bulk_discount"],
      confidence: 0.96,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
        quantity: 3,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation:
        "Pelanggan menanyakan potongan untuk pembelian tiga barang.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmBulkDiscount = await ask(
      "Kalau beli tiga barang, bisa dapat potongan harga nggak?",
      null,
      { sessionId: `llm_bulk_discount_${Date.now()}` },
    );
    assert.equal(llmBulkDiscount.intent, "price_promo");
    assert.equal(llmBulkDiscount.type, "text");
    assert.equal(llmBulkDiscount.products, undefined);
    assert.match(llmBulkDiscount.message, /3 barang/i);
    assert.match(llmBulkDiscount.message, /potongan tambahan/i);
    assert.equal(
      llmBulkDiscount.assistant_meta.llm_led.intent_source,
      "llm_bulk_discount_policy",
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "price_promo",
      intents: ["price_promo"],
      goals: ["promo"],
      confidence: 0.96,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation: "Pelanggan menanyakan promo beli satu gratis satu.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const bogo = await ask("beli barang1 gratis 1 engga?", null, {
      sessionId: `semantic_bogo_${Date.now()}`,
    });
    assert.equal(bogo.intent, "price_promo");
    assert.equal(bogo.type, "text");
    assert.equal(bogo.products, undefined);
    assert.match(bogo.message, /belum memiliki informasi terverifikasi/i);
    assert.match(bogo.message, /tidak otomatis berarti/i);
    assert.ok(bogo.admin_handoff);
    assert.equal(
      bogo.assistant_meta.llm_led.intent_source,
      "buy_one_get_one_policy",
    );

    semanticRoute = {
      ...semanticRoute,
      interpretation:
        "Pelanggan menanyakan promo produk yang baru dibicarakan.",
      topic_relation: "follow_up",
    };

    const llmLockedFocusedPromo = await ask("ada diskon gak?", null, {
      sessionId: activePromoFocusSession,
    });
    assert.equal(llmLockedFocusedPromo.intent, "price_promo");
    assert.equal(llmLockedFocusedPromo.type, "products");
    assert.deepEqual(productNames(llmLockedFocusedPromo), [
      "Jumbo Machinder Mazinger Z",
    ]);

    semanticRoute = {
      scope: "in_scope",
      intent: "price_promo",
      intents: ["price_promo"],
      goals: ["promo"],
      confidence: 0.96,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation: "Pelanggan menanyakan promo katalog yang sedang aktif.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmUnderstoodCasualPromo = await ask(
      "lg ada pnawaran spesial ga sih?",
      null,
      { sessionId: `llm_casual_promo_${Date.now()}` },
    );
    assert.equal(llmUnderstoodCasualPromo.intent, "price_promo");
    assert.equal(llmUnderstoodCasualPromo.type, "products");
    assert.deepEqual(productNames(llmUnderstoodCasualPromo), [
      "Fewture Models EX Gokin Getter Robo Black Version",
      "Action Toys Ideon",
    ]);

    semanticRoute = {
      ...semanticRoute,
      entities: {
        ...semanticRoute.entities,
        product_names: ["Jumbo Machinder Mazinger Z"],
      },
      requires_product: true,
      interpretation:
        "Pelanggan menanyakan promo Jumbo Machinder Mazinger Z.",
    };

    const llmUnderstoodProductPromo = await ask(
      "Jumbo Machinder Mazinger Z lg dpt harga spesial ga?",
      null,
      { sessionId: `llm_product_promo_${Date.now()}` },
    );
    assert.equal(llmUnderstoodProductPromo.intent, "price_promo");
    assert.deepEqual(productNames(llmUnderstoodProductPromo), [
      "Jumbo Machinder Mazinger Z",
    ]);
    assert.match(llmUnderstoodProductPromo.intro, /belum sedang promo/i);

    semanticRoute = {
      ...semanticRoute,
      goals: ["price"],
      interpretation:
        "Pelanggan menanyakan harga Jumbo Machinder Mazinger Z.",
    };

    const llmUnderstoodCasualPrice = await ask(
      "Jumbo Machinder Mazinger Z bandrolnya skrg brp?",
      null,
      { sessionId: `llm_casual_price_${Date.now()}` },
    );
    assert.equal(llmUnderstoodCasualPrice.intent, "price_promo");
    assert.deepEqual(productNames(llmUnderstoodCasualPrice), [
      "Jumbo Machinder Mazinger Z",
    ]);
    assert.equal(llmUnderstoodCasualPrice.products[0].numericPrice, 7000000);

    semanticRoute = {
      scope: "in_scope",
      intent: "stock_availability",
      intents: ["stock_availability"],
      goals: ["stock"],
      confidence: 0.96,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation:
        "Pelanggan meminta daftar produk yang bisa langsung dibeli.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmUnderstoodGlobalStock = await ask(
      "yg bisa lgsg dibungkus ada apa aja?",
      null,
      { sessionId: `llm_global_stock_${Date.now()}` },
    );
    assert.equal(llmUnderstoodGlobalStock.intent, "stock_availability");
    assert.equal(llmUnderstoodGlobalStock.type, "products");
    assert.ok(llmUnderstoodGlobalStock.products.length > 1);
    assert.ok(
      llmUnderstoodGlobalStock.products.every(
        (product) => product.stock === "instock",
      ),
    );
    assert.doesNotMatch(
      llmUnderstoodGlobalStock.intro || llmUnderstoodGlobalStock.message,
      /mau cek stok produk apa|belum ada di katalog/i,
    );

    semanticRoute = {
      ...semanticRoute,
      goals: ["stock_policy"],
      interpretation:
        "Pelanggan menanyakan apakah seluruh barang selalu tersedia.",
    };

    const llmUnderstoodStockPolicy = await ask(
      "emang brangnya slalu ada smua?",
      null,
      { sessionId: `llm_stock_policy_${Date.now()}` },
    );
    assert.equal(llmUnderstoodStockPolicy.intent, "stock_availability");
    assert.equal(llmUnderstoodStockPolicy.type, "text");
    assert.match(
      llmUnderstoodStockPolicy.message,
      /tidak semua robot selalu ready/i,
    );
    assert.match(
      llmUnderstoodStockPolicy.message,
      /dari katalog yang terbaca/i,
    );
    assert.equal(
      llmUnderstoodStockPolicy.assistant_meta.llm_led.intent_source,
      "llm_stock_policy",
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "product_discovery",
      intents: ["product_discovery"],
      goals: ["product_search"],
      confidence: 0.92,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation: "User wants to know what items can be wrapped in lngs",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const guardedGlobalStock = await ask(
      "yg bisa lngs dibungkus ada apa aja",
      null,
      { sessionId: `guarded_global_stock_${Date.now()}` },
    );
    assert.equal(guardedGlobalStock.intent, "stock_availability");
    assert.equal(guardedGlobalStock.type, "products");
    assert.ok(guardedGlobalStock.products.length > 1);
    assert.ok(
      guardedGlobalStock.products.every(
        (product) => product.stock === "instock",
      ),
    );
    assert.equal(
      guardedGlobalStock.assistant_meta.llm_led.intent_source,
      "global_ready_stock_guard",
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "product_discovery",
      intents: ["product_discovery"],
      goals: ["product_search"],
      confidence: 0.98,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation:
        "Pelanggan menanyakan daftar atau kategori produk yang dijual di toko.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const typoCatalogOverview = await ask(
      "brang apa saja yang dijual?",
      null,
      { sessionId: `typo_catalog_overview_${Date.now()}` },
    );
    assert.equal(typoCatalogOverview.intent, "product_discovery");
    assert.equal(typoCatalogOverview.type, "products");
    assert.ok(typoCatalogOverview.products.length > 1);
    assert.doesNotMatch(
      typoCatalogOverview.intro || typoCatalogOverview.message,
      /brang.*tidak tersedia|belum menemukannya/i,
    );

    const llmCatalogOverview = await ask("lihat produk", null, {
      sessionId: `llm_catalog_overview_${Date.now()}`,
    });
    assert.equal(llmCatalogOverview.intent, "product_discovery");
    assert.equal(llmCatalogOverview.type, "products");
    assert.ok(llmCatalogOverview.products.length > 1);

    semanticRoute = {
      scope: "in_scope",
      intent: "stock_availability",
      intents: ["stock_availability"],
      goals: ["stock"],
      confidence: 0.96,
      entities: {
        product_names: ["Voltes"],
        budget_min: null,
        budget_max: null,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation:
        "Pelanggan meminta produk Voltes yang tersedia di katalog.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const catalogAvailabilityDiscovery = await ask(
      "Coba tampilin robot Voltes yang tersedia",
      null,
      { sessionId: `catalog_availability_${Date.now()}` },
    );
    assert.equal(catalogAvailabilityDiscovery.intent, "product_discovery");
    assert.equal(catalogAvailabilityDiscovery.type, "products");
    assert.ok(catalogAvailabilityDiscovery.products.length > 0);
    assert.ok(
      productNames(catalogAvailabilityDiscovery).every((name) =>
        /Voltes/i.test(name),
      ),
    );
    assert.equal(
      catalogAvailabilityDiscovery.assistant_meta.llm_led.intent_locked,
      false,
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "recommendation",
      intents: ["recommendation"],
      goals: ["recommendation"],
      confidence: 0.96,
      entities: {
        product_names: ["Voltes"],
        budget_min: null,
        budget_max: null,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation: "Pelanggan meminta rekomendasi koleksi lawas Voltes.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmGroundedDiscovery = await ask(
      "Aku kepengen banget lihat koleksi lawas seri Voltes",
      null,
      { sessionId: `llm_grounded_discovery_${Date.now()}` },
    );
    assert.equal(llmGroundedDiscovery.intent, "product_discovery");
    assert.equal(llmGroundedDiscovery.type, "products");
    assert.ok(llmGroundedDiscovery.products.length > 1);
    assert.ok(
      productNames(llmGroundedDiscovery).every((name) => /Voltes/i.test(name)),
    );
    assert.equal(
      llmGroundedDiscovery.assistant_meta.llm_led.intent_locked,
      false,
    );

    semanticRoute = {
      ...semanticRoute,
      entities: {
        ...semanticRoute.entities,
        product_names: ["Robot Damashii Voltes V Legacy"],
      },
    };

    const rejectedOverSpecificDiscovery = await ask(
      "Coba tampilkan Voltes",
      null,
      { sessionId: `rejected_specific_discovery_${Date.now()}` },
    );
    assert.equal(rejectedOverSpecificDiscovery.intent, "product_discovery");
    assert.equal(rejectedOverSpecificDiscovery.type, "products");
    assert.ok(rejectedOverSpecificDiscovery.products.length > 1);
    assert.ok(
      productNames(rejectedOverSpecificDiscovery).every((name) =>
        /Voltes/i.test(name),
      ),
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "product_detail",
      intents: ["product_detail"],
      goals: ["material", "completeness"],
      confidence: 0.97,
      entities: {
        product_names: ["Jumbo Machinder Mazinger Z"],
        budget_min: null,
        budget_max: null,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation:
        "Pelanggan menanyakan bahan dan kelengkapan Jumbo Machinder Mazinger Z.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmFocusedProductDetail = await ask(
      "Jumbo Machinder Mazinger Z bahanya apaan, trus isi dus komplit ga?",
      null,
      { sessionId: `llm_product_detail_${Date.now()}` },
    );
    assert.equal(llmFocusedProductDetail.intent, "product_detail");
    assert.deepEqual(productNames(llmFocusedProductDetail), [
      "Jumbo Machinder Mazinger Z",
    ]);
    assert.match(llmFocusedProductDetail.reasoning_text, /die-cast dan ABS/i);
    assert.match(
      llmFocusedProductDetail.reasoning_text,
      /Kelengkapan dari deskripsi/i,
    );
    assert.doesNotMatch(
      llmFocusedProductDetail.reasoning_text,
      /Harga saat ini|Stok:/i,
    );
    assert.deepEqual(
      llmFocusedProductDetail.assistant_meta.llm_led.understanding_goals,
      ["material", "completeness"],
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "recommendation",
      intents: ["recommendation"],
      goals: ["recommendation"],
      confidence: 0.92,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: null,
      },
      recommendation_request: {
        price_mode: "none",
        target_price: null,
        budget_min: null,
        budget_max: null,
        purposes: [],
        stock: null,
        condition: null,
        promo_only: false,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation:
        "Pelanggan menanyakan rekomendasi varian Voltes yang paling worth it.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const scopedVoltesRecommendation = await ask(
      "Menurut mu dari semua variasi Voltes mana yang paling worth it",
      null,
      { sessionId: `scoped_voltes_recommendation_${Date.now()}` },
    );
    assert.equal(scopedVoltesRecommendation.intent, "recommendation");
    assert.equal(scopedVoltesRecommendation.type, "products");
    assert.ok(scopedVoltesRecommendation.products.length > 1);
    assert.ok(
      productNames(scopedVoltesRecommendation).every((name) =>
        /Voltes/i.test(name),
      ),
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "stock_availability",
      intents: ["stock_availability"],
      goals: ["stock"],
      confidence: 0.96,
      entities: {
        product_names: ["Daitarn"],
        budget_min: null,
        budget_max: null,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation:
        "Pelanggan menanyakan jadwal restock produk Daitarn.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmGroundedRestock = await ask(
      "kalau Daitarn habis, kapan restok?",
      null,
      { sessionId: `llm_grounded_restock_${Date.now()}` },
    );
    assert.equal(llmGroundedRestock.intent, "stock_availability");
    assert.deepEqual(productNames(llmGroundedRestock), [
      "Soul of Chogokin Daitarn 3",
    ]);
    assert.match(llmGroundedRestock.product_match?.reason || "", /^llm_entity:/);

    const rejectedHallucinatedEntity = await ask(
      "Ultraman kapan restok?",
      null,
      { sessionId: `rejected_llm_entity_${Date.now()}` },
    );
    assert.equal(rejectedHallucinatedEntity.intent, "stock_availability");
    assert.equal(rejectedHallucinatedEntity.type, "text");
    assert.equal(rejectedHallucinatedEntity.products, undefined);
    assert.match(rejectedHallucinatedEntity.message, /belum ditemukan/i);

    semanticRoute = {
      scope: "in_scope",
      intent: "stock_availability",
      intents: ["stock_availability"],
      goals: ["stock"],
      confidence: 0.96,
      entities: {
        product_names: ["Fewture Getter Set 1,2,3 Black Version"],
        budget_min: null,
        budget_max: null,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation: "Pelanggan meminta jumlah stok produk Fewture Getter.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const llmLockedStock = await ask(
      "Fewture Getter Set 1,2,3 Black Version sisa berapa pcs, bukan status pesanan saya?",
      null,
      { sessionId: `semantic_lock_${Date.now()}` },
    );
    assert.equal(llmLockedStock.intent, "stock_availability");
    assert.deepEqual(productNames(llmLockedStock), [
      "Fewture Getter Set 1,2,3 Black Version",
    ]);
    assert.equal(llmLockedStock.products[0].stockQuantity, 6);
    assert.equal(llmLockedStock.assistant_meta.llm_led.intent_source, "llm");
    assert.equal(llmLockedStock.assistant_meta.llm_led.intent_locked, true);
    assert.equal(
      llmLockedStock.assistant_meta.llm_led.served_intent,
      "stock_availability",
    );

    semanticRoute = {
      ...semanticRoute,
      entities: {
        ...semanticRoute.entities,
        product_names: [],
      },
      interpretation:
        "Pelanggan menanyakan stok dua produk yang baru dibandingkan.",
      topic_relation: "follow_up",
    };

    const llmLockedPairStock = await ask("keduanya ready gak?", null, {
      sessionId: compareFollowUpSession,
    });
    assert.equal(llmLockedPairStock.intent, "stock_availability");
    assert.equal(llmLockedPairStock.type, "products");
    assert.deepEqual(productNames(llmLockedPairStock), [
      "Comparison Robot Alpha",
      "Comparison Robot Beta",
    ]);
    assert.equal(llmLockedPairStock.assistant_meta.llm_led.intent_source, "llm");
    assert.equal(
      llmLockedPairStock.assistant_meta.llm_led.served_intent,
      "stock_availability",
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "price_promo",
      intents: ["price_promo"],
      goals: ["price", "promo"],
      confidence: 0.96,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: 4000000,
      },
      recommendation_request: {
        price_mode: "maximum",
        target_price: null,
        budget_min: null,
        budget_max: 4000000,
        purposes: [],
        stock: null,
        condition: null,
        promo_only: false,
      },
      requires_product: false,
      customer_state: "neutral",
      interpretation:
        "Pelanggan ingin memilih robot dengan budget maksimal empat juta.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const correctedRecommendationSelection = await ask(
      "Gue punya budget maksimal 4 juta, enaknya ambil robot yang mana?",
      null,
      { sessionId: `recommendation_selection_guard_${Date.now()}` },
    );
    assert.equal(correctedRecommendationSelection.intent, "recommendation");
    assert.equal(correctedRecommendationSelection.type, "products");
    assert.ok(correctedRecommendationSelection.products.length > 0);
    assert.ok(
      correctedRecommendationSelection.products.every(
        (item) => Number(item.numericPrice || 0) <= 4000000,
      ),
    );
    assert.doesNotMatch(
      correctedRecommendationSelection.intro || "",
      /diskon besar-besaran/i,
    );
    assert.equal(
      correctedRecommendationSelection.assistant_meta.llm_led.intent_source,
      "recommendation_selection_guard",
    );

    semanticRoute = {
      scope: "in_scope",
      intent: "recommendation",
      intents: ["recommendation"],
      goals: ["recommendation", "price"],
      confidence: 0.96,
      entities: {
        product_names: [],
        budget_min: null,
        budget_max: 10000000,
      },
      recommendation_request: {
        price_mode: "target",
        target_price: 10000000,
        budget_min: null,
        budget_max: 10000000,
        purposes: [],
        stock: "ready",
        condition: null,
        promo_only: false,
      },
      requires_product: true,
      customer_state: "neutral",
      interpretation:
        "Pelanggan meminta pilihan robot terbaik dengan dana sekitar sepuluh juta.",
      topic_relation: "new_topic",
      needs_clarification: false,
      clarification_question: null,
    };

    const semanticRecommendationSession = `semantic_recommendation_${Date.now()}`;
    const llmRecommendation = await ask(
      "Modal gue 10 jutaan, enaknya ambil robot apa?",
      null,
      { sessionId: semanticRecommendationSession },
    );
    assert.equal(llmRecommendation.intent, "recommendation");
    assert.deepEqual(productNames(llmRecommendation), [
      "Comparison Robot Alpha",
    ]);
    assert.match(llmRecommendation.reasoning_text, /Rp\s*10\.000\.000/i);

    semanticRoute = {
      ...semanticRoute,
      entities: {
        ...semanticRoute.entities,
        budget_min: null,
        budget_max: 7000000,
      },
      recommendation_request: {
        price_mode: "maximum",
        target_price: null,
        budget_min: null,
        budget_max: 7000000,
        purposes: [],
        stock: null,
        condition: null,
        promo_only: false,
      },
      interpretation: "Pelanggan meminta robot dengan budget maksimal tujuh juta.",
    };

    const correctedApproximateTarget = await ask(
      "Bang, rekomen robot yang bagus dong, sekitar 7 jutaan.",
      null,
      { sessionId: semanticRecommendationSession },
    );
    assert.equal(correctedApproximateTarget.intent, "recommendation");
    assert.deepEqual(productNames(correctedApproximateTarget), [
      "Jumbo Machinder Mazinger Z",
      "Fewture Getter Set 1,2,3 Black Version",
    ]);
    assert.ok(
      correctedApproximateTarget.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 5600000 && price <= 8400000;
      }),
    );
    assert.match(
      correctedApproximateTarget.reasoning_text,
      /Rp\s*7\.000\.000/i,
    );

    semanticRoute = {
      ...semanticRoute,
      entities: {
        ...semanticRoute.entities,
        budget_min: 5000000,
        budget_max: 8000000,
      },
      recommendation_request: {
        price_mode: "range",
        target_price: null,
        budget_min: 5000000,
        budget_max: 8000000,
        purposes: ["display"],
        stock: null,
        condition: null,
        promo_only: false,
      },
      requires_product: false,
      interpretation:
        "Pelanggan mencari robot untuk pajangan pada rentang lima sampai delapan juta.",
    };

    const genericRangeRecommendation = await ask(
      "Cari robot antara 5 sampai 8 juta buat pajangan dong",
      null,
      { sessionId: `semantic_range_recommendation_${Date.now()}` },
    );
    assert.equal(genericRangeRecommendation.intent, "recommendation");
    assert.equal(genericRangeRecommendation.type, "products");
    assert.ok(genericRangeRecommendation.products.length > 0);
    assert.ok(
      genericRangeRecommendation.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 5000000 && price <= 8000000;
      }),
    );

    semanticRoute = {
      ...semanticRoute,
      entities: {
        ...semanticRoute.entities,
        budget_min: null,
        budget_max: 3000000,
      },
      recommendation_request: {
        price_mode: "maximum",
        target_price: null,
        budget_min: null,
        budget_max: 3000000,
        purposes: ["display"],
        stock: null,
        condition: null,
        promo_only: false,
      },
      interpretation:
        "Pelanggan mengoreksi pilihan menjadi robot sekitar tiga juta untuk pajangan.",
    };

    const latestPriceAlternative = await ask(
      "Cari robot antara 5 sampe 8 juta buat pajangan. Kalau yang 3 jutaan ada?",
      null,
      { sessionId: `semantic_latest_price_${Date.now()}` },
    );
    assert.equal(latestPriceAlternative.intent, "recommendation");
    assert.ok(latestPriceAlternative.products.length > 0);
    assert.ok(
      latestPriceAlternative.products.every((item) => {
        const price = Number(item.numericPrice || 0);
        return price >= 2400000 && price <= 3600000;
      }),
    );
    assert.ok(
      latestPriceAlternative.products.every(
        (item) => Number(item.numericPrice || 0) !== 650000,
      ),
    );

    semanticRoute = {
      ...semanticRoute,
      entities: {
        ...semanticRoute.entities,
        product_names: ["Robot Ultraman Galactic"],
        budget_min: null,
        budget_max: null,
      },
      recommendation_request: {
        price_mode: "none",
        target_price: null,
        budget_min: null,
        budget_max: null,
        purposes: [],
        stock: null,
        condition: null,
        promo_only: false,
      },
      requires_product: true,
      interpretation:
        "Pelanggan mencari produk bernama Robot Ultraman Galactic.",
    };

    const unknownNamedRecommendation = await ask(
      "Ada Robot Ultraman Galactic yang bisa direkomendasikan?",
      null,
      { sessionId: `semantic_unknown_recommendation_${Date.now()}` },
    );
    assert.equal(unknownNamedRecommendation.intent, "recommendation");
    assert.equal(unknownNamedRecommendation.type, "text");
    assert.match(unknownNamedRecommendation.message, /belum ada di katalog/i);
    assert.equal(unknownNamedRecommendation.products, undefined);

    semanticRoute = {
      ...semanticRoute,
      intent: "recommendation",
      intents: ["recommendation"],
      goals: ["recommendation"],
      entities: {
        ...semanticRoute.entities,
        product_names: ["Fewture Getter Set 1,2,3 Black Version"],
      },
      interpretation:
        "Pelanggan meminta penilaian kecocokan Fewture untuk pajangan.",
    };

    const namedProductSuitability = await ask(
      "Apakah Fewture Getter Set 1,2,3 Black Version cocok untuk pajangan?",
      null,
      { sessionId: `named_suitability_${Date.now()}` },
    );
    assert.equal(namedProductSuitability.intent, "product_detail");
    assert.deepEqual(productNames(namedProductSuitability), [
      "Fewture Getter Set 1,2,3 Black Version",
    ]);
    assert.match(
      namedProductSuitability.reasoning_text,
      /Fewture Getter Set 1,2,3 Black Version/i,
    );
    assert.equal(
      namedProductSuitability.assistant_meta.llm_led.intent_source,
      "specific_product_suitability_guard",
    );
    assert.equal(
      namedProductSuitability.assistant_meta.llm_led.served_intent,
      "product_detail",
    );
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});
