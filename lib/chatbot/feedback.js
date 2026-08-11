import { createHash, randomUUID } from "node:crypto";

const RATINGS = new Set(["helpful", "unhelpful"]);

function safeLabel(value, fallback = "unknown") {
  const text = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,64}$/.test(text) ? text : fallback;
}

export function buildFeedbackEvent(
  input = {},
  {
    salt = process.env.FEEDBACK_HASH_SALT || "robot-jadul-feedback-v1",
    now = () => new Date(),
    uuid = randomUUID,
  } = {},
) {
  const rating = String(input.rating || "").trim().toLowerCase();
  const sessionId = String(input.sessionId || "").trim();

  if (!RATINGS.has(rating)) throw new Error("INVALID_RATING");
  if (sessionId.length < 8 || sessionId.length > 200) {
    throw new Error("INVALID_SESSION");
  }

  return {
    id: uuid(),
    session_hash: createHash("sha256")
      .update(`${salt}:${sessionId}`)
      .digest("hex"),
    rating,
    intent: safeLabel(input.intent),
    response_type: safeLabel(input.responseType),
    assistant_provider: safeLabel(input.assistantProvider),
    assistant_reason: safeLabel(input.assistantReason),
    created_at: now().toISOString(),
  };
}
