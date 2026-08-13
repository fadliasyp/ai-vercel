import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWooProductsUrl,
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
