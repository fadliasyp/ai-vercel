import test from "node:test";
import assert from "node:assert/strict";

import {
  assessLocalCommerceScope,
  buildOutOfScopeMessage,
} from "../lib/chatbot/scopeGuard.js";

test("rejects clear questions outside the store scope", () => {
  assert.equal(
    assessLocalCommerceScope("jam berapa sekarang?"),
    "out_of_scope",
  );
  assert.equal(assessLocalCommerceScope("jam berapa?"), "out_of_scope");
  assert.equal(
    assessLocalCommerceScope("bagaimana cuaca hari ini?"),
    "out_of_scope",
  );
  assert.equal(
    assessLocalCommerceScope("siapa presiden Indonesia?"),
    "out_of_scope",
  );
  assert.equal(assessLocalCommerceScope("1 + 1 berapa?"), "out_of_scope");
  assert.equal(
    assessLocalCommerceScope("akar kuadrat dari 100 berapa?"),
    "out_of_scope",
  );
  assert.equal(
    assessLocalCommerceScope("jelaskan fotosintesis"),
    "out_of_scope",
  );
});

test("rejects obvious random input without calling it a product search", () => {
  assert.equal(assessLocalCommerceScope("ahgawhgfak"), "out_of_scope");
  assert.equal(assessLocalCommerceScope("asdfghjkl"), "out_of_scope");
  assert.equal(assessLocalCommerceScope("asdasdasd"), "out_of_scope");
});

test("keeps supported ecommerce questions in scope", () => {
  assert.equal(
    assessLocalCommerceScope("ada produk Chogokin yang ready?"),
    "in_scope",
  );
  assert.equal(
    assessLocalCommerceScope("metode pembayarannya apa saja?"),
    "in_scope",
  );
  assert.equal(
    assessLocalCommerceScope("jam buka tokonya kapan?"),
    "in_scope",
  );
  assert.equal(
    assessLocalCommerceScope("robot jadul buka jam berapa sih?"),
    "in_scope",
  );
  assert.equal(
    assessLocalCommerceScope("chatbot ini bisaa apa aja?"),
    "in_scope",
  );
  assert.equal(
    assessLocalCommerceScope("GX-47T Energer Z"),
    "in_scope",
  );
});

test("allows short product follow-ups when conversation context exists", () => {
  assert.equal(
    assessLocalCommerceScope("yang kedua ready?", {
      lastIntent: "product_discovery",
      hasRecentProducts: true,
    }),
    "in_scope",
  );
  assert.equal(
    assessLocalCommerceScope("berapa totalnya?", {
      lastIntent: "shipping_transaction",
      hasPending: true,
    }),
    "in_scope",
  );
});

test("clear outside questions override an active commerce context", () => {
  assert.equal(
    assessLocalCommerceScope("sekarang jam berapa?", {
      lastIntent: "transaction_status",
      hasPending: true,
    }),
    "out_of_scope",
  );
});

test("leaves unknown requests for the single-model scope classifier", () => {
  assert.equal(
    assessLocalCommerceScope("tolong jelaskan hal ini"),
    "ambiguous",
  );
});

test("uses realistic messages for unsupported and random questions", () => {
  assert.match(
    buildOutOfScopeMessage("1 + 1 berapa?"),
    /di luar topik.*asisten ecommerce Robot Jadul/i,
  );
  assert.match(
    buildOutOfScopeMessage("ahgawhgfak"),
    /belum memahami pertanyaan/i,
  );
});
