import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCODPolicyMessage,
  buildTransactionPolicyMessage,
  looksLikeProductTransactionCompoundQuestion,
  looksLikePackingProtectionQuestion,
  looksLikeSameDayDispatchQuestion,
  looksLikeShippingCoverageQuestion,
  looksLikeShippingOriginQuestion,
  needsRecommendationBudgetClarification,
} from "../lib/chatbot/transactionIntent.js";

test("recognizes broad shipping destinations as ongkir flow", () => {
  const questions = [
    "Kalau ke luar pulau bisa kirim?",
    "Bisa kirim ke luar Jawa?",
    "Melayani pengiriman ke luar kota tidak?",
    "Bisa antar pulau?",
    "Pengiriman seluruh Indonesia bisa?",
    "Jangkauan pengiriman sampai mana?",
  ];

  for (const question of questions) {
    assert.equal(looksLikeShippingCoverageQuestion(question), true, question);
    assert.equal(looksLikeShippingOriginQuestion(question), false, question);
  }
});

test("keeps explicit shipping origin questions separate", () => {
  assert.equal(looksLikeShippingOriginQuestion("Barang dikirim dari mana?"), true);
  assert.equal(looksLikeShippingCoverageQuestion("Barang dikirim dari mana?"), false);
});

test("builds one consistent COD policy from the configured state", () => {
  assert.match(buildCODPolicyMessage({ enabled: false }), /belum tersedia/i);
  assert.match(buildCODPolicyMessage({ enabled: true }), /tersedia/i);
  assert.equal(
    buildCODPolicyMessage({ enabled: false }),
    buildCODPolicyMessage({ enabled: false }),
  );
});

test("answers every requested transaction policy in one response", () => {
  const payment = buildTransactionPolicyMessage(
    "Bisa COD tidak? Pembayarannya bisa pakai apa saja?",
    { codEnabled: false },
  );
  assert.match(payment, /COD \/ bayar di tempat belum tersedia/i);
  assert.match(payment, /Pilihan Pembayaran Tersedia/i);
  assert.match(payment, /QRIS/);

  const protection = buildTransactionPolicyMessage(
    "Pengirimannya aman kan? Bisa pakai asuransi dan packing kayu?",
  );
  assert.match(protection, /Asuransi Pengiriman/i);
  assert.match(protection, /Keamanan dan packing pesanan/i);
  assert.match(protection, /tidak otomatis disertakan atau dijamin tersedia/i);
});

test("keeps urgent dispatch promises conservative", () => {
  const question = "Kalau bayar sekarang bisa langsung dikirim hari ini?";
  assert.equal(looksLikeSameDayDispatchQuestion(question), true);
  assert.match(
    buildTransactionPolicyMessage(question),
    /tidak dapat dijamin otomatis/i,
  );
  assert.equal(looksLikePackingProtectionQuestion("bisa packing kayu?"), true);
});

test("detects product facts combined with transaction policy", () => {
  assert.equal(
    looksLikeProductTransactionCompoundQuestion(
      "Mazinger Z yang promo masih ready? Kalau bayar sekarang bisa dikirim hari ini?",
    ),
    true,
  );
  assert.equal(
    looksLikeProductTransactionCompoundQuestion("Bisa dikirim hari ini?"),
    false,
  );
  assert.equal(
    looksLikeProductTransactionCompoundQuestion("Mazinger Z masih ready?"),
    false,
  );
});

test("asks for a budget before running a budget-based recommendation", () => {
  assert.equal(
    needsRecommendationBudgetClarification(
      "Minta rekomendasi robot sesuai budget",
      false,
    ),
    true,
  );
  assert.equal(
    needsRecommendationBudgetClarification(
      "Rekomendasikan robot budget 1 juta",
      true,
    ),
    false,
  );
  assert.equal(
    needsRecommendationBudgetClarification("Rekomendasikan robot pajangan", false),
    false,
  );
});
