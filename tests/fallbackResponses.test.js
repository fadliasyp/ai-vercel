import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogNoMatchResponse,
  buildUnknownAnswerResponse,
} from "../lib/chatbot/fallbackResponses.js";

test("unknown store information includes a contextual admin handoff", () => {
  const response = buildUnknownAnswerResponse({
    topic: "asal-usul Robot Jadul",
  });

  assert.match(response.message, /belum punya informasi/i);
  assert.equal(response.admin_handoff.topic, "asal-usul Robot Jadul");
});

test("a missing catalog product never redirects the customer to admin", () => {
  const response = buildCatalogNoMatchResponse({
    intent: "product_detail",
  });

  assert.match(response.message, /belum ditemukan di katalog/i);
  assert.equal(response.intent, "product_detail");
  assert.equal("admin_handoff" in response, false);
});
