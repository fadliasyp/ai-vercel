import {
  hasCommerceProductNoun,
  mentionsRobotJadulStore,
} from "./utils.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";

function normalizeText(value = "") {
  return normalizeIndonesianCommerceText(value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isCatalogOverviewQuestion(question = "") {
  const text = normalizeText(question);
  if (!text) return false;

  const mentionsCatalog =
    hasCommerceProductNoun(text) ||
    mentionsRobotJadulStore(text) ||
    /\b(?:katalog|toko)\b/.test(text);
  const asksCount =
    /\bberapa\s+(?:macam|macem|jenis|banyak|jumlah)\b/.test(text) ||
    /\bjumlah(?:nya)?\b/.test(text);
  const asksList =
    /\b(?:apa+\s+aja|apa+\s+saja|macam\s+apa+\s+aja|jenis\s+apa+\s+aja)\b/.test(
      text,
    );

  return mentionsCatalog &&
    (asksCount || asksList || isStoreAssortmentQuestion(text));
}

export function isStoreAssortmentQuestion(question = "") {
  const text = normalizeText(question);
  if (!text) return false;

  return (
    /\b(?:cuma|cuman|hanya)\b.*\b(?:jual|menjual|ada)\b/.test(text) ||
    /\bjual\s+(?:yang\s+|yg\s+)?lain\b/.test(text) ||
    /\bselain\s+(?:robot|produk|barang|mainan|figure|figur)\b/.test(text) ||
    /\b(?:produk|barang|mainan|figure|figur)\s+lain\b/.test(text) ||
    /\bjual\s+apa+\s+(?:aja|saja)\b/.test(text) ||
    /\b(?:toko\s+ini|kalian|kamu)\s+(?:cuma\s+|hanya\s+)?jual\s+apa\b/.test(
      text,
    )
  );
}

export function isPriceOrderingFollowUp(question = "") {
  const text = normalizeText(question);
  if (!text) return false;

  return (
    /\b(?:menurut|berdasarkan|dari\s+sisi)\s+harga\b/.test(text) ||
    /\burut(?:kan)?\s+(?:dari\s+)?harga\b/.test(text)
  );
}

export function resolveProductQueryScope(question = "") {
  const text = normalizeText(question);
  if (!text) return "unspecified";

  if (
    /\b(?:hasil|pilihan|daftar|produk|barang|robot)\s+(?:yang\s+)?(?:sebelumnya|tadi|di\s+atas)\b/.test(
      text,
    ) ||
    /\b(?:dari|berdasarkan)\s+(?:hasil|pilihan|daftar)\s+(?:sebelumnya|tadi|di\s+atas)\b/.test(
      text,
    )
  ) {
    return "previous";
  }

  if (
    /\b(?:di\s+sini|disini|di\s+toko|toko\s+ini|robot\s+jadul)\b/.test(text) ||
    /\b(?:semua|seluruh)\s+(?:produk|barang|robot|item|mainan)\b/.test(text) ||
    /\bdari\s+(?:semua|seluruh)\s+(?:produk|barang|robot|item|mainan)\b/.test(
      text,
    )
  ) {
    return "catalog";
  }

  const asksForRecommendation =
    /\b(?:rekomendasi(?:kan)?|rekomen|carikan|pilihkan|sarankan)\b/.test(
      text,
    );
  const namesProductType =
    /\b(?:robot|produk|barang|mainan|figure|figur|item)\b/.test(text);
  if (asksForRecommendation && namesProductType) return "catalog";

  return "unspecified";
}

export function buildCatalogOverview(products = [], displayLimit = 10) {
  const catalog = Array.isArray(products) ? products.filter(Boolean) : [];
  const ready = catalog.filter((product) => product.stock === "instock");
  const promo = catalog.filter(
    (product) => Number(product.discountPercent || 0) > 0,
  );
  const displayProducts = (ready.length ? ready : catalog).slice(
    0,
    displayLimit,
  );
  const categoryCounts = new Map();

  for (const product of catalog) {
    const categoryNames = Array.isArray(product.categoryNames)
      ? product.categoryNames
      : Array.isArray(product.categories)
        ? product.categories.map((category) => category?.name || category)
        : [];

    for (const rawName of categoryNames) {
      const name = String(rawName || "")
        .replace(/&amp;/gi, "&")
        .trim();
      if (!name || /^uncategorized$/i.test(name)) continue;

      const key = name.toLowerCase();
      const previous = categoryCounts.get(key) || { name, count: 0 };
      categoryCounts.set(key, { ...previous, count: previous.count + 1 });
    }
  }
  const categories = [...categoryCounts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);

  return {
    total: catalog.length,
    ready: ready.length,
    promo: promo.length,
    categories,
    displayProducts,
  };
}
