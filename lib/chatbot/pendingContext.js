const PENDING_INTENTS = Object.freeze({
  checkout_flow: "shipping_transaction",
  compare: "compare",
  shipment_tracking: "shipment_tracking",
  shipping_quote: "shipping_transaction",
  transaction_status: "transaction_status",
});

const QUESTION_SIGNAL =
  /\b(?:apa|apakah|berapa|bagaimana|gimana|kenapa|kok|bisa|boleh|jual|cari|cek|promo|diskon|stok|ready|rekomendasi|retur|refund|resi|lacak|produk|barang|robot|figure|figur|detail|kondisi)\b/i;

export function shouldInterruptPendingFlow({
  pending = null,
  explicitIntent = "",
  explicitMethod = "",
  detectedIntent = "",
  detectedScore = 0,
  localScope = "ambiguous",
  question = "",
} = {}) {
  const expectedIntent = PENDING_INTENTS[pending?.type];
  if (!expectedIntent) return false;

  if (explicitIntent) {
    if (explicitIntent !== expectedIntent) return true;
    return Boolean(
      pending.type === "shipping_quote" &&
        explicitMethod === "explicit_shipping_insurance_rule",
    );
  }
  if (localScope === "out_of_scope") return true;

  const words = String(question || "").trim().split(/\s+/).filter(Boolean);
  const confidentNewQuestion =
    words.length >= 2 &&
    QUESTION_SIGNAL.test(question) &&
    Number(detectedScore || 0) >= 0.8;

  return Boolean(
    confidentNewQuestion &&
      detectedIntent &&
      detectedIntent !== expectedIntent,
  );
}
