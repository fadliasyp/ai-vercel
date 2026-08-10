import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeneralStockPolicyMessage,
  buildNegotiationPolicyMessage,
  buildReturnPolicyMessage,
  looksLikeGeneralStockPolicyQuestion,
  looksLikeNegotiationPolicyQuestion,
  RETURN_POLICY,
  summarizeCatalogStockModes,
} from "../lib/chatbot/storePolicy.js";

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
  assert.match(first, /refund sebagian.*penuh/i);
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
