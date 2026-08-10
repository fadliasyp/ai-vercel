import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const CAPABILITIES_PATTERN =
  /\b(?:chatbot|bot|kamu|anda)\s+(?:ini\s+)?(?:bisa+|dapat)\s+(?:bantu\s+)?(?:apa|ngapain)|\b(?:apa\s+(?:saja|aja)\s+yang\s+)?(?:bisa+|dapat)\s+(?:kamu|chatbot|bot)\s+(?:bantu|lakukan)|\b(?:bisa+|dapat)\s+bantu\s+(?:apa|ngapain)|\b(?:fitur|kemampuan|kapabilitas)\s+(?:chatbot|bot|kamu)\b/i;

export function looksLikeAssistantCapabilitiesQuestion(question = "") {
  return CAPABILITIES_PATTERN.test(normalizeIndonesianCommerceText(question));
}

export function buildAssistantCapabilitiesMessage() {
  return (
    "Aku bisa membantu kamu untuk:\n\n" +
    "- mencari produk Robot Jadul lewat nama, kategori, kebutuhan, budget, atau foto\n" +
    "- memberi rekomendasi, melihat detail, dan membandingkan produk\n" +
    "- mengecek harga, promo, stok ready, serta informasi PO yang tercatat\n" +
    "- menjelaskan cara membeli, metode pembayaran, ongkir, pengiriman, dan asuransi\n" +
    "- mengecek status pesanan dan membantu melacak nomor resi\n" +
    "- menjelaskan retur/refund serta informasi alamat dan jam operasional toko\n\n" +
    "Kamu cukup tulis kebutuhanmu dengan bahasa sehari-hari, misalnya: **carikan Chogokin ready di bawah 1 juta**."
  );
}
