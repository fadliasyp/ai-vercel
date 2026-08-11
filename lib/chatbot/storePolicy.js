import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const NEGOTIATION_PATTERN =
  /\b(?:nego(?:siasi)?|tawar|ditawar|menawar|harga\s+(?:pas|fix)|bisa\s+kurang|boleh\s+kurang|kurang\s+harga)\b/i;
const GENERAL_STOCK_POLICY_PATTERN =
  /\b(?:selalu|semua(?:nya)?|setiap)\s+(?:ready|tersedia)|\bada\s+(?:yang|yg)\s+(?:po|pre\s*order|preorder)|\b(?:ready|tersedia)\s+(?:atau|dan)\s+(?:po|pre\s*order|preorder)|\b(?:bisa|ada)\s+(?:po|pre\s*order|preorder)|\bsistem\s+(?:po|pre\s*order|preorder)\b/i;
const RETURN_POLICY_PATTERN =
  /\b(?:retur|return|refund|uang\s+kembali|pengembalian\s+uang|balikin\s+uang|kembalikan\s+uang|barang\s+rusak|produk\s+rusak|datang\s+rusak|nyampe\s+rusak|cacat|salah\s+kirim|tidak\s+sesuai)\b/i;

export const RETURN_POLICY = Object.freeze({
  claimWindow: "2 x 24 jam",
  reviewTime: "1-3 hari kerja",
  refundTime: "3-7 hari kerja",
});

export function looksLikeNegotiationPolicyQuestion(question = "") {
  return NEGOTIATION_PATTERN.test(normalizeIndonesianCommerceText(question));
}

export function looksLikeGeneralStockPolicyQuestion(question = "") {
  return GENERAL_STOCK_POLICY_PATTERN.test(
    normalizeIndonesianCommerceText(question),
  );
}

export function looksLikeReturnPolicyQuestion(question = "") {
  return RETURN_POLICY_PATTERN.test(normalizeIndonesianCommerceText(question));
}

export function detectReturnIssue(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();

  if (/\b(?:berubah pikiran|tidak jadi|ga jadi|engga jadi|batal beli)\b/.test(text)) {
    return "change_of_mind";
  }
  if (/\b(?:rusak|cacat|terkelupas|patah|retak|pecah)\b/.test(text)) {
    return "damaged";
  }
  if (
    /\b(?:part(?:-?nya| nya)? kurang|tidak lengkap|ga lengkap|engga lengkap|kurang part|aksesori(?:-?nya| nya)? kurang|aksesoris(?:-?nya| nya)? kurang)\b/.test(
      text,
    )
  ) {
    return "incomplete";
  }
  if (/\b(?:box penyok|kotak penyok|kemasan penyok|penyok)\b/.test(text)) {
    return "dented_box";
  }
  if (/\b(?:salah kirim|barang salah|tidak sesuai|beda dengan deskripsi)\b/.test(text)) {
    return "wrong_item";
  }

  return "unknown";
}

export function getReturnActionContext(question = "") {
  return detectReturnIssue(question) === "unknown"
    ? "return_issue_selection"
    : "return_claim_help";
}

export function buildNegotiationPolicyMessage() {
  return (
    "Harga yang tampil di katalog adalah harga yang berlaku saat ini. " +
    "Untuk kemungkinan **nego**, kamu boleh menanyakannya ke admin, tetapi aku tidak bisa menjanjikan semua produk dapat ditawar karena keputusannya bisa berbeda untuk setiap produk.\n\n" +
    "Kirim nama atau link produknya ke WhatsApp Admin: https://wa.me/6285975313930"
  );
}

function looksLikePreorderProduct(product = {}) {
  if (product.stock === "onbackorder") return true;
  const text = `${product.name || ""} ${product.category || ""} ${product.description || ""}`;
  return /\b(?:pre\s*order|preorder|open\s+po|backorder)\b/i.test(text);
}

export function summarizeCatalogStockModes(products = []) {
  const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
  return {
    total: safeProducts.length,
    ready: safeProducts.filter((product) => product.stock === "instock").length,
    preorder: safeProducts.filter(looksLikePreorderProduct).length,
    unavailable: safeProducts.filter(
      (product) =>
        product.stock !== "instock" && !looksLikePreorderProduct(product),
    ).length,
  };
}

export function buildGeneralStockPolicyMessage(products = []) {
  const stock = summarizeCatalogStockModes(products);
  let message =
    "Tidak semua robot selalu ready. Statusnya bisa berbeda per produk dan dapat berubah mengikuti stok toko.";

  if (stock.total > 0) {
    message += ` Dari katalog yang terbaca saat ini, **${stock.ready} dari ${stock.total} produk** berstatus ready.`;
  }

  if (stock.total > 0) {
    if (stock.preorder > 0) {
      message += ` Ada **${stock.preorder} produk** yang ditandai PO/backorder.`;
    } else {
      message +=
        " Saat ini aku belum melihat produk yang ditandai PO/backorder secara eksplisit di katalog.";
    }
  }

  message +=
    " Untuk status produk tertentu, lihat label stok pada produknya atau konfirmasi ke admin karena status bisa berubah sewaktu-waktu.";
  return message;
}

export function buildReturnPolicyMessage(question = "") {
  const returnIssue = detectReturnIssue(question);
  let issue = "kendala pada barang yang diterima";

  if (returnIssue === "damaged") {
    issue = "barang rusak atau cacat";
  } else if (returnIssue === "incomplete") {
    issue = "part kurang atau barang tidak lengkap";
  } else if (returnIssue === "dented_box") {
    issue = "box atau kemasan penyok";
  } else if (returnIssue === "wrong_item") {
    issue = "barang salah kirim atau tidak sesuai deskripsi";
  } else if (returnIssue === "change_of_mind") {
    issue = "retur karena berubah pikiran";
  }

  const eligibilityNote =
    returnIssue === "change_of_mind"
      ? " Pengajuan akan ditinjau terutama jika barang belum digunakan, belum dibongkar, dan seluruh kemasan serta kelengkapannya masih utuh."
      : "";

  return (
    `Maaf atas kendalanya. Untuk **${issue}**, retur atau refund **bisa diajukan**, tetapi tidak otomatis disetujui.${eligibilityNote}\n\n` +
    `**Batas pengajuan:** maksimal **${RETURN_POLICY.claimWindow}** sejak paket diterima. ` +
    "Kirim ke WhatsApp Admin https://wa.me/6285975313930: nomor pesanan, foto barang/cacat/kemasan/label kirim, video unboxing jika ada, dan kronologi. " +
    "Simpan kemasan/kelengkapannya; jangan gunakan, bongkar, perbaiki, atau kirim balik sebelum arahan admin.\n\n" +
    `Bukti ditinjau dalam **${RETURN_POLICY.reviewTime}** setelah lengkap. Jika disetujui, solusinya penggantian jika stok ada, refund sebagian, atau penuh. ` +
    `Refund diproses dalam **${RETURN_POLICY.refundTime}** setelah retur diterima dan diverifikasi.\n\n` +
    "Produk JUNK/second: cacat yang sudah tertulis bukan dasar klaim; kerusakan tambahan yang tidak tercantum tetap bisa diajukan."
  );
}
