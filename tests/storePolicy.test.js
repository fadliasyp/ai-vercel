import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBulkPurchaseOfferMessage,
  buildGeneralStockPolicyMessage,
  buildNegotiationPolicyMessage,
  buildReturnPolicyMessage,
  detectReturnIssue,
  detectReturnQuestionType,
  extractBulkPurchaseOfferContext,
  getReturnActionContext,
  looksLikeGeneralStockPolicyQuestion,
  looksLikeNegotiationPolicyQuestion,
  looksLikePostPurchaseReturnIssue,
  looksLikeReturnPolicyQuestion,
  RETURN_POLICY,
  summarizeCatalogStockModes,
} from "../lib/chatbot/storePolicy.js";

test("extracts the full context of a bulk purchase offer", () => {
  const context = extractBulkPurchaseOfferContext(
    "Kalau beli 3 barang total 10 juta, dapat potongan atau gratis ongkir ke Depok nggak?",
  );

  assert.deepEqual(context, {
    quantity: 3,
    cartTotal: 10_000_000,
    location: "Depok",
    asksFreeShipping: true,
  });
  assert.match(buildBulkPurchaseOfferMessage(context), /3 barang/);
  assert.match(buildBulkPurchaseOfferMessage(context), /Rp 10\.000\.000/);
  assert.match(buildBulkPurchaseOfferMessage(context), /Depok/);
});

test("recognizes general negotiation questions without requiring a product", () => {
  assert.equal(
    looksLikeNegotiationPolicyQuestion(
      "aku mau nanya, kira2 harga robot disini bisa di tawar engga ya?",
    ),
    true,
  );
  assert.equal(
    looksLikeNegotiationPolicyQuestion("harga Mazinger Z berapa?"),
    false,
  );
  assert.match(buildNegotiationPolicyMessage(), /tidak bisa menjanjikan/i);
});

test("recognizes ready versus PO policy and summarizes live stock facts", () => {
  assert.equal(
    looksLikeGeneralStockPolicyQuestion(
      "kalau robot disini selalu ready atau ada yg po?",
    ),
    true,
  );
  assert.equal(
    looksLikeGeneralStockPolicyQuestion("Mazinger Z ready?"),
    false,
  );

  const products = [
    { name: "A", stock: "instock" },
    { name: "B", stock: "instock" },
    { name: "C", stock: "onbackorder" },
    { name: "D", stock: "outofstock" },
  ];
  assert.deepEqual(summarizeCatalogStockModes(products), {
    total: 4,
    ready: 2,
    preorder: 1,
    unavailable: 1,
  });
  assert.match(buildGeneralStockPolicyMessage(products), /2 dari 4 produk/);
  assert.match(buildGeneralStockPolicyMessage(products), /1 produk.*PO/i);
  assert.doesNotMatch(
    buildGeneralStockPolicyMessage([]),
    /belum melihat produk yang ditandai PO/i,
  );
});

test("keeps return and refund policy deterministic and non-committal", () => {
  const question =
    "Barang saya rusak dan catnya terkelupas, bisa retur dan refund?";
  const first = buildReturnPolicyMessage(question);
  const second = buildReturnPolicyMessage(question);

  assert.equal(first, second);
  assert.match(first, /barang rusak atau cacat/i);
  assert.match(first, /nomor pesanan/i);
  assert.match(first, /video unboxing/i);
  assert.match(first, /tidak otomatis disetujui/i);
  assert.match(first, new RegExp(RETURN_POLICY.claimWindow));
  assert.match(first, new RegExp(RETURN_POLICY.reviewTime));
  assert.match(first, new RegExp(RETURN_POLICY.refundTime));
  assert.match(first, /refund sebagian.*refund penuh/i);
});

test("separates pre-purchase condition checks from implicit return incidents", () => {
  assert.equal(
    looksLikeReturnPolicyQuestion(
      "Produk Getter Robo ini ada cacat atau rusak parah engga?",
    ),
    false,
  );
  assert.equal(
    looksLikePostPurchaseReturnIssue(
      "Pas dibuka ternyata ada part yang hilang, ngurusnya gimana?",
    ),
    true,
  );
  assert.equal(
    looksLikeReturnPolicyQuestion(
      "Kalau sampai barangnya beda dari foto harus gimana?",
    ),
    true,
  );
});

test("explains wrong-item and JUNK claims without promising an automatic refund", () => {
  const wrongItem = buildReturnPolicyMessage(
    "Pesanan yang datang salah kirim dan tidak sesuai deskripsi",
  );
  const junkItem = buildReturnPolicyMessage(
    "Produk JUNK saya ternyata punya kerusakan tambahan yang tidak ditulis",
  );

  assert.match(wrongItem, /salah kirim atau tidak sesuai deskripsi/i);
  assert.match(junkItem, /cacat yang sudah tertulis.*bukan dasar klaim/i);
  assert.match(junkItem, /kerusakan tambahan.*tetap bisa diajukan/i);
  assert.doesNotMatch(wrongItem, /pasti.*refund|refund.*pasti/i);
});

test("directs return questions according to the customer's issue", () => {
  assert.equal(detectReturnIssue("Saya mau retur karena part-nya kurang"), "incomplete");
  assert.equal(
    getReturnActionContext("Bagaimana ketentuan retur di toko ini?"),
    "return_issue_selection",
  );
  assert.equal(
    getReturnActionContext("Barang saya pecah saat diterima"),
    "return_claim_help",
  );
  assert.match(
    buildReturnPolicyMessage("Saya berubah pikiran dan ingin retur"),
    /belum digunakan.*seluruh kelengkapan/i,
  );
});

test("answers each return follow-up with correlated but different policy", () => {
  const procedure = buildReturnPolicyMessage("Cara return gimana?");
  const evidence = buildReturnPolicyMessage(
    "Apa bukti yang perlu disiapkan untuk retur barang rusak?",
  );
  const timing = buildReturnPolicyMessage("Berapa lama proses refund?");
  const status = buildReturnPolicyMessage("Bagaimana status pengajuan retur saya?");

  assert.equal(detectReturnQuestionType("Berapa lama proses refund?"), "refund_timing");
  assert.match(procedure, /Berikut alur retur/i);
  assert.match(evidence, /foto close-up bagian yang rusak/i);
  assert.match(timing, /Waktu refund dihitung/i);
  assert.match(status, /belum dapat membuka status laporan retur pribadi/i);
  assert.equal(new Set([procedure, evidence, timing, status]).size, 4);

  for (const answer of [procedure, evidence, timing, status]) {
    assert.match(answer, /Laporkan ke Admin Robot Jadul/i);
  }
});
