// lib/chatbot/gemini.js

import { GoogleGenAI } from "@google/genai";
import {
  buildSemanticRouterMessages,
  parseSemanticRouterOutput,
  preserveExplicitTopicSwitch,
} from "./semanticRouter.js";

const geminiApiKey =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_TIMEOUT_MS = Math.max(
  10000,
  Number.parseInt(process.env.GEMINI_TIMEOUT_MS || "30000", 10) || 30000,
);
const GEMINI_MAX_MODEL_ATTEMPTS = Math.min(
  5,
  Math.max(
    1,
    Number.parseInt(process.env.GEMINI_MAX_MODEL_ATTEMPTS || "3", 10) || 3,
  ),
);
const GEMINI_MODEL_COOLDOWN_MS = Math.max(
  1000,
  Number.parseInt(process.env.GEMINI_MODEL_COOLDOWN_MS || "60000", 10) ||
    60000,
);
const GEMINI_DAILY_MODEL_COOLDOWN_MS = Math.max(
  GEMINI_MODEL_COOLDOWN_MS,
  Number.parseInt(
    process.env.GEMINI_DAILY_MODEL_COOLDOWN_MS || String(6 * 60 * 60 * 1000),
    10,
  ) || 6 * 60 * 60 * 1000,
);
const geminiModelCooldowns = new Map();

export const genai = geminiApiKey
  ? new GoogleGenAI({ apiKey: geminiApiKey })
  : null;

function uniqueList(items = []) {
  const out = [];
  for (const item of items.flat()) {
    const value = String(item || "").trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function splitModelList(raw = "") {
  return String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function envModel(name, fallback) {
  return String(process.env[name] || "").trim() || fallback;
}

function envModelList(name, fallback = []) {
  return uniqueList([splitModelList(process.env[name] || ""), fallback]);
}

export const GEMINI_MODELS = {
  FAST: envModel("GEMINI_FAST_MODEL", "gemini-3.1-flash-lite"),
  SMART: envModel("GEMINI_SMART_MODEL", "gemini-2.5-flash"),
  VISION: envModel("GEMINI_VISION_MODEL", "gemini-2.5-flash"),
  SCOPE: envModel("GEMINI_SCOPE_MODEL", "gemini-3.1-flash-lite"),
};

export const GEMINI_MODEL_FALLBACKS = {
  FAST: envModelList("GEMINI_FAST_MODELS", [
    GEMINI_MODELS.FAST,
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
  ]),
  SMART: envModelList("GEMINI_SMART_MODELS", [
    GEMINI_MODELS.SMART,
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
  ]),
  VISION: envModelList("GEMINI_VISION_MODELS", [
    GEMINI_MODELS.VISION,
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
  ]),
  TEXT: envModelList("GEMINI_TEXT_MODELS", [
    envModel("GEMINI_TEXT_MODEL", GEMINI_MODELS.FAST),
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.5-flash",
  ]),
};

export const GEMINI_MODE = {
  // enableSemanticParse: true,
  enableSemanticParse: false,
  enableRecommendationExplain: true,
  enableCompareExplain: true,
  enableStepExplain: true,
};

function getStatusCode(err) {
  return (
    err?.status ||
    err?.statusCode ||
    err?.response?.status ||
    err?.cause?.status ||
    0
  );
}

function geminiErrorText(err) {
  let details = "";
  try {
    details = JSON.stringify(
      err?.errorDetails ||
        err?.details ||
        err?.response?.data ||
        err?.cause ||
        "",
    );
  } catch {}

  return `${String(err?.message || err || "")} ${details}`.toLowerCase();
}

export function classifyGeminiFailure(err) {
  const status = Number(getStatusCode(err));
  const text = geminiErrorText(err);
  const quotaLimited =
    status === 429 ||
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("resource exhausted") ||
    text.includes("too many requests");
  const modelScoped =
    /per[_ -]?model|permodel|model[_ -]?quota|model-specific/.test(text);
  const projectScoped =
    quotaLimited &&
    !modelScoped &&
    (/spend|billing|project[_ -]?wide/.test(text) ||
      /perproject(?!permodel)/.test(text));
  const daily =
    quotaLimited &&
    /per[_ -]?day|perday|daily|requests?perday|\brpd\b|quota_exceeded/.test(
      text,
    );
  const unavailable =
    [404, 408, 409, 500, 502, 503, 504].includes(status) ||
    text.includes("overloaded") ||
    text.includes("unavailable") ||
    text.includes("deadline") ||
    text.includes("timeout") ||
    text.includes("not found") ||
    text.includes("not supported") ||
    text.includes("not available");
  const invalidModel =
    [400, 404].includes(status) &&
    /model|not found|not supported|not available/.test(text);

  return {
    status,
    quotaLimited,
    modelScoped,
    projectScoped,
    daily,
    tryAnotherModel:
      !projectScoped && (quotaLimited || unavailable || invalidModel),
    cooldownMs: daily
      ? GEMINI_DAILY_MODEL_COOLDOWN_MS
      : quotaLimited || unavailable || invalidModel
        ? GEMINI_MODEL_COOLDOWN_MS
        : 0,
  };
}

export function shouldTryAnotherGeminiModel(
  err,
  { attempt = 1, maxAttempts = GEMINI_MAX_MODEL_ATTEMPTS } = {},
) {
  const failure = classifyGeminiFailure(err);
  if (!failure.tryAnotherModel || attempt >= maxAttempts) return false;

  // An unknown 429 gets one alternate model. Explicit per-model quotas may
  // use the full bounded pool; project-wide limits switch provider instead.
  if (failure.quotaLimited && !failure.modelScoped) {
    return attempt < Math.min(maxAttempts, 2);
  }

  return true;
}

function setGeminiModelCooldown(model, failure, now = Date.now()) {
  if (!model || !failure?.cooldownMs) return;
  geminiModelCooldowns.set(model, now + failure.cooldownMs);
}

function availableGeminiModels(models, now = Date.now()) {
  return models.filter((model) => {
    const cooldownUntil = Number(geminiModelCooldowns.get(model) || 0);
    if (cooldownUntil <= now) {
      geminiModelCooldowns.delete(model);
      return true;
    }
    return false;
  });
}

function allGeminiModelsCoolingDown(models, now = Date.now()) {
  const retryAt = Math.min(
    ...models.map((model) => Number(geminiModelCooldowns.get(model) || Infinity)),
  );
  const error = new Error("Semua model Gemini yang sesuai sedang cooldown");
  error.code = "GEMINI_MODELS_COOLING_DOWN";
  error.status = 429;
  error.retryAfter = Number.isFinite(retryAt)
    ? Math.max(1, Math.ceil((retryAt - now) / 1000))
    : null;
  return error;
}

function modelsFor(modelOrModels) {
  const list = Array.isArray(modelOrModels)
    ? modelOrModels
    : splitModelList(modelOrModels || "");

  const first = list[0];
  if (list.length === 1 && first === GEMINI_MODELS.FAST) {
    return GEMINI_MODEL_FALLBACKS.FAST;
  }
  if (list.length === 1 && first === GEMINI_MODELS.SMART) {
    return GEMINI_MODEL_FALLBACKS.SMART;
  }
  if (list.length === 1 && first === GEMINI_MODELS.VISION) {
    return GEMINI_MODEL_FALLBACKS.VISION;
  }

  return uniqueList(list);
}

export function geminiResponseText(resp) {
  return resp?.text || resp?.response?.text?.() || "";
}

function reportGeminiStatus(onStatus, status) {
  if (typeof onStatus !== "function") return;
  try {
    onStatus(status);
  } catch {}
}

export async function geminiGenerateContentWithFallback({
  model,
  models,
  contents,
  config,
  taskName = "gemini",
  client = genai,
}) {
  if (!client) return null;

  const modelPool = modelsFor(models || model);
  const candidates = availableGeminiModels(modelPool).slice(
    0,
    GEMINI_MAX_MODEL_ATTEMPTS,
  );
  if (!candidates.length) throw allGeminiModelsCoolingDown(modelPool);

  const deadline = Date.now() + GEMINI_TIMEOUT_MS;
  let lastError = null;
  const attemptedModels = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const remainingMs = deadline - Date.now();
    if (remainingMs < 10000) break;
    attemptedModels.push(candidate);

    try {
      const response = await client.models.generateContent({
        model: candidate,
        contents,
        config: {
          ...(config || {}),
          httpOptions: {
            ...(config?.httpOptions || {}),
            timeout: Math.min(
              Number(config?.httpOptions?.timeout) || remainingMs,
              remainingMs,
            ),
          },
        },
      });
      return {
        response,
        model: candidate,
        fallbackFrom: attemptedModels.slice(0, -1),
      };
    } catch (err) {
      lastError = err;
      const failure = classifyGeminiFailure(err);
      if (failure.projectScoped) {
        modelPool.forEach((item) =>
          setGeminiModelCooldown(item, failure),
        );
      } else {
        setGeminiModelCooldown(candidate, failure);
      }
      console.error(
        `GEMINI ${taskName} ERROR on ${candidate}:`,
        err?.message || err,
      );
      if (
        !shouldTryAnotherGeminiModel(err, {
          attempt: index + 1,
          maxAttempts: candidates.length,
        })
      ) {
        break;
      }
    }
  }

  if (lastError) lastError.attemptedModels = attemptedModels;
  throw lastError || new Error(`Gemini ${taskName} failed`);
}

export async function geminiText({ model, models, prompt, temperature, taskName }) {
  const result = await geminiGenerateContentWithFallback({
    model,
    models,
    taskName: taskName || "text",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(typeof temperature === "number" ? { config: { temperature } } : {}),
  });

  return geminiResponseText(result?.response) || null;
}

export async function classifyCommerceWithGemini({
  question,
  context = {},
  generateImpl = geminiGenerateContentWithFallback,
} = {}) {
  if (
    (!genai && generateImpl === geminiGenerateContentWithFallback) ||
    !String(question || "").trim()
  ) {
    return null;
  }

  const messages = buildSemanticRouterMessages({ question, context });
  const prompt = messages
    .map(
      (message) =>
        `${String(message.role || "user").toUpperCase()}:\n${message.content}`,
    )
    .join("\n\n");
  const result = await generateImpl({
    models: GEMINI_MODEL_FALLBACKS.FAST,
    taskName: "semantic_router_fallback",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0,
      maxOutputTokens: 900,
      responseMimeType: "application/json",
    },
  });
  const route = parseSemanticRouterOutput(geminiResponseText(result?.response));

  return {
    ...preserveExplicitTopicSwitch(question, route),
    provider: "gemini",
    model: result?.model || GEMINI_MODELS.FAST,
  };
}

export async function classifyCommerceScopeWithGemini({
  question,
  lastIntent = "",
  lastTopic = "",
} = {}) {
  if (!genai || !String(question || "").trim()) return null;

  const prompt = `
Klasifikasikan pertanyaan user untuk chatbot ecommerce Robot Jadul.

IN_SCOPE jika pertanyaan berkaitan dengan:
- mencari, melihat detail, stok, harga, promo, rekomendasi, atau perbandingan produk;
- cara membeli, pembayaran, pengiriman, ongkir, asal kirim, pelacakan, status pesanan, retur;
- toko Robot Jadul, admin, alamat, jam buka, atau sapaan;
- pertanyaan lanjutan yang merujuk produk atau transaksi dari konteks sebelumnya.
- nama atau kode yang masuk akal sebagai produk koleksi, meskipun namanya tidak kamu kenal.

OUT_OF_SCOPE jika meminta pengetahuan atau layanan di luar toko, misalnya waktu saat ini,
cuaca, berita, politik, pelajaran, coding, resep, olahraga, atau obrolan umum yang tidak
berhubungan dengan produk maupun transaksi Robot Jadul.
- perhitungan matematika yang tidak berhubungan dengan harga atau transaksi;
- teks acak, rangkaian karakter tidak bermakna, atau pertanyaan yang tidak dapat dipahami.

Jangan menganggap pertanyaan sebagai pencarian produk hanya karena berisi kata umum seperti
"cari", "berapa", "bagaimana", atau "jelaskan". Jika hubungan dengan ecommerce Robot Jadul
tidak dapat dikenali dan konteks sebelumnya tidak membantu, pilih OUT_OF_SCOPE.

Balas tepat satu label saja: IN_SCOPE atau OUT_OF_SCOPE.

Konteks intent sebelumnya: ${String(lastIntent || "-").slice(0, 80)}
Konteks topik sebelumnya: ${String(lastTopic || "-").slice(0, 160)}
Pertanyaan: ${String(question || "").slice(0, 500)}
`;

  try {
    // Scope checking intentionally uses one high-quota model only. A quota or
    // availability error must not consume requests from the other model pools.
    const response = await genai.models.generateContent({
      model: GEMINI_MODELS.SCOPE,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0, maxOutputTokens: 8 },
    });

    const label = geminiResponseText(response).trim().toUpperCase();
    if (label.includes("OUT_OF_SCOPE")) return "out_of_scope";
    if (label.includes("IN_SCOPE")) return "in_scope";
    return null;
  } catch (err) {
    console.error(
      `GEMINI scope_check ERROR on ${GEMINI_MODELS.SCOPE}:`,
      err?.message || err,
    );
    return null;
  }
}

function truncateText(str = "", max = 300) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function clampText(str = "", max = 1200) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function trimEndingText(str = "", max = 240) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max).trim() + "…" : str;
}

function looksSafeHumanizedResult(original, parsed) {
  if (!parsed || typeof parsed !== "object") return false;

  const fields = ["intro", "message", "closing", "reasoning_text"];

  for (const key of fields) {
    if (parsed[key] != null && typeof parsed[key] !== "string") {
      return false;
    }
  }

  const originalHasText = fields.some((k) => String(original[k] || "").trim());
  const parsedHasText = fields.some((k) => String(parsed[k] || "").trim());

  if (originalHasText && !parsedHasText) return false;

  return true;
}

function shouldUseGemini(rawQuestion, payload) {
  if (!genai) return false;

  const q = String(rawQuestion || "")
    .trim()
    .toLowerCase();
  if (!q) return false;
  if (q.length < 10) return false;

  if (payload.type === "suggestions") return false;
  if (payload.type === "compare_reasoned") return false;
  if (payload.type === "how_to_buy") return false;

  // Untuk menghindari jawaban double di detail/rekomendasi
  if (payload.intent === "product_detail") return false;
  if (payload.intent === "recommendation") return false;
  if (payload.intent === "shipment_tracking") return false;
  if (payload.intent === "shipping_transaction") return false;
  if (payload.intent === "transaction_status") return false;

  if (
    payload.type === "products" &&
    Array.isArray(payload.products) &&
    payload.products.length > 1 &&
    !payload.reasoning_text
  ) {
    return false;
  }

  if (payload.type === "text" && payload.message) return true;

  if (
    payload.type === "products" &&
    Array.isArray(payload.products) &&
    payload.products.length === 1
  ) {
    return true;
  }

  if (payload.type === "products" && payload.reasoning_text) {
    return true;
  }

  return false;
}

export async function naturalizeWithGemini(
  payload,
  userQuestion,
  { force = false, onStatus = null } = {},
) {
  try {
    if (!genai) {
      reportGeminiStatus(onStatus, {
        provider: "gemini",
        naturalized: false,
        reason: "missing_api_key",
      });
      return payload;
    }
    if (!force && !shouldUseGemini(userQuestion, payload)) return payload;

    const safePayload = force
      ? {
          type: payload.type,
          intro: String(payload.intro || ""),
          message: String(payload.message || ""),
          closing: String(payload.closing || ""),
          reasoning_text: String(payload.reasoning_text || ""),
        }
      : {
          type: payload.type,
          intro: clampText(payload.intro || "", 300),
          message: clampText(payload.message || "", 500),
          closing: clampText(payload.closing || "", 250),
          reasoning_text: payload._noTruncateReasoning
            ? clampText(payload.reasoning_text || "", 1200)
            : truncateText(payload.reasoning_text || "", 800),
        };

    if (
      !safePayload.intro &&
      !safePayload.message &&
      !safePayload.closing &&
      !safePayload.reasoning_text
    ) {
      return payload;
    }

    const prompt = `
Kamu bertugas memoles gaya bahasa chatbot ecommerce agar terasa lebih natural seperti CS manusia.

TUGAS:
- Ubah teks agar lebih ramah, natural, sopan, dan enak dibaca.
- Pertahankan arti ASLI 100%.
- Jangan menambah fakta baru.
- Jangan menghapus fakta penting.
- Jangan mengubah nama produk, angka, harga, stok, diskon, atau detail produk.
- Jangan menambah rekomendasi baru yang tidak ada.
- Jangan menambah pertanyaan follow-up baru.
- Jangan mengubah struktur field.

Kembalikan JSON VALID SAJA tanpa markdown:
{
  "intro": "...",
  "message": "...",
  "closing": "...",
  "reasoning_text": "..."
}

DATA INPUT:
${JSON.stringify(safePayload, null, 2)}
`;

    const generated = await geminiGenerateContentWithFallback({
      models: GEMINI_MODEL_FALLBACKS.FAST,
      taskName: "naturalize",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.2, responseMimeType: "application/json" },
    });
    let txt = geminiResponseText(generated?.response);

    txt = (txt || "").trim();
    txt = txt
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      reportGeminiStatus(onStatus, {
        provider: "gemini",
        model: generated?.model,
        naturalized: false,
        reason: "invalid_output",
      });
      return payload;
    }

    if (!looksSafeHumanizedResult(payload, parsed)) {
      reportGeminiStatus(onStatus, {
        provider: "gemini",
        model: generated?.model,
        naturalized: false,
        reason: "unsafe_shape",
      });
      return payload;
    }

    const candidate = {
      ...payload,
      intro: typeof parsed.intro === "string" ? parsed.intro : payload.intro,
      message:
        typeof parsed.message === "string" ? parsed.message : payload.message,
      closing:
        typeof parsed.closing === "string"
          ? trimEndingText(parsed.closing, 240)
          : payload.closing,
      reasoning_text:
        typeof parsed.reasoning_text === "string"
          ? parsed.reasoning_text
          : payload.reasoning_text,
    };
    reportGeminiStatus(onStatus, {
      provider: "gemini",
      model: generated?.model,
      naturalized: true,
      reason: "success",
    });
    return candidate;
  } catch (err) {
    reportGeminiStatus(onStatus, {
      provider: "gemini",
      naturalized: false,
      reason: `error_${Number(getStatusCode(err)) || "unknown"}`,
    });
    console.error("NATURALIZE GEMINI ERROR:", err?.message || err);
    return payload;
  }
}

export async function explainCompareWithGemini({
  rawQuestion,
  facts,
  winner,
  reasons,
  scores,
  intent,
}) {
  if (!genai) return null;

  const prompt = `
Kamu adalah CS ecommerce Robot Jadul yang membantu user memilih robot koleksi.

TUGAS:
Tulis bagian "Ringkasan & Alasan" untuk hasil compare dua produk.

ATURAN WAJIB:
- Bahasa Indonesia natural, jelas, dan meyakinkan.
- Jangan menambah fakta baru di luar DATA.
- Jangan mengarang spesifikasi, bahan, kelengkapan, rarity, atau kondisi.
- Jika data terbatas, sebutkan secara natural bahwa penilaian berdasarkan data yang tersedia.
- Prioritaskan DATA strengths dan caveats yang diekstrak dari deskripsi WooCommerce.
- Sebutkan kelebihan dan kekurangan masing-masing produk jika datanya tersedia.
- Jika winner bernilai null, jangan memaksakan pemenang; jelaskan produk mana cocok untuk kebutuhan yang berbeda.
- Jelaskan alasan untuk Produk A dan Produk B, bukan hanya pemenang.
- Bahas minimal: stok, harga/value, kondisi, kategori/deskripsi jika tersedia.
- Tutup dengan rekomendasi praktis: pilih A kalau..., pilih B kalau...
- Jangan pakai tabel.
- Jangan pakai JSON.
- Panjang 6-12 bullet/kalimat pendek, maksimal 1600 karakter.

FORMAT OUTPUT:
Mulai langsung dari teks alasan. Boleh pakai bullet sederhana dan markdown bold.

PERTANYAAN USER:
${rawQuestion || ""}

DATA:
${JSON.stringify({ facts, winner, reasons, scores, intent }, null, 2)}
`;

  return await geminiText({
    model: GEMINI_MODELS.SMART,
    prompt,
    temperature: 0.4,
    taskName: "compare_explain",
  });
}

export async function explainStepWithGemini({ rawQuestion, step }) {
  if (!genai) return null;

  const prompt = `
Jelaskan step pembelian ini dengan bahasa sederhana.

DATA STEP:
${JSON.stringify(step, null, 2)}

PERTANYAAN USER:
${rawQuestion}
`;

  return await geminiText({
    model: GEMINI_MODELS.SMART,
    prompt,
    temperature: 0.5,
    taskName: "step_explain",
  });
}
