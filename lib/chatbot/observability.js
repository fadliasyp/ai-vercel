import { createHash, randomUUID } from "node:crypto";

const STATUSES = new Set(["success", "error"]);

function safeLabel(value, fallback = "unknown", maxLength = 64) {
  const text = String(value || "").trim().toLowerCase();
  return new RegExp(`^[a-z0-9_-]{1,${maxLength}}$`).test(text)
    ? text
    : fallback;
}

function safeModel(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z0-9._:/-]{1,100}$/.test(text) ? text : "unknown";
}

function boundedInteger(value, max = 86_400_000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(0, Math.round(number)));
}

function normalizedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
}

export function buildChatMetric(
  input = {},
  {
    salt =
      process.env.OBSERVABILITY_HASH_SALT ||
      process.env.FEEDBACK_HASH_SALT ||
      "robot-jadul-observability-v1",
    now = () => new Date(),
    uuid = randomUUID,
  } = {},
) {
  const sessionId = String(input.sessionId || "").trim();
  const status = String(input.status || "success").trim().toLowerCase();

  if (!sessionId || sessionId.length > 200) throw new Error("INVALID_SESSION");
  if (!STATUSES.has(status)) throw new Error("INVALID_STATUS");

  return {
    id: uuid(),
    session_hash: createHash("sha256")
      .update(`${salt}:${sessionId}`)
      .digest("hex"),
    status,
    intent: safeLabel(input.intent),
    intent_method: safeLabel(input.intentMethod),
    intent_score: normalizedScore(input.intentScore),
    response_type: safeLabel(input.responseType),
    assistant_provider: safeLabel(input.assistantProvider),
    assistant_model: safeModel(input.assistantModel),
    assistant_reason: safeLabel(input.assistantReason),
    router_provider: safeLabel(input.routerProvider),
    router_model: safeModel(input.routerModel),
    latency_ms: boundedInteger(input.latencyMs),
    product_count: boundedInteger(input.productCount, 1000),
    option_count: boundedInteger(input.optionCount, 1000),
    action_count: boundedInteger(input.actionCount, 1000),
    error_code: safeLabel(input.errorCode, "none"),
    created_at: now().toISOString(),
  };
}
