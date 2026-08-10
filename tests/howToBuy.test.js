import test from "node:test";
import assert from "node:assert/strict";

import {
  decodeHtmlEntities,
  getHowToBuySources,
} from "../lib/chatbot/howToBuy.js";

test("decodes WordPress HTML entities into readable punctuation", () => {
  assert.equal(
    decodeHtmlEntities(
      "Status &#8220;Processing&#8221; &amp; customer&#039;s note&hellip;",
    ),
    `Status “Processing” & customer's note...`,
  );
});

test("uses fadli.site for both how-to-buy retrieval methods", () => {
  assert.deepEqual(getHowToBuySources({}), {
    apiUrl:
      "https://fadli.site/wp-json/wp/v2/pages?slug=how-to-buy&_fields=content",
    pageUrl: "https://fadli.site/how-to-buy/",
  });
});

test("keeps both how-to-buy methods on a configured WordPress domain", () => {
  assert.deepEqual(
    getHowToBuySources({ WP_BASE_URL: "https://shop.example.com/store/" }),
    {
      apiUrl:
        "https://shop.example.com/store/wp-json/wp/v2/pages?slug=how-to-buy&_fields=content",
      pageUrl: "https://shop.example.com/store/how-to-buy/",
    },
  );
});
