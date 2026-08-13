import {
  CHATBOT_INTENTS,
  normalizeIntentConfidence,
} from "./intentDecision.js";
import { looksLikeStoreHoursQuestion } from "./storeInfo.js";
import { looksLikeAssistantCapabilitiesQuestion } from "./assistantCapabilities.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";
import { buildIndonesianIntentText } from "./indonesianMorphology.js";
import { looksLikeProductManufacturingOriginQuestion } from "./transactionIntent.js";

const STORE_GENERAL_PATTERN =
  /\b(?:buka\s+setiap\s+hari|hari\s+operasional|cabang\s+toko|kontak\s+admin|hubungi\s+admin|whats?app\s+admin)\b/i;
const COMPARE_PATTERN =
  /\b(?:banding(?:kan)?|komparasi|compare|versus|\bvs\b|beda(?:nya)?|perbedaan|sama\s+.+\s+beda)\b/i;
const RECOMMENDATION_PATTERN =
  /\b(?:rekomendasi|rekomen|saran|sarankan|mending|pilihkan|paling\s+cocok|bagusnya|worth\s+it|value\s+for\s+money|buat\s+(?:pajangan|hadiah|koleksi)|untuk\s+(?:pajangan|hadiah|pemula)|kolektor\s+baru)\b/i;
const STRONG_RECOMMENDATION_PATTERN =
  /\b(?:rekomendasi|rekomen|saran|sarankan|mending|pilihkan|worth\s+it|value\s+for\s+money)\b/i;
const PRICE_PATTERN =
  /\b(?:harga|sale|promo|diskon|potongan|cashback|budget|dana|kisaran|di\s+bawah|dibawah|under|maks(?:imal)?\s+(?:budget|dana)|selisih\s+harga)\b/i;
const INSURANCE_PATTERN =
  /\b(?:asuransi|diasuransikan|jaminan\s+pengiriman)\b/i;
const TRACKING_PATTERN =
  /\b(?:resi|tracking|lacak|posisi\s+(?:paket|kiriman)|paket\s+sampai\s+mana|perjalanan\s+(?:paket|kiriman|kurir)|kiriman\s+.+\s+belum\s+sampai)\b/i;
const TRANSACTION_STATUS_PATTERN =
  /\b(?:status|progres|perkembangan|tahap)\s+(?:proses\s+)?(?:order|pesanan(?:nya)?|pesan|pembayaran(?:nya)?|transaksi(?:nya)?)\b|\b(?:order|pesanan(?:nya)?|pesan|pembayaran(?:nya)?|transaksi(?:nya)?)\s+.+\s+(?:diproses|pending|tahap)\b/i;
const STOCK_PATTERN =
  /\b(?:stok|stock|ready(?:\s+stock)?|tersedia|ketersediaan|restock|pre\s*order|preorder|sold\s+out|sisa\s+unit|sudah\s+habis)\b/i;
const RETURN_PATTERN =
  /\b(?:retur|return|refund|komplain|klaim|tukar\s+barang|pengembalian|uang\s+kembali|dana\s+kembali|salah\s+kirim|tidak\s+sesuai\s+(?:foto|deskripsi))\b/i;
const SHIPPING_ORIGIN_PATTERN =
  /\b(?:dikirim|pengiriman)\s+dari\s+(?:kota\s+)?mana\b|\basal\s+kirim\b.*\bdari\s+mana\b|\bpaket\s+(?:nanti\s+)?berangkat\s+dari\s+mana\b|\b(?:alamat\s+(?:lengkap\s+)?toko|lokasi\s+(?:toko|offline|warehouse)|warehouse|pickup\s+langsung|ambil\s+langsung|base\s+di)\b/i;
const SHIPPING_TRANSACTION_PATTERN =
  /\b(?:ongkir|ongkos\s+kirim|biaya\s+kirim|metode\s+pembayaran|bayar|pembayaran|qris|transfer|cod|cash\s+on\s+delivery|checkout|cara\s+(?:beli|membeli|order|pesan)|kurir|ekspedisi|estimasi\s+(?:kirim|pengiriman|sampai|nyampe)|berapa\s+lama\s+(?:kirim|pengiriman)|packing|proteksi)\b/i;
const PRODUCT_DETAIL_PATTERN =
  /\b(?:detail|spesifikasi|spek|original|ori|ukuran|dimensi|berat|bahan|material|diecast|limited|edisi|versi|rilis|isi\s+box|kelengkapan|kondisi|misb|mib|bib|loose|digerakkan|digerakin|artikulasi|kekurangan|kelebihan|minus|cacat)\b/i;
const PRODUCT_DISCOVERY_PATTERN =
  /\b(?:cari|carikan|nyari|pencarian|lihat|dilihat|tampilkan|daftar|list|pilihan|kategori|seri|series)\b.*\b(?:produk|barang|robot|item|mainan|figure|figur|chogokin|gundam|mazinger|grendizer|voltes|voltron|vintage)\b|\b(?:produk|barang|robot|item|mainan|figure|figur)\b.*\b(?:apa\s+(?:aja|saja)|tersedia|dijual|ada|dilihat|pilihan)\b/i;
const GREETING_PATTERN =
  /^\s*(?:halo|hallo|hai|hi|hello|permisi|misi|pagi|siang|sore|malam|ass?alamualaikum)\b/i;
const CATALOG_OVERVIEW_PATTERN =
  /\b(?:produk(?:nya)?|barang(?:nya)?|item(?:nya)?)\b.*\b(?:apa\s+aja|berapa\s+(?:macam|macem|jenis|banyak|jumlah)|jumlahnya)\b|\b(?:apa\s+aja|berapa\s+(?:macam|macem|jenis|banyak|jumlah))\b.*\b(?:produk(?:nya)?|barang(?:nya)?|item(?:nya)?)\b|\b(?:cuma|cuman|hanya)\b.*\b(?:jual|menjual)\b|\bjual\s+(?:yang\s+|yg\s+)?lain\b|\bselain\s+(?:robot|produk|barang|mainan|figure|figur)\b/i;

function normalizeText(value = "") {
  return buildIndonesianIntentText(normalizeIndonesianCommerceText(value))
    .replace(/\s+/g, " ")
    .trim();
}

function supportedIntent(value, fallback = "general") {
  const intent = String(value || "").trim();
  return CHATBOT_INTENTS.has(intent) ? intent : fallback;
}

export function detectExplicitIntentOverride(question = "") {
  const text = normalizeText(question);
  if (!text) return null;

  if (looksLikeAssistantCapabilitiesQuestion(text)) {
    return {
      intent: "general",
      method: "explicit_assistant_capabilities_rule",
    };
  }
  if (TRACKING_PATTERN.test(text)) {
    return {
      intent: "shipment_tracking",
      method: "explicit_tracking_rule",
    };
  }
  if (TRANSACTION_STATUS_PATTERN.test(text)) {
    return {
      intent: "transaction_status",
      method: "explicit_transaction_status_rule",
    };
  }
  if (RETURN_PATTERN.test(text)) {
    return { intent: "return_product", method: "explicit_return_rule" };
  }
  if (COMPARE_PATTERN.test(text)) {
    return { intent: "compare", method: "explicit_compare_rule" };
  }
  if (looksLikeProductManufacturingOriginQuestion(text)) {
    return {
      intent: "product_detail",
      method: "explicit_product_manufacturing_origin_rule",
    };
  }
  if (SHIPPING_ORIGIN_PATTERN.test(text)) {
    return {
      intent: "shipping_origin",
      method: "explicit_shipping_origin_rule",
    };
  }
  if (INSURANCE_PATTERN.test(text)) {
    return {
      intent: "shipping_transaction",
      method: "explicit_shipping_insurance_rule",
    };
  }
  if (
    RECOMMENDATION_PATTERN.test(text) &&
    (!STOCK_PATTERN.test(text) || STRONG_RECOMMENDATION_PATTERN.test(text))
  ) {
    return {
      intent: "recommendation",
      method: "explicit_recommendation_rule",
    };
  }
  if (PRODUCT_DISCOVERY_PATTERN.test(text)) {
    return {
      intent: "product_discovery",
      method: "explicit_product_discovery_rule",
    };
  }
  if (STOCK_PATTERN.test(text)) {
    return {
      intent: "stock_availability",
      method: "explicit_stock_rule",
    };
  }
  if (RECOMMENDATION_PATTERN.test(text)) {
    return {
      intent: "recommendation",
      method: "explicit_recommendation_rule",
    };
  }
  if (SHIPPING_TRANSACTION_PATTERN.test(text)) {
    return {
      intent: "shipping_transaction",
      method: "explicit_shipping_transaction_rule",
    };
  }
  if (PRICE_PATTERN.test(text)) {
    return { intent: "price_promo", method: "explicit_price_rule" };
  }
  if (PRODUCT_DETAIL_PATTERN.test(text)) {
    return { intent: "product_detail", method: "explicit_product_detail_rule" };
  }
  if (CATALOG_OVERVIEW_PATTERN.test(text)) {
    return {
      intent: "product_discovery",
      method: "explicit_catalog_overview_rule",
    };
  }
  if (
    looksLikeStoreHoursQuestion(text) ||
    STORE_GENERAL_PATTERN.test(text)
  ) {
    return { intent: "general", method: "explicit_store_general_rule" };
  }
  if (GREETING_PATTERN.test(text)) {
    return { intent: "greeting", method: "explicit_greeting_rule" };
  }

  return null;
}

export function shouldUseSemanticRouter({
  enabled = false,
  localScope = "ambiguous",
  question = "",
} = {}) {
  if (!enabled || localScope === "out_of_scope") return false;
  if (/^\s*(?:halo|hai|hi|hello|ass?alamualaikum)\s*[!?.]*\s*$/i.test(question)) {
    return false;
  }
  return !detectExplicitIntentOverride(question);
}

export function chooseSemanticIntent({
  question = "",
  localScope = "ambiguous",
  local = null,
  semantic = null,
  minSemanticConfidence = 0.65,
} = {}) {
  const localIntent = supportedIntent(local?.intent);
  const localScore = normalizeIntentConfidence(local?.score);
  const localResult = {
    intent: localIntent,
    method: local?.method || "local_fallback",
    score: localScore,
    scope: localScope,
    semantic: semantic || null,
  };

  // A deterministic rejection protects the store from LLM hallucinations.
  if (localScope === "out_of_scope") {
    return {
      ...localResult,
      intent: "general",
      method: "out_of_scope_guard",
      score: 1,
      scope: "out_of_scope",
    };
  }

  const explicit = detectExplicitIntentOverride(question);
  if (explicit) {
    return {
      ...localResult,
      ...explicit,
      score: 1,
      scope: "in_scope",
    };
  }

  if (!semantic) return localResult;

  const semanticIntent = supportedIntent(semantic.intent);
  const semanticConfidence = normalizeIntentConfidence(semantic.confidence);
  const semanticScope =
    semantic.scope === "in_scope" || semantic.scope === "out_of_scope"
      ? semantic.scope
      : "out_of_scope";

  // Local commerce evidence wins if the remote model incorrectly rejects it.
  if (localScope === "in_scope" && semanticScope === "out_of_scope") {
    return {
      ...localResult,
      method: `local_scope_override:${localResult.method}`,
      scope: "in_scope",
    };
  }

  if (semanticScope === "out_of_scope") {
    return {
      ...localResult,
      intent: "general",
      method: "groq_out_of_scope",
      score: semanticConfidence,
      scope: "out_of_scope",
    };
  }

  if (semanticConfidence < minSemanticConfidence) {
    return {
      ...localResult,
      method: `local_low_semantic_confidence:${localResult.method}`,
      scope: localScope === "ambiguous" ? "in_scope" : localScope,
    };
  }

  return {
    ...localResult,
    intent: semanticIntent,
    method: `groq_semantic:${semantic.model || "unknown"}`,
    score: semanticConfidence,
    scope: "in_scope",
  };
}

export function semanticRouteToLegacy(route = null) {
  if (!route) return null;
  const productNames = route.entities?.product_names || [];
  const budgetMin = route.entities?.budget_min;
  const budgetMax = route.entities?.budget_max;
  const budgetText =
    budgetMin !== null || budgetMax !== null
      ? JSON.stringify({ min: budgetMin ?? null, max: budgetMax ?? null })
      : "";

  return {
    intent: route.intent || "general",
    user_goal: route.intent === "recommendation" ? "info" : "unknown",
    style_preference: "",
    keywords: productNames,
    category_hint: "",
    product_name: productNames[0] || "",
    compare_product_a: productNames[0] || "",
    compare_product_b: productNames[1] || "",
    budget_text: budgetText,
    condition_preference: "",
    needs_followup: Boolean(route.needs_clarification),
    followup_question: route.clarification_question || "",
    sort_preference: "best_match",
  };
}
