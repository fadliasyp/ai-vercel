import {
  buildSemanticRouterMessages,
  parseSemanticRouterOutput,
  preserveExplicitTopicSwitch,
} from "./semanticRouter.js";

const DEFAULT_GROQ_ENDPOINT =
  "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const DEFAULT_GROQ_FALLBACK_MODELS = ["qwen/qwen3.6-27b"];
const DEFAULT_TIMEOUT_MS = 4500;

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ];
}

function modelList(value, fallback = []) {
  const configured = String(value || "")
    .split(/[,\r\n]+/)
    .map((model) => model.trim())
    .filter(Boolean);
  return uniqueStrings(configured.length ? configured : fallback);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isGroqRouterEnabled(env = process.env) {
  const configured = String(env.GROQ_ROUTER_ENABLED || "").trim();
  if (configured) {
    return /^(?:1|true|yes|on)$/i.test(configured);
  }
  return Boolean(String(env.GROQ_API_KEY || "").trim());
}

export function resolveGroqRouterConfig(env = process.env) {
  return {
    enabled: isGroqRouterEnabled(env),
    apiKey: String(env.GROQ_API_KEY || "").trim(),
    endpoint:
      String(env.GROQ_API_URL || "").trim() || DEFAULT_GROQ_ENDPOINT,
    model: modelList(env.GROQ_ROUTER_MODEL, [DEFAULT_GROQ_MODEL])[0],
    fallbackModels: modelList(
      env.GROQ_ROUTER_FALLBACK_MODELS,
      DEFAULT_GROQ_FALLBACK_MODELS,
    ),
    timeoutMs: positiveInteger(
      env.GROQ_ROUTER_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
  };
}

export class GroqRouterError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "GroqRouterError";
    this.code = options.code || "GROQ_ROUTER_ERROR";
    this.status = Number(options.status || 0);
    this.retryable = Boolean(options.retryable);
    this.retryAfter = options.retryAfter || null;
    this.cause = options.cause;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function responseErrorMessage(payload, status) {
  return (
    payload?.error?.message ||
    payload?.message ||
    `Groq HTTP ${status || "error"}`
  );
}

function responseErrorCode(status) {
  if (status === 401) return "GROQ_UNAUTHORIZED";
  if (status === 403) return "GROQ_ACCESS_DENIED";
  if (status === 429) return "GROQ_RATE_LIMITED";
  return "GROQ_HTTP_ERROR";
}

function reasoningEffortForModel(model = "") {
  const normalized = String(model || "").toLowerCase();
  if (normalized.startsWith("qwen/")) return "none";
  if (normalized.startsWith("openai/gpt-oss-")) return "low";
  return null;
}

export async function classifyCommerceWithGroq({
  question,
  context = {},
  config = resolveGroqRouterConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!config.enabled) {
    throw new GroqRouterError("Groq semantic router belum diaktifkan", {
      code: "GROQ_DISABLED",
    });
  }
  if (!config.apiKey) {
    throw new GroqRouterError("GROQ_API_KEY belum diset", {
      code: "GROQ_NOT_CONFIGURED",
    });
  }
  if (typeof fetchImpl !== "function") {
    throw new GroqRouterError("Fetch API tidak tersedia", {
      code: "GROQ_FETCH_UNAVAILABLE",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const reasoningEffort = reasoningEffortForModel(config.model);
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: buildSemanticRouterMessages({ question, context }),
        response_format: { type: "json_object" },
        ...(reasoningEffort
          ? { reasoning_effort: reasoningEffort }
          : {}),
        temperature: 0,
        max_completion_tokens: 350,
        stream: false,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new GroqRouterError(
        responseErrorMessage(payload, response.status),
        {
          code: responseErrorCode(response.status),
          status: response.status,
          retryable: isRetryableStatus(response.status),
          retryAfter: response.headers?.get?.("retry-after") || null,
        },
      );
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new GroqRouterError("Respons Groq tidak memiliki content", {
        code: "GROQ_EMPTY_RESPONSE",
        retryable: true,
      });
    }

    let route;
    try {
      route = parseSemanticRouterOutput(content);
    } catch (error) {
      throw new GroqRouterError(error.message, {
        code: "GROQ_INVALID_OUTPUT",
        retryable: false,
        cause: error,
      });
    }

    return {
      ...preserveExplicitTopicSwitch(question, route),
      provider: "groq",
      model: payload?.model || config.model,
      usage: payload?.usage || null,
    };
  } catch (error) {
    if (error instanceof GroqRouterError) throw error;
    if (error?.name === "AbortError") {
      throw new GroqRouterError(
        `Groq timeout setelah ${config.timeoutMs} ms`,
        {
          code: "GROQ_TIMEOUT",
          retryable: true,
          cause: error,
        },
      );
    }
    throw new GroqRouterError(error?.message || "Groq request gagal", {
      code: "GROQ_NETWORK_ERROR",
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function shouldTryFallbackModel(error) {
  return (
    error?.code === "GROQ_RATE_LIMITED" ||
    error?.code === "GROQ_EMPTY_RESPONSE" ||
    error?.code === "GROQ_INVALID_OUTPUT" ||
    (error?.code === "GROQ_HTTP_ERROR" && error?.retryable)
  );
}

export async function classifyCommerceWithGroqFallback({
  question,
  context = {},
  config = resolveGroqRouterConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  const models = uniqueStrings([
    config.model,
    ...(config.fallbackModels || []),
  ]);
  let lastError = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const route = await classifyCommerceWithGroq({
        question,
        context,
        config: { ...config, model },
        fetchImpl,
      });

      return {
        ...route,
        fallback_from:
          index > 0 ? models.slice(0, index) : [],
      };
    } catch (error) {
      lastError = error;
      if (!shouldTryFallbackModel(error) || index === models.length - 1) {
        throw error;
      }
    }
  }

  throw lastError;
}
