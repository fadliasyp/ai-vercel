import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWooProductsUrl,
  getWooProductsCached,
  WOO_PRODUCT_FIELDS,
} from "../lib/chatbot/wooCatalog.js";

test("builds a compact WooCommerce product request", () => {
  const url = new URL(
    buildWooProductsUrl({
      per_page: 100,
      page: 2,
      status: "publish",
    }, {}),
  );

  assert.equal(url.searchParams.get("per_page"), "100");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("status"), "publish");
  assert.equal(url.searchParams.get("_fields"), WOO_PRODUCT_FIELDS);
  assert.equal(url.origin, "https://fadli.site");
  assert.match(WOO_PRODUCT_FIELDS, /\bid\b/);
  assert.match(WOO_PRODUCT_FIELDS, /\bname\b/);
  assert.match(WOO_PRODUCT_FIELDS, /\bstock_status\b/);
  assert.match(WOO_PRODUCT_FIELDS, /\bprice\b/);
  assert.match(WOO_PRODUCT_FIELDS, /\bshort_description\b/);
});

test("retries one transient WooCommerce transport failure", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.WC_PRODUCTS_URL;
  const originalKey = process.env.WC_KEY;
  const originalSecret = process.env.WC_SECRET;
  let fetchCalls = 0;

  process.env.WC_PRODUCTS_URL = "https://catalog.test/products";
  process.env.WC_KEY = "test-key";
  process.env.WC_SECRET = "test-secret";
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      const error = new TypeError("fetch failed");
      error.cause = { code: "UND_ERR_CONNECT_TIMEOUT" };
      throw error;
    }

    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const products = await getWooProductsCached({
      timeoutMs: 100,
      retries: 1,
    });

    assert.deepEqual(products, []);
    assert.equal(fetchCalls, 2);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl == null) delete process.env.WC_PRODUCTS_URL;
    else process.env.WC_PRODUCTS_URL = originalUrl;
    if (originalKey == null) delete process.env.WC_KEY;
    else process.env.WC_KEY = originalKey;
    if (originalSecret == null) delete process.env.WC_SECRET;
    else process.env.WC_SECRET = originalSecret;
  }
});

test("does not retry a non-transient WooCommerce client error", async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.WC_PRODUCTS_URL;
  const originalKey = process.env.WC_KEY;
  const originalSecret = process.env.WC_SECRET;
  let fetchCalls = 0;

  process.env.WC_PRODUCTS_URL = "https://catalog.test/products";
  process.env.WC_KEY = "test-key";
  process.env.WC_SECRET = "test-secret";
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      getWooProductsCached({ timeoutMs: 100, retries: 1 }),
      (error) => error?.status === 401,
    );
    assert.equal(fetchCalls, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl == null) delete process.env.WC_PRODUCTS_URL;
    else process.env.WC_PRODUCTS_URL = originalUrl;
    if (originalKey == null) delete process.env.WC_KEY;
    else process.env.WC_KEY = originalKey;
    if (originalSecret == null) delete process.env.WC_SECRET;
    else process.env.WC_SECRET = originalSecret;
  }
});
