import { extractRecommendationBudgetAnswer } from "./priceIntent.js";
import { hasSpecificProductSearchTerms } from "./productSearch.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const PRODUCT_GOAL_INTENTS = new Set([
  "compare",
  "price_promo",
  "product_detail",
  "product_discovery",
  "recommendation",
  "stock_availability",
]);

const ORDINAL_INDEX = {
  pertama: 0,
  satu: 0,
  "1": 0,
  kedua: 1,
  dua: 1,
  "2": 1,
  ketiga: 2,
  tiga: 2,
  "3": 2,
  keempat: 3,
  empat: 3,
  "4": 3,
  kelima: 4,
  lima: 4,
  "5": 4,
};

const PRODUCT_REFERENCE_PATTERN =
  /\b(?:(?:yang|produk|barang|robot|pilihan|nomor|no)\s+(?:ke[-\s]?)?(pertama|satu|1|kedua|dua|2|ketiga|tiga|3|keempat|empat|4|kelima|lima|5|terakhir)|(pertama|kedua|ketiga|keempat|kelima|terakhir)(?:nya)?)\b/gi;
const FOCUSED_PRODUCT_REFERENCE_PATTERN =
  /\b(?:produk|barang|robot)?\s*(?:yang\s+)?(?:itu|tadi|tersebut)(?:nya)?\b/i;

function cleanProducts(products = []) {
  return Array.isArray(products)
    ? products.filter((product) => product?.name).slice(0, 10)
    : [];
}

function compactProducts(products = []) {
  return cleanProducts(products).map((product) => ({
    id: product.id,
    name: product.name,
    numericPrice: product.numericPrice ?? product.effectivePrice ?? null,
    effectivePrice: product.effectivePrice ?? product.numericPrice ?? null,
    stock: product.stock || null,
    condition: product.condition || null,
    link: product.link || null,
  }));
}

function correctionTail(question = "") {
  const matches = [
    ...String(question).matchAll(
      /\b(?:maksud(?:nya)?(?:\s+saya|\s+aku|ku)?|mksd(?:nya)?|koreksi(?:nya)?|ralat(?:nya)?)(?:\s*[:,]\s*|\s+)(.+)$/gi,
    ),
  ];
  if (matches.length) return String(matches.at(-1)?.[1] || "").trim();

  const trailingCorrection = String(question).match(
    /^(.+?)\s+(?:maksud(?:nya)?|mksd(?:nya)?)[.!]?$/i,
  );
  if (trailingCorrection) return String(trailingCorrection[1] || "").trim();

  const replacement = String(question).match(
    /\b(?:bukan|bkn|nggak|engga|gak)\s+.+?[,;]\s*(?:tapi\s+)?(?:yang\s+)?(.+)$/i,
  );
  return String(replacement?.[1] || "").trim();
}

function productAtReference(word = "", products = []) {
  const key = String(word || "").toLowerCase();
  if (key === "terakhir") return products.at(-1) || null;
  const index = ORDINAL_INDEX[key];
  return Number.isInteger(index) ? products[index] || null : null;
}

function findOrdinalReferences(question = "", products = []) {
  return [...String(question).matchAll(PRODUCT_REFERENCE_PATTERN)]
    .map((match) => ({
      match: match[0],
      index: match.index,
      product: productAtReference(match[1] || match[2], products),
    }))
    .filter((reference) => reference.product);
}

function findRankedReference(question = "", products = []) {
  const asksProductFact =
    /\b(?:harga|stok|stock|ready|kondisi|detail|deskripsi|spesifikasi|spek|kelengkapan|kekurangan|kelebihan|minus|cacat)\b/i.test(
      question,
    );
  if (!asksProductFact) return null;

  const priced = products.filter(
    (product) => Number(product.numericPrice || product.effectivePrice || 0) > 0,
  );
  if (!priced.length) return null;

  if (/\b(?:yang\s+)?(?:paling\s+murah|termurah)\b/i.test(question)) {
    return priced.reduce((best, product) =>
      Number(product.numericPrice || product.effectivePrice) <
      Number(best.numericPrice || best.effectivePrice)
        ? product
        : best,
    );
  }
  if (/\b(?:yang\s+)?(?:paling\s+mahal|termahal)\b/i.test(question)) {
    return priced.reduce((best, product) =>
      Number(product.numericPrice || product.effectivePrice) >
      Number(best.numericPrice || best.effectivePrice)
        ? product
        : best,
    );
  }
  return null;
}

function replaceReferences(question, references) {
  let result = String(question);
  for (const reference of [...references].reverse()) {
    result =
      result.slice(0, reference.index) +
      reference.product.name +
      result.slice(reference.index + reference.match.length);
  }
  return result.replace(/\s+/g, " ").trim();
}

export function resolveConversationTurn(question = "", context = {}) {
  const originalQuestion = String(question || "").trim();
  const activeGoal = context.activeGoal || {};
  const rememberedProducts = cleanProducts(activeGoal.products);
  const recentProducts = cleanProducts(context.lastProducts);
  const products =
    rememberedProducts.length > recentProducts.length
      ? rememberedProducts
      : recentProducts;
  const lastIntent = String(activeGoal.intent || context.lastIntent || "");
  let resolvedQuestion = originalQuestion;
  let correction = null;
  let references = findOrdinalReferences(originalQuestion, products);

  const tail = correctionTail(originalQuestion);
  const correctedBudget = tail
    ? extractRecommendationBudgetAnswer(tail)
    : { detected: false };
  if (correctedBudget.detected) {
    const topic = String(activeGoal.category || "robot").trim() || "robot";
    resolvedQuestion =
      lastIntent === "recommendation"
        ? `rekomendasi ${topic} budget ${tail}`
        : `budget ${tail}`;
    correction = {
      type: "budget",
      min: correctedBudget.min,
      max: correctedBudget.max,
    };
    references = [];
  } else if (references.length) {
    if (tail && references.length > 1) {
      references = [references.at(-1)];
      const selectedName = references[0].product.name;
      const correctionPrefix = {
        price_promo: "harga",
        product_detail: "detail",
        recommendation: "rekomendasi",
        stock_availability: "stok",
      }[lastIntent];
      resolvedQuestion = correctionPrefix
        ? `${correctionPrefix} ${selectedName}`
        : selectedName;
      correction = { type: "product", productId: references[0].product.id };
    } else {
      resolvedQuestion = replaceReferences(originalQuestion, references);
    }
  } else {
    const rankedProduct = findRankedReference(originalQuestion, products);
    if (rankedProduct) {
      resolvedQuestion = originalQuestion.replace(
        /\b(?:yang\s+)?(?:paling\s+murah|termurah|paling\s+mahal|termahal)\b/i,
        rankedProduct.name,
      );
      references = [{ match: "ranked", index: 0, product: rankedProduct }];
    } else {
      const focusedName = String(activeGoal.focusedProductName || "").trim();
      const focusedReference = originalQuestion.match(
        FOCUSED_PRODUCT_REFERENCE_PATTERN,
      );
      const namesNewProductBeforeReference = focusedReference
        ? hasSpecificProductSearchTerms(
            originalQuestion.slice(0, focusedReference.index),
          )
        : false;
      const counterpart =
        products.length === 2 && focusedName
          ? products.find((product) => product.name !== focusedName)
          : null;
      if (
        counterpart &&
        /\b(?:(?:produk|barang|robot)\s+)?(?:yang\s+)?(?:satunya|lainnya|sebelahnya)\b/i.test(
          originalQuestion,
        )
      ) {
        resolvedQuestion = originalQuestion.replace(
          /\b(?:(?:produk|barang|robot)\s+)?(?:yang\s+)?(?:satunya|lainnya|sebelahnya)\b/i,
          counterpart.name,
        );
        references = [
          { match: "counterpart", index: 0, product: counterpart },
        ];
      } else if (
        /^\s*bandingkan\s+(?:dua|keduanya)\s+(?:tadi|itu|tersebut)\s*$/i.test(
          originalQuestion,
        ) &&
        products.length === 2
      ) {
        resolvedQuestion = `bandingkan ${products[0].name} dengan ${products[1].name}`;
        references = products.map((product) => ({
          match: "pair",
          index: 0,
          product,
        }));
      } else if (
        activeGoal.previousFocusedProductName &&
        /\b(?:balik|kembali)\s+ke\s+(?:produk|barang|robot)?\s*(?:yang\s+)?sebelumnya\b/i.test(
          originalQuestion,
        )
      ) {
        const previousProduct = products.find(
          (product) =>
            product.name === activeGoal.previousFocusedProductName,
        );
        if (previousProduct) {
          resolvedQuestion = originalQuestion.replace(
            /\b(?:balik|kembali)\s+ke\s+(?:produk|barang|robot)?\s*(?:yang\s+)?sebelumnya\b/i,
            previousProduct.name,
          );
          references = [
            { match: "previous", index: 0, product: previousProduct },
          ];
        }
      } else if (
        focusedName &&
        focusedReference &&
        !namesNewProductBeforeReference
      ) {
        resolvedQuestion = originalQuestion.replace(
          FOCUSED_PRODUCT_REFERENCE_PATTERN,
          focusedName,
        );
        const focusedProduct = products.find(
          (product) => product.name === focusedName,
        );
        if (focusedProduct) {
          references = [
            { match: "focused", index: 0, product: focusedProduct },
          ];
        }
      }
    }
  }

  return {
    originalQuestion,
    question: resolvedQuestion,
    changed: resolvedQuestion !== originalQuestion,
    correction,
    usesPreviousProducts: references.length > 0,
    referencedProducts: references.map((reference) => reference.product),
  };
}

export function buildActiveConversationGoal(previous = null, input = {}) {
  const intent = String(input.intent || "");
  if (!PRODUCT_GOAL_INTENTS.has(intent)) return previous;

  const products = compactProducts(input.products);
  const previousProducts = compactProducts(previous?.products);
  const productsArePreviousSubset =
    products.length > 0 &&
    previousProducts.length > products.length &&
    products.every((product) =>
      previousProducts.some(
        (previousProduct) =>
          String(previousProduct.id || previousProduct.name) ===
          String(product.id || product.name),
      ),
    );
  const goalProducts = productsArePreviousSubset
    ? previousProducts
    : products.length
      ? products
      : previousProducts;
  const slots = input.slots || {};
  const filters = input.filters || {};
  const previousFocus = String(previous?.focusedProductName || "");
  const focusedProduct =
    products.length === 1
      ? products[0]
      : goalProducts.find((product) => product.name === previousFocus) || null;

  return {
    intent,
    category: slots.category || previous?.category || null,
    products: goalProducts,
    productIds: goalProducts.map((product) => product.id).filter(Boolean),
    productNames: goalProducts.map((product) => product.name),
    focusedProductId: focusedProduct?.id || null,
    focusedProductName: focusedProduct?.name || null,
    constraints: {
      budgetMin: slots.budgetMin ?? previous?.constraints?.budgetMin ?? null,
      budgetMax: slots.budgetMax ?? previous?.constraints?.budgetMax ?? null,
      brand: slots.brand || previous?.constraints?.brand || null,
      condition: slots.condition || previous?.constraints?.condition || null,
      stockOnly: Boolean(filters.stockOnly),
      promoOnly: Boolean(filters.promoOnly),
    },
    updatedAt: Date.now(),
  };
}

export function focusActiveConversationGoal(goal = null, product = null) {
  if (!goal || !product?.name) return goal;
  return {
    ...goal,
    previousFocusedProductName:
      goal.focusedProductName && goal.focusedProductName !== product.name
        ? goal.focusedProductName
        : goal.previousFocusedProductName || null,
    focusedProductId: product.id || null,
    focusedProductName: product.name,
    updatedAt: Date.now(),
  };
}
