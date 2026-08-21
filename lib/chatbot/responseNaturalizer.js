import { resolveGroqRouterConfig } from "./groq.js";
import {
  answeredProductFacts,
  isRequiredClarificationPayload,
} from "./followUpClosings.js";

const TEXT_FIELDS = ["intro", "message", "reasoning_text", "closing"];

const SUGGESTION_ACTIONS = {
  product_detail: {
    description: "Tanyakan detail atau spesifikasi produk yang tampil",
    products: 1,
    pattern: /\b(?:detail|spesifikasi|jelaskan|informasi)\b/i,
  },
  product_condition: {
    description: "Tanyakan kondisi, kelengkapan, box, atau kekurangan produk",
    products: 1,
    pattern: /\b(?:kondisi|kelengkapan|lengkap|cacat|rusak|box|kemasan)\b/i,
  },
  product_suitability: {
    description:
      "Nilai kecocokan produk untuk pajangan, hadiah, koleksi, atau kolektor pemula",
    products: 1,
    pattern:
      /\b(?:cocok|layak)\b.*\b(?:pajangan|display|hadiah|kado|koleksi|kolektor|pemula)\b/i,
  },
  product_tradeoffs: {
    description:
      "Tanyakan kelebihan, kekurangan, atau hal yang perlu dipertimbangkan sebelum membeli",
    products: 1,
    pattern:
      /\b(?:kelebihan|kekurangan|pertimbangan|perlu diperhatikan|sebelum membeli)\b/i,
  },
  product_alternative: {
    description:
      "Cari alternatif atau produk serupa yang lebih murah, lebih bagus, atau ready",
    products: 1,
    pattern:
      /\b(?:alternatif|produk serupa|pilihan lain)\b.*\b(?:murah|bagus|baik|worth|ready|tersedia)|\b(?:carikan|cari|rekomendasikan)\b.*\b(?:alternatif|produk serupa|pilihan lain)\b/i,
  },
  product_stock: {
    description: "Tanyakan stok atau status ready produk",
    products: 1,
    pattern: /\b(?:stok|stock|ready|tersedia|po)\b/i,
  },
  product_price: {
    description: "Tanyakan harga atau promo produk",
    products: 1,
    pattern: /\b(?:harga|promo|diskon)\b/i,
  },
  compare_products: {
    description: "Bandingkan dua produk yang tampil",
    products: 2,
    pattern: /\b(?:banding|beda|pilih|worth)\b/i,
  },
  better_value: {
    description: "Cari alternatif yang sedikit lebih bagus atau lebih worth it",
    products: 0,
    pattern: /\b(?:lebih bagus|lebih baik|worth|budget|alternatif)\b/i,
  },
  recommendation: {
    description: "Minta rekomendasi berdasarkan kebutuhan pelanggan",
    products: 0,
    pattern: /\b(?:rekomendasi(?:kan)?|cocok|pilih|sarankan)\b/i,
  },
  shipping_quote: {
    description: "Minta cek ongkir ke kota tujuan",
    products: 0,
    pattern: /\b(?:ongkir|biaya kirim)\b/i,
  },
  shipping_estimate: {
    description: "Tanyakan estimasi waktu pengiriman",
    products: 0,
    pattern: /\b(?:estimasi|berapa lama|kapan sampai|waktu pengiriman)\b/i,
  },
  shipping_protection: {
    description: "Tanyakan asuransi atau packing pengiriman",
    products: 0,
    pattern: /\b(?:asuransi|packing|kemasan pengiriman)\b/i,
  },
  shipping_coverage: {
    description: "Tanyakan cakupan wilayah pengiriman",
    products: 0,
    pattern: /\b(?:kirim|pengiriman)\b.*\b(?:luar pulau|luar kota|luar jawa|seluruh indonesia)\b/i,
  },
  cod: {
    description: "Tanyakan apakah pembayaran COD tersedia",
    products: 0,
    pattern: /\b(?:cod|bayar di tempat|cash on delivery)\b/i,
  },
  payment: {
    description: "Tanyakan metode pembayaran atau COD",
    products: 0,
    pattern: /\b(?:pembayaran|bayar|cod|transfer|qris)\b/i,
  },
  how_to_buy: {
    description: "Tanyakan cara membeli atau checkout",
    products: 0,
    pattern: /\b(?:cara .*beli|cara .*pesan|checkout|order)\b/i,
  },
  return_evidence: {
    description: "Tanyakan bukti yang diperlukan untuk retur",
    products: 0,
    pattern: /\b(?:bukti|foto|video).*(?:retur|refund)|(?:retur|refund).*(?:bukti|foto|video)\b/i,
  },
  return_timing: {
    description: "Tanyakan waktu pemeriksaan retur atau refund",
    products: 0,
    pattern: /\b(?:berapa lama|kapan|waktu).*(?:retur|refund)|(?:retur|refund).*(?:berapa lama|kapan|waktu)\b/i,
  },
  return_status: {
    description: "Tanyakan status pengajuan retur",
    products: 0,
    pattern: /\b(?:status|progres).*(?:retur|refund)|(?:retur|refund).*(?:status|progres)\b/i,
  },
  order_status: {
    description: "Tanyakan status pesanan",
    products: 0,
    pattern: /\b(?:status|progres).*(?:pesanan|order)|(?:pesanan|order).*(?:status|progres)\b/i,
  },
  shipment_tracking: {
    description: "Tanyakan pelacakan paket atau resi",
    products: 0,
    pattern: /\b(?:lacak|tracking|resi|posisi paket)\b/i,
  },
  store_location: {
    description: "Tanyakan alamat atau lokasi toko",
    products: 0,
    pattern: /\b(?:alamat|lokasi|di mana|dimana)\b/i,
  },
  store_hours: {
    description: "Tanyakan jam buka toko",
    products: 0,
    pattern: /\b(?:jam|pukul).*(?:buka|operasional)|(?:buka|operasional).*(?:jam|pukul)\b/i,
  },
  catalog_overview: {
    description: "Tanyakan jenis produk yang dijual toko",
    products: 0,
    pattern: /\b(?:jual apa|apa saja yang dijual|jenis produk|koleksi apa)\b/i,
  },
};

const PRODUCT_SUGGESTION_KEYS = [
  "product_detail",
  "product_condition",
  "product_suitability",
  "product_tradeoffs",
  "product_alternative",
  "product_stock",
  "product_price",
  "compare_products",
  "better_value",
  "recommendation",
];

const SUGGESTION_KEYS_BY_INTENT = {
  product_discovery: PRODUCT_SUGGESTION_KEYS,
  product_detail: PRODUCT_SUGGESTION_KEYS,
  price_promo: PRODUCT_SUGGESTION_KEYS,
  stock_availability: PRODUCT_SUGGESTION_KEYS,
  recommendation: PRODUCT_SUGGESTION_KEYS,
  compare: PRODUCT_SUGGESTION_KEYS,
  image_product_search: PRODUCT_SUGGESTION_KEYS,
  shipping_transaction: [
    "shipping_quote",
    "shipping_estimate",
    "shipping_protection",
    "shipping_coverage",
    "payment",
    "cod",
    "how_to_buy",
  ],
  shipping_origin: [
    "shipping_quote",
    "shipping_estimate",
    "shipping_protection",
    "shipping_coverage",
    "payment",
    "cod",
    "how_to_buy",
  ],
  return_product: ["return_evidence", "return_timing", "return_status"],
  transaction_status: ["shipment_tracking", "shipping_estimate"],
  shipment_tracking: ["order_status", "shipping_estimate", "shipping_protection"],
  greeting: [
    "catalog_overview",
    "recommendation",
    "shipping_quote",
    "payment",
    "cod",
    "how_to_buy",
    "store_location",
    "store_hours",
  ],
  general: [
    "catalog_overview",
    "recommendation",
    "shipping_quote",
    "payment",
    "cod",
    "how_to_buy",
    "store_location",
    "store_hours",
  ],
};

function enabledFlag(value, fallback = false) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return /^(?:1|true|yes|on)$/i.test(text);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ];
}

function uniqueSuggestedActions(values = []) {
  const seen = new Set();
  return uniqueStrings(values).filter((value) => {
    const key = normalizeQuestionForComparison(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function configuredModels(value, fallback = []) {
  const models = String(value || "")
    .split(/[,\r\n]+/)
    .map((model) => model.trim())
    .filter(Boolean);
  return uniqueStrings(models.length ? models : fallback);
}

function reasoningEffortForModel(model = "") {
  const normalized = String(model || "").toLowerCase();
  if (normalized.startsWith("qwen/")) return "none";
  if (normalized.startsWith("openai/gpt-oss-")) return "low";
  return null;
}

function parseJsonObject(value = "") {
  const text = String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Naturalizer tidak mengembalikan JSON object");
  }
  return parsed;
}

function combinedText(value = {}) {
  return TEXT_FIELDS.map((field) => String(value[field] || ""))
    .filter(Boolean)
    .join("\n");
}

function protectedNumbers(text = "") {
  return (String(text).match(/\d+(?:[.,]\d+)*(?:\s*%|\s*(?:pcs|kg|cm))?/gi) || [])
    .map((value) => value.replace(/\s+/g, " ").toLowerCase())
    .sort();
}

function protectedUrls(text = "") {
  return (String(text).match(/https?:\/\/[^\s)>\]]+/gi) || [])
    .map((value) => value.replace(/[.,;!?]+$/, ""))
    .sort();
}

function protectedMarkdownPhrases(text = "") {
  return [...String(text || "").matchAll(/\*\*([^*\n]+)\*\*/g)]
    .map((match) => String(match[1] || "").trim().toLowerCase())
    .filter(Boolean);
}

function sameValues(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function rankSuggestedActions(
  fallbackActions = [],
  candidates = [],
  indexes = [],
) {
  const safeCandidates = uniqueSuggestedActions(candidates).slice(0, 8);
  if (!safeCandidates.length || !Array.isArray(indexes)) {
    return uniqueSuggestedActions(fallbackActions).slice(0, 3);
  }

  const ranked = [];
  for (const value of indexes) {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= safeCandidates.length) {
      continue;
    }
    if (!ranked.includes(safeCandidates[index])) ranked.push(safeCandidates[index]);
    if (ranked.length === 3) break;
  }

  return ranked.length
    ? ranked
    : uniqueSuggestedActions(fallbackActions).slice(0, 3);
}

function completedSuggestionKeys(question = "") {
  const text = String(question || "").toLowerCase();
  const keys = new Set();

  if (/\b(?:termurah|termahal|harga|promo|diskon)\b/.test(text)) {
    keys.add("product_price");
  }
  if (/\b(?:stok|stock|ready|tersedia)\b/.test(text)) keys.add("product_stock");
  if (/\b(?:detail|spesifikasi)\b/.test(text)) keys.add("product_detail");
  if (/\b(?:kondisi|kelengkapan|cacat|rusak|box)\b/.test(text)) {
    keys.add("product_condition");
  }
  if (/\b(?:banding|versus|\bvs\b|bedanya)\b/.test(text)) {
    keys.add("compare_products");
  }
  if (/\b(?:rekomendasi|rekomen|sarankan|pilihkan|cocok)\b/.test(text)) {
    keys.add("recommendation");
  }
  if (/\b(?:worth it|value for money)\b/.test(text)) {
    keys.add("better_value");
  }
  if (
    /\b(?:cocok|layak)\b.*\b(?:pajangan|display|hadiah|kado|koleksi|kolektor|pemula)\b/.test(
      text,
    )
  ) {
    keys.add("product_suitability");
  }
  if (
    /\b(?:kelebihan|kekurangan|pertimbangan|perlu diperhatikan|sebelum membeli)\b/.test(
      text,
    )
  ) {
    keys.add("product_tradeoffs");
  }
  if (/\b(?:alternatif|produk serupa|pilihan lain)\b/.test(text)) {
    keys.add("product_alternative");
  }
  if (/\b(?:ongkir|biaya kirim)\b/.test(text)) keys.add("shipping_quote");
  if (/\b(?:estimasi|berapa lama|kapan sampai)\b/.test(text)) {
    keys.add("shipping_estimate");
  }
  if (/\b(?:asuransi|packing)\b/.test(text)) keys.add("shipping_protection");
  if (/\b(?:luar pulau|luar kota|luar jawa|seluruh indonesia)\b/.test(text)) {
    keys.add("shipping_coverage");
  }
  if (/\b(?:pembayaran|bayar|cod|transfer|qris)\b/.test(text)) {
    keys.add("payment");
  }
  if (/\b(?:cod|bayar di tempat|cash on delivery)\b/.test(text)) {
    keys.add("cod");
  }
  if (/\b(?:retur|refund)\b/.test(text) && /\b(?:bukti|foto|video)\b/.test(text)) {
    keys.add("return_evidence");
  }
  if (/\b(?:retur|refund)\b/.test(text) && /\b(?:berapa lama|kapan|waktu)\b/.test(text)) {
    keys.add("return_timing");
  }

  return keys;
}

export function buildSuggestionGenerationContext({
  payload = {},
  intent = "general",
  userQuestion = "",
  fallbackCandidates = [],
  recentActions = [],
} = {}) {
  const products = (Array.isArray(payload.products) ? payload.products : [])
    .map((product) => ({
      name: String(product?.name || "").trim().slice(0, 180),
      has_price:
        Number(
          product?.numericPrice ||
            product?.effectivePrice ||
            product?.price ||
            0,
        ) > 0,
      has_stock: Boolean(String(product?.stock || "").trim()),
    }))
    .filter((product) => product.name)
    .slice(0, 5)
    .map((product, index) => ({ index, ...product }));
  const completed = completedSuggestionKeys(userQuestion);
  const answeredFacts = answeredProductFacts(payload);
  const recentQuestions = uniqueStrings(recentActions).slice(-24);
  const recent = completedSuggestionKeys(recentQuestions.join(" "));
  const eligibleKeys = (SUGGESTION_KEYS_BY_INTENT[intent] || [])
    .filter((key) => {
      const spec = SUGGESTION_ACTIONS[key];
      if (!spec || spec.products > products.length || completed.has(key)) {
        return false;
      }
      if (key === "product_price" && answeredFacts.price) return false;
      if (key === "product_stock" && answeredFacts.stock) return false;
      if (key === "product_detail" && answeredFacts.details) return false;
      if (
        key === "product_condition" &&
        answeredFacts.condition &&
        answeredFacts.completeness
      ) {
        return false;
      }
      return true;
    });
  const freshKeys = eligibleKeys.filter((key) => !recent.has(key));
  const allowedActions = (freshKeys.length ? freshKeys : eligibleKeys)
    .map((key) => ({
      key,
      description: SUGGESTION_ACTIONS[key].description,
      required_product_count: SUGGESTION_ACTIONS[key].products,
    }));

  return {
    allowedActions,
    products,
    answeredFacts,
    recentQuestions,
    fallbackCandidates: uniqueStrings(fallbackCandidates).slice(0, 8),
  };
}

function normalizeQuestionForComparison(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateGeneratedSuggestions(
  generated = [],
  context = {},
  userQuestion = "",
) {
  if (!Array.isArray(generated)) return [];

  const allowed = new Set(
    (context.allowedActions || []).map((action) => action.key),
  );
  const products = Array.isArray(context.products) ? context.products : [];
  const originalQuestion = normalizeQuestionForComparison(userQuestion);
  const recentQuestions = new Set(
    (context.recentQuestions || []).map(normalizeQuestionForComparison),
  );
  const accepted = [];

  for (const item of generated.slice(0, 6)) {
    const key = String(item?.action_key || "").trim();
    const spec = SUGGESTION_ACTIONS[key];
    if (!spec || !allowed.has(key)) continue;

    const indexes = [
      ...new Set(
        (Array.isArray(item?.product_indexes) ? item.product_indexes : [])
          .map(Number)
          .filter(Number.isInteger),
      ),
    ];
    if (indexes.length < spec.products) continue;

    const selectedProducts = indexes
      .slice(0, spec.products)
      .map((index) => products[index])
      .filter(Boolean);
    if (selectedProducts.length !== spec.products) continue;
    if (
      (key === "product_price" &&
        (context.answeredFacts?.price ||
          selectedProducts.every((product) => product.has_price))) ||
      (key === "product_stock" &&
        (context.answeredFacts?.stock ||
          selectedProducts.every((product) => product.has_stock)))
    ) {
      continue;
    }

    let question = String(item?.question || "").replace(/\s+/g, " ").trim();
    if (question.length < 12 || question.length > 160) continue;
    if (/https?:\/\/|www\.|wa\.me|@|<[^>]+>|\b\d{8,}\b/i.test(question)) {
      continue;
    }
    if (
      /^(?:kalau kamu mau[, ]+)?(?:mau|boleh|ingin)?\s*(?:aku|saya)\s+(?:bisa\s+)?(?:bantu|carikan|rekomendasikan)\b/i.test(
        question,
      )
    ) {
      continue;
    }
    if (!spec.pattern.test(question)) continue;
    const normalizedQuestion = question.toLowerCase();
    if (
      (key === "product_detail" && context.answeredFacts?.details) ||
      (key === "product_condition" &&
        ((context.answeredFacts?.condition &&
          /\bkondisi\b/.test(normalizedQuestion)) ||
          (context.answeredFacts?.completeness &&
            /\b(?:kelengkapan|lengkap|part|aksesori|aksesoris|isi\s+box)\b/.test(
              normalizedQuestion,
            ))))
    ) {
      continue;
    }
    if (
      !selectedProducts.every((product) =>
        question.toLowerCase().includes(product.name.toLowerCase()),
      )
    ) {
      continue;
    }
    if (normalizeQuestionForComparison(question) === originalQuestion) continue;
    if (recentQuestions.has(normalizeQuestionForComparison(question))) continue;

    if (!/[?!.]$/.test(question)) question += "?";
    if (!accepted.some((value) => value.toLowerCase() === question.toLowerCase())) {
      accepted.push(question);
    }
    if (accepted.length === 3) break;
  }

  return accepted;
}

function mentionedProductNames(payload = {}, text = "") {
  const normalizedText = String(text).toLowerCase();
  return (Array.isArray(payload.products) ? payload.products : [])
    .map((product) => String(product?.name || "").trim())
    .filter(
      (name) => name && normalizedText.includes(name.toLowerCase()),
    );
}

export function isSafeNaturalizedResponse(original = {}, candidate = {}) {
  for (const field of TEXT_FIELDS) {
    const before = String(original[field] || "").trim();
    const after =
      typeof candidate[field] === "string" ? candidate[field].trim() : "";

    if (!before && after) return false;
    if (before && !after) return false;
    if (after.length > Math.max(before.length * 2, before.length + 220)) {
      return false;
    }
  }

  const beforeText = combinedText(original);
  const afterText = combinedText(candidate);

  if (
    !sameValues(protectedNumbers(beforeText), protectedNumbers(afterText)) ||
    !sameValues(protectedUrls(beforeText), protectedUrls(afterText))
  ) {
    return false;
  }

  const afterLower = afterText.toLowerCase();
  return (
    mentionedProductNames(original, beforeText).every((name) =>
      afterLower.includes(name.toLowerCase()),
    ) &&
    protectedMarkdownPhrases(beforeText).every((phrase) =>
      afterLower.includes(phrase),
    )
  );
}

export function resolveGroqNaturalizerConfig(env = process.env) {
  const router = resolveGroqRouterConfig(env);
  return {
    enabled: enabledFlag(
      env.GROQ_NATURALIZER_ENABLED,
      Boolean(router.apiKey),
    ),
    apiKey: router.apiKey,
    endpoint: router.endpoint,
    model: configuredModels(env.GROQ_NATURALIZER_MODEL, [router.model])[0],
    fallbackModels: configuredModels(
      env.GROQ_NATURALIZER_FALLBACK_MODELS,
      router.fallbackModels,
    ),
    timeoutMs: positiveInteger(
      env.GROQ_NATURALIZER_TIMEOUT_MS,
      6500,
    ),
  };
}

function reportStatus(onStatus, status) {
  if (typeof onStatus !== "function") return;
  try {
    onStatus(status);
  } catch {}
}

function naturalizerInput(payload = {}) {
  return Object.fromEntries(
    TEXT_FIELDS.map((field) => [
      field,
      String(payload[field] || "").slice(
        0,
        field === "reasoning_text" ? 1800 : 800,
      ),
    ]),
  );
}

async function requestNaturalizedJson({
  payload,
  userQuestion,
  intent,
  conversationContext,
  actionCandidates,
  verifiedFacts,
  config,
  model,
  fetchImpl,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const suggestionContext = buildSuggestionGenerationContext({
    payload,
    intent,
    userQuestion,
    fallbackCandidates: actionCandidates,
    recentActions: conversationContext?.recentActions,
  });

  try {
    const reasoningEffort = reasoningEffortForModel(model);
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah penyusun jawaban akhir chatbot ecommerce Robot Jadul. " +
              "Tulis ulang teks dalam bahasa Indonesia agar terasa seperti asisten AI yang natural, ramah, singkat, dan nyambung dengan gaya bicara user. " +
              "Jika user menyapa atau memanggil dengan sebutan seperti min, kak, gan, atau sejenisnya, tanggapi secara wajar satu kali bila cocok agar user merasa diperhatikan; jangan berlebihan atau meniru panggilan yang tidak pantas. " +
              "Jawab kekhawatiran user secara langsung; jika editable_text memuat beberapa jawaban, pertahankan dan sambungkan seluruh poinnya dalam urutan yang mudah dibaca. " +
              "Gunakan aku/kamu secara wajar, hindari bahasa kaku seperti 'berikut adalah', dan jangan mengulang sapaan di tengah percakapan. " +
              "Gunakan konteks percakapan hanya untuk menjaga kesinambungan gaya dan rujukan; jangan menyimpulkan fakta baru dari konteks. " +
              "verified_facts adalah hasil tool WooCommerce/API yang boleh dipercaya. Gunakan hanya untuk memahami fakta yang sudah tersedia; jangan membuat nilai baru dan jangan mengubah struktur data. " +
              "Sesuaikan empati secara wajar dengan customer_state; state itu hanya petunjuk nada, bukan sumber fakta atau alasan untuk menambah janji. " +
              "Boleh memperhalus susunan kalimat, tetapi jangan berlebihan memakai emoji atau bahasa gaul. " +
              "Pertahankan seluruh fakta, nama produk, angka, harga, stok, diskon, status, dan URL persis. " +
              "Jangan menambah fakta, produk, janji, opini, pertanyaan, atau ajakan follow-up baru. " +
              "Jika suggestion_generation berisi allowed_actions, prediksi maksimal tiga pertanyaan lanjutan yang paling mungkin dibutuhkan user setelah jawaban ini. Gunakan maksud pertanyaan sekarang, produk yang tampil, dan tahap perjalanan belanja untuk memilih kebutuhan berikutnya yang paling relevan. Setiap item wajib memakai action_key yang diizinkan, product_indexes yang tersedia, dan kalimat question yang natural. Variasikan tujuan pertanyaan, bukan hanya mengganti susunan kata. question harus berupa kalimat yang akan diucapkan pelanggan kepada chatbot, bukan tawaran dari asisten; jangan mulai dengan 'Mau aku bantu', 'Aku bisa bantu', atau bentuk serupa. Jangan menanyakan fakta yang ditandai sudah tampil dalam answered_product_facts, termasuk harga, stok, kondisi, kelengkapan, dan detail. Prioritaskan kecocokan, kelebihan-kekurangan, alternatif, perbandingan, pengiriman, atau langkah pembelian yang belum dijawab. Hindari pertanyaan dalam recent_questions. Jangan mengulang permintaan user, jangan mengarang produk atau kemampuan, dan jangan menulis URL/data sensitif. " +
              "action_indexes boleh dipakai sebagai ranking fallback_candidates jika kamu tidak dapat membuat suggested_actions yang valid. " +
              "Jangan mengubah field kosong menjadi berisi. Kembalikan JSON valid saja.",
          },
          {
            role: "user",
            content: JSON.stringify({
              question: String(userQuestion || "").slice(0, 500),
              intent: String(intent || "general"),
              conversation_context: {
                previous_intent: String(
                  conversationContext?.lastIntent || "",
                ).slice(0, 80),
                previous_topic: String(
                  conversationContext?.lastTopic || "",
                ).slice(0, 160),
                had_pending_step: Boolean(conversationContext?.hasPending),
                customer_state: String(
                  conversationContext?.customerState || "neutral",
                ).slice(0, 20),
                recent_products: Array.isArray(
                  conversationContext?.recentProducts,
                )
                  ? conversationContext.recentProducts
                      .map((name) => String(name || "").slice(0, 180))
                      .filter(Boolean)
                      .slice(0, 5)
                  : [],
                ...(conversationContext?.linguistic &&
                typeof conversationContext.linguistic === "object"
                  ? {
                      language_analysis: {
                        subject: String(
                          conversationContext.linguistic.subject || "",
                        ).slice(0, 100),
                        predicate: String(
                          conversationContext.linguistic.predicate || "",
                        ).slice(0, 80),
                        object: String(
                          conversationContext.linguistic.object || "",
                        ).slice(0, 160),
                        negated: Boolean(
                          conversationContext.linguistic.negated,
                        ),
                        question_type: String(
                          conversationContext.linguistic.question_type || "",
                        ).slice(0, 30),
                      },
                    }
                  : {}),
              },
              editable_text: naturalizerInput(payload),
              verified_facts:
                verifiedFacts && typeof verifiedFacts === "object"
                  ? verifiedFacts
                  : {},
              safe_action_candidates: uniqueStrings(actionCandidates)
                .slice(0, 8)
                .map((action, index) => ({ index, action })),
              suggestion_generation: {
                allowed_actions: suggestionContext.allowedActions,
                available_products: suggestionContext.products,
                answered_product_facts: suggestionContext.answeredFacts,
                recent_questions: suggestionContext.recentQuestions,
                fallback_candidates: suggestionContext.fallbackCandidates,
              },
              output_schema: {
                intro: "string",
                message: "string",
                reasoning_text: "string",
                closing: "string",
                suggested_actions:
                  "array maksimal 3 berisi { action_key: string, product_indexes: number[], question: string }",
                action_indexes: "number[]; max 3; hanya indeks safe_action_candidates",
              },
            }),
          },
        ],
        response_format: { type: "json_object" },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        temperature: 0.2,
        max_completion_tokens: 850,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        data?.error?.message || `Groq naturalizer HTTP ${response.status}`,
      );
      error.status = response.status;
      throw error;
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq naturalizer menghasilkan respons kosong");

    return parseJsonObject(content);
  } finally {
    clearTimeout(timeout);
  }
}

export async function naturalizeResponseWithGroq(
  payload,
  {
    userQuestion = "",
    intent = "general",
    conversationContext = {},
    actionCandidates = [],
    verifiedFacts = {},
    config = resolveGroqNaturalizerConfig(),
    fetchImpl = globalThis.fetch,
    onStatus = null,
  } = {},
) {
  if (!payload || typeof payload !== "object") {
    reportStatus(onStatus, {
      provider: "template",
      naturalized: false,
      reason: "invalid_payload",
    });
    return payload;
  }
  const payloadType = String(payload.type || "");
  const mustPreserveClarification =
    payloadType === "options" ||
    (payloadType !== "suggestions" && isRequiredClarificationPayload(payload));
  if (mustPreserveClarification) {
    reportStatus(onStatus, {
      provider: "template",
      naturalized: false,
      reason: "required_clarification",
    });
    return payload;
  }
  if (!config.enabled || !config.apiKey || typeof fetchImpl !== "function") {
    reportStatus(onStatus, {
      provider: "template",
      naturalized: false,
      reason: !config.enabled
        ? "disabled"
        : !config.apiKey
          ? "missing_api_key"
          : "fetch_unavailable",
    });
    return payload;
  }
  if (!combinedText(payload).trim()) {
    reportStatus(onStatus, {
      provider: "template",
      naturalized: false,
      reason: "no_editable_text",
    });
    return payload;
  }

  const models = uniqueStrings([
    config.model,
    ...(config.fallbackModels || []),
  ]);

  for (let index = 0; index < models.length; index += 1) {
    try {
      const candidate = await requestNaturalizedJson({
        payload,
        userQuestion,
        intent,
        conversationContext,
        actionCandidates,
        verifiedFacts,
        config,
        model: models[index],
        fetchImpl,
      });

      const suggestionContext = buildSuggestionGenerationContext({
        payload,
        intent,
        userQuestion,
        fallbackCandidates: actionCandidates,
        recentActions: conversationContext?.recentActions,
      });
      const generatedActions = validateGeneratedSuggestions(
        candidate.suggested_actions,
        suggestionContext,
        userQuestion,
      );
      const rankedFallback = rankSuggestedActions(
        payload.actions,
        actionCandidates,
        candidate.action_indexes,
      );
      const rankedActions = uniqueSuggestedActions([
        ...generatedActions,
        ...rankedFallback,
      ]).slice(0, 3);

      if (!isSafeNaturalizedResponse(payload, candidate)) {
        reportStatus(onStatus, {
          provider: "groq",
          model: models[index],
          naturalized: false,
          reason: "unsafe_rewrite_rejected",
          suggestions_generated: generatedActions.length > 0,
        });
        return {
          ...payload,
          ...(rankedActions.length ? { actions: rankedActions } : {}),
        };
      }

      reportStatus(onStatus, {
        provider: "groq",
        model: models[index],
        naturalized: true,
        reason: "success",
        suggestions_generated: generatedActions.length > 0,
      });

      return {
        ...payload,
        ...Object.fromEntries(
          TEXT_FIELDS.map((field) => [
            field,
            String(candidate[field] || "").trim(),
          ]),
        ),
        ...(rankedActions.length ? { actions: rankedActions } : {}),
      };
    } catch (error) {
      const canFallback =
        error?.status === 429 ||
        error?.status === 408 ||
        error?.name === "AbortError" ||
        Number(error?.status || 0) >= 500;
      const isLast = index === models.length - 1;

      if (!canFallback || isLast) {
        reportStatus(onStatus, {
          provider: "groq",
          model: models[index],
          naturalized: false,
          reason:
            error?.name === "AbortError"
              ? "timeout"
              : `error_${Number(error?.status || 0) || "unknown"}`,
        });
        console.error(
          "GROQ NATURALIZER FALLBACK:",
          error?.message || error,
        );
        return payload;
      }
    }
  }

  reportStatus(onStatus, {
    provider: "groq",
    naturalized: false,
    reason: "models_exhausted",
  });
  return payload;
}
