export const CHATBOT_INTENTS = new Set([
  "greeting",
  "product_discovery",
  "recommendation",
  "product_detail",
  "price_promo",
  "stock_availability",
  "shipping_transaction",
  "shipping_origin",
  "return_product",
  "compare",
  "transaction_status",
  "shipment_tracking",
  "general",
]);

export const DEFAULT_INTENT_ML_MIN_CONFIDENCE = 0.6;

export function normalizeIntentConfidence(value, fallback = 0) {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return fallback;
  return Math.min(1, Math.max(0, confidence));
}

export function resolveIntentMlMinConfidence(value) {
  return normalizeIntentConfidence(
    value,
    DEFAULT_INTENT_ML_MIN_CONFIDENCE,
  );
}

export function chooseHybridIntent({
  ml = null,
  rule,
  minConfidence = DEFAULT_INTENT_ML_MIN_CONFIDENCE,
} = {}) {
  const safeRule = rule || {
    intent: "general",
    method: "fallback",
    score: 0,
  };
  const threshold = resolveIntentMlMinConfidence(minConfidence);
  const mlIntent = String(ml?.intent || "").trim();
  const mlConfidence = normalizeIntentConfidence(ml?.confidence);
  const mlIntentSupported = CHATBOT_INTENTS.has(mlIntent);
  const apiMarksLowConfidence = ml?.is_low_confidence === true;

  if (
    mlIntentSupported &&
    !apiMarksLowConfidence &&
    mlConfidence >= threshold
  ) {
    return {
      intent: mlIntent,
      method: ml?.method || "ml",
      score: mlConfidence,
      ml_confidence: mlConfidence,
      ml_is_low_confidence: false,
      ...(Array.isArray(ml?.top3) ? { ml_top3: ml.top3 } : {}),
    };
  }

  return {
    intent: safeRule.intent || "general",
    method: `fallback_rule_low_confidence:${safeRule.method || "fallback"}`,
    score: normalizeIntentConfidence(safeRule.score),
    ml_confidence: mlConfidence,
    ml_intent: mlIntent || null,
    ml_is_low_confidence:
      apiMarksLowConfidence ||
      !mlIntentSupported ||
      mlConfidence < threshold,
    ...(Array.isArray(ml?.top3) ? { ml_top3: ml.top3 } : {}),
  };
}
