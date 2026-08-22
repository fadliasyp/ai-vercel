import {
  buildSemanticRouterMessages,
  parseSemanticRouterOutput,
  preserveExplicitTopicSwitch,
} from "./semanticRouter.js";

const DEFAULT_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MODEL = "mistral-small-latest";
const DEFAULT_TIMEOUT_MS = 4500;
const DEFAULT_VISION_TIMEOUT_MS = 15000;

function enabledValue(value = "") {
  return !/^(?:0|false|no|off)$/i.test(String(value || "").trim());
}

function modelList(value = "") {
  return [
    ...new Set(
      String(value || "")
        .split(/[,\r\n]+/)
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveMistralConfig(env = process.env) {
  const apiKey = String(env.MISTRAL_API_KEY || "").trim();
  return {
    enabled: Boolean(apiKey) && enabledValue(env.MISTRAL_ENABLED),
    apiKey,
    endpoint: String(env.MISTRAL_API_URL || "").trim() || DEFAULT_ENDPOINT,
    model: String(env.MISTRAL_MODEL || "").trim() || DEFAULT_MODEL,
    fallbackModels: modelList(env.MISTRAL_FALLBACK_MODELS),
    timeoutMs: positiveInteger(env.MISTRAL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

export function resolveMistralVisionConfig(env = process.env) {
  const base = resolveMistralConfig(env);
  return {
    ...base,
    enabled:
      base.enabled && enabledValue(env.MISTRAL_VISION_ENABLED ?? "true"),
    model: String(env.MISTRAL_VISION_MODEL || "").trim() || base.model,
    fallbackModels: modelList(env.MISTRAL_VISION_FALLBACK_MODELS),
    timeoutMs: positiveInteger(
      env.MISTRAL_VISION_TIMEOUT_MS,
      DEFAULT_VISION_TIMEOUT_MS,
    ),
  };
}

export class MistralError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "MistralError";
    this.code = options.code || "MISTRAL_ERROR";
    this.status = Number(options.status || 0);
    this.retryable = Boolean(options.retryable);
    this.retryAfter = options.retryAfter || null;
    this.cause = options.cause;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function errorCode(status) {
  if (status === 401) return "MISTRAL_UNAUTHORIZED";
  if (status === 403) return "MISTRAL_ACCESS_DENIED";
  if (status === 429) return "MISTRAL_RATE_LIMITED";
  return "MISTRAL_HTTP_ERROR";
}

function responseContent(payload = {}) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part === "string" ? part : part?.text || ""))
    .join("");
}

async function requestMistralJson({
  messages,
  config,
  fetchImpl = globalThis.fetch,
  maxTokens = 900,
  temperature = 0,
} = {}) {
  if (!config?.enabled || !config.apiKey) {
    throw new MistralError("MISTRAL_API_KEY belum diset", {
      code: "MISTRAL_NOT_CONFIGURED",
    });
  }
  if (typeof fetchImpl !== "function") {
    throw new MistralError("Fetch API tidak tersedia", {
      code: "MISTRAL_FETCH_UNAVAILABLE",
    });
  }

  const models = [
    ...new Set([config.model, ...(config.fallbackModels || [])].filter(Boolean)),
  ];
  let lastError = null;

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const response = await fetchImpl(config.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature,
          max_tokens: maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new MistralError(
          payload?.message ||
            payload?.error?.message ||
            `Mistral HTTP ${response.status}`,
          {
            code: errorCode(response.status),
            status: response.status,
            retryable: isRetryableStatus(response.status),
            retryAfter: response.headers?.get?.("retry-after") || null,
          },
        );
      }

      const content = responseContent(payload);
      if (!content) {
        throw new MistralError("Respons Mistral tidak memiliki content", {
          code: "MISTRAL_EMPTY_RESPONSE",
          retryable: true,
        });
      }

      return { content, model: payload?.model || model, usage: payload?.usage };
    } catch (error) {
      lastError =
        error?.name === "AbortError"
          ? new MistralError(`Mistral timeout setelah ${config.timeoutMs} ms`, {
              code: "MISTRAL_TIMEOUT",
              retryable: true,
              cause: error,
            })
          : error instanceof MistralError
            ? error
            : new MistralError(error?.message || "Mistral request gagal", {
                code: "MISTRAL_NETWORK_ERROR",
                retryable: true,
                cause: error,
              });

      const canTryNext =
        index < models.length - 1 &&
        (lastError.retryable || lastError.code === "MISTRAL_EMPTY_RESPONSE");
      if (!canTryNext) throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new MistralError("Mistral request gagal");
}

export async function generateVisionJsonWithMistral({
  prompt,
  images = [],
  config = resolveMistralVisionConfig(),
  fetchImpl = globalThis.fetch,
  maxTokens = 1000,
} = {}) {
  const content = [{ type: "text", text: String(prompt || "") }];
  for (const image of images) {
    if (!image?.data || !image?.mimeType) continue;
    if (image.label) {
      content.push({ type: "text", text: String(image.label) });
    }
    content.push({
      type: "image_url",
      image_url: `data:${image.mimeType};base64,${image.data}`,
    });
  }

  const result = await requestMistralJson({
    messages: [{ role: "user", content }],
    config,
    fetchImpl,
    maxTokens,
    temperature: 0,
  });
  const raw = String(result.content || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return { ...result, json: JSON.parse(raw) };
  } catch (error) {
    throw new MistralError("Output vision Mistral bukan JSON valid", {
      code: "MISTRAL_INVALID_OUTPUT",
      cause: error,
    });
  }
}

export async function classifyCommerceWithMistral({
  question,
  context = {},
  config = resolveMistralConfig(),
  fetchImpl = globalThis.fetch,
} = {}) {
  const result = await requestMistralJson({
    messages: buildSemanticRouterMessages({ question, context }),
    config,
    fetchImpl,
    maxTokens: 900,
    temperature: 0,
  });
  let route;

  try {
    route = parseSemanticRouterOutput(result.content);
  } catch (error) {
    throw new MistralError(error.message, {
      code: "MISTRAL_INVALID_OUTPUT",
      cause: error,
    });
  }

  return {
    ...preserveExplicitTopicSwitch(question, route),
    provider: "mistral",
    model: result.model,
    usage: result.usage || null,
  };
}

function reportStatus(onStatus, status) {
  if (typeof onStatus !== "function") return;
  try {
    onStatus(status);
  } catch {}
}

export async function naturalizeWithMistral(
  payload,
  userQuestion,
  {
    config = resolveMistralConfig(),
    fetchImpl = globalThis.fetch,
    onStatus = null,
  } = {},
) {
  try {
    const editable = {
      intro: String(payload?.intro || ""),
      message: String(payload?.message || ""),
      reasoning_text: String(payload?.reasoning_text || ""),
      closing: String(payload?.closing || ""),
    };
    if (!Object.values(editable).some(Boolean)) {
      reportStatus(onStatus, {
        provider: "mistral",
        naturalized: false,
        reason: "no_editable_text",
      });
      return payload;
    }

    const prompt = `Poles gaya bahasa jawaban ecommerce berikut agar natural, ramah, dan langsung menjawab pelanggan.

ATURAN WAJIB:
- Pertahankan arti dan seluruh fakta 100%.
- Jangan mengubah atau menghapus nama produk, angka, harga, stok, diskon, URL, kebijakan, maupun detail produk.
- Jangan menambah fakta, janji, rekomendasi, atau pertanyaan lanjutan baru.
- Pertahankan field yang kosong tetap kosong.
- Kembalikan JSON valid dengan field intro, message, reasoning_text, dan closing saja.

PERTANYAAN PELANGGAN:
${String(userQuestion || "").slice(0, 1200)}

JAWABAN TERVERIFIKASI:
${JSON.stringify(editable)}`;
    const result = await requestMistralJson({
      messages: [{ role: "user", content: prompt }],
      config,
      fetchImpl,
      maxTokens: 1200,
      temperature: 0.2,
    });
    const parsed = JSON.parse(result.content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new MistralError("Output naturalizer Mistral bukan object", {
        code: "MISTRAL_INVALID_OUTPUT",
      });
    }

    const candidate = { ...payload };
    for (const field of Object.keys(editable)) {
      if (typeof parsed[field] !== "string") {
        throw new MistralError(`Field ${field} dari Mistral tidak valid`, {
          code: "MISTRAL_INVALID_OUTPUT",
        });
      }
      candidate[field] = parsed[field];
    }

    reportStatus(onStatus, {
      provider: "mistral",
      model: result.model,
      naturalized: true,
      reason: "success",
    });
    return candidate;
  } catch (error) {
    reportStatus(onStatus, {
      provider: "mistral",
      naturalized: false,
      reason:
        error?.code === "MISTRAL_TIMEOUT"
          ? "timeout"
          : `error_${Number(error?.status || 0) || "unknown"}`,
    });
    console.error("MISTRAL NATURALIZER ERROR:", error?.message || error);
    return payload;
  }
}
