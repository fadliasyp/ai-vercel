import { createPartFromBase64 } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  GEMINI_MODEL_FALLBACKS,
  genai,
  geminiGenerateContentWithFallback,
  geminiResponseText,
} from "../lib/chatbot/gemini.js";
import { generateVisionJsonWithMistral } from "../lib/chatbot/mistral.js";
import { generateVisionJsonWithCloudflare } from "../lib/chatbot/cloudflare.js";
import {
  loadProductVisualIndex,
  scoreProductVisualIndex,
} from "../lib/chatbot/visualIndex.js";
import { naturalizeResponseWithGroq } from "../lib/chatbot/responseNaturalizer.js";
import { getWooProductsCached } from "../lib/chatbot/wooCatalog.js";
import {
  applyImageSearchConstraints,
  extractImageSearchConstraints,
  getImageBudgetMismatch,
  interleaveUniqueProducts,
  plausibleVisualProducts,
} from "../lib/chatbot/imageCandidatePool.js";
import { buildChatMetric } from "../lib/chatbot/observability.js";
import {
  applyControlledFollowUpPolicy,
  buildControlledActions,
  isRequiredClarificationPayload,
  serializeSuggestedActions,
} from "../lib/chatbot/followUpClosings.js";

export const config = {
  runtime: "nodejs",
  maxDuration: 90,
};

let imageAnalyzeCooldownUntil = 0;

const IMAGE_SEARCH_BUDGET_MS = Number(
  process.env.IMAGE_SEARCH_BUDGET_MS || 55000,
);
const MIN_VISUAL_RERANK_STEP_MS = 9000;
const GEMINI_QUOTA_COOLDOWN_MS = Number(
  process.env.GEMINI_QUOTA_COOLDOWN_MS || 10 * 60 * 1000,
);

const observabilitySupabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      )
    : null;

async function logImageMetric(input) {
  if (!observabilitySupabase) return;

  try {
    const { error } = await observabilitySupabase
      .from("chat_observability")
      .insert(buildChatMetric(input));

    if (error) console.error("IMAGE OBSERVABILITY ERROR:", error.message);
  } catch (error) {
    console.error("IMAGE OBSERVABILITY ERROR:", error?.message || error);
  }
}

function createDeadline(ms = IMAGE_SEARCH_BUDGET_MS) {
  const endAt = Date.now() + ms;
  return {
    remaining() {
      return Math.max(0, endAt - Date.now());
    },
    expired(bufferMs = 0) {
      return Date.now() + bufferMs >= endAt;
    },
  };
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function looksLikeGeminiQuotaError(err) {
  const status = Number(
    err?.status || err?.statusCode || err?.response?.status || 0,
  );
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    status === 429 ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota exceeded") ||
    msg.includes("free_tier_requests") ||
    msg.includes("generaterequestsperday") ||
    msg.includes("429")
  );
}

function setImageAnalyzeCooldown(err) {
  if (!looksLikeGeminiQuotaError(err)) return;
  imageAnalyzeCooldownUntil = Date.now() + GEMINI_QUOTA_COOLDOWN_MS;
}

function isImageAnalyzeCoolingDown() {
  return Date.now() < imageAnalyzeCooldownUntil;
}

function parseImageDataUrl(image = "") {
  const m = String(image || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;

  const mimeType = m[1].toLowerCase();
  const data = m[2].trim();

  if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mimeType)) {
    return null;
  }

  const approxBytes = Math.ceil((data.length * 3) / 4);
  if (approxBytes > 5 * 1024 * 1024) {
    const err = new Error("IMAGE_TOO_LARGE");
    err.code = "IMAGE_TOO_LARGE";
    throw err;
  }

  return { mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType, data };
}

function stripHtml(html = "") {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNum(x) {
  const n = parseFloat(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function cleanNumberString(v) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function getUrlFileName(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const u = new URL(raw);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "");
  } catch {
    const last = raw.split("?")[0].split("/").filter(Boolean).pop() || raw;
    try {
      return decodeURIComponent(last).replace(/\.[a-z0-9]+$/i, "");
    } catch {
      return last.replace(/\.[a-z0-9]+$/i, "");
    }
  }
}

function getProductImages(p = {}) {
  const rawImages = Array.isArray(p.images) ? p.images : [];
  const candidates = rawImages.map((img, index) => ({
    url: img?.src || img?.url || "",
    name: img?.name || "",
    alt: img?.alt || "",
    position: Number.isFinite(Number(img?.position)) ? Number(img.position) : index,
  }));

  [
    p.image,
    p.thumbnail,
    p.featured_image,
    p.featuredImage,
  ].forEach((url) => {
    if (url) {
      candidates.push({
        url,
        name: "",
        alt: "",
        position: candidates.length,
      });
    }
  });

  const seen = new Set();
  return candidates
    .filter((img) => {
      const url = String(img.url || "").trim();
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    .map((img, index) => ({
      ...img,
      index,
      fileName: getUrlFileName(img.url),
      text: [img.name, img.alt, getUrlFileName(img.url)]
        .filter(Boolean)
        .join(" "),
    }));
}

function getProductImageUrl(p = {}) {
  const firstImage = getProductImages(p)[0];
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

function getProductImageText(p = {}) {
  return getProductImages(p)
    .flatMap((img) => [img.name, img.alt, img.fileName])
    .filter(Boolean)
    .join(" ");
}

async function fetchProductsCached({ deadline = null } = {}) {
  if (deadline?.expired(5000)) return [];

  const timeoutMs = deadline
    ? Math.max(2500, Math.min(12000, deadline.remaining() - 1000))
    : 12000;
  const products = await getWooProductsCached({ timeoutMs });

  return products.map(mapWooProduct);
}

function mapWooProduct(p) {
  const price = toNum(p.price);
  const regular = toNum(p.regular_price);
  const sale = toNum(p.sale_price);
  const effectivePrice = sale ?? price ?? regular ?? null;
  const regularNum = Number(regular || 0);
  const saleNum = Number(sale || 0);
  const discountPercent =
    regularNum > 0 && saleNum > 0 && saleNum < regularNum
      ? Math.round(((regularNum - saleNum) / regularNum) * 100)
      : 0;

  return {
    id: p.id,
    name: p.name,
    price: p.price,
    regular_price: p.regular_price,
    sale_price: p.sale_price,
    numericPrice: effectivePrice ?? 0,
    effectivePrice,
    stock: p.stock_status,
    stockQuantity:
      typeof p.stock_quantity === "number" ? p.stock_quantity : null,
    description: p.description || "",
    link: p.permalink,
    image: getProductImageUrl(p),
    images: getProductImages(p),
    imageText: getProductImageText(p),
    category: p.categories?.map((c) => c.name.toLowerCase()).join(" ") || "",
    condition:
      p.condition ||
      (Array.isArray(p.meta_data)
        ? p.meta_data.find((m) => String(m.key || "").toLowerCase() === "condition")
            ?.value
        : "") ||
      "",
    weight: cleanNumberString(p.weight),
    dimensions: {
      length: cleanNumberString(p.dimensions?.length),
      width: cleanNumberString(p.dimensions?.width),
      height: cleanNumberString(p.dimensions?.height),
    },
    discountPercent,
    isPromo: discountPercent > 0,
  };
}

function uniqueTerms(items = []) {
  const out = [];
  for (const item of items.flat()) {
    const s = String(item || "").trim().toLowerCase();
    if (s.length >= 2 && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 40);
}

const IMAGE_QUERY_STOPWORDS = new Set([
  "ada",
  "apakah",
  "bisa",
  "cari",
  "carikan",
  "cek",
  "engga",
  "ngga",
  "gak",
  "tidak",
  "ini",
  "itu",
  "saya",
  "aku",
  "mau",
  "tolong",
  "produk",
  "product",
  "barang",
  "robot",
  "foto",
  "gambar",
  "yang",
  "dan",
  "atau",
  "dengan",
]);

export function extractImageQueryKeywords(question = "") {
  return [
    ...new Set(
      String(question || "")
        .toLowerCase()
        .split(/[^\p{L}\p{N}-]+/u)
        .map((word) => word.trim())
        .filter(
          (word) => word.length >= 3 && !IMAGE_QUERY_STOPWORDS.has(word),
        ),
    ),
  ].slice(0, 12);
}

function expandSearchTerms(terms = []) {
  const stop = new Set([
    "robot",
    "figure",
    "produk",
    "product",
    "barang",
    "mainan",
    "toy",
    "foto",
    "gambar",
    "mirip",
    "carikan",
    "tolong",
    "dengan",
    "yang",
    "ini",
    "the",
    "and",
    "for",
  ]);

  const out = [];
  for (const term of terms) {
    const s = String(term || "").toLowerCase().trim();
    if (!s) continue;

    if (!stop.has(s) && !out.includes(s)) out.push(s);

    s.split(/[^a-z0-9]+/i)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length >= 3 && !stop.has(x))
      .forEach((x) => {
        if (!out.includes(x)) out.push(x);
      });
  }

  return out.slice(0, 80);
}

function productSearchText(p = {}) {
  return [
    p.name,
    p.category,
    p.condition,
    p.imageText,
    stripHtml(p.description || ""),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreProduct(p, terms = [], analysis = {}) {
  const text = productSearchText(p);
  const name = String(p.name || "").toLowerCase();
  const expandedTerms = expandSearchTerms(terms);
  let score = 0;
  const hits = [];

  for (const term of expandedTerms) {
    if (!term) continue;
    if (name.includes(term)) {
      score += 18;
      hits.push(term);
    } else if (text.includes(term)) {
      score += 7;
      hits.push(term);
    }
  }

  for (const color of analysis.colors || []) {
    const c = String(color || "").toLowerCase();
    if (c && text.includes(c)) score += 2;
  }

  return {
    ...p,
    imageMatchScore: score,
    imageMatchTerms: [...new Set(hits)].slice(0, 8),
  };
}

function mergeUniqueProducts(groups = []) {
  const map = new Map();

  for (const group of groups) {
    for (const product of group || []) {
      const key = String(product?.id || "");
      if (!key || map.has(key)) continue;
      map.set(key, product);
    }
  }

  return [...map.values()];
}

function parseJsonLoose(text = "") {
  const raw = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const m = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : raw);
}

function inferImageMimeType(url = "", contentType = "") {
  const ct = String(contentType || "").split(";")[0].toLowerCase();
  if (ct.startsWith("image/")) return ct;

  const cleanUrl = String(url || "").split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  return "image/jpeg";
}

async function fetchImageAsBase64(url = "", { timeoutMs = 12000 } = {}) {
  if (!url) return null;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (VercelBot; +https://vercel.com)",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().startsWith("image/")) {
      return null;
    }

    const arrayBuffer = await resp.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength > 2.5 * 1024 * 1024) {
      return null;
    }

    return {
      mimeType: inferImageMimeType(url, contentType),
      data: Buffer.from(arrayBuffer).toString("base64"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function candidateFacts(candidates = []) {
  return candidates.map((item, index) => {
    const p = item.product || item;
    const image = item.image || {};
    const visualIndexImage = (p.visualIndexImages || []).find(
      (entry) => String(entry?.url || "") === String(image?.url || ""),
    ) || (p.visualIndexImages || [])[Number(image.index || 0)] || {};
    return {
      candidate_index: index + 1,
      id: p.id,
      name: p.name,
      category: p.category || "",
      condition: p.condition || "",
      lexical_score: p.imageMatchScore || 0,
      lexical_hits: p.imageMatchTerms || [],
      image_index: Number(image.index || 0) + 1,
      image_file: image.fileName || "",
      image_alt: image.alt || "",
      image_name: image.name || "",
      indexed_caption: visualIndexImage.caption || "",
      indexed_visible_text: visualIndexImage.visibleText || [],
      indexed_features: visualIndexImage.features || [],
      indexed_colors: visualIndexImage.colors || [],
    };
  });
}

async function attachCandidateImages(
  candidates = [],
  {
    maxProducts = 12,
    maxImagesPerProduct = 2,
    maxTotalImages = 18,
    deadline = null,
  } = {},
) {
  const products = candidates.filter((p) => p.image).slice(0, maxProducts);
  const imageVariants = [];

  for (let round = 0; round < maxImagesPerProduct; round += 1) {
    for (const product of products) {
      const image = getProductImages(product)[round];
      if (!image?.url) continue;
      imageVariants.push({ product, image });
      if (imageVariants.length >= maxTotalImages) break;
    }
    if (imageVariants.length >= maxTotalImages) break;
  }

  const fetched = await Promise.allSettled(
    imageVariants.map(async (item) => ({
      ...item,
      imagePart: await fetchImageAsBase64(item.image.url, {
        timeoutMs: deadline
          ? Math.max(1800, Math.min(4500, deadline.remaining() - 1000))
          : 4500,
      }),
    })),
  );

  return fetched
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((x) => x?.imagePart);
}

export function buildVisualRerankPrompt({ analysis, candidates }) {
  return `
Kamu adalah visual matcher untuk katalog Robot Jadul.
Bandingkan USER_IMAGE dengan setiap CANDIDATE_IMAGE.

Tugas:
- Nilai kemiripan visual, bukan popularitas produk.
- Prioritaskan bentuk robot, warna, kepala/wajah, dada, aksesoris, box/tulisan, pose, dan proporsi.
- Setiap candidate_index merujuk ke satu foto produk. Produk yang sama bisa muncul beberapa kali dengan angle/foto berbeda.
- Jika kandidat tampak produk yang sama, beri skor 85-100.
- Jika hanya mirip kategori/seri, beri skor 50-75.
- Jika tidak mirip, beri skor di bawah 40.
- Abaikan permintaan nonvisual seperti budget, harga, stok, promo, dan rekomendasi.
- Nilai identitas visual dahulu; constraint pelanggan diterapkan terpisah setelah rerank.

Analisis awal foto user:
${JSON.stringify(analysis, null, 2)}

Data kandidat:
${JSON.stringify(candidateFacts(candidates), null, 2)}

Kembalikan JSON valid saja:
{
  "summary": "ringkasan pendek hasil perbandingan visual",
  "matches": [
    {
      "candidate_index": 1,
      "visual_score": 0,
      "confidence": "high | medium | low",
      "reason": "alasan singkat visual"
    }
  ]
}
`;
}

export function applyVisualMatches(
  parsed,
  candidates,
  { provider, scoreCap = 100 } = {},
) {
  const matches = Array.isArray(parsed?.matches) ? parsed.matches : [];
  const byIndex = new Map();
  matches.forEach((match) => {
    const index = Number(match.candidate_index);
    if (Number.isFinite(index)) byIndex.set(index, match);
  });

  const bestByProduct = new Map();
  candidates.forEach((item, index) => {
    const match = byIndex.get(index + 1) || {};
    const visualScore = Math.max(
      0,
      Math.min(scoreCap, Number(match.visual_score || 0)),
    );
    const product = {
      ...item.product,
      visualScore,
      visualConfidence: match.confidence || "low",
      visualReason: match.reason || "",
      visualImageIndex: Number(item.image?.index || 0),
      visualImageUrl: item.image?.url || item.product.image,
      visualRerankProvider: provider || "unknown",
    };
    const key = String(product.id || product.name || index);
    const previous = bestByProduct.get(key);
    if (!previous || visualScore > Number(previous.visualScore || 0)) {
      bestByProduct.set(key, product);
    }
  });

  return {
    summary: parsed?.summary || "",
    provider: provider || "unknown",
    products: [...bestByProduct.values()].sort((a, b) => {
      if (Number(b.visualScore || 0) !== Number(a.visualScore || 0)) {
        return Number(b.visualScore || 0) - Number(a.visualScore || 0);
      }
      return Number(b.imageMatchScore || 0) - Number(a.imageMatchScore || 0);
    }),
  };
}

async function rerankVisualBatchWithGemini({
  userImage,
  question,
  analysis,
  candidates,
}) {
  if (!genai) throw new Error("Gemini vision tidak dikonfigurasi");
  const prompt = buildVisualRerankPrompt({ question, analysis, candidates });

  const parts = [
    { text: prompt },
    { text: "USER_IMAGE:" },
    createPartFromBase64(userImage.data, userImage.mimeType),
  ];

  candidates.forEach((item, index) => {
    parts.push({
      text: `CANDIDATE_IMAGE ${index + 1}: ${item.product.name} (ID ${item.product.id}) - foto ${Number(item.image?.index || 0) + 1} ${item.image?.fileName || ""}`,
    });
    parts.push(createPartFromBase64(item.imagePart.data, item.imagePart.mimeType));
  });

  const result = await geminiGenerateContentWithFallback({
    models: GEMINI_MODEL_FALLBACKS.VISION,
    taskName: "image_visual_rerank",
    contents: [{ role: "user", parts }],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 1200,
    },
  });

  const txt = geminiResponseText(result?.response);
  const parsed = parseJsonLoose(txt);
  return applyVisualMatches(parsed, candidates, { provider: "gemini" });
}

async function rerankVisualBatchWithMistral({
  userImage,
  question,
  analysis,
  candidates,
}) {
  // Keep one slot for USER_IMAGE and bound payload size across Mistral models.
  const directCandidates = candidates.slice(0, 7);
  const prompt = buildVisualRerankPrompt({
    question,
    analysis,
    candidates: directCandidates,
  });
  const result = await generateVisionJsonWithMistral({
    prompt,
    images: [
      { ...userImage, label: "USER_IMAGE" },
      ...directCandidates.map((item, index) => ({
        ...item.imagePart,
        label: `CANDIDATE_IMAGE ${index + 1}: ${item.product.name}`,
      })),
    ],
    maxTokens: 1200,
  });
  return applyVisualMatches(result.json, directCandidates, {
    provider: "mistral",
  });
}

async function rerankVisualBatchWithCloudflare({
  userImage,
  question,
  analysis,
  candidates,
}) {
  const prompt = `${buildVisualRerankPrompt({
    question,
    analysis,
    candidates,
  })}

Catatan: hanya USER_IMAGE yang dilampirkan langsung. Gunakan indexed_caption,
indexed_visible_text, indexed_features, dan indexed_colors sebagai representasi
terverifikasi dari foto kandidat. Karena kandidat tidak dilampirkan langsung,
jangan beri visual_score di atas 75.`;
  const result = await generateVisionJsonWithCloudflare({
    prompt,
    image: userImage,
    maxTokens: 1200,
  });
  return applyVisualMatches(result.json, candidates, {
    provider: "cloudflare_visual_index",
    scoreCap: 75,
  });
}

async function rerankVisualBatch({
  userImage,
  question,
  analysis,
  candidates,
  deadline = null,
}) {
  let lastError = null;

  if (genai && !isImageAnalyzeCoolingDown()) {
    try {
      return await rerankVisualBatchWithGemini({
        userImage,
        question,
        analysis,
        candidates,
      });
    } catch (error) {
      lastError = error;
      setImageAnalyzeCooldown(error);
      console.error("GEMINI VISUAL RERANK FALLBACK:", error?.message || error);
    }
  }

  if (!deadline?.expired(8000)) {
    try {
      return await rerankVisualBatchWithMistral({
        userImage,
        question,
        analysis,
        candidates,
      });
    } catch (error) {
      lastError = error;
      console.error("MISTRAL VISUAL RERANK FALLBACK:", error?.message || error);
    }
  }

  if (!deadline?.expired(8000)) {
    try {
      return await rerankVisualBatchWithCloudflare({
        userImage,
        question,
        analysis,
        candidates,
      });
    } catch (error) {
      lastError = error;
      console.error(
        "CLOUDFLARE VISUAL RERANK FALLBACK:",
        error?.message || error,
      );
    }
  }

  throw lastError || new Error("Visual rerank providers unavailable");
}

async function rerankProductsVisually({
  userImage,
  question,
  analysis,
  candidates,
  deadline = null,
}) {
  if (!candidates.length) return null;
  if (deadline?.expired(14000)) return null;

  const visualCandidates = await attachCandidateImages(candidates, {
    maxProducts: 12,
    maxImagesPerProduct: 2,
    maxTotalImages: 12,
    deadline,
  });
  if (!visualCandidates.length) return null;
  return rerankVisualBatch({
    userImage,
    question,
    analysis,
    candidates: visualCandidates,
    deadline,
  });
}

export function buildImageAnalysisPrompt({ imageName = "" } = {}) {
  return `
Kamu adalah asisten visual search untuk toko koleksi robot vintage bernama Robot Jadul.
Analisis foto user, lalu kembalikan JSON valid saja.

Fokus:
- foto bisa hanya menampilkan sebagian produk, crop kecil, pose berbeda, atau tanpa box
- nama robot/karakter/seri jika terlihat
- alias/nama alternatif/franchise yang mungkin, termasuk ejaan Jepang/Inggris jika relevan
- brand atau teks pada box/mainan jika terbaca
- warna, bentuk, aksesoris, tipe barang
- ciri visual pembeda: kepala/wajah, dada, senjata, sayap, bentuk kendaraan, logo, proporsi
- keyword pencarian produk dalam bahasa Indonesia dan Inggris

Jangan menebak produk utuh hanya dari warna umum. Untuk foto parsial, jelaskan bagian
yang benar-benar terlihat dan cari ciri identitas lokal seperti bentuk kepala, emblem,
pola dada, senjata, sambungan, atau potongan teks.
Jangan mengarang kepastian. Jika tidak yakin, isi banyak kemungkinan di possible_names
dan search_queries.
Permintaan nonvisual pelanggan seperti budget, harga, stok, promo, dan rekomendasi
diproses terpisah. Jangan biarkan permintaan tersebut mengubah fakta visual foto.

Nama file foto user (bukan bukti identitas produk):
${imageName || "(tidak ada nama file)"}

Format JSON:
{
  "short_description": "deskripsi singkat objek pada foto",
  "possible_names": ["nama/seri yang mungkin"],
  "brand_or_series": ["brand atau seri yang mungkin"],
  "visible_text": ["teks yang terbaca pada foto"],
  "colors": ["warna utama"],
  "distinctive_features": ["ciri visual pembeda"],
  "object_type": "robot figure / box / model kit / accessory / unknown",
  "keywords": ["keyword untuk cari produk toko"],
  "search_queries": ["query pendek untuk mencari produk serupa di katalog"],
  "user_intent": "find_similar_product | ask_strengths | ask_price | recommendation"
}
`;
}

async function analyzeImageWithGemini({ image, question, imageName = "" }) {
  if (!genai) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const prompt = buildImageAnalysisPrompt({ imageName });

  const result = await geminiGenerateContentWithFallback({
    models: GEMINI_MODEL_FALLBACKS.VISION,
    taskName: "image_analyze",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          createPartFromBase64(image.data, image.mimeType),
        ],
      },
    ],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 1200,
    },
  });

  const txt = geminiResponseText(result?.response);
  try {
    return {
      ...parseJsonLoose(txt),
      analysis_provider: "gemini",
      analysis_model: result?.model || "unknown",
    };
  } catch {
    return {
      short_description: txt.slice(0, 300) || "objek pada foto",
      possible_names: [],
      brand_or_series: [],
      visible_text: [],
      colors: [],
      distinctive_features: [],
      object_type: "unknown",
      keywords: `${question || ""} ${imageName || ""}`
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .slice(0, 12),
      search_queries: [],
      user_intent: "find_similar_product",
    };
  }
}

async function analyzeImageWithMistral({ image, question, imageName = "" }) {
  const result = await generateVisionJsonWithMistral({
    prompt: buildImageAnalysisPrompt({ imageName }),
    images: [{ ...image, label: "USER_IMAGE" }],
  });
  return {
    ...result.json,
    analysis_provider: "mistral",
    analysis_model: result.model || "unknown",
  };
}

async function analyzeImageWithCloudflare({ image, question, imageName = "" }) {
  const result = await generateVisionJsonWithCloudflare({
    prompt: buildImageAnalysisPrompt({ imageName }),
    image,
  });
  return {
    ...result.json,
    analysis_provider: "cloudflare_workers_ai",
    analysis_model: result.model || "unknown",
  };
}

async function analyzeImageWithProviderFallback({
  image,
  question,
  imageName = "",
  skipGemini = false,
}) {
  let geminiError = null;

  if (!skipGemini) {
    try {
      return await analyzeImageWithGemini({ image, question, imageName });
    } catch (error) {
      geminiError = error;
      setImageAnalyzeCooldown(error);
      console.error("GEMINI IMAGE ANALYZE FALLBACK:", error?.message || error);
    }
  }

  try {
    return await analyzeImageWithMistral({ image, question, imageName });
  } catch (error) {
    console.error("MISTRAL IMAGE ANALYZE FALLBACK:", error?.message || error);
  }

  try {
    return await analyzeImageWithCloudflare({ image, question, imageName });
  } catch (error) {
    console.error("CLOUDFLARE IMAGE ANALYZE FALLBACK:", error?.message || error);
    return fallbackImageAnalysis({
      question,
      reason:
        error?.message ||
        geminiError?.message ||
        "Vision providers unavailable",
    });
  }
}

function fallbackImageAnalysis({ question = "", reason = "" } = {}) {
  const keywords = extractImageQueryKeywords(question);

  return {
    short_description:
      "foto produk yang kamu kirim (analisis visual AI sedang terbatas)",
    possible_names: [],
    brand_or_series: [],
    visible_text: [],
    colors: [],
    distinctive_features: [],
    object_type: "unknown",
    keywords,
    search_queries: keywords,
    user_intent: "find_similar_product",
    analysis_fallback: true,
    analysis_fallback_reason: reason,
    analysis_provider: "local_visual_index",
    analysis_model: "none",
  };
}

function productsFromVisualIndex() {
  const index = loadProductVisualIndex();
  if (!index?.products?.length) return [];

  return index.products.map((p) => ({
    id: p.id,
    name: p.name,
    link: p.link || "",
    image: p.image || p.images?.[0]?.url || "",
    images: Array.isArray(p.images) ? p.images : [],
    imageText: [
      p.visualText,
      Array.isArray(p.visualTerms) ? p.visualTerms.join(" ") : "",
      ...(Array.isArray(p.images)
        ? p.images.flatMap((img) => [
            img.name,
            img.alt,
            img.fileName,
            img.caption,
            Array.isArray(img.visibleText) ? img.visibleText.join(" ") : "",
            Array.isArray(img.features) ? img.features.join(" ") : "",
            Array.isArray(img.keywords) ? img.keywords.join(" ") : "",
          ])
        : []),
    ]
      .filter(Boolean)
      .join(" "),
    category: p.category || "",
    condition: p.condition || "",
    numericPrice: p.numericPrice || 0,
    effectivePrice: p.numericPrice || 0,
    price: p.numericPrice || 0,
    stock: p.stock || "",
    stockQuantity:
      typeof p.stockQuantity === "number" ? p.stockQuantity : null,
    weight: p.weight || "",
    dimensions: p.dimensions || {},
    discountPercent: 0,
    isPromo: false,
    visualIndexOnly: true,
  }));
}

function formatRupiah(value) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function buildConstraintSummary(constraints = {}, result = {}) {
  const parts = [];

  if (constraints.budgetMin != null && constraints.budgetMax != null) {
    parts.push(
      `harga ${formatRupiah(constraints.budgetMin)} sampai ${formatRupiah(constraints.budgetMax)}`,
    );
  } else if (constraints.budgetMin != null) {
    parts.push(`harga minimal ${formatRupiah(constraints.budgetMin)}`);
  } else if (constraints.budgetMax != null) {
    parts.push(`harga maksimal ${formatRupiah(constraints.budgetMax)}`);
  }

  if (constraints.readyStockOnly) parts.push("stok ready");
  if (result.applied?.similarSize) {
    parts.push(`ukuran katalog yang mendekati kandidat utama`);
  }

  return parts.join(", ");
}

function buildBudgetMismatchNotice(product = {}, mismatch = {}) {
  const direction = mismatch.direction === "below" ? "di bawah" : "di atas";
  return (
    `Foto ini paling mirip dengan **${product.name || "produk katalog"}** ` +
    `seharga **${formatRupiah(mismatch.price)}**. Harganya ${direction} ` +
    `batas budget **${formatRupiah(mismatch.limit)}**, jadi produk tersebut ` +
    "tidak dimasukkan ke daftar alternatif yang sesuai budget."
  );
}

function buildReasoning({
  analysis,
  products,
  question,
  visualResult = null,
  constraints = {},
  constraintResult = {},
}) {
  const lines = [];
  const desc = analysis.short_description || "objek pada foto";
  const terms = uniqueTerms([
    analysis.possible_names || [],
    analysis.brand_or_series || [],
    analysis.visible_text || [],
    analysis.distinctive_features || [],
    analysis.keywords || [],
    analysis.search_queries || [],
  ]);

  if (analysis.analysis_fallback) {
    lines.push(
      "Analisis visual AI sedang terbatas, jadi aku memakai visual index katalog dan teks pendamping sebagai cadangan.",
    );
  } else {
    lines.push(`Aku membaca foto sebagai **${desc}**.`);
  }
  if (terms.length) {
    lines.push(`Keyword visual yang kupakai: **${terms.slice(0, 10).join(", ")}**.`);
  }
  if (question) {
    lines.push(`Aku juga mempertimbangkan perintah kamu: "${question}".`);
  }

  const constraintSummary = buildConstraintSummary(constraints, constraintResult);
  if (constraintSummary) {
    lines.push(`Hasil sudah disaring berdasarkan **${constraintSummary}**.`);
  }
  if (constraintResult.similarSizeUnavailable) {
    lines.push(
      "Permintaan ukuran serupa belum dijadikan filter karena ukuran fisik tidak bisa dipastikan dari foto dan dimensi kandidat utama belum tercatat di katalog.",
    );
  }

  if (products.length) {
    if (
      visualResult?.summary &&
      String(visualResult.products?.[0]?.id || "") === String(products[0]?.id || "")
    ) {
      lines.push(`Hasil perbandingan visual: ${visualResult.summary}`);
    }

    const top = products[0];
    if (top?.visualScore) {
      lines.push(
        `Kandidat teratas: **${top.name}** dengan skor visual **${Math.round(
          Number(top.visualScore || 0),
        )}/100** (${top.visualConfidence || "low"}). ${
          top.visualReason || ""
        }`.trim(),
      );
    } else {
      lines.push(
        "Produk di bawah dipilih karena nama/kategori/deskripsinya paling dekat dengan ciri visual tersebut, lalu diprioritaskan yang ready stock.",
      );
    }
  }

  return lines.join("\n\n");
}

export default async function handler(req, res) {
  const requestStartedAt = Date.now();
  const sessionId = req.headers["x-session-id"] || "anon";
  let responseEditorMeta = {
    provider: "template",
    model: "unknown",
    reason: "not_run",
  };

  async function sendObserved(statusCode, payload, errorCode = "none") {
    const hasAnalysis = Boolean(payload?.image_analysis);
    const analysisFallback = payload?.image_analysis?.analysis_fallback;
    const visuallyReranked = payload?.match_confidence?.visually_reranked;

    await logImageMetric({
      sessionId,
      status: statusCode >= 400 ? "error" : "success",
      intent: "image_product_search",
      intentMethod:
        statusCode >= 400
          ? statusCode < 500
            ? "request_validation"
            : "image_pipeline_error"
          : analysisFallback
            ? "visual_index_fallback"
            : visuallyReranked
              ? "gemini_visual_rerank"
              : "image_candidate_pipeline",
      responseType: payload?.type,
      assistantProvider: responseEditorMeta.provider,
      assistantModel: responseEditorMeta.model,
      assistantReason: responseEditorMeta.reason,
      routerProvider: !hasAnalysis
        ? "none"
        : analysisFallback
          ? "local_visual_index"
          : payload?.image_analysis?.analysis_provider || "gemini",
      latencyMs: Date.now() - requestStartedAt,
      productCount: payload?.products?.length,
      actionCount: payload?.actions?.length,
      errorCode,
    });

    return sendJson(res, statusCode, payload);
  }

  async function naturalizeImagePayload(payload, question) {
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const safeRecentActions = history
      .filter((item) => item?.type === "suggestions")
      .slice(-8)
      .flatMap((item) =>
        Array.isArray(item.suggestions) ? item.suggestions : [],
      )
      .map((action) =>
        action && typeof action === "object" ? action.value : action,
      )
      .filter(Boolean);
    const suppressSuggestedActions = isRequiredClarificationPayload(payload);
    const actionCandidates = suppressSuggestedActions
      ? []
      : buildControlledActions("image_product_search", payload, {
          recentActions: safeRecentActions,
          limit: 8,
          userQuestion: question,
        });
    const controlledPayload = applyControlledFollowUpPolicy(payload, {
      intent: "image_product_search",
      recentActions: safeRecentActions,
      userQuestion: question,
    });

    const finalPayload = await naturalizeResponseWithGroq(controlledPayload, {
      userQuestion: question,
      intent: "image_product_search",
      conversationContext: { recentActions: safeRecentActions },
      actionCandidates,
      onStatus(status) {
        responseEditorMeta = status;
      },
    });
    if (suppressSuggestedActions) {
      delete finalPayload.actions;
      delete finalPayload.suggestions;
    }
    return finalPayload;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-Id",
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return sendJson(res, 405, { type: "text", message: "Method not allowed" });
  }

  try {
    const deadline = createDeadline();
    const question = String(req.body?.question || "").trim();
    const constraints = extractImageSearchConstraints(question);
    const imageName = String(req.body?.imageName || req.body?.fileName || "")
      .trim()
      .slice(0, 180);
    const image = parseImageDataUrl(req.body?.image || "");

    if (!image) {
      return sendObserved(400, {
        type: "text",
        intent: "image_product_search",
        message: "Gambar belum terbaca. Coba upload foto JPG, PNG, atau WEBP ya.",
      }, "invalid_image");
    }

    const [analysisResult, productsResult] = await Promise.allSettled([
      analyzeImageWithProviderFallback({
        image,
        question,
        imageName,
        skipGemini: isImageAnalyzeCoolingDown(),
      }),
      fetchProductsCached({ deadline }),
    ]);

    let analysis =
      analysisResult.status === "fulfilled"
        ? analysisResult.value
        : fallbackImageAnalysis({
            question,
            reason:
              analysisResult.reason?.message || "Image analysis providers failed",
          });

    if (analysisResult.status === "rejected") {
      console.error(
        "IMAGE ANALYZE FALLBACK:",
        analysisResult.reason?.message || analysisResult.reason,
      );
    }

    let products =
      productsResult.status === "fulfilled" ? productsResult.value : [];

    if (productsResult.status === "rejected") {
      console.error(
        "PRODUCT FETCH FALLBACK:",
        productsResult.reason?.message || productsResult.reason,
      );
    }

    if (!products.length) {
      products = productsFromVisualIndex();
    }

    if (imageName) analysis.user_image_name = imageName;

    const questionKeywords = extractImageQueryKeywords(question);

    if (analysis.analysis_fallback && !questionKeywords.length) {
      const unavailablePayload = {
        type: "text",
        intent: "image_product_search",
        message:
          "Maaf, pembacaan visual AI sedang tidak tersedia, jadi aku belum bisa memastikan produk dari foto ini. Aku tidak akan menampilkan produk katalog secara acak. Coba kirim ulang nanti atau sertakan nama, seri, logo, atau tulisan yang terlihat pada produknya.",
        image_analysis: analysis,
        match_confidence: {
          level: "none",
          top_score: null,
          score_gap: null,
          visually_reranked: false,
        },
      };
      return sendObserved(200, unavailablePayload);
    }

    const terms = uniqueTerms([
      analysis.possible_names || [],
      analysis.brand_or_series || [],
      analysis.visible_text || [],
      analysis.distinctive_features || [],
      analysis.keywords || [],
      analysis.search_queries || [],
      analysis.object_type || "",
      questionKeywords,
    ]);

    let ranked = products
      .map((p) => scoreProduct(p, terms, analysis))
      .filter((p) => p.imageMatchScore > 0)
      .sort((a, b) => b.imageMatchScore - a.imageMatchScore);

    const visualIndexCandidates = scoreProductVisualIndex({
      analysis,
      question: questionKeywords.join(" "),
      imageName: "",
      limit: 24,
    });

    if (!ranked.length) {
      ranked = products
        .filter((p) => p.stock === "instock")
        .sort((a, b) => Number(b.numericPrice || 0) - Number(a.numericPrice || 0))
        .slice(0, 20);
    }

    const canUseVisualRerank =
      !analysis.analysis_fallback &&
      !deadline.expired(MIN_VISUAL_RERANK_STEP_MS);

    const liveProductById = new Map(
      products.map((p) => [String(p.id || ""), p]),
    );

    const scoredVisualIndexCandidates = visualIndexCandidates.map((p) => ({
        ...scoreProduct(
          {
            ...(liveProductById.get(String(p.id || "")) || p),
            visualIndexScore: p.visualIndexScore,
            visualIndexCandidate: true,
            imageMatchTerms: p.imageMatchTerms || [],
            visualIndexImages: p.images || [],
          },
          terms,
          analysis,
        ),
        visualIndexScore: p.visualIndexScore,
        visualIndexCandidate: true,
      }));
    const lexicalCandidates = ranked.slice(0, 24);

    const candidatePool = mergeUniqueProducts([
      scoredVisualIndexCandidates,
      lexicalCandidates,
    ]);
    const visualCandidatePool = interleaveUniqueProducts(
      [scoredVisualIndexCandidates, lexicalCandidates],
      12,
    );

    const visualResult = canUseVisualRerank
      ? await rerankProductsVisually({
          userImage: image,
          question,
          analysis,
          candidates: visualCandidatePool,
          deadline,
        }).catch((e) => {
          setImageAnalyzeCooldown(e);
          console.error("VISUAL RERANK ERROR:", e?.message || e);
          return null;
        })
      : null;

    const visualProducts = visualResult?.products || [];
    const hasVisualRerank = visualProducts.length > 0;
    const plausibleProducts = plausibleVisualProducts(visualProducts, {
      limit: 18,
    });
    const unconstrainedProducts =
      hasVisualRerank
        ? plausibleProducts
        : candidatePool.length
          ? candidatePool
          : ranked;
    const constraintResult = applyImageSearchConstraints(
      unconstrainedProducts,
      constraints,
      { referenceProduct: visualProducts[0] || unconstrainedProducts[0] },
    );
    const finalProducts = constraintResult.products.slice(0, 5);
    const closestProduct = unconstrainedProducts[0] || null;
    const budgetMismatch = getImageBudgetMismatch(closestProduct, constraints);
    const closestProductExcludedByBudget =
      Boolean(budgetMismatch) &&
      !finalProducts.some(
        (product) => String(product.id || "") === String(closestProduct?.id || ""),
      );
    const budgetMismatchNotice = closestProductExcludedByBudget
      ? buildBudgetMismatchNotice(closestProduct, budgetMismatch)
      : "";
    const matchedTopVisualScore = Number(visualProducts[0]?.visualScore || 0);
    const matchedSecondVisualScore = Number(visualProducts[1]?.visualScore || 0);
    const matchedVisualScoreGap = Math.max(
      0,
      matchedTopVisualScore - matchedSecondVisualScore,
    );

    const hasRequestedConstraints =
      constraintResult.applied.budget ||
      constraintResult.applied.readyStock ||
      constraints.similarSizeRequested;

    if (hasRequestedConstraints && !finalProducts.length && unconstrainedProducts.length) {
      const summary = buildConstraintSummary(constraints, constraintResult);
      const noConstraintMatchPayload = {
        type: "text",
        intent: "image_product_search",
        message: budgetMismatchNotice
          ? `${budgetMismatchNotice}\n\nAku belum menemukan alternatif yang cukup mirip dan sekaligus memenuhi ${summary || "semua kriteria yang kamu minta"}.`
          : `Aku menemukan kandidat yang mirip dengan foto, tetapi belum ada yang sekaligus memenuhi ${summary || "semua kriteria yang kamu minta"}. Aku tidak akan menampilkan produk yang berada di luar kriteria tersebut.`,
        image_analysis: analysis,
        search_constraints: constraints,
      };
      const finalNoConstraintMatchPayload = await naturalizeImagePayload(
        noConstraintMatchPayload,
        question,
      );
      return sendObserved(200, finalNoConstraintMatchPayload);
    }

    if (hasVisualRerank && !finalProducts.length) {
      const noMatchPayload = {
        type: "text",
        intent: "image_product_search",
        message:
          "Aku belum menemukan produk katalog yang cukup mirip dengan robot pada foto itu. Daripada menampilkan produk yang berbeda jauh, coba kirim foto lain yang memperlihatkan wajah, dada, senjata, logo, atau tulisan serinya dengan lebih jelas.",
        image_analysis: analysis,
        match_confidence: {
          level: "none",
          top_score: matchedTopVisualScore || null,
          score_gap: matchedVisualScoreGap,
          visually_reranked: true,
        },
      };
      const finalNoMatchPayload = await naturalizeImagePayload(
        noMatchPayload,
        question,
      );
      return sendObserved(200, finalNoMatchPayload);
    }

    const topVisualScore = Number(finalProducts[0]?.visualScore || 0);
    const secondVisualScore = Number(finalProducts[1]?.visualScore || 0);
    const visualScoreGap = Math.max(0, topVisualScore - secondVisualScore);
    const isHighConfidence =
      hasVisualRerank &&
      topVisualScore >= 78 &&
      (topVisualScore >= 90 || visualScoreGap >= 10);
    const isLowConfidence = !isHighConfidence;

    const responsePayload = {
      type: "products",
      intent: "image_product_search",
      intro: budgetMismatchNotice
        ? `${budgetMismatchNotice}\n\nBerikut alternatif paling mirip yang masih sesuai budget kamu:`
        : analysis.analysis_fallback
          ? "Pembacaan visual AI sedang tidak tersedia, jadi aku memakai visual index katalog Robot Jadul sebagai cadangan. Ini kandidat paling dekat yang bisa aku temukan:"
        : isLowConfidence
          ? "Aku sudah membandingkan foto itu dengan katalog, tetapi bukti visualnya belum cukup untuk memastikan satu produk. Berikut kandidat terdekat, bukan hasil pasti:"
          : "Aku sudah membandingkan foto itu dengan foto produk katalog. Kandidat pertama memiliki kecocokan visual yang kuat:",
      products: finalProducts,
      reasoning_text: buildReasoning({
        analysis,
        products: finalProducts,
        question,
        visualResult,
        constraints,
        constraintResult,
      }),
      image_analysis: analysis,
      search_constraints: constraints,
      match_confidence: {
        level: isHighConfidence ? "high" : "low",
        top_score: topVisualScore || null,
        score_gap: hasVisualRerank ? visualScoreGap : null,
        visually_reranked: hasVisualRerank,
        rerank_provider: visualResult?.provider || null,
      },
      closing:
        analysis.analysis_fallback
          ? "Hasil ini belum memakai pembacaan visual langsung. Coba lagi nanti atau kirim foto yang menampilkan logo, wajah, dada, atau tulisan seri dengan lebih jelas."
          : isLowConfidence
          ? "Agar lebih akurat, kirim satu foto tambahan dari sudut lain atau foto yang memperlihatkan logo, wajah, dada, aksesori, atau tulisan seri."
          : "Kalau mau, aku bisa bantu jelaskan kenapa produk pertama paling mirip atau carikan alternatif yang ready stock.",
    };

    const finalPayload = serializeSuggestedActions(
      await naturalizeImagePayload(responsePayload, question),
    );

    return sendObserved(200, finalPayload);
  } catch (err) {
    console.error("ASK IMAGE ERROR:", err?.message || err);

    if (err?.code === "IMAGE_TOO_LARGE") {
      return sendObserved(413, {
        type: "text",
        intent: "image_product_search",
        message: "Ukuran foto terlalu besar. Coba upload foto maksimal 5 MB ya.",
      }, "image_too_large");
    }

    return sendObserved(500, {
      type: "text",
      intent: "image_product_search",
      message:
        "Maaf, fitur scan foto sedang mengalami kendala. Coba lagi sebentar ya.",
    }, err?.code || err?.name || "image_search_error");
  }
}
