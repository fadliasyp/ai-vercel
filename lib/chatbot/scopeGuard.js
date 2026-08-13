import { normalizeIndonesianCommerceText } from "./textNormalization.js";
import { looksLikeStoreBackgroundQuestion } from "./storeInfo.js";

const OUT_OF_SCOPE_PATTERNS = [
  /\b(?:lawan|melawan|bertarung|berantem|menang)\b.*\b(?:godzilla|monster|kaiju)\b|\b(?:godzilla|monster|kaiju)\b.*\b(?:lawan|melawan|bertarung|berantem|menang)\b/i,
  /^\s*(?:sekarang\s+)?(?:jam|pukul)\s+berapa(?:\s+(?:sekarang|saat\s+ini))?\s*[?!.]*$/i,
  /\b(?:jam|pukul)\s+berapa\s+(?:sekarang|saat\s+ini)\b/i,
  /\b(?:sekarang|saat\s+ini)\s+(?:jam|pukul)\s+berapa\b/i,
  /\b(?:hari|tanggal)\s+apa\s+(?:sekarang|hari\s+ini)\b/i,
  /\b(?:cuaca|prakiraan\s+cuaca|ramalan\s+cuaca|suhu\s+udara)\b/i,
  /\b(?:berita|news)\s+(?:hari\s+ini|terbaru|terkini)\b/i,
  /\b(?:siapa|nama)\s+(?:presiden|wakil\s+presiden|menteri|gubernur)\b/i,
  /\b(?:ibu\s*kota|sejarah|penemu|planet|zodiak|horoskop)\b/i,
  /\b(?:resep|cara\s+memasak|menu\s+masakan)\b/i,
  /\b(?:terjemahkan|translate)\b/i,
  /\b(?:buatkan|bikin(?:kan)?)\s+(?:kode|program|website|puisi|cerita|esai)\b/i,
  /\b(?:coding|javascript|python|php|java|sql)\b/i,
  /\b(?:skor|hasil\s+pertandingan|jadwal\s+pertandingan)\b/i,
  /\b(?:akar\s+kuadrat|persamaan\s+matematika|soal\s+matematika)\b/i,
  /\b(?:fotosintesis|gravitasi|tata\s+surya|rumus\s+fisika)\b/i,
  /\b(?:tebak[-\s]?tebakan|lelucon|jokes?)\b/i,
];

const PURE_ARITHMETIC_PATTERN =
  /^\s*(?:(?:berapa|hitung|hasil(?:nya)?(?:\s+dari)?|berapa\s+hasil(?:\s+dari)?)\s*)?\(?\s*\d+(?:[.,]\d+)?\s*(?:\+|-|x|×|\*|\/|÷|ditambah|tambah|dikurangi|kurang|dikali|kali|dibagi|bagi)\s*\d+(?:[.,]\d+)?\s*\)?\s*(?:berapa|hasilnya|sama\s+dengan\s+berapa)?\s*[?!.]*$/i;

const COMMERCE_PATTERNS = [
  /\b(?:produk(?:nya)?|barang(?:nya)?|mainan|action\s+figure|figure|figurin|robot(?:nya)?|model\s+kit|diecast|koleksi|kolektor|cari(?:kan)?|nyari)\b/i,
  /\b(?:harga(?:nya)?|promo|diskon|sale|cashback|budget|murah|termurah|mahal)\b/i,
  /\b(?:stok(?:nya)?|stock|ready|tersedia|habis|pre\s*order|preorder)\b/i,
  /\b(?:beli|membeli|order|pesan|checkout|keranjang|pembayaran(?:nya)?|bayar|transfer|cod)\b/i,
  /\b(?:ongkir|ongkos\s+kirim|pengiriman(?:nya)?|dikirim|kurir|resi|tracking|lacak|paket)\b/i,
  /\b(?:retur|return|refund|pengembalian|barang\s+rusak|salah\s+kirim)\b/i,
  /\b(?:bandingkan|compare|versus|\bvs\b|perbedaan|bedanya|rekomendasi|rekomen|worth\s+it)\b/i,
  /\b(?:toko|robot\s+jadul|admin|customer\s+service|kontak|whatsapp|alamat|lokasi|jam\s+buka|buka\s+(?:jam|pukul)|jam\s+operasional|tutup\s+(?:jam|pukul))\b/i,
  /\b(?:chatbot|bot|kamu)\b.*\b(?:bisa+|dapat|fitur|kemampuan|bantu|ngapain)\b/i,
  /\b(?:chogokin|gundam|mazinger|grendizer|getter|voltes|voltron|gashapon|bandai|takara|vintage|misb)\b/i,
  /\/product\//i,
];

const PRODUCT_CODE_PATTERN =
  /\b(?:gx|dx|smp|src|soc|metal\s*build)[-\s]?[a-z0-9][a-z0-9-]*\b/i;

const GREETING_ONLY_PATTERN =
  /^\s*(?:halo|hallo|hai|hi|hello|pagi|siang|sore|malam|assalamualaikum|permisi)(?:\s+(?:min|admin|kak))?[!.,?\s]*$/i;

const CONTEXT_FOLLOW_UP_PATTERNS = [
  /\b(?:ini|itu|tadi|tersebut|produknya|barangnya|harganya|stoknya|kondisinya|linknya)\b/i,
  /\b(?:yang\s+)?(?:pertama|kedua|ketiga|nomor\s+[1-9]|satu|dua|tiga)\b/i,
  /^(?:iya|ya|boleh|mau|tidak|nggak|engga|lanjut|pilih)\b/i,
  /^(?:berapa|gimana|bagaimana|kenapa|kok|masih|jadi)\b/i,
];

const COMMERCE_INTENTS = new Set([
  "product_discovery",
  "product_detail",
  "price_promo",
  "stock_availability",
  "shipping_transaction",
  "shipping_origin",
  "recommendation",
  "compare",
  "return_product",
  "transaction_status",
  "shipment_tracking",
]);

function normalizeScopeText(value = "") {
  return normalizeIndonesianCommerceText(value)
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeLikelyGibberish(value = "") {
  const text = normalizeScopeText(value).toLowerCase();
  const tokens = text.match(/[a-z]+/g) || [];
  if (!tokens.length || tokens.length > 3) return false;

  const letters = tokens.join("");
  if (letters.length < 7) return false;

  if (
    /(?:qwerty|asdfgh|zxcv|qazwsx|poiuy|lkjhg)/i.test(letters) ||
    /(.)\1{3,}/i.test(letters) ||
    /^(.{2,4})\1{2,}$/i.test(letters)
  ) {
    return true;
  }

  const vowelCount = (letters.match(/[aeiou]/g) || []).length;
  const vowelRatio = vowelCount / letters.length;
  return (
    tokens.length === 1 &&
    vowelRatio <= 0.32 &&
    /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(letters)
  );
}

export function assessLocalCommerceScope(question = "", context = {}) {
  const text = normalizeScopeText(question);
  if (!text) return "out_of_scope";

  if (GREETING_ONLY_PATTERN.test(text)) return "in_scope";
  if (looksLikeStoreBackgroundQuestion(text)) return "in_scope";

  // Strong non-store questions must win even when the intent model guesses a
  // commerce intent from generic words such as "berapa" or "cari".
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text))) {
    return "out_of_scope";
  }

  if (PURE_ARITHMETIC_PATTERN.test(text)) {
    return "out_of_scope";
  }

  if (
    COMMERCE_PATTERNS.some((pattern) => pattern.test(text)) ||
    PRODUCT_CODE_PATTERN.test(text)
  ) {
    return "in_scope";
  }

  if (looksLikeLikelyGibberish(text)) {
    return "out_of_scope";
  }

  const hasCommerceContext =
    Boolean(context.hasPending) ||
    Boolean(context.hasRecentProducts) ||
    COMMERCE_INTENTS.has(String(context.lastIntent || ""));

  if (
    hasCommerceContext &&
    (CONTEXT_FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(text)) ||
      /^#?\d{3,}$/.test(text))
  ) {
    return "in_scope";
  }

  return "ambiguous";
}

export function buildOutOfScopeMessage(question = "") {
  if (looksLikeLikelyGibberish(question)) {
    return (
      "Maaf, aku belum memahami pertanyaan itu. " +
      "Coba tanyakan kembali tentang produk atau layanan Robot Jadul, misalnya " +
      "pencarian produk, harga, stok, rekomendasi, pembayaran, atau pengiriman."
    );
  }

  return (
    "Maaf, pertanyaan itu berada di luar topik yang bisa aku bantu sebagai " +
    "asisten ecommerce Robot Jadul. Aku khusus membantu pencarian dan detail " +
    "produk, rekomendasi, perbandingan, harga, stok, pembayaran, pengiriman, " +
    "pelacakan, retur, serta status pesanan."
  );
}

export function isCommerceIntent(intent = "") {
  return COMMERCE_INTENTS.has(String(intent || ""));
}
