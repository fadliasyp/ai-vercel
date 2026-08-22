const DEFAULT_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const DEFAULT_TIMEOUT_MS = 15000;

function enabledValue(value = "") {
  return !/^(?:0|false|no|off)$/i.test(String(value || "").trim());
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveCloudflareVisionConfig(env = process.env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const apiToken = String(
    env.CLOUDFLARE_AI_API_TOKEN || env.CLOUDFLARE_AUTH_TOKEN || "",
  ).trim();
  const model = String(env.CLOUDFLARE_VISION_MODEL || "").trim() || DEFAULT_MODEL;

  return {
    enabled:
      Boolean(accountId && apiToken) &&
      enabledValue(env.CLOUDFLARE_VISION_ENABLED ?? "true"),
    accountId,
    apiToken,
    model,
    endpoint:
      String(env.CLOUDFLARE_AI_API_URL || "").trim() ||
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    timeoutMs: positiveInteger(
      env.CLOUDFLARE_VISION_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
  };
}

export class CloudflareAiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CloudflareAiError";
    this.code = options.code || "CLOUDFLARE_AI_ERROR";
    this.status = Number(options.status || 0);
    this.cause = options.cause;
  }
}

function responseText(payload = {}) {
  const result = payload?.result;
  if (typeof result === "string") return result;
  return String(result?.response || result?.text || "").trim();
}

function parseJson(text = "") {
  const raw = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const object = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(object ? object[0] : raw);
}

export async function generateVisionJsonWithCloudflare({
  prompt,
  image,
  config = resolveCloudflareVisionConfig(),
  fetchImpl = globalThis.fetch,
  maxTokens = 1000,
} = {}) {
  if (!config?.enabled) {
    throw new CloudflareAiError("Cloudflare Workers AI belum dikonfigurasi", {
      code: "CLOUDFLARE_AI_NOT_CONFIGURED",
    });
  }
  if (!image?.data || !image?.mimeType) {
    throw new CloudflareAiError("Gambar Cloudflare Workers AI tidak valid", {
      code: "CLOUDFLARE_AI_INVALID_IMAGE",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: String(prompt || ""),
        image: `data:${image.mimeType};base64,${image.data}`,
        max_tokens: maxTokens,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok || payload?.success === false) {
      const message =
        payload?.errors?.[0]?.message ||
        payload?.messages?.[0]?.message ||
        `Cloudflare Workers AI HTTP ${response.status}`;
      throw new CloudflareAiError(message, {
        code: response.status === 429
          ? "CLOUDFLARE_AI_RATE_LIMITED"
          : "CLOUDFLARE_AI_HTTP_ERROR",
        status: response.status,
      });
    }

    const text = responseText(payload);
    if (!text) {
      throw new CloudflareAiError("Respons Cloudflare Workers AI kosong", {
        code: "CLOUDFLARE_AI_EMPTY_RESPONSE",
      });
    }

    try {
      return { json: parseJson(text), model: config.model };
    } catch (error) {
      throw new CloudflareAiError(
        "Output vision Cloudflare Workers AI bukan JSON valid",
        { code: "CLOUDFLARE_AI_INVALID_OUTPUT", cause: error },
      );
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new CloudflareAiError(
        `Cloudflare Workers AI timeout setelah ${config.timeoutMs} ms`,
        { code: "CLOUDFLARE_AI_TIMEOUT", cause: error },
      );
    }
    throw error instanceof CloudflareAiError
      ? error
      : new CloudflareAiError(
          error?.message || "Cloudflare Workers AI gagal",
          { code: "CLOUDFLARE_AI_NETWORK_ERROR", cause: error },
        );
  } finally {
    clearTimeout(timeout);
  }
}
