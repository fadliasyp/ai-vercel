import { evaluateAnswerCoverage } from "./answerCoverage.js";
import {
  isSafeNaturalizedResponse,
  naturalizeResponseWithGroq,
  resolveGroqNaturalizerConfig,
} from "./responseNaturalizer.js";

const MODES = new Set(["legacy", "shadow", "active"]);
const PRODUCT_GOALS = new Set([
  "product_search",
  "recommendation",
  "material",
  "dimensions",
  "product_condition",
  "completeness",
  "price",
  "promo",
  "stock",
]);
const POLICY_GOALS = new Set([
  "bulk_discount",
  "free_shipping",
  "insurance",
  "packing",
  "shipping_estimate",
  "same_day",
  "shipping_origin",
  "shipping_coverage",
  "store_location",
  "store_hours",
  "cod",
  "payment_methods",
  "return_policy",
  "refund",
  "how_to_buy",
  "order_processing",
  "admin_help",
]);

function cleanMode(value = "") {
  const mode = String(value || "").trim().toLowerCase();
  return MODES.has(mode) ? mode : "legacy";
}

export function resolveLlmAssistantConfig(env = process.env) {
  const naturalizer = resolveGroqNaturalizerConfig(env);
  const mode = cleanMode(env.LLM_LED_ASSISTANT_MODE);

  return {
    mode,
    enabled: mode !== "legacy" && naturalizer.enabled,
    naturalizer,
  };
}

export function shouldUseLlmUnderstanding(
  question = "",
  { mode = "legacy", routerEnabled = false } = {},
) {
  if (cleanMode(mode) === "legacy" || !routerEnabled) return false;
  const text = String(question || "").trim();
  return Boolean(text) &&
    !/^(?:halo|hai|hi|hello|ass?alamualaikum)[!?.]*$/i.test(text);
}

function hasGoal(goals, accepted) {
  return goals.some((goal) => accepted.has(goal));
}

export function buildLlmToolPlan(
  understanding = null,
  { internationalShipping = false } = {},
) {
  if (!understanding || understanding.scope !== "in_scope") return [];

  const goals = Array.isArray(understanding.goals)
    ? understanding.goals
    : [];
  const plan = [];
  const add = (tool, reason) => {
    if (!plan.some((step) => step.tool === tool)) {
      plan.push({ tool, reason });
    }
  };

  if (understanding.requires_product || hasGoal(goals, PRODUCT_GOALS)) {
    add("woo_catalog", "Mencari produk dan membaca fakta katalog terverifikasi");
  }
  if (goals.includes("shipping_quote")) {
    if (internationalShipping) {
      add(
        "store_policy",
        "Pengiriman internasional harus dikonfirmasi dengan admin",
      );
    } else {
      add("shipping_quote", "Menghitung ongkir dari kota dan kecamatan tujuan");
    }
  }
  if (hasGoal(goals, POLICY_GOALS)) {
    add("store_policy", "Membaca kebijakan toko dan transaksi yang berlaku");
  }
  if (goals.includes("transaction_status")) {
    add("woo_order", "Memeriksa status pesanan setelah verifikasi pelanggan");
  }
  if (goals.includes("shipment_tracking")) {
    add("shipment_tracking", "Melacak perjalanan paket dari data kurir");
  }

  return plan;
}

function boundedText(value, maxLength = 1200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function buildVerifiedFactPacket(payload = {}) {
  const products = (Array.isArray(payload.products) ? payload.products : [])
    .slice(0, 6)
    .map((product) => ({
      id: product?.id ?? null,
      name: boundedText(product?.name, 200),
      price: Number(product?.numericPrice || product?.effectivePrice || 0) || null,
      regular_price: Number(product?.regular_price || 0) || null,
      sale_price: Number(product?.sale_price || 0) || null,
      stock: boundedText(product?.stock, 30) || null,
      stock_quantity:
        product?.stockQuantity !== null &&
        product?.stockQuantity !== undefined &&
        Number.isFinite(Number(product.stockQuantity))
          ? Number(product.stockQuantity)
          : null,
      condition: boundedText(product?.condition, 500) || null,
      dimensions:
        product?.dimensions && typeof product.dimensions === "object"
          ? product.dimensions
          : null,
      link: boundedText(product?.link, 500) || null,
    }));

  return {
    response_type: boundedText(payload.type, 40) || "text",
    products,
    payment_methods: (Array.isArray(payload.methods) ? payload.methods : [])
      .map((method) => boundedText(method?.name || method, 100))
      .filter(Boolean)
      .slice(0, 20),
    has_admin_handoff: Boolean(payload.admin_handoff),
  };
}

function structuredSnapshot(payload = {}) {
  return JSON.stringify({
    type: payload.type || "text",
    products: payload.products || [],
    options: payload.options || [],
    methods: payload.methods || [],
    steps: payload.steps || [],
    winner: payload.winner ?? null,
    admin_handoff: payload.admin_handoff || null,
  });
}

function textSnapshot(payload = {}) {
  return JSON.stringify({
    intro: payload.intro || "",
    message: payload.message || "",
    reasoning_text: payload.reasoning_text || "",
    closing: payload.closing || "",
    actions: payload.actions || [],
  });
}

export function validateLlmComposedAnswer(
  question = "",
  original = {},
  candidate = {},
) {
  const before = evaluateAnswerCoverage(question, original);
  const after = evaluateAnswerCoverage(question, candidate);
  const structurePreserved =
    structuredSnapshot(original) === structuredSnapshot(candidate);
  const factsPreserved = isSafeNaturalizedResponse(original, candidate);
  const coveragePreserved = after.coverage >= before.coverage;

  return {
    accepted: structurePreserved && factsPreserved && coveragePreserved,
    structure_preserved: structurePreserved,
    facts_preserved: factsPreserved,
    coverage_before: before.coverage,
    coverage_after: after.coverage,
  };
}

export async function runLlmAnswerComposer({
  payload,
  question = "",
  intent = "general",
  conversationContext = {},
  actionCandidates = [],
  config = resolveLlmAssistantConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!config.enabled) {
    return {
      payload,
      meta: { mode: config.mode, status: "disabled", accepted: false },
    };
  }

  let composerStatus = null;
  const candidate = await naturalizeResponseWithGroq(payload, {
    userQuestion: question,
    intent,
    conversationContext,
    actionCandidates,
    config: config.naturalizer,
    fetchImpl,
    verifiedFacts: buildVerifiedFactPacket(payload),
    onStatus(status) {
      composerStatus = status;
    },
  });
  const validation = validateLlmComposedAnswer(question, payload, candidate);
  const changed = textSnapshot(payload) !== textSnapshot(candidate);
  const accepted = Boolean(composerStatus?.naturalized) && validation.accepted;

  return {
    payload: config.mode === "active" && accepted ? candidate : payload,
    meta: {
      mode: config.mode,
      status: accepted
        ? config.mode === "shadow"
          ? "shadow_accepted"
          : "active_accepted"
        : composerStatus?.reason || "rejected",
      accepted,
      changed,
      provider: composerStatus?.provider || "template",
      model: composerStatus?.model,
      safety_issue: composerStatus?.validation_reason || null,
      repaired_fields: composerStatus?.repaired_fields || [],
      validation,
    },
  };
}
