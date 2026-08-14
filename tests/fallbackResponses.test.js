import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogNoMatchResponse,
  buildUnknownAnswerResponse,
  looksLikeAdminContactQuestion,
} from "../lib/chatbot/fallbackResponses.js";

test("does not confuse the stock unit pcs with customer service", () => {
  for (const question of [
    "Halo, ada Getter Robo yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs sih",
    "Ideon ready berapa pcs?",
    "getter robo stoknya sisa berapa PCS",
  ]) {
    assert.equal(looksLikeAdminContactQuestion(question), false, question);
  }

  for (const question of [
    "Boleh minta nomor admin?",
    "Saya mau hubungi CS",
    "Ada kontak customer service?",
  ]) {
    assert.equal(looksLikeAdminContactQuestion(question), true, question);
  }
});

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
