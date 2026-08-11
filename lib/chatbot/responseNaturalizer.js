import { resolveGroqRouterConfig } from "./groq.js";

const TEXT_FIELDS = ["intro", "message", "reasoning_text", "closing"];

function enabledFlag(value, fallback = false) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return /^(?:1|true|yes|on)$/i.test(text);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ];
}

function configuredModels(value, fallback = []) {
  const models = String(value || "")
    .split(/[,\r\n]+/)
    .map((model) => model.trim())
    .filter(Boolean);
  return uniqueStrings(models.length ? models : fallback);
}

function reasoningEffortForModel(model = "") {
  const normalized = String(model || "").toLowerCase();
  if (normalized.startsWith("qwen/")) return "none";
  if (normalized.startsWith("openai/gpt-oss-")) return "low";
  return null;
}

function parseJsonObject(value = "") {
  const text = String(value || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Naturalizer tidak mengembalikan JSON object");
  }
  return parsed;
}

function combinedText(value = {}) {
  return TEXT_FIELDS.map((field) => String(value[field] || ""))
    .filter(Boolean)
    .join("\n");
}

function protectedNumbers(text = "") {
  return (String(text).match(/\d+(?:[.,]\d+)*(?:\s*%|\s*(?:pcs|kg|cm))?/gi) || [])
    .map((value) => value.replace(/\s+/g, " ").toLowerCase())
    .sort();
}

function protectedUrls(text = "") {
  return (String(text).match(/https?:\/\/[^\s)>\]]+/gi) || [])
    .map((value) => value.replace(/[.,;!?]+$/, ""))
    .sort();
}

function protectedMarkdownPhrases(text = "") {
  return [...String(text || "").matchAll(/\*\*([^*\n]+)\*\*/g)]
    .map((match) => String(match[1] || "").trim().toLowerCase())
    .filter(Boolean);
}

function sameValues(left = [], right = []) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function rankSuggestedActions(
  fallbackActions = [],
  candidates = [],
  indexes = [],
) {
  const safeCandidates = uniqueStrings(candidates).slice(0, 8);
  if (!safeCandidates.length || !Array.isArray(indexes)) {
    return uniqueStrings(fallbackActions).slice(0, 3);
  }

  const ranked = [];
  for (const value of indexes) {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= safeCandidates.length) {
      continue;
    }
    if (!ranked.includes(safeCandidates[index])) ranked.push(safeCandidates[index]);
    if (ranked.length === 3) break;
  }

  return ranked.length
    ? ranked
    : uniqueStrings(fallbackActions).slice(0, 3);
}

function mentionedProductNames(payload = {}, text = "") {
  const normalizedText = String(text).toLowerCase();
  return (Array.isArray(payload.products) ? payload.products : [])
    .map((product) => String(product?.name || "").trim())
    .filter(
      (name) => name && normalizedText.includes(name.toLowerCase()),
    );
}

export function isSafeNaturalizedResponse(original = {}, candidate = {}) {
  for (const field of TEXT_FIELDS) {
    const before = String(original[field] || "").trim();
    const after =
      typeof candidate[field] === "string" ? candidate[field].trim() : "";

    if (!before && after) return false;
    if (before && !after) return false;
    if (after.length > Math.max(before.length * 2, before.length + 220)) {
      return false;
    }
  }

  const beforeText = combinedText(original);
  const afterText = combinedText(candidate);

  if (
    !sameValues(protectedNumbers(beforeText), protectedNumbers(afterText)) ||
    !sameValues(protectedUrls(beforeText), protectedUrls(afterText))
  ) {
    return false;
  }

  const afterLower = afterText.toLowerCase();
  return (
    mentionedProductNames(original, beforeText).every((name) =>
      afterLower.includes(name.toLowerCase()),
    ) &&
    protectedMarkdownPhrases(beforeText).every((phrase) =>
      afterLower.includes(phrase),
    )
  );
}

export function resolveGroqNaturalizerConfig(env = process.env) {
  const router = resolveGroqRouterConfig(env);
  return {
    enabled: enabledFlag(
      env.GROQ_NATURALIZER_ENABLED,
      Boolean(router.apiKey),
    ),
    apiKey: router.apiKey,
    endpoint: router.endpoint,
    model: configuredModels(env.GROQ_NATURALIZER_MODEL, [router.model])[0],
    fallbackModels: configuredModels(
      env.GROQ_NATURALIZER_FALLBACK_MODELS,
      router.fallbackModels,
    ),
    timeoutMs: positiveInteger(
      env.GROQ_NATURALIZER_TIMEOUT_MS,
      6500,
    ),
  };
}

function reportStatus(onStatus, status) {
  if (typeof onStatus !== "function") return;
  try {
    onStatus(status);
  } catch {}
}

function naturalizerInput(payload = {}) {
  return Object.fromEntries(
    TEXT_FIELDS.map((field) => [
      field,
      String(payload[field] || "").slice(
        0,
        field === "reasoning_text" ? 1800 : 800,
      ),
    ]),
  );
}

async function requestNaturalizedJson({
  payload,
  userQuestion,
  intent,
  conversationContext,
  actionCandidates,
  config,
  model,
  fetchImpl,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const reasoningEffort = reasoningEffortForModel(model);
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Kamu adalah editor akhir chatbot ecommerce Robot Jadul. " +
              "Tulis ulang teks dalam bahasa Indonesia agar terasa seperti asisten AI yang natural, ramah, singkat, dan nyambung dengan gaya bicara user. " +
              "Jawab kekhawatiran user secara langsung; jika editable_text memuat beberapa jawaban, pertahankan dan sambungkan seluruh poinnya dalam urutan yang mudah dibaca. " +
              "Gunakan aku/kamu secara wajar, hindari bahasa kaku seperti 'berikut adalah', dan jangan mengulang sapaan di tengah percakapan. " +
              "Gunakan konteks percakapan hanya untuk menjaga kesinambungan gaya dan rujukan; jangan menyimpulkan fakta baru dari konteks. " +
              "Sesuaikan empati secara wajar dengan customer_state; state itu hanya petunjuk nada, bukan sumber fakta atau alasan untuk menambah janji. " +
              "Boleh memperhalus susunan kalimat, tetapi jangan berlebihan memakai emoji atau bahasa gaul. " +
              "Pertahankan seluruh fakta, nama produk, angka, harga, stok, diskon, status, dan URL persis. " +
              "Jangan menambah fakta, produk, janji, opini, pertanyaan, atau ajakan follow-up baru. " +
              "Jika safe_action_candidates tersedia, urutkan maksimal tiga indeks pertanyaan lanjutan yang paling mungkin dibutuhkan user setelah jawaban ini. Jangan membuat pertanyaan baru dan jangan memilih tindakan yang mengulang permintaan user. " +
              "Jangan mengubah field kosong menjadi berisi. Kembalikan JSON valid saja.",
          },
          {
            role: "user",
            content: JSON.stringify({
              question: String(userQuestion || "").slice(0, 500),
              intent: String(intent || "general"),
              conversation_context: {
                previous_intent: String(
                  conversationContext?.lastIntent || "",
                ).slice(0, 80),
                previous_topic: String(
                  conversationContext?.lastTopic || "",
                ).slice(0, 160),
                had_pending_step: Boolean(conversationContext?.hasPending),
                customer_state: String(
                  conversationContext?.customerState || "neutral",
                ).slice(0, 20),
                recent_products: Array.isArray(
                  conversationContext?.recentProducts,
                )
                  ? conversationContext.recentProducts
                      .map((name) => String(name || "").slice(0, 180))
                      .filter(Boolean)
                      .slice(0, 5)
                  : [],
                ...(conversationContext?.linguistic &&
                typeof conversationContext.linguistic === "object"
                  ? {
                      language_analysis: {
                        subject: String(
                          conversationContext.linguistic.subject || "",
                        ).slice(0, 100),
                        predicate: String(
                          conversationContext.linguistic.predicate || "",
                        ).slice(0, 80),
                        object: String(
                          conversationContext.linguistic.object || "",
                        ).slice(0, 160),
                        negated: Boolean(
                          conversationContext.linguistic.negated,
                        ),
                        question_type: String(
                          conversationContext.linguistic.question_type || "",
                        ).slice(0, 30),
                      },
                    }
                  : {}),
              },
              editable_text: naturalizerInput(payload),
              safe_action_candidates: uniqueStrings(actionCandidates)
                .slice(0, 8)
                .map((action, index) => ({ index, action })),
              output_schema: {
                intro: "string",
                message: "string",
                reasoning_text: "string",
                closing: "string",
                action_indexes: "number[]; max 3; hanya indeks safe_action_candidates",
              },
            }),
          },
        ],
        response_format: { type: "json_object" },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        temperature: 0,
        max_completion_tokens: 850,
        stream: false,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(
        data?.error?.message || `Groq naturalizer HTTP ${response.status}`,
      );
      error.status = response.status;
      throw error;
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq naturalizer menghasilkan respons kosong");

    return parseJsonObject(content);
  } finally {
    clearTimeout(timeout);
  }
}

export async function naturalizeResponseWithGroq(
  payload,
  {
    userQuestion = "",
    intent = "general",
    conversationContext = {},
    actionCandidates = [],
    config = resolveGroqNaturalizerConfig(),
    fetchImpl = globalThis.fetch,
    onStatus = null,
  } = {},
) {
  if (!payload || typeof payload !== "object") {
    reportStatus(onStatus, {
      provider: "template",
      naturalized: false,
      reason: "invalid_payload",
    });
    return payload;
  }
  if (!config.enabled || !config.apiKey || typeof fetchImpl !== "function") {
    reportStatus(onStatus, {
      provider: "template",
      naturalized: false,
      reason: !config.enabled
        ? "disabled"
        : !config.apiKey
          ? "missing_api_key"
          : "fetch_unavailable",
    });
    return payload;
  }
  if (!combinedText(payload).trim()) {
    reportStatus(onStatus, {
      provider: "template",
      naturalized: false,
      reason: "no_editable_text",
    });
    return payload;
  }

  const models = uniqueStrings([
    config.model,
    ...(config.fallbackModels || []),
  ]);

  for (let index = 0; index < models.length; index += 1) {
    try {
      const candidate = await requestNaturalizedJson({
        payload,
        userQuestion,
        intent,
        conversationContext,
        actionCandidates,
        config,
        model: models[index],
        fetchImpl,
      });

      if (!isSafeNaturalizedResponse(payload, candidate)) {
        reportStatus(onStatus, {
          provider: "groq",
          model: models[index],
          naturalized: false,
          reason: "unsafe_rewrite_rejected",
        });
        return payload;
      }

      reportStatus(onStatus, {
        provider: "groq",
        model: models[index],
        naturalized: true,
        reason: "success",
      });

      const rankedActions = rankSuggestedActions(
        payload.actions,
        actionCandidates,
        candidate.action_indexes,
      );

      return {
        ...payload,
        ...Object.fromEntries(
          TEXT_FIELDS.map((field) => [
            field,
            String(candidate[field] || "").trim(),
          ]),
        ),
        ...(rankedActions.length ? { actions: rankedActions } : {}),
      };
    } catch (error) {
      const canFallback =
        error?.status === 429 ||
        error?.status === 408 ||
        error?.name === "AbortError" ||
        Number(error?.status || 0) >= 500;
      const isLast = index === models.length - 1;

      if (!canFallback || isLast) {
        reportStatus(onStatus, {
          provider: "groq",
          model: models[index],
          naturalized: false,
          reason:
            error?.name === "AbortError"
              ? "timeout"
              : `error_${Number(error?.status || 0) || "unknown"}`,
        });
        console.error(
          "GROQ NATURALIZER FALLBACK:",
          error?.message || error,
        );
        return payload;
      }
    }
  }

  reportStatus(onStatus, {
    provider: "groq",
    naturalized: false,
    reason: "models_exhausted",
  });
  return payload;
}
