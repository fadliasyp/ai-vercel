import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createPartFromBase64 } from "@google/genai";
import {
  GEMINI_MODEL_FALLBACKS,
  genai,
  geminiGenerateContentWithFallback,
  geminiResponseText,
} from "../lib/chatbot/gemini.js";
import { getWooProductsCached } from "../lib/chatbot/wooCatalog.js";

const OUT_PATH = path.join(process.cwd(), "data", "product-visual-index.json");
const MAX_PRODUCTS = Number(process.env.VISUAL_INDEX_LIMIT || 0);
const OFFSET_PRODUCTS = Number(process.env.VISUAL_INDEX_OFFSET || 0);
const MAX_IMAGES_PER_PRODUCT = Number(
  process.env.VISUAL_INDEX_IMAGES_PER_PRODUCT || 2,
);
const SCAN_WITH_GEMINI = process.env.VISUAL_INDEX_SCAN_GEMINI !== "false";
const RESUME_INDEX = process.env.VISUAL_INDEX_RESUME !== "false";
const GEMINI_TIMEOUT_MS = Number(
  process.env.VISUAL_INDEX_GEMINI_TIMEOUT_MS || 30000,
);

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
  const seen = new Set();

  return rawImages
    .map((img, index) => ({
      url: img?.src || img?.url || "",
      name: img?.name || "",
      alt: img?.alt || "",
      position: Number.isFinite(Number(img?.position))
        ? Number(img.position)
        : index,
    }))
    .filter((img) => {
      if (!img.url || seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    })
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    .map((img, index) => ({
      ...img,
      index,
      fileName: getUrlFileName(img.url),
    }));
}

function inferImageMimeType(url = "", contentType = "") {
  const ct = String(contentType || "").split(";")[0].toLowerCase();
  if (ct.startsWith("image/")) return ct;

  const cleanUrl = String(url || "").split("?")[0].toLowerCase();
  if (cleanUrl.endsWith(".png")) return "image/png";
  if (cleanUrl.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function fetchImageAsBase64(url = "", timeoutMs = 12000) {
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (VisualIndexBot; +https://vercel.com)",
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
    clearTimeout(timer);
  }
}

function parseJsonLoose(text = "") {
  const raw = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const m = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : raw);
}

function withTimeout(promise, ms, label = "timeout") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function loadExistingIndex() {
  if (!RESUME_INDEX) return null;

  try {
    const raw = await fs.readFile(OUT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.products)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveIndex(products) {
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(
    OUT_PATH,
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        scanWithGemini: !!genai && SCAN_WITH_GEMINI,
        maxImagesPerProduct: MAX_IMAGES_PER_PRODUCT,
        products,
      },
      null,
      2,
    ),
  );
}

async function fetchProducts() {
  const all = await getWooProductsCached({ timeoutMs: 20000 });

  const sliced = OFFSET_PRODUCTS > 0 ? all.slice(OFFSET_PRODUCTS) : all;
  return MAX_PRODUCTS > 0 ? sliced.slice(0, MAX_PRODUCTS) : sliced;
}

async function scanImageWithGemini({ product, image }) {
  if (!genai || !SCAN_WITH_GEMINI) return null;

  const imagePart = await fetchImageAsBase64(image.url);
  if (!imagePart) return null;

  const prompt = `
Kamu membuat visual index untuk katalog toko Robot Jadul.
Analisis gambar produk ini, lalu kembalikan JSON valid saja.

Data produk:
${JSON.stringify(
  {
    id: product.id,
    name: product.name,
    category: product.category,
    condition: product.condition,
    image_file: image.fileName,
    image_alt: image.alt,
    image_name: image.name,
  },
  null,
  2,
)}

Format JSON:
{
  "caption": "deskripsi visual singkat gambar",
  "possible_names": ["nama karakter/seri/brand yang mungkin"],
  "brand_or_series": ["brand atau seri"],
  "visible_text": ["teks yang terlihat di box/foto"],
  "colors": ["warna utama"],
  "features": ["ciri pembeda bentuk/kepala/dada/aksesoris/box"],
  "keywords": ["keyword pencarian visual"]
}
`;

  const result = await withTimeout(
    geminiGenerateContentWithFallback({
      models: GEMINI_MODEL_FALLBACKS.VISION,
      taskName: "build_visual_index",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            createPartFromBase64(imagePart.data, imagePart.mimeType),
          ],
        },
      ],
    }),
    GEMINI_TIMEOUT_MS,
    "Gemini visual index timeout",
  );

  const txt = geminiResponseText(result?.response);
  try {
    return parseJsonLoose(txt);
  } catch {
    return {
      caption: txt.slice(0, 300),
      possible_names: [],
      brand_or_series: [],
      visible_text: [],
      colors: [],
      features: [],
      keywords: [],
    };
  }
}

function mapProduct(product, images) {
  const price = toNum(product.price);
  const regular = toNum(product.regular_price);
  const sale = toNum(product.sale_price);
  const effectivePrice = sale ?? price ?? regular ?? null;
  const enrichedImages = images.map((img) => ({
    url: img.url,
    name: img.name,
    alt: img.alt,
    fileName: img.fileName,
    caption: img.scan?.caption || "",
    possibleNames: img.scan?.possible_names || [],
    brandOrSeries: img.scan?.brand_or_series || [],
    visibleText: img.scan?.visible_text || [],
    colors: img.scan?.colors || [],
    features: img.scan?.features || [],
    keywords: img.scan?.keywords || [],
  }));

  const visualTerms = enrichedImages.flatMap((img) => [
    img.fileName,
    img.name,
    img.alt,
    img.caption,
    img.possibleNames,
    img.brandOrSeries,
    img.visibleText,
    img.colors,
    img.features,
    img.keywords,
  ]);

  return {
    id: product.id,
    name: product.name,
    link: product.permalink,
    image: enrichedImages[0]?.url || "",
    images: enrichedImages,
    category:
      product.categories?.map((c) => String(c.name || "").toLowerCase()).join(" ") ||
      "",
    condition:
      product.condition ||
      (Array.isArray(product.meta_data)
        ? product.meta_data.find(
            (m) => String(m.key || "").toLowerCase() === "condition",
          )?.value
        : "") ||
      "",
    numericPrice: effectivePrice ?? 0,
    stock: product.stock_status,
    stockQuantity:
      typeof product.stock_quantity === "number" ? product.stock_quantity : null,
    weight: cleanNumberString(product.weight),
    dimensions: {
      length: cleanNumberString(product.dimensions?.length),
      width: cleanNumberString(product.dimensions?.width),
      height: cleanNumberString(product.dimensions?.height),
    },
    visualText: stripHtml(product.description || "").slice(0, 800),
    visualTerms: visualTerms.flat().filter(Boolean).slice(0, 120),
  };
}

async function main() {
  const existing = await loadExistingIndex();
  const existingProducts = Array.isArray(existing?.products)
    ? existing.products
    : [];
  const indexedById = new Map(
    existingProducts.map((product) => [String(product.id), product]),
  );
  const products = await fetchProducts();
  const indexed = [...existingProducts];

  for (let i = 0; i < products.length; i += 1) {
    const product = products[i];
    const productKey = String(product.id);
    if (indexedById.has(productKey)) {
      console.log(`[skip] ${product.name} sudah ada di index`);
      continue;
    }

    const images = getProductImages(product).slice(0, MAX_IMAGES_PER_PRODUCT);

    console.log(
      `[${i + 1}/${products.length}] ${product.name} (${images.length} image)`,
    );

    const scannedImages = [];
    for (const image of images) {
      const scan = await scanImageWithGemini({ product, image }).catch((err) => {
        console.error("SCAN ERROR:", product.id, image.url, err?.message || err);
        return null;
      });
      scannedImages.push({ ...image, scan });
    }

    const mapped = mapProduct(product, scannedImages);
    indexed.push(mapped);
    indexedById.set(productKey, mapped);
    await saveIndex(indexed);
    console.log(`Saved progress: ${indexed.length} products`);
  }

  await saveIndex(indexed);

  console.log(`Visual index saved: ${OUT_PATH}`);
  console.log(`Products indexed: ${indexed.length}`);
}

main().catch((err) => {
  console.error("BUILD VISUAL INDEX ERROR:", err?.message || err);
  process.exit(1);
});
