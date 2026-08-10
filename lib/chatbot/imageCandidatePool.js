import { extractBudgetRange } from "./priceIntent.js";

export const MIN_PLAUSIBLE_VISUAL_SCORE = 45;

export function extractImageSearchConstraints(question = "") {
  const text = String(question || "").toLowerCase();
  const budget = extractBudgetRange(text);

  return {
    budgetMin: budget.detected ? budget.min : null,
    budgetMax: budget.detected ? budget.max : null,
    readyStockOnly:
      /\b(?:ready(?:\s+stock)?|stok\s+(?:ada|tersedia|ready)|stock\s+(?:ada|tersedia|ready)|masih\s+(?:ada|tersedia))\b/.test(
        text,
      ),
    similarSizeRequested:
      /\b(?:seukuran(?:nya)?|ukuran(?:nya)?\s+(?:mirip|sama|serupa)|size(?:nya)?\s+(?:mirip|sama|serupa))\b/.test(
        text,
      ),
  };
}

function largestDimension(product = {}) {
  const values = Object.values(product.dimensions || {})
    .map((value) => Number(String(value || "").replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);

  return values.length ? Math.max(...values) : null;
}

export function applyImageSearchConstraints(
  products = [],
  constraints = {},
  { referenceProduct = null, sizeTolerance = 0.3 } = {},
) {
  let filtered = Array.isArray(products) ? [...products] : [];
  const applied = {
    budget: constraints.budgetMin != null || constraints.budgetMax != null,
    readyStock: Boolean(constraints.readyStockOnly),
    similarSize: false,
  };
  const referenceSize = constraints.similarSizeRequested
    ? largestDimension(referenceProduct)
    : null;

  if (applied.budget) {
    filtered = filtered.filter((product) => {
      const price = Number(product?.numericPrice || product?.effectivePrice || 0);
      if (price <= 0) return false;
      if (constraints.budgetMin != null && price < constraints.budgetMin) {
        return false;
      }
      if (constraints.budgetMax != null && price > constraints.budgetMax) {
        return false;
      }
      return true;
    });
  }

  if (applied.readyStock) {
    filtered = filtered.filter((product) => product?.stock === "instock");
  }

  if (referenceSize != null) {
    const minSize = referenceSize * (1 - sizeTolerance);
    const maxSize = referenceSize * (1 + sizeTolerance);
    filtered = filtered.filter((product) => {
      const size = largestDimension(product);
      return size != null && size >= minSize && size <= maxSize;
    });
    applied.similarSize = true;
  }

  return {
    products: filtered,
    applied,
    similarSizeUnavailable:
      Boolean(constraints.similarSizeRequested) && referenceSize == null,
    referenceSize,
  };
}

export function interleaveUniqueProducts(groups = [], limit = 18) {
  const sources = (Array.isArray(groups) ? groups : []).map((group) =>
    Array.isArray(group) ? group : [],
  );
  const output = [];
  const seen = new Set();
  let index = 0;

  while (output.length < limit) {
    let progressed = false;

    for (const source of sources) {
      const product = source[index];
      if (!product) continue;
      progressed = true;

      const key = String(product.id || "").trim();
      if (!key || seen.has(key)) continue;

      seen.add(key);
      output.push(product);
      if (output.length >= limit) break;
    }

    if (!progressed) break;
    index += 1;
  }

  return output;
}

export function plausibleVisualProducts(
  products = [],
  { minimumScore = MIN_PLAUSIBLE_VISUAL_SCORE, limit = 5 } = {},
) {
  return (Array.isArray(products) ? products : [])
    .filter((product) => Number(product?.visualScore || 0) >= minimumScore)
    .slice(0, limit);
}
