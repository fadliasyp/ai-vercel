import { extractBudgetRange } from "./priceIntent.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const FACET_PATTERNS = Object.freeze({
  product_condition:
    /\b(?:kondisi(?:nya)?|junk|misb|mib|bib|loose|mint|cacat|patah|lecet|terkelupas|rusak)\b/i,
  completeness: /\b(?:kelengkapan(?:nya)?|lengkap|part|aksesori|aksesoris|senjata|isi\s+box)\b/i,
  stock: /\b(?:stok(?:nya)?|stock|ready|tersedia|masih\s+ada|habis|po|pre\s*order)\b/i,
  promo: /\b(?:promo(?:nya)?|diskon(?:nya)?|sale|cashback|harga\s+normal)\b/i,
  shipping_quote: /\b(?:ongkir(?:nya)?|ongkos\s+kirim|biaya\s+kirim)\b/i,
  insurance: /\b(?:asuransi|diasuransikan|proteksi\s+pengiriman)\b/i,
  packing: /\b(?:packing|kemasan)\s+(?:kayu|aman|tambahan|khusus)\b|\b(?:bubble\s*wrap|double\s*box)\b/i,
  shipping_estimate:
    /\b(?:berapa\s+lama|berapa\s+hari|kapan\s+sampai|estimasi\s+(?:pengiriman|sampai)|lama\s+pengiriman)\b/i,
  same_day:
    /\b(?:kirim|dikirim|diproses|checkout|bayar)\b.{0,35}\bhari\s+ini\b|\bhari\s+ini\b.{0,35}\b(?:kirim|dikirim|diproses|checkout|bayar)\b|\bsame\s*day\b/i,
  store_location:
    /\b(?:alamat|lokasi|toko\s+fisik|blok\s+m|lantai|blok\s+apa|datang\s+langsung)\b/i,
  store_hours:
    /\b(?:jam\s+buka|jam\s+operasional|buka\s+sampai|buka\s+jam|tutup\s+jam|hari\s+ini\s+buka)\b/i,
  cod: /\b(?:cod|cash\s+on\s+delivery|bayar\s+di\s+tempat|bayar\s+pas\s+barang\s+sampai)\b/i,
  payment_methods:
    /\b(?:metode\s+(?:pembayaran|bayar)|pembayaran\s+apa|bayar\s+(?:pakai|pake)\s+apa|qris|gopay|transfer|kartu\s+kredit)\b/i,
  return_policy: /\b(?:retur|return|pengembalian|komplain|klaim)\b/i,
  refund: /\b(?:refund|uang\s+kembali|balik\s+uang|pengembalian\s+uang)\b/i,
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
  const facets = Object.entries(FACET_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([facet]) => facet);
  if (extractBudgetRange(text).detected) facets.push("budget");
  return [...new Set(facets)];
}

function hasAnswerEvidence(facet, text, products, question) {
  const hasProducts = products.length > 0;
  const productNotFound = /\b(?:tidak|belum)\s+(?:ada|menemukan|ditemukan)|belum\s+tersedia\b/i.test(text);

  if (facet === "product_condition") {
    return (
      /\b(?:kondisi|junk|misb|mib|bib|loose|mint|cacat|patah|lecet|terkelupas|rusak)\b/i.test(text) ||
      productNotFound
    );
  }
  if (facet === "completeness") {
    return /\b(?:lengkap|kelengkapan|part|aksesori|aksesoris|senjata|isi\s+box|deskripsi\s+produk)\b/i.test(text) || productNotFound;
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
  if (facet === "shipping_quote") {
    return /\bongkir\b/i.test(text) && /\brp\s*[\d.]|tarif/i.test(text);
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
    return /\b(?:qris|gopay|transfer\s+bank|kartu\s+kredit|bni|bri|mandiri|cimb|permatabank)\b/i.test(text);
  }
  if (facet === "return_policy") {
    return /\b(?:retur|return|klaim)\b/i.test(text) && /\b(?:diajukan|batas|syarat|bukti|admin)\b/i.test(text);
  }
  if (facet === "refund") {
    return /\b(?:refund|uang\s+kembali)\b/i.test(text) && /\b(?:diajukan|diproses|disetujui|hari\s+kerja|sebagian|penuh)\b/i.test(text);
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
    return /\b(?:sebutkan|pilih|butuh|masukkan)\b.{0,50}\b(?:kota|kabupaten|kecamatan|tujuan)\b|\b(?:kota|kabupaten|kecamatan)\b.{0,50}\b(?:mana|tujuan)\b/i.test(text);
  }
  if (["product_condition", "completeness", "stock", "promo"].includes(facet)) {
    return /\b(?:kirim|sebutkan|masukkan)\b.{0,50}\b(?:nama|kode|link|foto)\s+produk\b/i.test(text);
  }
  if (["recommendation", "budget"].includes(facet)) {
    return /\b(?:budget|anggaran|kisaran\s+harga|tujuan|pajangan|hadiah)\b.{0,40}\b(?:berapa|apa|mana)\b/i.test(text);
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
