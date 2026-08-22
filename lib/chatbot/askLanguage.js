import { classifyIntentML } from "../classifyIntentML.js";
import {
  GEMINI_MODELS,
  geminiText,
  genai,
} from "./gemini.js";
import {
  chooseHybridIntent,
  resolveIntentMlMinConfidence,
} from "./intentDecision.js";
import {
  INTENT_DATASET,
  INTENT_STOPWORDS,
  INTENT_KEYWORDS,
} from "./intentData.js";
import {
  expandCommerceProductNouns,
  stripHtml2,
} from "./utils.js";
import { deriveRecommendationMetadata } from "./recommendationMetadata.js";
import { extractProductComparisonNotes } from "./productFormatter.js";
import { buildIndonesianIntentText } from "./indonesianMorphology.js";
import { isGreetingOnly } from "./conversationUi.js";

const stripHtml = stripHtml2;

export function getProductImageUrl(p = {}) {
  const firstImage = Array.isArray(p.images) ? p.images[0] : null;

  return (
    p.image ||
    p.thumbnail ||
    p.featured_image ||
    p.featuredImage ||
    firstImage?.src ||
    firstImage?.url ||
    ""
  );
}

function tokenize(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !INTENT_STOPWORDS.has(t));
}

// Jaccard similarity untuk nentuin contoh dataset paling dekat
function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isOpinionQuestion(q = "") {
  const s = String(q || "").toLowerCase();

  return (
    s.includes("bagus") ||
    s.includes("worth it") ||
    s.includes("layak") ||
    s.includes("cocok") ||
    s.includes("recommended") ||
    s.includes("rekomen") ||
    s.includes("rekomendasi") ||
    s.includes("menarik") ||
    s.includes("kelebihan") ||
    s.includes("kekurangan") ||
    s.includes("pertimbangan") ||
    s.includes("perlu diperhatikan") ||
    s.includes("oke gak") ||
    s.includes("oke ga") ||
    s.includes("bagus engga") ||
    s.includes("bagus nggak") ||
    s.includes("bagus ga")
  );
}

// ===============================
// 🔤 LEVENSHTEIN
// ===============================
export function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function classifyIntentFromDataset(rawQuestion = "") {
  const intentQuestion = expandCommerceProductNouns(
    buildIndonesianIntentText(rawQuestion),
  );
  const qTokens = tokenize(intentQuestion);

  // 1) keyword boost
  const qLower = intentQuestion.toLowerCase();
  const kwScore = {
    product_discovery: 0,
    product_detail: 0,
    price_promo: 0,
    stock_availability: 0,
    shipping_transaction: 0,
    shipping_origin: 0,
    greeting: 0,
    return_product: 0,
    recommendation: 0,
    compare: 0,
    transaction_status: 0,
    shipment_tracking: 0,
  };

  for (const [intent, kws] of Object.entries(INTENT_KEYWORDS)) {
    for (const k of kws) {
      if (qLower.includes(k)) kwScore[intent] += 1;
    }
  }

  // 2) similarity ke dataset
  let best = { intent: "product_discovery", score: 0 };
  for (const [ex, intent] of INTENT_DATASET) {
    const s = jaccard(qTokens, tokenize(expandCommerceProductNouns(ex)));
    if (s > best.score) best = { intent, score: s };
  }

  if (
    qLower.includes("bandingkan") ||
    qLower.includes("compare") ||
    qLower.includes(" vs ") ||
    qLower.includes(" versus ") ||
    qLower.includes("apa bedanya") ||
    qLower.includes("bedanya") ||
    qLower.includes("perbedaan") ||
    (qLower.includes(" mana ") &&
      (qLower.includes("lebih bagus") ||
        qLower.includes("lebih baik") ||
        qLower.includes("bagusan"))) ||
    qLower.includes("pilih yang mana")
  ) {
    return {
      intent: "compare",
      method: "compare_phrase_rule",
      score: 0.95,
    };
  }

  if (
    qLower.includes("paling dicari") ||
    qLower.includes("terpopuler") ||
    qLower.includes("best seller") ||
    qLower.includes("bestseller") ||
    qLower.includes("paling laku") ||
    qLower.includes("yang paling banyak dicari")
  ) {
    return {
      intent: "recommendation",
      method: "popularity_rule",
      score: 0.95,
    };
  }
  if (
    qLower.includes("lagi nyari") ||
    qLower.includes("lagi cari") ||
    qLower.includes("mau cari") ||
    qLower.includes("ada pilihan") ||
    qLower.includes("kategori") ||
    (qLower.includes("produk") && qLower.includes("ada"))
  ) {
    return {
      intent: "product_discovery",
      method: "discovery_phrase_rule",
      score: 0.9,
    };
  }

  if (
    qLower.includes("rekomendasi") ||
    qLower.includes("rekomen") ||
    qLower.includes("cocok untuk") ||
    qLower.includes("buat pajangan") ||
    qLower.includes("untuk pajangan") ||
    qLower.includes("display") ||
    qLower.includes("untuk koleksi") ||
    qLower.includes("buat koleksi") ||
    qLower.includes("worth it")
  ) {
    return {
      intent: "recommendation",
      method: "recommendation_rule",
      score: 0.92,
    };
  }

  // gabung: keyword + similarity
  // (keyword menang kalau user jelas ngomong ongkir/checkout/harga/stok)
  const bestByKw = Object.entries(kwScore).sort((a, b) => b[1] - a[1])[0];
  const [kwIntent, kwVal] = bestByKw;

  // threshold: kalau similarity kecil banget, pakai keyword; kalau keyword kosong, default discovery
  if (kwVal >= 2) {
    if (kwIntent === "greeting" && !isGreetingOnly(rawQuestion)) {
      return {
        intent: "product_discovery",
        method: "mixed_greeting_fallback",
        score: kwVal,
      };
    }

    return { intent: kwIntent, method: "keyword", score: kwVal };
  }

  if (best.score >= 0.2) {
    if (best.intent === "greeting" && !isGreetingOnly(rawQuestion)) {
      return {
        intent: "product_discovery",
        method: "mixed_greeting_dataset_fallback",
        score: best.score,
      };
    }

    return { intent: best.intent, method: "dataset", score: best.score };
  }

  return { intent: "product_discovery", method: "fallback", score: 0 };
}

// ===============================
// TYPO NORMALIZATION
// ===============================

export const TYPO_MAP = {
  vitage: "vintage",
  vintge: "vintage",
  msib: "misb",
  orginal: "original",
  oriignal: "original",
  stokk: "stok",
  ongkiir: "ongkir",
  dikirm: "dikirim",
  brapa: "berapa",
  gundm: "gundam",
  voltrn: "voltron",
  brapa: "berapa",
  cogokin: "chogokin",
  chocogin: "chogokin",
  termura: "termurah",
  murh: "murah",
};

export function fuzzyCorrectWord(word, dictionary) {
  if (!word || word.length < 4) return word;

  let best = word;
  let bestScore = 0;

  for (const target of dictionary) {
    const dist = levenshtein(word, target);

    const score = 1 - dist / Math.max(word.length, target.length);

    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }

  if (bestScore >= 0.7) {
    return best;
  }

  return word;
}

const IMPORTANT_WORDS = [
  "misb",
  "original",
  "stok",
  "ready",
  "ongkir",
  "checkout",
  "vintage",
  "gashapon",
  "gundam",
  "voltron",
  "grendizer",
];

const PRODUCT_WORDS = [
  "voltron",
  "voltes",
  "gundam",
  "grendizer",
  "mazinger",
  "getter",
  "gashapon",
  "chogokin",
  "bandai",
  "takara",
  "vintage",
  "figure",
  "diecast",
  "model",
  "kit",
];

export const CORRECTION_WORDS = [...IMPORTANT_WORDS, ...PRODUCT_WORDS];

export function normalize(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function classifyIntentHybrid(rawQuestion) {
  try {
    // const ml = await withTimeout(classifyIntentML(rawQuestion), 1500);
    const ml = await classifyIntentML(rawQuestion);
    const rule = classifyIntentFromDataset(rawQuestion);

    return chooseHybridIntent({
      ml,
      rule,
      minConfidence: resolveIntentMlMinConfidence(
        process.env.INTENT_ML_MIN_CONFIDENCE,
      ),
    });
  } catch (err) {
    console.error("ML INTENT ERROR:", err?.message || err);

    const rule = classifyIntentFromDataset(rawQuestion);
    return {
      intent: rule.intent,
      method: "fallback_rule_low_confidence",
      score: rule.score ?? 0,
    };
  }
}

// ===============================
// Rekomendasi dengan Gemini
// =============================
export async function recommendWithGemini({
  rawQuestion,
  candidates,
  mode = "recommendation",
}) {
  if (!genai) return null;

  const facts = candidates.map((p) => {
    const notes = extractProductComparisonNotes(p);
    return {
      id: p.id,
      name: p.name,
      price: p.numericPrice || 0,
      stock: p.stock,
      stockQuantity: p.stockQuantity ?? null,
      totalSales: p.totalSales ?? 0,
      averageRating: p.averageRating ?? 0,
      ratingCount: p.ratingCount ?? 0,
      condition: p.condition || "(tidak tercantum)",
      category: p.category || "",
      recommendationMetadata:
        p.recommendationMetadata || deriveRecommendationMetadata(p),
      weight: p.weight || "",
      dimensions: p.dimensions || {},
      description: stripHtml(p.description || "").slice(0, 1200),
      strengths: notes.strengths,
      caveats: notes.caveats,
      link: p.link || "",
    };
  });

  const prompt = `
Kamu adalah AI recommendation engine untuk toko koleksi robot.

TUGAS:
1. Pilih maksimal 3 produk terbaik dari data kandidat.
2. WAJIB jelaskan alasan setiap produk dipilih.
3. Jika user menyebut budget, alasan HARUS menjelaskan kenapa harga produk masih masuk budget.
4. Jika user menyebut "untuk pajangan" / "display", alasan HARUS fokus pada kecocokan untuk pajangan.
5. Jika user menyebut dekade, gunakan hanya recommendationMetadata dan sebut sebagai era franchise, bukan tahun produksi barang.
6. Jika user mencari hadiah, jelaskan dari stok, kondisi, harga, dan kecocokan display yang tersedia; jangan menebak selera penerima.
7. Boleh gunakan bullet sederhana seperti: • ✅ 💰 📦
8. Jangan hanya mengulang range harga user.
9. Gunakan strengths dan caveats untuk menjelaskan kelebihan serta pertimbangan tiap produk.
10. Jangan menyembunyikan caveats produk terpilih. Jika datanya kosong, jangan mengarang.
11. reasoning_text harus berisi:
   - ringkasan singkat,
   - Boleh gunakan bullet sederhana seperti: • ✅ 💰 📦
   - alasan produk 1,
   - alasan produk 2,
   - alasan produk 3,
   - penutup singkat.

ATURAN KERAS:
- Jangan mengarang spesifikasi.
- Jangan mengarang angka.
- Hanya gunakan data kandidat.
- Alasan harus spesifik terhadap masing-masing produk.
- Jangan jawab template umum.

PERTANYAAN USER:
${rawQuestion}

MODE:
${mode}

DATA KANDIDAT:
${JSON.stringify(facts, null, 2)}

Kembalikan JSON valid saja:
{
  "chosen_product_ids": [1,2,3],
  "reasoning_text": "alasan lengkap dan natural",
  "summary_label": "best_seller | terpopuler | rekomendasi | worth_it"
}
`;

  try {
    let txt = await geminiText({
      model: GEMINI_MODELS.SMART,
      prompt,
      temperature: 0.3,
    });

    txt = (txt || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    console.log("GEMINI RAW RESPONSE: 654");
    console.log(txt);

    const parsed = JSON.parse(txt);

    return {
      chosen_product_ids: Array.isArray(parsed.chosen_product_ids)
        ? parsed.chosen_product_ids
        : [],
      reasoning_text: parsed.reasoning_text || null,
      summary_label: parsed.summary_label || null,
    };
  } catch (err) {
    console.error("GEMINI RECOMMEND CORE ERROR:", err?.message || err);
    return null;
  }
}

// ===============================
// Gemini semantic
// ==============================
export async function parseUserIntentWithGemini(rawQuestion, session = null) {
  if (!genai) return null;

  const recentContext = {
    lastIntent: session?.lastIntent || null,
    lastTopic: session?.lastTopic || null,
    lastProductNames: Array.isArray(session?.lastProducts)
      ? session.lastProducts.map((p) => p.name).slice(0, 3)
      : [],
    slots: session?.slots || {},
  };

  const prompt = `
Kamu bertugas sebagai semantic parser untuk chatbot ecommerce koleksi robot.

TUGAS:
Pahami maksud user dan ubah menjadi JSON terstruktur.
JANGAN jawab seperti chatbot.
JANGAN beri penjelasan.
HANYA keluarkan JSON valid.

INPUT USER:
${rawQuestion}

KONTEKS SESSION:
${JSON.stringify(recentContext, null, 2)}

ATURAN:
- Pahami bahasa informal, typo ringan, dan maksud implisit.
- Jika user bertanya rekomendasi, intent bisa "recommendation".
- Jika user bertanya detail spesifikasi, intent bisa "product_detail".
- Jika user bertanya stok, intent bisa "stock_availability".
- Jika user bertanya harga/promo/budget, intent bisa "price_promo".
- Jika user bertanya ongkir/pengiriman/checkout/pembayaran/COD/asuransi/estimasi kirim, intent bisa "shipping_transaction".
- Jika user membandingkan 2 produk, intent bisa "compare".
- Jika user hanya menyapa, intent bisa "greeting".

Field JSON yang wajib:
{
  "intent": "greeting | recommendation | product_discovery | product_detail | stock_availability | price_promo | shipping_transaction | shipping_origin | compare | general",
  "user_goal": "display | collection | gift | play | investment | comparison | info | shipping | checkout | unknown",
  "style_preference": "",
  "keywords": [],
  "category_hint": "",
  "product_name": "",
  "compare_product_a": "",
  "compare_product_b": "",
  "budget_text": "",
  "condition_preference": "",
  "needs_followup": false,
  "followup_question": "",
  "sort_preference": "best_match | cheapest | most_expensive | newest | ready_stock"
}

Output JSON saja.
`;

  try {
    let txt = await geminiText({
      model: GEMINI_MODELS.FAST,
      prompt,
      temperature: 0.1,
    });

    txt = (txt || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    console.log("GEMINI RAW RESPONSE: 743");
    console.log(txt);

    const parsed = JSON.parse(txt);

    return {
      intent: parsed.intent || "general",
      user_goal: parsed.user_goal || "unknown",
      style_preference: parsed.style_preference || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      category_hint: parsed.category_hint || "",
      product_name: parsed.product_name || "",
      compare_product_a: parsed.compare_product_a || "",
      compare_product_b: parsed.compare_product_b || "",
      budget_text: parsed.budget_text || "",
      condition_preference: parsed.condition_preference || "",
      needs_followup: !!parsed.needs_followup,
      followup_question: parsed.followup_question || "",
      sort_preference: parsed.sort_preference || "best_match",
    };
  } catch (err) {
    console.error("SEMANTIC PARSE ERROR:", err?.message || err);
    return null;
  }
}

export function isDiscoveryStyleQuestion(q = "") {
  const s = q.toLowerCase();

  return (
    s.includes("lagi nyari") ||
    s.includes("lagi cari") ||
    s.includes("mau cari") ||
    s.includes("cari") ||
    s.includes("ada ga disini") ||
    s.includes("ada di sini") ||
    s.includes("ada ga") ||
    s.includes("ada pilihan") ||
    s.includes("kategori") ||
    s.includes("produk") ||
    s.includes("koleksi toko") ||
    s.includes("bisa dibeli") ||
    s.includes("masuk koleksi toko")
  );
}

export function looksLikeShippingQuoteQuestion(q = "") {
  const s = String(q || "").toLowerCase();

  return (
    s.includes("ongkir") ||
    s.includes("ongkos kirim") ||
    s.includes("biaya kirim") ||
    s.includes("cek ongkir") ||
    s.includes("berapa ongkir") ||
    s.includes("tarif pengiriman")
  );
}
