import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const NEGOTIATION_PATTERN =
  /\b(?:nego(?:siasi)?|tawar|ditawar|menawar|harga\s+(?:pas|fix)|bisa\s+kurang|boleh\s+kurang|kurang\s+harga)\b/i;
const GENERAL_STOCK_POLICY_PATTERN =
  /\b(?:selalu|semua(?:nya)?|setiap)\s+(?:ready|tersedia)|\bada\s+(?:yang|yg)\s+(?:po|pre\s*order|preorder)|\b(?:ready|tersedia)\s+(?:atau|dan)\s+(?:po|pre\s*order|preorder)|\b(?:bisa|ada)\s+(?:po|pre\s*order|preorder)|\bsistem\s+(?:po|pre\s*order|preorder)\b/i;
const EXPLICIT_RETURN_POLICY_PATTERN =
  /\b(?:retur|return|refund|komplain|klaim|tukar\s+barang|uang\s+kembali|pengembalian\s+uang|balikin\s+uang|kembalikan\s+uang|salah\s+kirim|tidak\s+sesuai(?:\s+(?:foto|deskripsi))?)\b/i;
const POST_PURCHASE_MARKER_PATTERN =
  /\b(?:baru\s+)?(?:sampai|datang|diterima|dibuka|unboxing)\b|\b(?:saya|aku)\s+terima\b/i;
const RETURN_PROBLEM_PATTERN =
  /\b(?:rusak|kerusakan|cacat|terkelupas|patah|retak|pecah|penyok|salah|beda\s+(?:dari|dengan)\s+(?:foto|deskripsi)|tidak\s+sesuai|(?:part|aksesori|aksesoris)(?:-?nya)?(?:\s+yang)?\s+(?:kurang|hilang|tidak\s+ada))\b/i;
const OWNED_DAMAGED_ITEM_PATTERN =
  /\b(?:barang|produk|paket|pesanan)(?:nya)?\s+(?:saya|aku)\b.{0,60}\b(?:rusak|cacat|terkelupas|patah|retak|pecah|penyok|salah|tidak\s+sesuai|part\s+(?:kurang|hilang))\b/i;

export const RETURN_POLICY = Object.freeze({
  claimWindow: "2 x 24 jam",
  reviewTime: "1-3 hari kerja",
  refundTime: "3-7 hari kerja",
});

const RETURN_ADMIN_URL = "https://wa.me/6285975313930";

export function looksLikeNegotiationPolicyQuestion(question = "") {
  return NEGOTIATION_PATTERN.test(normalizeIndonesianCommerceText(question));
}

export function looksLikeGeneralStockPolicyQuestion(question = "") {
  return GENERAL_STOCK_POLICY_PATTERN.test(
    normalizeIndonesianCommerceText(question),
  );
}

export function looksLikeReturnPolicyQuestion(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();
  return (
    EXPLICIT_RETURN_POLICY_PATTERN.test(text) ||
    looksLikePostPurchaseReturnIssue(text)
  );
}

export function looksLikePostPurchaseReturnIssue(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();
  return (
    OWNED_DAMAGED_ITEM_PATTERN.test(text) ||
    (POST_PURCHASE_MARKER_PATTERN.test(text) &&
      RETURN_PROBLEM_PATTERN.test(text))
  );
}

export function detectReturnIssue(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();

  if (/\b(?:berubah pikiran|tidak jadi|ga jadi|engga jadi|batal beli)\b/.test(text)) {
    return "change_of_mind";
  }
  if (/\b(?:rusak|kerusakan|cacat|terkelupas|patah|retak|pecah)\b/.test(text)) {
    return "damaged";
  }
  if (
    /\b(?:(?:part|aksesori|aksesoris)(?:-?nya| nya)?(?:\s+yang)?\s+(?:kurang|hilang|tidak\s+ada)|tidak lengkap|ga lengkap|engga lengkap|kurang part)\b/.test(
      text,
    )
  ) {
    return "incomplete";
  }
  if (/\b(?:box penyok|kotak penyok|kemasan penyok|penyok)\b/.test(text)) {
    return "dented_box";
  }
  if (/\b(?:salah kirim|barang salah|tidak sesuai|beda (?:dari|dengan) (?:foto|deskripsi))\b/.test(text)) {
    return "wrong_item";
  }

  return "unknown";
}

export function detectReturnQuestionType(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();

  if (/\b(?:status|progres|progress|sampai mana|sudah diproses|belum diproses)\b/.test(text)) {
    return "status";
  }
  if (/\b(?:bukti|dokumen|foto apa|video apa|perlu disiapkan|harus disiapkan)\b/.test(text)) {
    return "evidence";
  }
  if (
    /\b(?:berapa lama|kapan|durasi|waktu)\b/.test(text) &&
    /\b(?:refund|uang|dana|pengembalian)\b/.test(text)
  ) {
    return "refund_timing";
  }
  if (/\b(?:hubungi|kontak|whatsapp|wa admin|lapor ke admin)\b/.test(text)) {
    return "admin_contact";
  }

  return detectReturnIssue(question) === "unknown" ? "procedure" : "issue";
}

export function getReturnActionContext(question = "") {
  const questionType = detectReturnQuestionType(question);
  const contexts = {
    procedure: "return_issue_selection",
    issue: "return_claim_help",
    evidence: "return_evidence_next",
    refund_timing: "return_refund_next",
    admin_contact: "return_report_next",
    status: "return_status_next",
  };
  return contexts[questionType];
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
  const text = normalizeIndonesianCommerceText(question).toLowerCase();
  const returnIssue = detectReturnIssue(question);
  const questionType = detectReturnQuestionType(question);
  const adminClosing =
    `\n\n**Laporkan ke Admin Robot Jadul:** ${RETURN_ADMIN_URL}\n` +
    "Sertakan nomor pesanan dan ringkasan kendalanya agar laporan mudah ditelusuri.";

  if (questionType === "procedure") {
    return (
      "Berikut alur retur Robot Jadul:\n\n" +
      `1. Laporkan kendala maksimal **${RETURN_POLICY.claimWindow}** sejak paket diterima.\n` +
      "2. Simpan barang, kemasan, label kirim, dan seluruh kelengkapannya. Jangan kirim balik sebelum mendapat arahan admin.\n" +
      "3. Pilih jenis kendalanya di bawah agar bukti dan solusi yang disiapkan tepat.\n" +
      `4. Admin memeriksa laporan lengkap dalam **${RETURN_POLICY.reviewTime}** dan memberikan instruksi retur jika pengajuan memenuhi ketentuan.` +
      adminClosing
    );
  }

  if (questionType === "evidence") {
    const issueEvidence = {
      damaged: "foto close-up bagian yang rusak serta foto keseluruhan barang",
      incomplete: "foto seluruh isi paket yang ditata berdampingan dan daftar part yang kurang",
      dented_box: "foto box dari semua sisi sebelum dibuka dan foto kardus pengiriman",
      wrong_item: "foto barang yang diterima, invoice, serta label pengiriman",
      change_of_mind: "foto segel, kemasan, dan kelengkapan untuk menunjukkan barang belum digunakan",
      unknown: "foto barang, kemasan, label pengiriman, dan bagian yang bermasalah",
    }[returnIssue];

    return (
      "Untuk membuat laporan retur, siapkan:\n\n" +
      `- **Nomor pesanan** dan nama produk.\n- **${issueEvidence}**.\n` +
      "- **Video unboxing** jika tersedia.\n- Kronologi singkat sejak paket diterima.\n\n" +
      "Jangan mengedit bukti atau mengirim barang sebelum admin memberikan alamat dan instruksi retur." +
      adminClosing
    );
  }

  if (questionType === "refund_timing") {
    return (
      "Waktu refund dihitung setelah pengajuan melewati pemeriksaan:\n\n" +
      `- Pemeriksaan bukti: **${RETURN_POLICY.reviewTime}** setelah laporan lengkap.\n` +
      "- Jika barang harus dikembalikan, pemeriksaan fisik dilakukan setelah barang diterima toko.\n" +
      `- Refund yang disetujui diproses dalam **${RETURN_POLICY.refundTime}** setelah verifikasi akhir.\n\n` +
      "Kecepatan dana masuk dapat mengikuti proses bank atau penyedia pembayaran. Untuk mengecek laporan tertentu, kirim nomor pesanan dan tanggal pengajuan ke admin." +
      adminClosing
    );
  }

  if (questionType === "admin_contact") {
    return (
      "Kamu bisa membuat laporan langsung ke Admin Robot Jadul melalui WhatsApp. Gunakan format berikut:\n\n" +
      "**Nomor pesanan:** ...\n**Produk:** ...\n**Kendala:** ...\n**Paket diterima:** ...\n**Bukti foto/video:** terlampir\n\n" +
      "Admin akan mencatat laporan dan memberi instruksi berikutnya. Jangan mengirim barang tanpa nomor atau persetujuan retur." +
      adminClosing
    );
  }

  if (questionType === "status") {
    return (
      "Aku belum dapat membuka status laporan retur pribadi dari chat ini. Untuk pengecekan yang aman, kirim ke admin:\n\n" +
      "- nomor pesanan,\n- tanggal laporan dibuat, dan\n- nama produk yang diklaim.\n\n" +
      `Jika bukti sudah lengkap, pemeriksaan awal biasanya memerlukan **${RETURN_POLICY.reviewTime}**. Admin akan memastikan apakah laporan masih diperiksa, menunggu barang kembali, atau sudah masuk proses refund.` +
      adminClosing
    );
  }

  const issuePolicy = {
    damaged:
      "Untuk **barang rusak atau cacat**, hentikan pemakaian dan jangan mencoba memperbaikinya. Foto bagian rusak dari dekat, kondisi barang secara utuh, kemasan, dan label kirim; sertakan video unboxing jika ada. Jika klaim disetujui, solusi dapat berupa penggantian part/barang bila stok tersedia, refund sebagian, atau refund penuh.",
    incomplete:
      "Untuk **part kurang atau barang tidak lengkap**, cocokkan isi paket dengan deskripsi lalu foto seluruh part secara bersamaan. Tulis bagian yang hilang secara spesifik. Jika terbukti, toko memprioritaskan pengiriman part pengganti; bila part tidak tersedia, admin dapat menawarkan penggantian barang atau refund.",
    dented_box:
      "Untuk **box atau kemasan penyok**, foto kardus pengiriman dan box produk dari semua sisi sebelum barang digunakan. Karena box bernilai penting bagi kolektor, admin akan membedakan kerusakan kosmetik pada box dengan kerusakan yang ikut mengenai produk. Solusinya dapat berupa kompensasi sebagian, penggantian, atau retur sesuai tingkat kerusakan.",
    wrong_item:
      "Untuk **barang salah kirim atau tidak sesuai deskripsi**, jangan gunakan barang dan pertahankan segel bagian dalam jika masih tertutup. Kirim foto barang, invoice, dan label pengiriman. Jika terverifikasi, toko akan mengutamakan penukaran dengan barang yang benar; jika stoknya tidak ada, refund penuh dapat diproses.",
    change_of_mind:
      "Untuk **retur karena berubah pikiran**, barang harus belum digunakan, segel dan kemasan harus utuh, serta seluruh kelengkapan harus ada. Pengajuan tidak otomatis diterima; produk JUNK/second, barang clearance, atau barang yang segelnya sudah dibuka tidak dapat memakai alasan ini. Jika disetujui, ongkos kirim kembali menjadi tanggung jawab pembeli.",
  }[returnIssue];

  const junkPolicy = /\b(?:junk|second)\b/.test(text)
    ? "\n\nKhusus produk JUNK/second, cacat yang sudah tertulis di deskripsi bukan dasar klaim; kerusakan tambahan yang tidak tercantum tetap bisa diajukan."
    : "";

  return (
    `Maaf atas kendalanya. ${issuePolicy} Pengajuan harus dibuat maksimal **${RETURN_POLICY.claimWindow}** sejak paket diterima dan tidak otomatis disetujui.\n\n` +
    `Bukti lengkap ditinjau dalam **${RETURN_POLICY.reviewTime}**. Jika hasil akhirnya refund, dana diproses dalam **${RETURN_POLICY.refundTime}** setelah retur diterima dan diverifikasi.` +
    junkPolicy +
    adminClosing
  );
}
