import test from "node:test";
import assert from "node:assert/strict";

import {
  buildIndonesianIntentText,
  extractIndonesianMorphologyHints,
  stemIndonesianWord,
} from "../lib/chatbot/indonesianMorphology.js";

test("extracts safe Indonesian ecommerce roots from inflected words", () => {
  assert.equal(stemIndonesianWord("pembayarannya"), "bayar");
  assert.equal(stemIndonesianWord("pengirimannya"), "kirim");
  assert.equal(stemIndonesianWord("dibandingkan"), "banding");
  assert.equal(stemIndonesianWord("direkomendasikan"), "rekomendasi");
  assert.equal(stemIndonesianWord("pengembaliannya"), "kembali");
  assert.deepEqual(
    extractIndonesianMorphologyHints(
      "pembayarannya sudah dikirimkan dan sedang dilacak",
    ),
    ["bayar", "kirim", "lacak"],
  );
});

test("protects brands, series, codes, prices, and tracking IDs", () => {
  assert.equal(stemIndonesianWord("Bandai"), "bandai");
  assert.equal(stemIndonesianWord("Chogokin"), "chogokin");
  assert.equal(stemIndonesianWord("GX-47T"), "gx-47t");
  assert.equal(stemIndonesianWord("500rb"), "500rb");
  assert.equal(stemIndonesianWord("JP123"), "jp123");
});

test("appends only compact morphology hints for intent routing", () => {
  assert.equal(
    buildIndonesianIntentText("boleh direkomendasikan yang cocok untuk hadiah?"),
    "boleh direkomendasikan yang cocok untuk hadiah? rekomendasi",
  );
});

