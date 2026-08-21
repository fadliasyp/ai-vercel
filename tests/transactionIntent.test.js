import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCODPolicyMessage,
  buildInternationalShippingMessage,
  buildTransactionTopicClarification,
  buildTransactionPolicyMessage,
  extractInternationalShippingDestination,
  looksLikeProductTransactionCompoundQuestion,
  looksLikePackingProtectionQuestion,
  looksLikePaymentMethodQuestion,
  looksLikePayLaterQuestion,
  looksLikeSameDayDispatchQuestion,
  looksLikeShippingCoverageQuestion,
  looksLikeInternationalShippingQuestion,
  looksLikeShippingOriginQuestion,
  looksLikeProductManufacturingOriginQuestion,
  needsRecommendationBudgetClarification,
} from "../lib/chatbot/transactionIntent.js";

test("routes international shipping to admin without inventing a quote", () => {
  const question =
    "Kalau kirim Voltes V ke Malaysia ongkir dan total harganya berapa USD?";
  assert.equal(extractInternationalShippingDestination(question), "Malaysia");
  assert.equal(looksLikeInternationalShippingQuestion(question), true);
  assert.equal(
    looksLikeInternationalShippingQuestion("Ongkir ke Tangerang berapa?"),
    false,
  );

  const message = buildInternationalShippingMessage("Malaysia");
  assert.match(message, /Admin Robot Jadul/);
  assert.match(message, /packing tambahan/);
  assert.match(message, /Total dalam USD/);
  assert.doesNotMatch(message, /Rp\s*[\d.]+/);
});

test("recognizes shipping coverage without forcing an ongkir flow", () => {
  const questions = [
    "Kalau ke luar pulau bisa kirim?",
    "Bisa kirim ke luar Jawa?",
    "Melayani pengiriman ke luar kota tidak?",
    "Bisa antar pulau?",
    "Pengiriman seluruh Indonesia bisa?",
    "Jangkauan pengiriman sampai mana?",
    "Bisa kirim ke Surabaya?",
  ];

  for (const question of questions) {
    assert.equal(looksLikeShippingCoverageQuestion(question), true, question);
    assert.equal(looksLikeShippingOriginQuestion(question), false, question);
  }
});

test("understands informal payment and PayLater questions", () => {
  const payLaterQuestion = "Woi jut bayarnya bisa make paylater ga?";
  assert.equal(looksLikePaymentMethodQuestion(payLaterQuestion), true);
  assert.equal(looksLikePayLaterQuestion(payLaterQuestion), true);
  assert.match(
    buildTransactionPolicyMessage(payLaterQuestion),
    /PayLater belum tercantum/i,
  );

  const methodsQuestion = "Pembayaran bisa apa aja emang?";
  assert.equal(looksLikePaymentMethodQuestion(methodsQuestion), true);
  assert.match(
    buildTransactionPolicyMessage(methodsQuestion),
    /Pilihan Pembayaran Tersedia/i,
  );
});

test("keeps an ambiguous transaction prompt optional", () => {
  assert.match(buildTransactionTopicClarification(), /tidak perlu menjawab/i);
});

test("keeps explicit shipping origin questions separate", () => {
  assert.equal(looksLikeShippingOriginQuestion("Barang dikirim dari mana?"), true);
  assert.equal(looksLikeShippingCoverageQuestion("Barang dikirim dari mana?"), false);
  assert.equal(
    looksLikeShippingOriginQuestion(
      "Robotnya diproduksi sendiri atau import dari luar?",
    ),
    false,
  );
  assert.equal(
    looksLikeProductManufacturingOriginQuestion(
      "Robotnya diproduksi sendiri atau import dari luar?",
    ),
    true,
  );
  assert.equal(
    looksLikeProductManufacturingOriginQuestion(
      "Kamu tau asal usul Robot Jadul engga?",
    ),
    false,
  );
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
  const bulkOffer = buildTransactionPolicyMessage(
    "Kalau beli 3 barang total 10 juta, dapat potongan atau gratis ongkir ke Depok nggak?",
  );
  assert.match(bulkOffer, /potongan tambahan atau gratis ongkir ke Depok/i);
  assert.match(bulkOffer, /belum bisa dijanjikan otomatis/i);

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
