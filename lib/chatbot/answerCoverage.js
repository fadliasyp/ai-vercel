import { extractBudgetRange } from "./priceIntent.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";
import {
  looksLikeBulkPurchaseOfferQuestion,
  looksLikePostPurchaseReturnIssue,
  looksLikeReturnPolicyQuestion,
} from "./storePolicy.js";

const FACET_PATTERNS = Object.freeze({
  material:
    /\b(?:bahan(?:nya)?|material(?:nya)?|die[\s-]*cast|plastik|plastic|abs|metal|logam)\b/i,
  dimensions:
    /\b(?:ukuran(?:nya)?|dimensi(?:nya)?|tinggi(?:nya)?|panjang(?:nya)?|lebar(?:nya)?|berapa\s+cm)\b/i,
  product_condition:
    /\b(?:kondisi(?:nya)?|junk|misb|mib|bib|loose|mint|mulus|cacat|patah|retak|lecet|baret|terkelupas|rusak|tanpa\s+minus|no\s+minus|fungsi\s+normal)\b/i,
  completeness: /\b(?:kelengkapan(?:nya)?|lengkap|part|aksesori|aksesoris|senjata|isi\s+box)\b/i,
  price: /\b(?:harga(?:nya)?|berapa\s+harga|harga\s+berapa)\b/i,
  stock: /\b(?:stok(?:nya)?|stock|ready|tersedia|masih\s+ada|habis|po|pre\s*order)\b/i,
  promo: /\b(?:promo(?:nya)?|diskon(?:nya)?|sale|cashback|harga\s+normal)\b/i,
  bulk_discount:
    /\b(?:diskon|potongan|harga\s+(?:paket|khusus))\b/i,
  free_shipping: /\bgratis\s+ongkir\b/i,
  shipping_quote: /\b(?:ongkir(?:nya)?|ongkos\s+kirim|biaya\s+kirim)\b/i,
  insurance: /\b(?:asuransi|diasuransikan|proteksi\s+pengiriman)\b/i,
  packing: /\b(?:packing|kemasan)\s+(?:kayu|aman|tambahan|khusus)\b|\b(?:bubble\s*wrap|double\s*box)\b/i,
  shipping_estimate:
    /\b(?:berapa\s+lama|berapa\s+hari|kapan\s+sampai|estimasi\s+(?:pengiriman|sampai)|lama\s+pengiriman)\b/i,
  same_day:
    /\b(?:kirim|dikirim|diproses|checkout|bayar)\b.{0,35}\bhari\s+ini\b|\bhari\s+ini\b.{0,35}\b(?:kirim|dikirim|diproses|checkout|bayar)\b|\bsame\s*day\b/i,
  shipping_origin:
    /\b(?:pengiriman|barang|produk|pesanan)\b.{0,45}\b(?:diproses|dikirim|berangkat)\b.{0,30}\b(?:dari mana|asal)|\b(?:dari mana|asal)\b.{0,35}\b(?:pengiriman|dikirim|gudang)\b/i,
  shipping_coverage:
    /\b(?:kirim|dikirim|pengiriman|antar)\b.{0,40}\b(?:luar\s+(?:pulau|jawa|kota|daerah)|seluruh\s+indonesia|se\s*-?indonesia|sampai\s+mana)\b|\b(?:jangkauan|cakupan)\s+pengiriman\b/i,
  store_location:
    /\b(?:alamat|lokasi|toko\s+fisik|blok\s+m|lantai|blok\s+apa|datang\s+langsung)\b/i,
  store_hours:
    /\b(?:jam\s+buka|jam\s+operasional|buka\s+sampai|buka\s+jam|tutup\s+jam|hari\s+ini\s+buka)\b/i,
  cod: /\b(?:cod|cash\s+on\s+delivery|bayar\s+di\s+tempat|bayar\s+pas\s+barang\s+sampai)\b/i,
  payment_methods:
    /\b(?:metode\s+(?:pembayaran|bayar)|(?:pembayaran(?:nya)?|bayarnya)\b.{0,30}\b(?:apa|pakai|pake|make|menggunakan)|bayar\s+(?:pakai|pake|make)\s+apa|pay\s*later|paylater|spaylater|kredivo|akulaku|indodana|qris|gopay|transfer|kartu\s+kredit)\b/i,
  return_policy: /\b(?:retur|return|pengembalian|komplain|klaim)\b/i,
  refund: /\b(?:refund|uang\s+kembali|balik\s+uang|pengembalian\s+uang)\b/i,
  return_evidence:
    /\b(?:bukti|foto|video\s+unboxing)\b.{0,35}\b(?:retur|return|komplain|klaim)\b|\b(?:retur|return|komplain|klaim)\b.{0,35}\b(?:bukti|foto|video\s+unboxing)\b/i,
  return_status:
    /\b(?:status|progres)\b.{0,35}\b(?:retur|return|pengajuan|klaim)\b|\b(?:retur|return|pengajuan|klaim)\b.{0,35}\b(?:status|progres)\b/i,
  how_to_buy:
    /\b(?:cara|langkah|proses)\s+(?:membeli|beli|memesan|pesan|order|checkout)|\b(?:mau\s+beli|mau\s+order)\b.{0,20}\b(?:gimana|bagaimana)\b/i,
  catalog_overview:
    /\b(?:apa\s+saja\s+yang\s+dijual|jual\s+apa|jenis\s+produk|isi\s+katalog|koleksi\s+apa)\b/i,
  assistant_capabilities:
    /\b(?:chatbot|kamu|robot\s+jadul\s+ai)\b.{0,35}\b(?:bisa|dapat)\b.{0,25}\b(?:membantu|bantu|apa\s+saja)\b/i,
  transaction_status:
    /\b(?:status|progres|pembayaran)\b.{0,35}\b(?:pesanan|order|transaksi|masuk|diterima|terkonfirmasi)|\b(?:pesanan|order|transaksi)\b.{0,35}\b(?:status|progres|pembayaran)\b/i,
  shipment_tracking:
    /\b(?:lacak|melacak|tracking|nomor\s+resi|posisi\s+paket|paket\b.{0,20}\bsampai\s+mana)\b/i,
  order_processing:
    /\b(?:berapa\s+lama|kapan)\b.{0,30}\b(?:pesanan|order)\b.{0,20}\b(?:diproses|dikirim)|\b(?:pesanan|order)\b.{0,30}\b(?:diproses|selesai)\b/i,
  recommendation:
    /\b(?:rekomendasi(?:kan)?|rekomen|pilihkan|paling\s+cocok|mending|buat\s+(?:kado|hadiah|pajangan|display))\b/i,
});

function collectProducts(payloads = []) {
  return payloads.flatMap((payload) =>
    Array.isArray(payload?.products) ? payload.products : [],
  );
}

function responseCorpus(payloads = []) {
  return normalizeIndonesianCommerceText(
    payloads
      .flatMap((payload) => [
        payload?.message,
        payload?.intro,
        payload?.reasoning_text,
        payload?.closing,
        ...(Array.isArray(payload?.methods)
          ? payload.methods.map((method) => method?.name)
          : []),
        ...(Array.isArray(payload?.steps)
          ? payload.steps.map((step) => step?.text)
          : []),
      ])
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

export function detectRequestedAnswerFacets(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();
  let facets = Object.entries(FACET_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([facet]) => facet);
  if (!looksLikeBulkPurchaseOfferQuestion(text)) {
    facets = facets.filter((facet) => facet !== "bulk_discount");
  }
  if (
    facets.includes("free_shipping") &&
    !/\b(?:ongkir|ongkos\s+kirim|biaya\s+kirim)\b.{0,55}\b(?:berapa|tarif|biaya|kena)\b|\b(?:berapa|tarif|biaya)\b.{0,55}\b(?:ongkir|ongkos\s+kirim)\b/i.test(
      text,
    )
  ) {
    facets = facets.filter((facet) => facet !== "shipping_quote");
  }
  const returnConcern = looksLikeReturnPolicyQuestion(text);
  if (returnConcern) facets.push("return_policy");

  const asksCatalogProductFacts =
    /\b(?:kondisi(?:nya)?\b.{0,20}\b(?:bagaimana|gimana|apa|bagus|baik|mulus|normal)|(?:bagaimana|gimana|cek|jelaskan)\b.{0,15}\bkondisi|kelengkapan(?:nya)?\b.{0,20}\b(?:apa|bagaimana|gimana|lengkap)|(?:part|aksesori|aksesoris)(?:-?nya)?\s+lengkap\s+(?:kan|kah)|lengkap\s+(?:kan|kah|tidak|engga|gak|nggak)|bukan\s+(?:barang\s+)?junk|ada\b.{0,25}\b(?:cacat|rusak)\b.{0,20}\b(?:engga|gak|nggak|tidak|kah))\b/i.test(
      text,
    );
  if (
    returnConcern &&
    !asksCatalogProductFacts &&
    (looksLikePostPurchaseReturnIssue(text) ||
      /\b(?:retur|return|refund|komplain|klaim)\b/i.test(text))
  ) {
    facets = facets.filter(
      (facet) => !["product_condition", "completeness"].includes(facet),
    );
  }

  if (extractBudgetRange(text).detected) facets.push("budget");
  return [...new Set(facets)];
}

function hasAnswerEvidence(facet, text, products, question) {
  const hasProducts = products.length > 0;
  const productNotFound = /\b(?:tidak|belum)\s+(?:ada|menemukan|ditemukan)|belum\s+tersedia\b/i.test(text);

  if (facet === "material") {
    return /\b(?:bahan|material|die[\s-]*cast|plastik|plastic|abs|metal|logam)\b/i.test(text) || productNotFound;
  }
  if (facet === "dimensions") {
    return (
      (/\b(?:ukuran|dimensi|tinggi|panjang|lebar)\b/i.test(text) &&
        /\b\d+(?:[.,]\d+)?\s*cm\b/i.test(text)) ||
      /\b(?:ukuran|dimensi|tinggi|panjang|lebar)\b.{0,45}\b(?:tidak|belum)\s+(?:tercantum|tersedia|diketahui)\b/i.test(
        text,
      )
    ) || productNotFound;
  }
  if (facet === "product_condition") {
    return (
      /\b(?:kondisi|junk|misb|mib|bib|loose|mint|mulus|bagus|baik|normal|minus|cacat|patah|retak|lecet|baret|terkelupas|rusak)\b/i.test(text) ||
      productNotFound
    );
  }
  if (facet === "completeness") {
    return /\b(?:lengkap|kelengkapan|part|aksesori|aksesoris|senjata|isi\s+box|deskripsi\s+produk)\b/i.test(text) || productNotFound;
  }
  if (facet === "price") {
    return (
      products.some(
        (product) =>
          Number(
            product?.numericPrice ||
              product?.effectivePrice ||
              product?.price ||
              0,
          ) > 0,
      ) || /\b(?:harga|rp\s*[\d.]+)\b/i.test(text)
    );
  }
  if (facet === "stock") {
    return products.some((product) => product?.stock) || /\b(?:ready|stok|stock|tersedia|habis|pre\s*order|po)\b/i.test(text);
  }
  if (facet === "promo") {
    return (
      /\b(?:promo|diskon|sale|cashback|harga\s+normal|tidak\s+sedang\s+promo)\b/i.test(text) ||
      productNotFound
    );
  }
  if (facet === "bulk_discount") {
    return /\b(?:potongan|diskon|harga\s+(?:paket|khusus))\b.{0,120}\b(?:belum|tidak|tergantung|bergantung|admin|persetujuan|dikonfirmasi)\b|\b(?:belum|tidak)\b.{0,120}\b(?:potongan|diskon|harga\s+(?:paket|khusus))\b/i.test(
      text,
    );
  }
  if (facet === "free_shipping") {
    return /\bgratis\s+ongkir\b.{0,120}\b(?:belum|tidak|tergantung|bergantung|admin|persetujuan|dikonfirmasi)\b|\b(?:belum|tidak)\b.{0,120}\bgratis\s+ongkir\b/i.test(
      text,
    );
  }
  if (facet === "shipping_quote") {
    return (
      (/\bongkir\b/i.test(text) && /\brp\s*[\d.]|tarif/i.test(text)) ||
      /\bgratis\s+ongkir\b.{0,80}\b(?:belum|tidak|tergantung|bergantung|admin|promo|dijanjikan)\b|\b(?:belum|tidak)\b.{0,80}\bgratis\s+ongkir\b/i.test(
        text,
      )
    );
  }
  if (facet === "insurance") {
    return /\basuransi\b/i.test(text) && /\b(?:bisa|tersedia|perlindungan|tambahan|admin|belum|tidak)\b/i.test(text);
  }
  if (facet === "packing") {
    return /\b(?:packing\s+kayu|kemasan|bubble\s*wrap|double\s*box)\b/i.test(text) && /\b(?:tersedia|aman|tambahan|admin|biaya|tidak|belum|dikemas)\b/i.test(text);
  }
  if (facet === "shipping_estimate") {
    return /\b\d+\s*(?:-|sampai)?\s*\d*\s*hari|estimasi/i.test(text);
  }
  if (facet === "same_day") {
    return /\b(?:hari\s+yang\s+sama|hari\s+ini|same\s*day|tidak\s+dapat\s+dijamin)\b/i.test(text) && /\b(?:kirim|dikirim|pengiriman|diproses|kurir)\b/i.test(text);
  }
  if (facet === "shipping_origin") {
    return /\b(?:pengiriman|pesanan|barang)\b.{0,55}\b(?:diproses|dikirim|berangkat)\b.{0,35}\b(?:dari|asal)\b|\b(?:asal|lokasi)\s+pengiriman\b/i.test(text) &&
      /\b(?:toko|gudang|jakarta|blok\s+m|lokasi)\b/i.test(text);
  }
  if (facet === "shipping_coverage") {
    return /\b(?:bisa|melayani|tersedia|menjangkau|tidak|belum)\b.{0,45}\b(?:kirim|pengiriman|luar\s+(?:pulau|jawa|kota|daerah)|seluruh\s+indonesia|se\s*-?indonesia)\b|\b(?:kirim|pengiriman)\b.{0,45}\b(?:seluruh\s+indonesia|luar\s+(?:pulau|jawa|kota|daerah))\b/i.test(text);
  }
  if (facet === "store_location") {
    return /\b(?:blok\s+m|alamat|lokasi|lantai\s+3a|jalan|jl\.)\b/i.test(text);
  }
  if (facet === "store_hours") {
    return /\b(?:buka|operasional)\b/i.test(text) && /\b\d{1,2}[.:]\d{2}\b/.test(text);
  }
  if (facet === "cod") {
    return /\b(?:cod|cash\s+on\s+delivery|bayar\s+di\s+tempat)\b/i.test(text) && /\b(?:tersedia|belum|tidak|bisa)\b/i.test(text);
  }
  if (facet === "payment_methods") {
    return /\b(?:pay\s*later|paylater|spaylater|kredivo|akulaku|indodana|qris|gopay|transfer\s+bank|kartu\s+kredit|bni|bri|mandiri|cimb|permatabank)\b/i.test(text);
  }
  if (facet === "return_policy") {
    return /\b(?:retur|return|klaim)\b/i.test(text) && /\b(?:diajukan|batas|syarat|bukti|admin)\b/i.test(text);
  }
  if (facet === "refund") {
    return /\b(?:refund|uang\s+kembali)\b/i.test(text) && /\b(?:diajukan|diproses|disetujui|hari\s+kerja|sebagian|penuh)\b/i.test(text);
  }
  if (facet === "return_evidence") {
    return /\b(?:bukti|foto|video\s+unboxing)\b/i.test(text) &&
      /\b(?:retur|return|komplain|klaim|barang|paket)\b/i.test(text);
  }
  if (facet === "return_status") {
    return /\b(?:status|progres)\b.{0,40}\b(?:retur|return|pengajuan|klaim)\b|\b(?:retur|return|pengajuan|klaim)\b.{0,40}\b(?:diproses|diterima|disetujui|ditolak|selesai)\b/i.test(text);
  }
  if (facet === "how_to_buy") {
    return /\b(?:pilih|buka|klik|tambahkan|masukkan)\b.{0,45}\b(?:produk|keranjang|checkout|alamat|pembayaran)\b|\b(?:keranjang|checkout)\b.{0,45}\b(?:bayar|pembayaran|pesanan|order)\b/i.test(text);
  }
  if (facet === "catalog_overview") {
    return /\b(?:katalog|robot\s+jadul|toko\s+kami)\b.{0,70}\b(?:memuat|menjual|menyediakan|produk|robot|figure|model\s+kit|koleksi)\b/i.test(text);
  }
  if (facet === "assistant_capabilities") {
    return /\b(?:aku|chatbot|robot\s+jadul\s+ai)\b.{0,30}\b(?:bisa|dapat)\b.{0,30}\b(?:membantu|bantu)\b/i.test(text) &&
      /\b(?:produk|stok|harga|promo|rekomendasi|ongkir|pengiriman|pesanan|retur)\b/i.test(text);
  }
  if (facet === "transaction_status") {
    return /\b(?:pesanan|order|transaksi|pembayaran)\b.{0,45}\b(?:terkonfirmasi|diterima|berhasil|diproses|dikemas|dikirim|selesai|dibatalkan|gagal)\b|\bstatus\b.{0,30}\b(?:pesanan|order|transaksi|pembayaran)\b/i.test(text);
  }
  if (facet === "shipment_tracking") {
    return /\b(?:resi|tracking|pelacakan|posisi\s+paket|paket)\b.{0,55}\b(?:ditemukan|diproses|dikirim|transit|kurir|sampai|diterima|status)\b/i.test(text);
  }
  if (facet === "order_processing") {
    return /\b(?:pesanan|order)\b.{0,45}\b(?:diproses|dikemas|dikirim)\b.{0,35}\b(?:hari|jam|setelah)|\b\d+\s*(?:-|sampai)?\s*\d*\s*(?:hari|jam)\b.{0,35}\b(?:proses|pesanan|order)\b/i.test(text);
  }
  if (facet === "recommendation") {
    return hasProducts || /\b(?:rekomendasi|cocok|pilihan|belum\s+menemukan)\b/i.test(text);
  }
  if (facet === "budget") {
    const budget = extractBudgetRange(question);
    if (!budget.detected) return true;
    if (!hasProducts) return productNotFound;
    return products.every((product) => {
      const price = Number(
        product?.numericPrice || product?.effectivePrice || product?.price || 0,
      );
      return (
        price > 0 &&
        (budget.min == null || price >= budget.min) &&
        (budget.max == null || price <= budget.max)
      );
    });
  }
  return false;
}

function hasClarificationEvidence(facet, text) {
  if (facet === "shipping_quote") {
    return /\b(?:sebutkan|pilih|butuh|masukkan)\b.{0,70}\b(?:kota|kabupaten|kecamatan|tujuan)\b|\b(?:kota|kabupaten|kecamatan|tujuan)\b.{0,70}\b(?:pilih|mana|yang\s+benar)\b/i.test(text);
  }
  if (["material", "dimensions", "product_condition", "completeness", "price", "stock", "promo"].includes(facet)) {
    return /\b(?:kirim|sebutkan|masukkan)\b.{0,50}\b(?:nama|kode|link|foto)\s+produk\b/i.test(text);
  }
  if (["recommendation", "budget"].includes(facet)) {
    return /\b(?:budget|anggaran|kisaran\s+harga|tujuan|pajangan|hadiah)\b.{0,40}\b(?:berapa|apa|mana)\b/i.test(text);
  }
  if (facet === "transaction_status") {
    return /\b(?:masukkan|kirim|sebutkan)\b.{0,45}\b(?:nomor\s+pesanan|order\s*id|id\s+pesanan)\b/i.test(text);
  }
  if (facet === "shipment_tracking") {
    return /\b(?:masukkan|kirim|sebutkan)\b.{0,45}\b(?:nomor\s+resi|resi|tracking)\b/i.test(text);
  }
  return false;
}

export function evaluateAnswerCoverage(question = "", payloadOrPayloads = []) {
  const payloads = Array.isArray(payloadOrPayloads)
    ? payloadOrPayloads.filter(Boolean)
    : [payloadOrPayloads].filter(Boolean);
  const requested = detectRequestedAnswerFacets(question);
  const text = responseCorpus(payloads);
  const products = collectProducts(payloads);
  const status = {};

  for (const facet of requested) {
    status[facet] = hasAnswerEvidence(facet, text, products, question)
      ? "answered"
      : hasClarificationEvidence(facet, text)
        ? "clarified"
        : "missing";
  }

  const answered = requested.filter((facet) => status[facet] === "answered");
  const clarified = requested.filter((facet) => status[facet] === "clarified");
  const missing = requested.filter((facet) => status[facet] === "missing");
  const satisfied = answered.length + clarified.length;

  return {
    requested,
    status,
    answered,
    clarified,
    missing,
    coverage: requested.length ? satisfied / requested.length : 1,
    passed: missing.length === 0,
  };
}

function appendCoverageSections(payload = {}, sections = []) {
  const text = [...new Set(sections.map((section) => String(section || "").trim()))]
    .filter(Boolean)
    .join("\n\n");
  if (!text) return payload;

  if (["options", "suggestions"].includes(payload.type)) {
    return {
      ...payload,
      intro: [payload.intro || payload.message, text]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  if (payload.type === "products") {
    return {
      ...payload,
      reasoning_text: [payload.reasoning_text, text]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  return {
    ...payload,
    message: [payload.message || payload.intro, text]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function repairAnswerCoverage(
  question = "",
  payload = {},
  { answerSections = {}, clarificationSections = {} } = {},
) {
  const before = evaluateAnswerCoverage(question, payload);
  if (payload?._deferCoverageUntilProductSelection) {
    const deferred = {
      requested: before.requested,
      status: Object.fromEntries(
        before.requested.map((facet) => [facet, "missing"]),
      ),
      answered: [],
      clarified: [],
      missing: [...before.requested],
      coverage: before.requested.length ? 0 : 1,
      passed: before.requested.length === 0,
    };
    return {
      payload,
      before: deferred,
      after: deferred,
      repaired: [],
      clarified: [],
      unresolved: deferred.missing,
    };
  }
  if (before.passed) {
    return {
      payload,
      before,
      after: before,
      repaired: [],
      clarified: [],
      unresolved: [],
    };
  }

  const factualSections = before.missing
    .map((facet) => answerSections[facet])
    .filter(Boolean);
  let repairedPayload = appendCoverageSections(payload, factualSections);
  const afterFacts = evaluateAnswerCoverage(question, repairedPayload);
  const clarificationFacets = afterFacts.missing.filter(
    (facet) => clarificationSections[facet],
  );
  repairedPayload = appendCoverageSections(
    repairedPayload,
    clarificationFacets.map((facet) => clarificationSections[facet]),
  );
  const after = evaluateAnswerCoverage(question, repairedPayload);

  return {
    payload: repairedPayload,
    before,
    after,
    repaired: before.missing.filter(
      (facet) => after.status[facet] === "answered",
    ),
    clarified: before.missing.filter(
      (facet) => after.status[facet] === "clarified",
    ),
    unresolved: after.missing,
  };
}
