import test from "node:test";
import assert from "node:assert/strict";

import { detectExplicitIntentOverride } from "../lib/chatbot/intentFusion.js";

const cases = {
  greeting: [
    "halooo min aku bru mampir nih",
    "permisi kak, boleh tanya?",
  ],
  product_discovery: [
    "lg nyari figure robot lawas, ad apa aj?",
    "tolong cariin daftar chogokin yang dijual",
  ],
  recommendation: [
    "rek robot yg cocok bwt hadiah dong",
    "boleh direkomendasikan yang worth it untuk pemula?",
  ],
  product_detail: [
    "spek dan kelengkapnnya gmn?",
    "apa kekurangan produk ini sebelum dibeli?",
  ],
  price_promo: [
    "hrg produk ini brp ya?",
    "lg ada disc atau potongan engga?",
  ],
  stock_availability: [
    "stk brg ini msh ready gak?",
    "ketersediaannya gimana, sudah habis belum?",
  ],
  shipping_transaction: [
    "ong ke bekasi brp ya?",
    "pembayarannya bisa qris atau transfer?",
  ],
  shipping_origin: [
    "barang dikirm dari kota mn?",
    "alamat lengkap warehouse kalian dimana?",
  ],
  return_product: [
    "brg gak sesuai foto bsa rtr?",
    "kalau salah kirim bagaimana pengembaliannya?",
  ],
  compare: [
    "bndingin Voltes sama Daimos dong",
    "dua produk ini kalau dibandingkan unggul mana?",
  ],
  transaction_status: [
    "stat ordr saya udh diproses blm?",
    "perkembangan pesanannya sudah sampai tahap mana?",
  ],
  shipment_tracking: [
    "trck paket saya smpe mn?",
    "kiriman saya sedang dilacak, posisi terakhir dimana?",
  ],
  general: [
    "toko bka jm brp?",
    "ada cabang toko di luar Jakarta?",
  ],
};

test("understands formal, casual, abbreviated, typo, and inflected intent language", () => {
  for (const [expectedIntent, questions] of Object.entries(cases)) {
    for (const question of questions) {
      assert.equal(
        detectExplicitIntentOverride(question)?.intent,
        expectedIntent,
        question,
      );
    }
  }
});
