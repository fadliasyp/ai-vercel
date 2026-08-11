import { createPartFromBase64 } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  GEMINI_MODEL_FALLBACKS,
  genai,
  geminiGenerateContentWithFallback,
  geminiResponseText,
} from "../lib/chatbot/gemini.js";
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

export const config = {
  runtime: "nodejs",
  maxDuration: 90,
};

let imageAnalyzeCooldownUntil = 0;

const IMAGE_SEARCH_BUDGET_MS = Number(
  process.env.IMAGE_SEARCH_BUDGET_MS || 55000,
);
const MIN_GEMINI_STEP_MS = 9000;
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
  const msg = String(err?.message || err || "").toLowerCase();
  return (
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
    };
  });
}

function compactProductFacts(products = []) {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category || "",
    condition: p.condition || "",
    image_count: Array.isArray(p.images) ? p.images.length : 0,
    image_text: String(p.imageText || "").slice(0, 320),
    description: stripHtml(p.description || "").slice(0, 260),
  }));
}

async function selectCandidatesWithGemini({
  analysis,
  question,
  products,
  limit = 30,
  deadline = null,
  maxChunks = 2,
}) {
  if (!genai || !products.length) return [];

  const facts = compactProductFacts(products);
  const chunks = [];
  for (let i = 0; i < facts.length; i += 160) {
    chunks.push(facts.slice(i, i + 160));
  }

  const selectedIds = [];

  for (const chunk of chunks.slice(0, maxChunks)) {
    if (deadline?.expired(MIN_GEMINI_STEP_MS)) break;

    const prompt = `
Kamu membantu mencari produk Robot Jadul dari foto internet/user.
Pilih kandidat produk yang PALING mungkin sama atau mirip dengan objek pada foto.

Penting:
- Jangan hanya mengandalkan warna. Nama karakter/seri/brand lebih penting.
- Produk dari internet bisa beda angle, beda pose, beda background, atau tanpa box.
- Gunakan sinonim/alias robot vintage jika tahu, tapi jangan mengarang hasil final.
- Output JSON valid saja.

Perintah user:
${question || "(tidak ada teks)"}

Analisis foto user:
${JSON.stringify(analysis, null, 2)}

Daftar produk kandidat dari toko:
${JSON.stringify(chunk, null, 2)}

Format JSON:
{
  "candidate_ids": [123, 456],
  "reason": "alasan singkat kenapa kandidat dipilih"
}
`;

    const result = await geminiGenerateContentWithFallback({
      models: GEMINI_MODEL_FALLBACKS.TEXT,
      taskName: "image_candidate_select",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const txt = geminiResponseText(result?.response);

    try {
      const parsed = parseJsonLoose(txt);
      const ids = Array.isArray(parsed.candidate_ids)
        ? parsed.candidate_ids
        : [];
      ids.forEach((id) => {
        const s = String(id || "").trim();
        if (s && !selectedIds.includes(s)) selectedIds.push(s);
      });
    } catch (e) {
      console.error("GEMINI CANDIDATE SELECT PARSE ERROR:", e?.message || e);
    }

    if (selectedIds.length >= limit) break;
  }

  const byId = new Map(products.map((p) => [String(p.id || ""), p]));
  const selected = selectedIds.map((id) => byId.get(String(id))).filter(Boolean);

  return selected.slice(0, limit);
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

async function rerankVisualBatch({
  userImage,
  question,
  analysis,
  candidates,
}) {
  if (!genai || !candidates.length) return { summary: "", products: [] };

  const prompt = `
Kamu adalah visual matcher untuk katalog Robot Jadul.
Bandingkan USER_IMAGE dengan setiap CANDIDATE_IMAGE.

Tugas:
- Nilai kemiripan visual, bukan popularitas produk.
- Prioritaskan bentuk robot, warna, kepala/wajah, dada, aksesoris, box/tulisan, pose, dan proporsi.
- Setiap candidate_index merujuk ke satu foto produk. Produk yang sama bisa muncul beberapa kali dengan angle/foto berbeda.
- Jika kandidat tampak produk yang sama, beri skor 85-100.
- Jika hanya mirip kategori/seri, beri skor 50-75.
- Jika tidak mirip, beri skor di bawah 40.
- Jangan memilih produk hanya karena ready stock atau harga.

Perintah user:
${question || "(tidak ada teks)"}

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
  });

  const txt = geminiResponseText(result?.response);
  const parsed = parseJsonLoose(txt);
  const matches = Array.isArray(parsed.matches) ? parsed.matches : [];

  const byIndex = new Map();
  matches.forEach((m) => {
    const idx = Number(m.candidate_index);
    if (Number.isFinite(idx)) byIndex.set(idx, m);
  });

  const reranked = candidates
    .map((item, index) => {
      const m = byIndex.get(index + 1) || {};
      return {
        ...item.product,
        visualScore: Number(m.visual_score || 0),
        visualConfidence: m.confidence || "low",
        visualReason: m.reason || "",
        visualImageIndex: Number(item.image?.index || 0),
        visualImageUrl: item.image?.url || item.product.image,
      };
    })
    .sort((a, b) => {
      if (Number(b.visualScore || 0) !== Number(a.visualScore || 0)) {
        return Number(b.visualScore || 0) - Number(a.visualScore || 0);
      }
      return Number(b.imageMatchScore || 0) - Number(a.imageMatchScore || 0);
    });

  return {
    summary: parsed.summary || "",
    products: reranked,
  };
}

function mergeVisualProducts(products = []) {
  const byId = new Map();

  for (const product of products) {
    const key = String(product?.id || "");
    if (!key) continue;

    const prev = byId.get(key);
    if (
      !prev ||
      Number(product.visualScore || 0) > Number(prev.visualScore || 0)
    ) {
      byId.set(key, {
        ...product,
        image: product.visualImageUrl || product.image,
      });
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (Number(b.visualScore || 0) !== Number(a.visualScore || 0)) {
      return Number(b.visualScore || 0) - Number(a.visualScore || 0);
    }
    return Number(b.imageMatchScore || 0) - Number(a.imageMatchScore || 0);
  });
}

async function rerankProductsVisually({
  userImage,
  question,
  analysis,
  candidates,
  deadline = null,
}) {
  if (!genai || !candidates.length) return null;
  if (deadline?.expired(14000)) return null;

  const visualCandidates = await attachCandidateImages(candidates, {
    maxProducts: 12,
    maxImagesPerProduct: 2,
    maxTotalImages: 18,
    deadline,
  });
  if (!visualCandidates.length) return null;

  const batches = [];
  for (let i = 0; i < visualCandidates.length; i += 6) {
    batches.push(visualCandidates.slice(i, i + 6));
  }

  const results = [];
  for (const batch of batches) {
    if (deadline?.expired(MIN_GEMINI_STEP_MS)) break;

    const result = await rerankVisualBatch({
      userImage,
      question,
      analysis,
      candidates: batch,
    }).catch((e) => {
      console.error("VISUAL BATCH ERROR:", e?.message || e);
      return null;
    });

    if (result?.products?.length) {
      results.push(result);
    }
  }

  const products = mergeVisualProducts(results.flatMap((r) => r.products || []));

  return {
    summary: results.map((r) => r.summary).filter(Boolean).join(" "),
    products,
  };
}

async function analyzeImageWithGemini({ image, question, imageName = "" }) {
  if (!genai) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const prompt = `
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
- kebutuhan user dari teks pendamping

Jangan menebak produk utuh hanya dari warna umum. Untuk foto parsial, jelaskan bagian
yang benar-benar terlihat dan cari ciri identitas lokal seperti bentuk kepala, emblem,
pola dada, senjata, sambungan, atau potongan teks.
Jangan mengarang kepastian. Jika tidak yakin, isi banyak kemungkinan di possible_names
dan search_queries.

Teks/perintah user:
${question || "(tidak ada teks)"}

Nama file foto user:
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
  });

  const txt = geminiResponseText(result?.response);
  try {
    return parseJsonLoose(txt);
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

function fallbackImageAnalysis({ question = "", imageName = "", reason = "" } = {}) {
  const keywords = `${question || ""} ${imageName || ""}`
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3)
    .slice(0, 20);

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
          : "gemini",
      latencyMs: Date.now() - requestStartedAt,
      productCount: payload?.products?.length,
      actionCount: payload?.actions?.length,
      errorCode,
    });

    return sendJson(res, statusCode, payload);
  }

  function naturalizeImagePayload(payload, question) {
    return naturalizeResponseWithGroq(payload, {
      userQuestion: question,
      intent: "image_product_search",
      onStatus(status) {
        responseEditorMeta = status;
      },
    });
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

    const skipImageAnalyze = isImageAnalyzeCoolingDown();
    const [analysisResult, productsResult] = await Promise.allSettled([
      skipImageAnalyze
        ? Promise.resolve(
            fallbackImageAnalysis({
              question,
              imageName,
              reason: "Gemini image analysis is cooling down after quota error",
            }),
          )
        : analyzeImageWithGemini({ image, question, imageName }),
      fetchProductsCached({ deadline }),
    ]);

    let analysis =
      analysisResult.status === "fulfilled"
        ? analysisResult.value
        : fallbackImageAnalysis({
            question,
            imageName,
            reason: analysisResult.reason?.message || "Gemini image analysis failed",
          });

    if (analysisResult.status === "rejected") {
      setImageAnalyzeCooldown(analysisResult.reason);
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

    const terms = uniqueTerms([
      analysis.possible_names || [],
      analysis.brand_or_series || [],
      analysis.visible_text || [],
      analysis.distinctive_features || [],
      analysis.keywords || [],
      analysis.search_queries || [],
      analysis.object_type || "",
      question || "",
      imageName || "",
    ]);

    let ranked = products
      .map((p) => scoreProduct(p, terms, analysis))
      .filter((p) => p.imageMatchScore > 0)
      .sort((a, b) => b.imageMatchScore - a.imageMatchScore);

    const visualIndexCandidates = scoreProductVisualIndex({
      analysis,
      question,
      imageName,
      limit: 24,
    });

    if (!ranked.length) {
      ranked = products
        .filter((p) => p.stock === "instock")
        .sort((a, b) => Number(b.numericPrice || 0) - Number(a.numericPrice || 0))
        .slice(0, 20);
    }

    const canUseGeminiFollowup =
      !analysis.analysis_fallback && !deadline.expired(MIN_GEMINI_STEP_MS);

    const semanticInput = mergeUniqueProducts([ranked.slice(0, 100), products]);
    const semanticCandidates = canUseGeminiFollowup
      ? await selectCandidatesWithGemini({
          analysis,
          question,
          products: semanticInput,
          limit: 24,
          deadline,
          maxChunks: ranked.length ? 2 : 1,
        }).catch((e) => {
          console.error("GEMINI CANDIDATE SELECT ERROR:", e?.message || e);
          return [];
        })
      : [];

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
          },
          terms,
          analysis,
        ),
        visualIndexScore: p.visualIndexScore,
        visualIndexCandidate: true,
      }));
    const scoredSemanticCandidates = semanticCandidates.map((p) => ({
        ...scoreProduct(p, terms, analysis),
        semanticCandidate: true,
      }));
    const lexicalCandidates = ranked.slice(0, 24);

    const candidatePool = mergeUniqueProducts([
      scoredVisualIndexCandidates,
      scoredSemanticCandidates,
      lexicalCandidates,
    ]);
    const visualCandidatePool = interleaveUniqueProducts(
      [
        scoredVisualIndexCandidates,
        scoredSemanticCandidates,
        lexicalCandidates,
      ],
      18,
    );

    const visualResult = canUseGeminiFollowup
      ? await rerankProductsVisually({
          userImage: image,
          question,
          analysis,
          candidates: visualCandidatePool,
          deadline,
        }).catch((e) => {
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
          ? "Gemini sedang kena limit, jadi aku pakai visual index katalog Robot Jadul sebagai cadangan. Ini kandidat paling dekat yang bisa aku temukan:"
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
      },
      closing:
        analysis.analysis_fallback
          ? "Karena kuota Gemini sedang habis, hasil ini belum memakai pembacaan visual langsung. Coba lagi nanti saat quota sudah reset untuk hasil yang lebih presisi."
          : isLowConfidence
          ? "Agar lebih akurat, kirim satu foto tambahan dari sudut lain atau foto yang memperlihatkan logo, wajah, dada, aksesori, atau tulisan seri."
          : "Kalau mau, aku bisa bantu jelaskan kenapa produk pertama paling mirip atau carikan alternatif yang ready stock.",
    };

    const finalPayload = await naturalizeImagePayload(responsePayload, question);

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
