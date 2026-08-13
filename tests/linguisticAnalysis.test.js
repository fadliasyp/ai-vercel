import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeIndonesianQuestion,
  compactLinguisticAnalysis,
} from "../lib/chatbot/linguisticAnalysis.js";

test("parses store context, predicate, object, POS, and dependencies", () => {
  const result = analyzeIndonesianQuestion("ditoko ini jual baju juga ga");

  assert.equal(result.syntax.subject, "Robot Jadul");
  assert.equal(result.syntax.subject_source, "store_context");
  assert.equal(result.syntax.predicate, "jual");
  assert.equal(result.syntax.object, "baju");
  assert.equal(result.syntax.negated, true);
  assert.equal(result.syntax.question_type, "yes_no");
  assert.deepEqual(result.entities.product_terms, ["baju"]);

  const byLemma = Object.fromEntries(
    result.tokens.map((token) => [token.lemma, token]),
  );
  assert.equal(byLemma.di.pos, "ADP");
  assert.equal(byLemma.toko.pos, "NOUN");
  assert.equal(byLemma.jual.pos, "VERB");
  assert.equal(byLemma.jual.dep, "root");
  assert.equal(byLemma.baju.pos, "NOUN");
  assert.equal(byLemma.baju.dep, "obj");
  assert.equal(byLemma.ga.dep, "neg");
});

test("extracts ecommerce entities without confusing numbers", () => {
  const shipping = analyzeIndonesianQuestion(
    "cek ongkir ke Tangerang, Rajeg",
  );
  assert.equal(shipping.entities.location, "Tangerang, Rajeg");
  assert.deepEqual(shipping.entities.product_terms, []);

  const order = analyzeIndonesianQuestion("cek status order 6864");
  assert.equal(order.entities.order_id, "6864");

  const budget = analyzeIndonesianQuestion("budget maksimal 500 ribu");
  assert.equal(budget.entities.budget_max, 500000);
  assert.equal(budget.entities.order_id, "");
});

test("builds a compact token-efficient LLM hint", () => {
  const compact = compactLinguisticAnalysis(
    analyzeIndonesianQuestion("ditoko ini jual baju juga ga"),
  );

  assert.deepEqual(compact, {
    subject: "Robot Jadul",
    predicate: "jual",
    object: "baju",
    negated: true,
    question_type: "yes_no",
    entities: {
      store_name: "Robot Jadul",
      product_terms: ["baju"],
    },
  });
  assert.ok(JSON.stringify(compact).length < 220);
});

test("extracts two comparison entities and ecommerce attributes", () => {
  const comparison = analyzeIndonesianQuestion(
    "bandingkan Bandai GX-47 MISB dengan Takara GX-48 ready",
  );

  assert.deepEqual(comparison.entities.product_terms, [
    "bandai gx 47 misb",
    "takara gx 48",
  ]);
  assert.deepEqual(comparison.entities.brands, ["Bandai", "Takara"]);
  assert.deepEqual(comparison.entities.conditions, ["MISB"]);
  assert.equal(comparison.entities.stock_state, "ready");
});

test("parses informal repeated spelling without losing the merchandise object", () => {
  const result = analyzeIndonesianQuestion(
    "ditokoo ini jualll baju2 jugaaa gaa?",
  );

  assert.equal(result.normalized_text, "ditoko ini jual baju juga ga?");
  assert.equal(result.syntax.subject, "Robot Jadul");
  assert.equal(result.syntax.predicate, "jual");
  assert.equal(result.syntax.object, "baju");
  assert.deepEqual(result.entities.product_terms, ["baju"]);
});

test("adds compact morphology hints for implied ecommerce meaning", () => {
  const result = analyzeIndonesianQuestion(
    "gimana pembayaran dan pengirimannya?",
  );
  const compact = compactLinguisticAnalysis(result);

  assert.equal(result.syntax.predicate, "bayar");
  assert.deepEqual(result.morphology.stems, ["bayar", "kirim"]);
  assert.deepEqual(compact.morphology_stems, ["bayar", "kirim"]);
});

test("keeps greetings out of the subject while extracting product predicates", () => {
  const analysis = analyzeIndonesianQuestion(
    "Halo, ada Getter Robo yang lagi diskon ngga? Kalo ada, ready stock sisa berapa pcs?",
  );

  assert.equal(analysis.syntax.subject, "");
  assert.equal(analysis.syntax.predicate, "ada");
  assert.equal(analysis.syntax.object, "getter robo");
  assert.deepEqual(analysis.entities.product_terms, ["getter robo"]);
});
