import fs from "node:fs";
import path from "node:path";

const DEFAULT_INDEX_PATH = path.join(
  process.cwd(),
  "data",
  "product-visual-index.json",
);

let cachedIndex = {
  path: "",
  mtimeMs: 0,
  data: null,
};

const TERM_ALIASES = {
  black: ["hitam", "black"],
  hitam: ["black", "hitam"],
  yellow: ["kuning", "yellow", "emas", "gold"],
  kuning: ["yellow", "gold", "emas"],
  gold: ["emas", "kuning", "yellow"],
  red: ["merah", "red"],
  merah: ["red", "merah"],
  silver: ["perak", "silver", "abu abu", "gray", "grey"],
  perak: ["silver", "gray", "grey", "abu abu"],
  gray: ["abu abu", "grey", "silver", "perak"],
  grey: ["abu abu", "gray", "silver", "perak"],
  white: ["putih", "white"],
  putih: ["white", "putih"],
  blue: ["biru", "blue"],
  biru: ["blue", "biru"],
  green: ["hijau", "green"],
  hijau: ["green", "hijau"],
  orange: ["oranye", "jingga", "orange"],
  prototype: ["test type", "prototype", "prototipe"],
  prototipe: ["prototype", "test type"],
  test: ["test type", "prototype"],
  "test type": ["prototype", "prototipe", "energer z test type"],
  mazinger: ["mazinger z", "shin mazinger"],
  "mazinger z": ["mazinger", "shin mazinger"],
  energer: ["energer z", "gx 47t", "gx-47t", "mazinger z"],
  "energer z": ["energer", "gx 47t", "gx-47t", "mazinger z"],
  gx47t: ["gx 47t", "gx-47t", "energer z test type"],
  "gx 47t": ["gx-47t", "gx47t", "energer z test type"],
  "gx-47t": ["gx 47t", "gx47t", "energer z test type"],
};

function normalizeText(str = "") {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactCode(str = "") {
  return normalizeText(str).replace(/[\s-]+/g, "");
}

function expandAliases(term = "") {
  const normalized = normalizeText(term);
  const compact = compactCode(term);
  return unique([
    normalized,
    compact,
    TERM_ALIASES[normalized] || [],
    TERM_ALIASES[compact] || [],
  ]);
}

function unique(items = []) {
  const out = [];
  for (const item of items.flat()) {
    const value = normalizeText(item);
    if (value.length >= 2 && !out.includes(value)) out.push(value);
  }
  return out;
}

function tokenizeTerms(items = []) {
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
  for (const item of unique(items)) {
    if (!stop.has(item) && !out.includes(item)) out.push(item);
    item
      .split(/[^a-z0-9]+/i)
      .map((x) => normalizeText(x))
      .filter((x) => x.length >= 3 && !stop.has(x))
      .forEach((x) => {
        if (!out.includes(x)) out.push(x);
      });
  }
  return out.slice(0, 120);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function productVisualText(product = {}) {
  const imageTexts = safeArray(product.images).flatMap((img) => [
    img.name,
    img.alt,
    img.fileName,
    img.caption,
    img.visibleText,
    safeArray(img.colors).join(" "),
    safeArray(img.features).join(" "),
    safeArray(img.possibleNames).join(" "),
    safeArray(img.brandOrSeries).join(" "),
    safeArray(img.keywords).join(" "),
  ]);

  return normalizeText(
    [
      product.name,
      product.category,
      product.condition,
      product.visualText,
      safeArray(product.visualTerms).join(" "),
      imageTexts.join(" "),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function loadProductVisualIndex(indexPath = DEFAULT_INDEX_PATH) {
  try {
    const stat = fs.statSync(indexPath);
    if (
      cachedIndex.data &&
      cachedIndex.path === indexPath &&
      cachedIndex.mtimeMs === stat.mtimeMs
    ) {
      return cachedIndex.data;
    }

    const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const products = safeArray(parsed.products)
      .filter((p) => p?.id && p?.name)
      .map((p) => ({
        ...p,
        visualSearchText: productVisualText(p),
      }));

    cachedIndex = {
      path: indexPath,
      mtimeMs: stat.mtimeMs,
      data: { ...parsed, products },
    };
    return cachedIndex.data;
  } catch {
    return null;
  }
}

export function canReuseVisualIndexProduct({
  existing,
  product,
  images = [],
} = {}) {
  if (!existing || Number(existing.visualIndexVersion || 0) < 2) return false;
  const currentModifiedAt =
    product?.date_modified_gmt || product?.date_modified || "";
  if (
    currentModifiedAt &&
    String(existing.catalogModifiedAt || "") !== String(currentModifiedAt)
  ) {
    return false;
  }

  const existingImages = safeArray(existing.images);
  const existingUrls = existingImages.map((image) => image.url);
  const currentUrls = safeArray(images).map((image) => image.url);
  if (JSON.stringify(existingUrls) !== JSON.stringify(currentUrls)) {
    return false;
  }

  return existingImages.every(
    (image) => image.scanProvider && image.scanProvider !== "none",
  );
}

export function buildVisualSearchTerms({ analysis = {}, question = "", imageName = "" }) {
  const baseTerms = tokenizeTerms([
    analysis.short_description || "",
    analysis.possible_names || [],
    analysis.brand_or_series || [],
    analysis.visible_text || [],
    analysis.colors || [],
    analysis.distinctive_features || [],
    analysis.keywords || [],
    analysis.search_queries || [],
    analysis.object_type || "",
    question || "",
    imageName || "",
  ]);

  return unique(baseTerms.flatMap((term) => expandAliases(term))).slice(0, 160);
}

export function scoreProductVisualIndex({
  analysis = {},
  question = "",
  imageName = "",
  limit = 24,
  indexPath,
} = {}) {
  const index = loadProductVisualIndex(indexPath);
  if (!index?.products?.length) return [];

  const terms = buildVisualSearchTerms({ analysis, question, imageName });
  if (!terms.length) return [];

  const scored = [];
  for (const product of index.products) {
    const text = product.visualSearchText || productVisualText(product);
    const name = normalizeText(product.name || "");
    const compactText = compactCode(text);
    const compactName = compactCode(name);
    let score = 0;
    const hits = [];

    for (const term of terms) {
      if (!term) continue;
      const compactTerm = compactCode(term);

      if (name.includes(term) || (compactTerm && compactName.includes(compactTerm))) {
        score += 22;
        hits.push(term);
      } else if (
        text.includes(term) ||
        (compactTerm && compactText.includes(compactTerm))
      ) {
        score += 10;
        hits.push(term);
      }
    }

    for (const color of buildVisualSearchTerms({ analysis: { colors: safeArray(analysis.colors) } })) {
      const c = normalizeText(color);
      if (c && text.includes(c)) score += 2;
    }

    const productTextHasEnerger =
      text.includes("energer") || compactText.includes("gx47t");
    const queryLooksEnerger =
      terms.some((term) =>
        [
          "energer",
          "energer z",
          "gx 47t",
          "gx-47t",
          "gx47t",
          "energer test type",
        ].includes(term),
      );

    if (productTextHasEnerger && queryLooksEnerger) {
      score += 36;
      hits.push("energer-alias");
    }

    const queryExplicitNormalColor =
      terms.includes("normal") && terms.includes("color");
    const queryExplicitTestType =
      terms.includes("test type") ||
      terms.includes("prototype") ||
      terms.includes("prototipe");

    if (
      productTextHasEnerger &&
      text.includes("normal color") &&
      queryExplicitNormalColor
    ) {
      score += 80;
      hits.push("energer-normal-color");
    }

    if (
      productTextHasEnerger &&
      text.includes("test type") &&
      queryExplicitTestType &&
      !queryExplicitNormalColor
    ) {
      score += 32;
      hits.push("energer-test-type-visual");
    }

    const captionHits = safeArray(product.images).filter((img) => {
      const imgText = normalizeText(
        [
          img.caption,
          img.visibleText,
          safeArray(img.features).join(" "),
          safeArray(img.possibleNames).join(" "),
        ]
          .filter(Boolean)
          .join(" "),
      );
      return terms.some((term) => term && imgText.includes(term));
    }).length;

    score += Math.min(16, captionHits * 4);

    if (score > 0) {
      scored.push({
        ...product,
        image: product.image || safeArray(product.images)[0]?.url || "",
        imageMatchScore: score,
        imageMatchTerms: [...new Set(hits)].slice(0, 10),
        visualIndexScore: score,
        visualIndexCandidate: true,
      });
    }
  }

  return scored
    .sort((a, b) => Number(b.visualIndexScore || 0) - Number(a.visualIndexScore || 0))
    .slice(0, limit);
}
