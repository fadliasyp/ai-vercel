import test from "node:test";
import assert from "node:assert/strict";

import {
  isLikelyTypoMatch,
  normalizeIndonesianCommerceText,
} from "../lib/chatbot/textNormalization.js";

test("normalizes chat abbreviations, repeated letters, and light typos", () => {
  assert.equal(
    normalizeIndonesianCommerceText(
      "Kira2 stooook Chogokinn masih adaaa enggaaa?",
    ),
    "kira kira stok chogokin masih ada engga?",
  );
  assert.equal(
    normalizeIndonesianCommerceText("rekomndasi robot buat hadiaah"),
    "rekomendasi robot buat hadiah",
  );
  assert.equal(
    normalizeIndonesianCommerceText("brp ongkiir dgn JNE skrg?"),
    "berapa ongkir dengan jne sekarang?",
  );
  assert.equal(
    normalizeIndonesianCommerceText(
      "rekomenndasi dibwah 2jt yg redy, part ilang bsa komplen?",
    ),
    "rekomendasi dibawah 2jt yang ready, part hilang bisa komplain?",
  );
});

test("normalizes safe numeric reduplication without touching identifiers", () => {
  assert.equal(
    normalizeIndonesianCommerceText("produk2 di bawah 500rb apa aja?"),
    "produk di bawah 500rb apa aja?",
  );
  assert.equal(
    normalizeIndonesianCommerceText(
      "GX-47T V2 order #6864 resi JP123 500rb",
    ),
    "gx-47t v2 order #6864 resi jp123 500rb",
  );
});

test("normalizes abbreviations across every commerce flow", () => {
  assert.equal(
    normalizeIndonesianCommerceText(
      "rek brg, cek stk, hrg, ong, almt, byr, rtr, stat ordr, trck",
    ),
    "rekomendasi barang, cek stok, harga, ongkir, alamat, bayar, retur, status order, tracking",
  );
});

test("keeps catalog typo matching conservative", () => {
  assert.equal(isLikelyTypoMatch("ultramann", "ultraman"), true);
  assert.equal(isLikelyTypoMatch("ultramann", "voltron"), false);
  assert.equal(isLikelyTypoMatch("gx", "dx"), false);
  assert.equal(isLikelyTypoMatch("500rb", "50000"), false);
});
