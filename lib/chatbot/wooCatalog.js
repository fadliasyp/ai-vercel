import { fetchWithTimeoutJson } from "./wpApi.js";
import { buildWordPressUrl } from "./siteConfig.js";

const PRODUCT_CACHE_TTL_MS = 10 * 60 * 1000;

export const WOO_PRODUCT_FIELDS = [
  "id",
  "name",
  "type",
  "permalink",
  "price",
  "regular_price",
  "sale_price",
  "stock_status",
  "stock_quantity",
  "images",
  "categories",
  "description",
  "meta_data",
  "weight",
  "dimensions",
  "total_sales",
  "average_rating",
  "rating_count",
].join(",");

let productCache = { at: 0, data: null };
let productFetchInFlight = null;

export function buildWooProductsUrl(params = {}, env = process.env) {
  const url = new URL(
    env.WC_PRODUCTS_URL ||
      buildWordPressUrl("wp-json/wc/v3/products", env),
  );

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  if (!url.searchParams.has("_fields")) {
    url.searchParams.set("_fields", WOO_PRODUCT_FIELDS);
  }

  return url.toString();
}

export function buildWooAuthHeaders() {
  const key = String(process.env.WC_KEY || "");
  const secret = String(process.env.WC_SECRET || "");

  if (!key || !secret) {
    throw new Error("WC_CREDENTIALS_MISSING");
  }

  return {
    Authorization:
      "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"),
  };
}

async function fetchAllWooProducts({
  timeoutMs = 15000,
  perPage = 50,
  maxPages = 20,
  retries = 1,
} = {}) {
  const all = [];
  const headers = buildWooAuthHeaders();

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildWooProductsUrl({
      per_page: perPage,
      page,
      status: "publish",
    });
    let data;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        data = await fetchWithTimeoutJson(url, { headers }, timeoutMs);
        break;
      } catch (error) {
        const retryable =
          error?.name === "AbortError" ||
          error?.code === "WC_FETCH_TIMEOUT" ||
          error?.status === 429 ||
          Number(error?.status || 0) >= 500;

        if (!retryable || attempt === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    if (!Array.isArray(data)) {
      throw new Error("WC_PRODUCTS_INVALID_RESPONSE");
    }
    if (!data.length) break;

    all.push(...data);
    if (data.length < perPage) break;
  }

  return all;
}

export async function getWooProductsCached(options = {}) {
  const now = Date.now();
  const hasCachedProducts =
    Array.isArray(productCache.data) && productCache.data.length > 0;

  if (
    hasCachedProducts &&
    now - productCache.at < PRODUCT_CACHE_TTL_MS
  ) {
    return productCache.data;
  }

  if (productFetchInFlight) return productFetchInFlight;

  productFetchInFlight = fetchAllWooProducts(options)
    .then((products) => {
      productCache = { at: Date.now(), data: products };
      return products;
    })
    .catch((error) => {
      if (hasCachedProducts) {
        console.warn(
          "WC CATALOG REFRESH FAILED, USING STALE CACHE:",
          error?.message || error,
        );
        return productCache.data;
      }
      throw error;
    })
    .finally(() => {
      productFetchInFlight = null;
    });

  return productFetchInFlight;
}
