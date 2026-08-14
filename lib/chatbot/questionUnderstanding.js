import { resolveProductQueryScope } from "./catalogIntent.js";
import {
  analyzeIndonesianQuestion,
  compactLinguisticAnalysis,
} from "./linguisticAnalysis.js";
import { looksLikeStoreBackgroundQuestion } from "./storeInfo.js";
import {
  looksLikeProductManufacturingOriginQuestion,
  looksLikeShippingOriginQuestion,
} from "./transactionIntent.js";
import { normalizeIndonesianCommerceText } from "./textNormalization.js";
import { extractRecommendationBudgetAnswer } from "./priceIntent.js";
import { hasSpecificProductSearchTerms } from "./productSearch.js";

const INTENT_QUESTION_TYPES = {
  compare: "product_comparison",
  greeting: "greeting",
  price_promo: "price_or_promotion",
  product_detail: "product_detail",
  product_discovery: "catalog_search",
  recommendation: "product_recommendation",
  return_product: "return_policy",
  shipment_tracking: "shipment_tracking",
  shipping_origin: "shipping_origin",
  shipping_transaction: "shipping_transaction",
  stock_availability: "stock_availability",
  transaction_status: "transaction_status",
};

const PRODUCT_INTENTS = new Set([
  "compare",
  "price_promo",
  "product_detail",
  "product_discovery",
  "recommendation",
  "stock_availability",
]);

const QUESTION_TYPE_INTENTS = {
  catalog_search: "product_discovery",
  price_or_promotion: "price_promo",
  product_comparison: "compare",
  product_detail: "product_detail",
  product_manufacturing_origin: "product_detail",
  product_recommendation: "recommendation",
  stock_availability: "stock_availability",
};

const PRODUCT_ANSWER_INTENTS = {
  compare_second: "compare",
  detail: "product_detail",
  recommendation: "recommendation",
  stock: "stock_availability",
};

function isBareBudgetReply(text = "") {
  if (!extractRecommendationBudgetAnswer(text).detected) return false;

  const remainder = normalizeIndonesianCommerceText(text)
    .toLowerCase()
    .replace(/\b(?:rp|budget|anggaran|dana|harga)\b/g, " ")
    .replace(/\b(?:di\s*atas|di\s*bawah|lebih\s+dari|kurang\s+dari|mulai\s+dari|maksimal|minimal|antara|kisaran|sekitar|sampai|hingga|under)\b/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\b/g, " ")
    .replace(/\b(?:juta(?:an)?|jt|ribu(?:an)?|rb|k)\b/g, " ")
    .replace(/-/g, " ")
    .replace(/\b(?:dan|ke|saja|aja|ya|deh|dong)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

  return !remainder;
}

function looksLikeProductSelection(text = "") {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 14) return false;
  return !/\b(?:tidak|engga|nggak|gak|batal|ga jadi|nggak jadi|topik lain|cuaca|politik|coding)\b/.test(
    text,
  );
}

export function resolveContextualIntent(question = "", context = {}) {
  const text = normalizeIndonesianCommerceText(question)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const explicitIntent = String(context.explicitIntent || "");
  const lastIntent = String(context.lastIntent || "");
  const questionType = String(context.lastBotQuestionType || "");
  const questionMeta = context.lastBotQuestionMeta || {};
  const hasRecentProducts = Boolean(context.hasRecentProducts);
  const productQueryScope =
    context.productQueryScope || resolveProductQueryScope(question);

  if (
    ["ask_budget", "ask_budget_value"].includes(questionType) &&
    isBareBudgetReply(text)
  ) {
    return {
      intent: "recommendation",
      method: "context_expected_budget_rule",
      confidence: 1,
      is_follow_up: true,
      expected_answer_type: "budget",
    };
  }

  if (lastIntent === "recommendation" && isBareBudgetReply(text)) {
    return {
      intent: "recommendation",
      method: "context_recommendation_budget_rule",
      confidence: 0.98,
      is_follow_up: true,
      expected_answer_type: "budget",
    };
  }

  if (explicitIntent) return null;

  if (
    questionType === "ask_product_for_spec" &&
    looksLikeProductSelection(text)
  ) {
    return {
      intent: "product_detail",
      method: "context_product_selection_rule",
      confidence: 1,
      is_follow_up: true,
      expected_answer_type: "product_selection",
    };
  }

  if (
    questionType === "ask_product_name" &&
    PRODUCT_ANSWER_INTENTS[questionMeta.source] &&
    looksLikeProductSelection(text)
  ) {
    return {
      intent: PRODUCT_ANSWER_INTENTS[questionMeta.source],
      method: "context_expected_product_name_rule",
      confidence: 0.98,
      is_follow_up: true,
      expected_answer_type: "product_name",
    };
  }

  if (hasRecentProducts && productQueryScope === "previous") {
    const domainQuestionType = inferDomainQuestionType(text);
    const intent = QUESTION_TYPE_INTENTS[domainQuestionType];
    if (intent) {
      return {
        intent,
        method: "context_previous_products_rule",
        confidence: 0.95,
        is_follow_up: true,
        expected_answer_type: "previous_products",
      };
    }

    if (/\b(?:ada\s+lagi|yang\s+lain|lainnya|alternatif\s+lain)\b/.test(text)) {
      return {
        intent: ["recommendation", "product_discovery"].includes(lastIntent)
          ? lastIntent
          : "product_discovery",
        method: "context_more_products_rule",
        confidence: 0.9,
        is_follow_up: true,
        expected_answer_type: "previous_products",
      };
    }
  }

  return null;
}

function inferDomainQuestionType(text, explicitIntent = "") {
  if (looksLikeStoreBackgroundQuestion(text)) return "store_background";
  if (looksLikeProductManufacturingOriginQuestion(text)) {
    return "product_manufacturing_origin";
  }
  if (looksLikeShippingOriginQuestion(text)) return "shipping_origin";
  if (INTENT_QUESTION_TYPES[explicitIntent]) {
    return INTENT_QUESTION_TYPES[explicitIntent];
  }
  if (/\b(?:bandingkan|compare|versus|vs|bedanya|perbedaan)\b/.test(text)) {
    return "product_comparison";
  }
  if (/\b(?:rekomendasi|rekomen|mending|worth it|paling cocok)\b/.test(text)) {
    return "product_recommendation";
  }
  if (/\b(?:promo|diskon|sale|cashback)\b/.test(text)) {
    return "price_or_promotion";
  }
  if (/\b(?:harga|berapa|termurah|termahal)\b/.test(text)) {
    return "price_or_promotion";
  }
  if (/\b(?:stok|stock|ready|preorder|restock)\b/.test(text)) {
    return "stock_availability";
  }
  if (/\b(?:kondisi|deskripsi|detail|ukuran|material|kelengkapan|kekurangan|kelebihan)\b/.test(text)) {
    return "product_detail";
  }
  return "unknown";
}

function inferRequiredFacts(domainQuestionType) {
  const facts = {
    catalog_search: ["catalog"],
    price_or_promotion: ["catalog_price"],
    product_comparison: ["product_catalog_facts"],
    product_detail: ["product_description"],
    product_manufacturing_origin: ["product_description"],
    product_recommendation: ["product_catalog_facts"],
    return_policy: ["store_policy"],
    shipment_tracking: ["tracking_data"],
    shipping_origin: ["store_shipping_origin"],
    shipping_transaction: ["shipping_or_payment_policy"],
    stock_availability: ["catalog_stock"],
    store_background: ["store_background"],
    transaction_status: ["verified_order_data"],
  };
  return facts[domainQuestionType] || [];
}

function hasImplicitPreviousProductReference(text, hasRecentProducts) {
  if (!hasRecentProducts) return false;
  const reference = text.match(
    /\b(?:produk|barang|robot)?\s*(?:itu|tadi|tersebut)(?:nya)?\b|\b(?:keduanya|ketiganya|keempatnya)\b|^(?:kalau\s+)?yang\b|^mana\s+yang\b/,
  );
  const namesNewProductBeforeReference = reference
    ? hasSpecificProductSearchTerms(text.slice(0, reference.index))
    : false;
  const hasProductDecision =
    /\b(?:bagus(?:nya)?|worth it|mending|pilih|murah|mahal|harga(?:nya)?|promo(?:nya)?|diskon(?:nya)?|ready|stok(?:nya)?|kondisi(?:nya)?|detail(?:nya)?|bahan(?:nya)?|material|spesifikasi(?:nya)?|spek(?:nya)?|kekurangan(?:nya)?|kelebihan(?:nya)?)\b/.test(
      text,
    );
  return Boolean(reference) && !namesNewProductBeforeReference && hasProductDecision;
}

export function buildQuestionUnderstanding(question = "", context = {}) {
  const text = normalizeIndonesianCommerceText(question)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  const linguistic =
    context.linguisticAnalysis || analyzeIndonesianQuestion(question);
  const compactLinguistic = compactLinguisticAnalysis(linguistic);
  const entities = linguistic.entities || {};
  const explicitIntent = String(context.explicitIntent || "");
  const domainQuestionType = inferDomainQuestionType(text, explicitIntent);
  const baseScope =
    context.productQueryScope || resolveProductQueryScope(question);
  const productTerms = Array.isArray(entities.product_terms)
    ? entities.product_terms.filter(Boolean)
    : [];
  const hasProductNoun =
    /\b(?:produk|barang|robot|item|mainan|figure|figur)(?:nya)?\b/.test(text);
  const implicitPreviousReference = hasImplicitPreviousProductReference(
    text,
    Boolean(context.hasRecentProducts),
  );

  let referenceScope = "unspecified";
  if (baseScope === "previous") {
    referenceScope = "previous_products";
  } else if (
    context.hasPageProduct &&
    /\b(?:produk|barang|robot|item|figure|figur)(?:nya)?\s+ini\b|\byang\s+ini\b/.test(
      text,
    )
  ) {
    referenceScope = "current_page";
  } else if (domainQuestionType === "store_background") {
    referenceScope = "store";
  } else if (implicitPreviousReference) {
    referenceScope = "previous_products";
  } else if (productTerms.length) {
    referenceScope = "specific_product";
  } else if (baseScope === "catalog") {
    referenceScope = "catalog";
  }

  let subjectType = "unknown";
  if (domainQuestionType === "store_background") {
    subjectType = "store";
  } else if (
    ["transaction_status", "return_policy"].includes(domainQuestionType)
  ) {
    subjectType = "order";
  } else if (domainQuestionType === "shipment_tracking") {
    subjectType = "shipment";
  } else if (
    ["shipping_origin", "shipping_transaction"].includes(domainQuestionType)
  ) {
    subjectType = "shipping";
  } else if (
    PRODUCT_INTENTS.has(explicitIntent) ||
    domainQuestionType.startsWith("product_") ||
    productTerms.length ||
    hasProductNoun ||
    referenceScope === "previous_products" ||
    referenceScope === "current_page"
  ) {
    subjectType = "product";
  } else if (compactLinguistic.subject === "Robot Jadul") {
    subjectType = "store";
  }

  const mentionsOrigin =
    /\b(?:asal(?:nya)?|berasal|dari mana)\b/.test(text);
  const hasExplicitOriginMeaning = [
    "product_manufacturing_origin",
    "shipping_origin",
    "store_background",
  ].includes(domainQuestionType);
  const needsOriginClarification =
    mentionsOrigin &&
    !hasExplicitOriginMeaning &&
    !context.hasPending &&
    (subjectType === "product" ||
      hasProductNoun);

  const confidence = needsOriginClarification
    ? 0.55
    : domainQuestionType !== "unknown"
      ? 0.95
      : Number(linguistic.syntax?.confidence || 0.45);

  return {
    subject_type: subjectType,
    domain_question_type: domainQuestionType,
    reference_scope: referenceScope,
    required_facts: inferRequiredFacts(domainQuestionType),
    confidence,
    needs_clarification: needsOriginClarification,
    clarification_kind: needsOriginClarification ? "origin_meaning" : "",
  };
}

export function compactQuestionUnderstanding(frame = {}) {
  return {
    subject_type: String(frame.subject_type || "unknown"),
    domain_question_type: String(frame.domain_question_type || "unknown"),
    reference_scope: String(frame.reference_scope || "unspecified"),
    required_facts: Array.isArray(frame.required_facts)
      ? frame.required_facts.slice(0, 4).map(String)
      : [],
    confidence: Math.max(0, Math.min(1, Number(frame.confidence || 0))),
    needs_clarification: Boolean(frame.needs_clarification),
    ...(frame.clarification_kind
      ? { clarification_kind: String(frame.clarification_kind) }
      : {}),
  };
}
