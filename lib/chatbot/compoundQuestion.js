import { detectRequestedAnswerFacets } from "./answerCoverage.js";
import { extractBudgetRange } from "./priceIntent.js";
import { hasSpecificProductSearchTerms } from "./productSearch.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const GOOD_CONDITION_PATTERN =
  /\b(?:kondisi(?:nya|\s+(?:barang|produk))?.{0,20}\b(?:bagus|baik|mulus|normal)|(?:bagus|baik|mulus|normal).{0,20}\bkondisi(?:nya|\s+(?:barang|produk))?|fungsi(?:nya)?\s+normal|mint|misb|mib|sealed|segel|no\s+minus|tanpa\s+(?:cacat|minus))\b/i;
const BAD_CONDITION_PATTERN =
  /\b(?:junk|rongsok|rusak|cacat|patah|retak|part\s+only|tidak\s+lengkap|kurang\s+part|lecet\s+berat)\b/i;
const VAGUE_PRODUCT_REFERENCE =
  /\b(?:(?:produk|barang|robot|item)\s+)?(?:yang\s+)?(?:itu|tadi|tersebut)(?:nya)?\b/i;
const ORDINAL_REFERENCE =
  /\b(?:pertama|kedua|ketiga|keempat|kelima|terakhir|nomor\s*[1-5]|ke[-\s]?[1-5])\b/i;
const PRODUCT_FACT_FACETS = new Set([
  "material",
  "dimensions",
  "product_condition",
  "completeness",
  "price",
  "stock",
  "promo",
  "budget",
]);
const TRANSACTION_POLICY_FACETS = new Set([
  "insurance",
  "packing",
  "shipping_estimate",
  "same_day",
  "cod",
  "payment_methods",
]);

function productText(product = {}) {
  return [
    product.name,
    product.category,
    product.condition,
    product.description,
    product.shortDescription,
    product.short_description,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function splitClauses(text = "") {
  return String(text || "")
    .split(/\s*(?:[,;]|\b(?:dan|serta|sekaligus)\b)\s*/i)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function includesKnownProduct(text, products = []) {
  return products.some((product) => {
    const name = normalizeIndonesianCommerceText(product?.name || "")
      .toLowerCase()
      .trim();
    return name.length >= 3 && text.includes(name);
  });
}

function clarificationForProduct(products = [], facets = []) {
  const command = facets.some((facet) =>
    ["material", "product_condition"].includes(facet),
  )
    ? "Jelaskan kondisi"
    : facets.includes("stock")
      ? "Cek stok"
      : facets.includes("price") ||
          facets.includes("promo") ||
          facets.includes("budget")
        ? "Cek harga dan promo"
        : "Tampilkan detail";

  return products.slice(0, 5).map((product) => ({
    label: String(product.name),
    value: `${command} ${product.name}`,
  }));
}

function inferPrimaryIntent(text, facets, purposes) {
  if (/\b(?:bandingkan|compare|versus|\bvs\b|perbedaan|bedanya)\b/i.test(text)) {
    return "compare";
  }
  const selectionConstraintCount = facets.filter((facet) =>
    ["stock", "product_condition", "budget", "promo"].includes(facet),
  ).length;
  if (
    facets.includes("recommendation") ||
    purposes.length ||
    (/\b(?:cari|carikan|pilih|pilihkan|rekomendasikan)\b/i.test(text) &&
      selectionConstraintCount >= 2) ||
    /\b(?:rekomendasi(?:kan)?|rekomen|pilihkan|mending|worth\s+it)\b/i.test(
      text,
    )
  ) {
    return "recommendation";
  }
  if (
    facets.some((facet) =>
      [
        "shipping_quote",
        "insurance",
        "packing",
        "shipping_estimate",
        "same_day",
        "cod",
        "payment_methods",
      ].includes(facet),
    )
  ) {
    return "shipping_transaction";
  }
  if (facets.includes("return_policy") || facets.includes("refund")) {
    return "return_product";
  }
  if (
    facets.includes("material") ||
    facets.includes("product_condition") ||
    facets.includes("completeness")
  ) {
    return "product_detail";
  }
  if (
    facets.includes("price") ||
    facets.includes("promo") ||
    facets.includes("budget")
  ) {
    return "price_promo";
  }
  if (facets.includes("stock")) return "stock_availability";
  return null;
}

export function analyzeCompoundQuestion(question = "", context = {}) {
  const text = normalizeIndonesianCommerceText(question)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const clauses = splitClauses(text);
  const facets = detectRequestedAnswerFacets(text);
  const budget = extractBudgetRange(text);
  const vagueProductReference = text.match(VAGUE_PRODUCT_REFERENCE);
  const namesNewProductBeforeReference = vagueProductReference
    ? hasSpecificProductSearchTerms(
        text.slice(0, vagueProductReference.index),
      )
    : false;
  const recentProducts = Array.isArray(context.recentProducts)
    ? context.recentProducts.filter((product) => product?.name).slice(0, 10)
    : [];
  const purposes = [
    /\b(?:hadiah|kado|gift)\b/.test(text) ? "gift" : null,
    /\b(?:pajangan|display|dipajang)\b/.test(text) ? "display" : null,
    /\b(?:koleksi|kolektor|collector)\b/.test(text) ? "collection" : null,
    /\b(?:pemula|baru\s+mulai|beginner)\b/.test(text) ? "beginner" : null,
  ].filter(Boolean);
  const unavailableMention =
    /\b(?:tidak|belum|engga|nggak|gak)\s+ready\b|\b(?:habis|sold\s*out|pre\s*order|preorder|po)\b/.test(
      text,
    );
  const readyText = text.replace(
    /\b(?:tidak|belum|engga|nggak|gak)\s+ready\b|\b(?:habis|sold\s*out|pre\s*order|preorder|po)\b/g,
    " ",
  );
  const stockPreference = /\b(?:ready|tersedia|stok\s+ada|in\s*stock)\b/.test(
    readyText,
  )
    ? "ready"
    : unavailableMention
      ? "unavailable"
      : null;
  const conditionPreference = GOOD_CONDITION_PATTERN.test(text)
    ? "good"
    : BAD_CONDITION_PATTERN.test(text)
      ? "damaged"
      : null;
  const constraints = {
    budgetMin: budget.detected ? budget.min : null,
    budgetMax: budget.detected ? budget.max : null,
    stock: stockPreference,
    condition: conditionPreference,
    purposes,
    promoOnly: /\b(?:promo|diskon|sale)\b/.test(text),
  };
  const constraintCount = [
    constraints.budgetMin != null || constraints.budgetMax != null,
    Boolean(constraints.stock),
    Boolean(constraints.condition),
    constraints.purposes.length > 0,
    constraints.promoOnly,
  ].filter(Boolean).length;

  let confidence = text ? 0.96 : 0;
  let clarificationKind = "";
  let clarificationQuestion = "";
  let clarificationOptions = [];

  if (
    constraints.budgetMin != null &&
    constraints.budgetMax != null &&
    constraints.budgetMin > constraints.budgetMax
  ) {
    confidence = 0.35;
    clarificationKind = "conflicting_budget";
    clarificationQuestion =
      "Rentang budgetnya terbalik. Batas minimum dan maksimum yang benar berapa?";
  } else if (
    recentProducts.length > 1 &&
    !context.focusedProductName &&
    vagueProductReference &&
    !ORDINAL_REFERENCE.test(text) &&
    !namesNewProductBeforeReference &&
    !includesKnownProduct(text, recentProducts)
  ) {
    confidence = 0.5;
    clarificationKind = "ambiguous_product_reference";
    clarificationQuestion = "Produk yang mana yang kamu maksud?";
    clarificationOptions = clarificationForProduct(recentProducts, facets);
  }

  return {
    isCompound:
      clauses.length > 1 || facets.length > 1 || constraintCount > 1,
    clauses,
    facets,
    constraints,
    primaryIntent: inferPrimaryIntent(text, facets, purposes),
    confidence,
    needsClarification: Boolean(clarificationKind),
    clarificationKind,
    clarificationQuestion,
    clarificationOptions,
  };
}

export function compactCompoundQuestionAnalysis(analysis = {}) {
  const constraints = analysis.constraints || {};
  return {
    compound: Boolean(analysis.isCompound),
    facets: Array.isArray(analysis.facets) ? analysis.facets.slice(0, 8) : [],
    constraints: {
      budget_min: constraints.budgetMin ?? null,
      budget_max: constraints.budgetMax ?? null,
      stock: constraints.stock || null,
      condition: constraints.condition || null,
      purposes: Array.isArray(constraints.purposes)
        ? constraints.purposes.slice(0, 4)
        : [],
      promo_only: Boolean(constraints.promoOnly),
    },
    primary_intent: analysis.primaryIntent || null,
    confidence: Math.max(0, Math.min(1, Number(analysis.confidence || 0))),
    needs_clarification: Boolean(analysis.needsClarification),
    ...(analysis.clarificationKind
      ? { clarification_kind: String(analysis.clarificationKind) }
      : {}),
  };
}

export function buildAnswerPlan(analysis = {}) {
  const facets = Array.isArray(analysis.facets)
    ? [...new Set(analysis.facets)]
    : [];
  const sections = [];
  const productFacts = facets.filter((facet) =>
    PRODUCT_FACT_FACETS.has(facet),
  );
  const transactionPolicies = facets.filter((facet) =>
    TRANSACTION_POLICY_FACETS.has(facet),
  );

  if (analysis.primaryIntent === "recommendation") {
    sections.push({ key: "recommendation", facets: productFacts });
  } else if (productFacts.length) {
    sections.push({ key: "product_facts", facets: productFacts });
  }
  if (transactionPolicies.length) {
    sections.push({
      key: "transaction_policy",
      facets: transactionPolicies,
    });
  }
  if (facets.includes("shipping_quote")) {
    sections.push({ key: "shipping_quote", facets: ["shipping_quote"] });
  }
  if (facets.some((facet) => ["return_policy", "refund"].includes(facet))) {
    sections.push({
      key: "return_policy",
      facets: facets.filter((facet) =>
        ["return_policy", "refund"].includes(facet),
      ),
    });
  }

  return {
    primaryIntent: analysis.primaryIntent || null,
    sections,
    isMultiSection: sections.length > 1,
    requiresProduct: sections.some((section) =>
      ["product_facts", "recommendation"].includes(section.key),
    ),
  };
}

export function compactAnswerPlan(plan = {}) {
  return {
    primary_intent: plan.primaryIntent || null,
    multi_section: Boolean(plan.isMultiSection),
    sections: Array.isArray(plan.sections)
      ? plan.sections.slice(0, 5).map((section) => ({
          key: String(section.key || ""),
          facets: Array.isArray(section.facets)
            ? section.facets.slice(0, 8).map(String)
            : [],
        }))
      : [],
  };
}

export function answerPlanIncludes(plan = {}, key = "") {
  return Array.isArray(plan.sections)
    ? plan.sections.some((section) => section.key === key)
    : false;
}

export function prependAnswerSections(payload = {}, sections = []) {
  const context = (Array.isArray(sections) ? sections : [])
    .map((section) => String(section || "").trim())
    .filter(Boolean)
    .join("\n\n");
  if (!context) return payload;

  if (["options", "suggestions"].includes(payload.type)) {
    return {
      ...payload,
      intro: [context, payload.intro || payload.message]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  if (payload.type === "products") {
    return {
      ...payload,
      intro: [context, payload.intro].filter(Boolean).join("\n\n"),
    };
  }
  return {
    ...payload,
    message: [context, payload.message || payload.intro]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function appendAnswerSections(payload = {}, sections = []) {
  const context = (Array.isArray(sections) ? sections : [])
    .map((section) => String(section || "").trim())
    .filter(Boolean)
    .join("\n\n");
  if (!context) return payload;

  if (["options", "suggestions", "products"].includes(payload.type)) {
    return {
      ...payload,
      intro: [payload.intro || payload.message, context]
        .filter(Boolean)
        .join("\n\n"),
    };
  }
  return {
    ...payload,
    message: [payload.message || payload.intro, context]
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function productMatchesCompoundConstraints(product = {}, analysis = {}) {
  const constraints = analysis.constraints || analysis || {};
  const price = Number(
    product.numericPrice || product.effectivePrice || product.price || 0,
  );
  const text = productText(product);
  const condition = String(product.condition || "").toLowerCase();

  if (constraints.budgetMin != null && price < constraints.budgetMin) {
    return false;
  }
  if (constraints.budgetMax != null && price > constraints.budgetMax) {
    return false;
  }
  if (
    constraints.stock === "ready" &&
    String(product.stock || "").toLowerCase() !== "instock"
  ) {
    return false;
  }
  if (constraints.promoOnly && Number(product.discountPercent || 0) <= 0) {
    return false;
  }
  if (constraints.condition === "good") {
    const explicitlyGood =
      /\b(?:bagus|baik|mulus|normal|mint|misb|mib|sealed|segel)\b/i.test(
        condition,
      ) || GOOD_CONDITION_PATTERN.test(text);
    return explicitlyGood && !BAD_CONDITION_PATTERN.test(text);
  }
  if (constraints.condition === "damaged") {
    return BAD_CONDITION_PATTERN.test(text);
  }
  return true;
}
