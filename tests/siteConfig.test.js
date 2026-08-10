import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWordPressUrl,
  getWordPressBaseUrl,
  migrateLegacyWordPressUrl,
} from "../lib/chatbot/siteConfig.js";

test("uses fadli.site as the default WordPress domain", () => {
  assert.equal(getWordPressBaseUrl({}), "https://fadli.site");
  assert.equal(
    buildWordPressUrl("wp-json/wc/v3/products", {}),
    "https://fadli.site/wp-json/wc/v3/products",
  );
});

test("supports a normalized WordPress base URL override", () => {
  const env = { WP_BASE_URL: "https://shop.example.com/store///" };

  assert.equal(
    getWordPressBaseUrl(env),
    "https://shop.example.com/store",
  );
  assert.equal(
    buildWordPressUrl("/wp-json/rj/v1/cities?q=jakarta", env),
    "https://shop.example.com/store/wp-json/rj/v1/cities?q=jakarta",
  );
});

test("migrates only URLs that use the legacy WordPress base", () => {
  assert.equal(
    migrateLegacyWordPressUrl(
      "https://pstaging.my.id/robotjadul/product/voltes-v/",
      {},
    ),
    "https://fadli.site/product/voltes-v/",
  );
  assert.equal(
    migrateLegacyWordPressUrl("https://example.com/product/voltes-v/", {}),
    "https://example.com/product/voltes-v/",
  );
});
