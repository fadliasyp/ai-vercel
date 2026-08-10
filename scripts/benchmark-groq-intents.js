import "dotenv/config";

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyCommerceWithGroq,
  resolveGroqRouterConfig,
} from "../lib/chatbot/groq.js";
import { SEMANTIC_ROUTER_INTENTS } from "../lib/chatbot/semanticRouter.js";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_DATASET_PATH = path.join(
  ROOT_DIR,
  "benchmarks",
  "intent-hard-test.json",
);
const DEFAULT_RESULT_PATH = path.join(
  ROOT_DIR,
  "benchmarks",
  "results",
  "groq-semantic-router.json",
);
const DEFAULT_CHECKPOINT_PATH = path.join(
  ROOT_DIR,
  "benchmarks",
  "results",
  ".groq-checkpoint.json",
);
const EXPECTED_CASE_COUNT = 104;
const DEFAULT_DELAY_MS = 5500;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1;
const FATAL_HTTP_STATUSES = new Set([400, 401, 403, 404]);

function parsePositiveInteger(value, fallback, { allowZero = false } = {}) {
  const number = Number.parseInt(String(value ?? ""), 10);
  const minimum = allowZero ? 0 : 1;
  return Number.isFinite(number) && number >= minimum ? number : fallback;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--fresh") {
      options.fresh = true;
      continue;
    }
    if (argument === "--dataset" && next) {
      options.datasetPath = path.resolve(next);
      index += 1;
      continue;
    }
    if (argument === "--output" && next) {
      options.resultPath = path.resolve(next);
      index += 1;
      continue;
    }
    if (argument === "--model" && next) {
      options.model = String(next).trim();
      index += 1;
      continue;
    }
    if (argument === "--delay-ms" && next) {
      options.delayMs = parsePositiveInteger(next, DEFAULT_DELAY_MS);
      index += 1;
      continue;
    }
    if (argument === "--timeout-ms" && next) {
      options.timeoutMs = parsePositiveInteger(next, DEFAULT_TIMEOUT_MS);
      index += 1;
      continue;
    }
    if (argument === "--retries" && next) {
      options.retries = parsePositiveInteger(next, DEFAULT_RETRIES, {
        allowZero: true,
      });
      index += 1;
      continue;
    }
    if (argument === "--limit" && next) {
      options.limit = parsePositiveInteger(next, null);
      index += 1;
    }
  }

  return {
    datasetPath: options.datasetPath || DEFAULT_DATASET_PATH,
    resultPath: options.resultPath || DEFAULT_RESULT_PATH,
    checkpointPath: DEFAULT_CHECKPOINT_PATH,
    model: options.model || null,
    delayMs: options.delayMs || DEFAULT_DELAY_MS,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    retries:
      options.retries === undefined ? DEFAULT_RETRIES : options.retries,
    limit: options.limit || null,
    fresh: Boolean(options.fresh),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values, percentage) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentage / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

function parseRetryAfter(value) {
  if (!value) return 0;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function validateDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.cases)) {
    throw new Error("Fixture benchmark harus memiliki array cases");
  }
  if (dataset.cases.length !== EXPECTED_CASE_COUNT) {
    throw new Error(
      `Fixture harus berisi ${EXPECTED_CASE_COUNT} kasus, ditemukan ${dataset.cases.length}`,
    );
  }

  const expectedLabels = new Set(SEMANTIC_ROUTER_INTENTS);
  const actualLabels = new Set();

  dataset.cases.forEach((testCase, index) => {
    if (!String(testCase.question || "").trim()) {
      throw new Error(`Pertanyaan kosong pada kasus ke-${index + 1}`);
    }
    if (!expectedLabels.has(testCase.expected_intent)) {
      throw new Error(
        `Label tidak dikenal pada kasus ke-${index + 1}: ${testCase.expected_intent}`,
      );
    }
    actualLabels.add(testCase.expected_intent);
  });

  const missingLabels = SEMANTIC_ROUTER_INTENTS.filter(
    (label) => !actualLabels.has(label),
  );
  if (missingLabels.length) {
    throw new Error(`Fixture tidak memuat intent: ${missingLabels.join(", ")}`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadCheckpoint({
  checkpointPath,
  datasetHash,
  model,
  fresh,
}) {
  if (fresh) {
    await unlink(checkpointPath).catch(() => {});
    return [];
  }

  try {
    const checkpoint = await readJson(checkpointPath);
    if (
      checkpoint.dataset_hash !== datasetHash ||
      checkpoint.model !== model ||
      !Array.isArray(checkpoint.results)
    ) {
      console.log("Checkpoint lama diabaikan karena dataset/model berubah.");
      return [];
    }
    return checkpoint.results;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`Checkpoint tidak dapat dibaca: ${error.message}`);
    }
    return [];
  }
}

function resolveModelsEndpoint(chatEndpoint) {
  const url = new URL(chatEndpoint);
  url.pathname = url.pathname.replace(
    /\/chat\/completions\/?$/,
    "/models",
  );
  return url.toString();
}

async function preflightGroq(config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(resolveModelsEndpoint(config.endpoint), {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.message ||
        `Groq HTTP ${response.status}`;
      throw new Error(`Groq preflight ditolak (${response.status}): ${message}`);
    }

    const modelIds = Array.isArray(payload?.data)
      ? payload.data.map((model) => model?.id).filter(Boolean)
      : [];
    if (!modelIds.includes(config.model)) {
      throw new Error(
        `Model ${config.model} tidak tersedia untuk API key/project ini`,
      );
    }

    console.log(
      `Preflight Groq berhasil: ${modelIds.length} model tersedia, ${config.model} dapat digunakan.`,
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Groq preflight timeout setelah ${config.timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function classifyWithRetry({
  testCase,
  config,
  retries,
  delayMs,
}) {
  const startedAt = Date.now();
  let attempts = 0;
  let lastError;

  while (attempts <= retries) {
    attempts += 1;
    try {
      const route = await classifyCommerceWithGroq({
        question: testCase.question,
        config,
      });

      return {
        question: testCase.question,
        expected_intent: testCase.expected_intent,
        predicted_intent: route.intent,
        scope: route.scope,
        confidence: route.confidence,
        needs_clarification: route.needs_clarification,
        entities: route.entities,
        correct: route.intent === testCase.expected_intent,
        latency_ms: Date.now() - startedAt,
        attempts,
        usage: route.usage || null,
        error: null,
      };
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempts > retries) break;

      const retryDelay = Math.max(
        delayMs,
        parseRetryAfter(error.retryAfter),
      );
      console.warn(
        `  Percobaan ${attempts} gagal (${error.code || "ERROR"}), ulang dalam ${retryDelay} ms`,
      );
      await sleep(retryDelay);
    }
  }

  return {
    question: testCase.question,
    expected_intent: testCase.expected_intent,
    predicted_intent: null,
    scope: null,
    confidence: null,
    needs_clarification: null,
    entities: null,
    correct: false,
    latency_ms: Date.now() - startedAt,
    attempts,
    usage: null,
    error: {
      code: lastError?.code || "UNKNOWN_ERROR",
      status: Number(lastError?.status || 0),
      message: lastError?.message || "Unknown error",
    },
  };
}

function buildMetrics(results) {
  const successful = results.filter((result) => !result.error);
  const correct = results.filter((result) => result.correct);
  const latencies = results.map((result) => result.latency_ms);
  const confusion = Object.fromEntries(
    SEMANTIC_ROUTER_INTENTS.map((label) => [label, {}]),
  );
  const scopeDistribution = {};

  for (const result of results) {
    const predicted = result.predicted_intent || "__error__";
    confusion[result.expected_intent][predicted] =
      (confusion[result.expected_intent][predicted] || 0) + 1;
    if (result.scope) {
      scopeDistribution[result.scope] =
        (scopeDistribution[result.scope] || 0) + 1;
    }
  }

  const perIntent = {};
  for (const label of SEMANTIC_ROUTER_INTENTS) {
    const tp = results.filter(
      (result) =>
        result.expected_intent === label &&
        result.predicted_intent === label,
    ).length;
    const fp = results.filter(
      (result) =>
        result.expected_intent !== label &&
        result.predicted_intent === label,
    ).length;
    const fn = results.filter(
      (result) =>
        result.expected_intent === label &&
        result.predicted_intent !== label,
    ).length;
    const support = results.filter(
      (result) => result.expected_intent === label,
    ).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 =
      precision + recall
        ? (2 * precision * recall) / (precision + recall)
        : 0;

    perIntent[label] = {
      support,
      correct: tp,
      precision: round(precision),
      recall: round(recall),
      f1: round(f1),
    };
  }

  const usage = successful.reduce(
    (total, result) => {
      const current = result.usage || {};
      const promptDetails = current.prompt_tokens_details || {};
      total.prompt_tokens += Number(current.prompt_tokens || 0);
      total.completion_tokens += Number(current.completion_tokens || 0);
      total.cached_tokens += Number(promptDetails.cached_tokens || 0);
      total.total_tokens += Number(
        current.total_tokens ||
          Number(current.prompt_tokens || 0) +
            Number(current.completion_tokens || 0),
      );
      return total;
    },
    {
      prompt_tokens: 0,
      completion_tokens: 0,
      cached_tokens: 0,
      total_tokens: 0,
    },
  );

  const macroF1 =
    Object.values(perIntent).reduce(
      (sum, metric) => sum + metric.f1,
      0,
    ) / SEMANTIC_ROUTER_INTENTS.length;

  return {
    total: results.length,
    successes: successful.length,
    failures: results.length - successful.length,
    correct: correct.length,
    accuracy: round(results.length ? correct.length / results.length : 0),
    macro_f1: round(macroF1),
    low_confidence_below_0_6: successful.filter(
      (result) => Number(result.confidence) < 0.6,
    ).length,
    scope_distribution: scopeDistribution,
    latency_ms: {
      average: round(
        latencies.length
          ? latencies.reduce((sum, value) => sum + value, 0) /
              latencies.length
          : 0,
        2,
      ),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    usage,
    per_intent: perIntent,
    confusion,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const datasetText = await readFile(options.datasetPath, "utf8");
  const dataset = JSON.parse(datasetText);
  validateDataset(dataset);

  const baseConfig = resolveGroqRouterConfig();
  if (!baseConfig.apiKey) {
    throw new Error("GROQ_API_KEY belum tersedia di .env");
  }

  const config = {
    ...baseConfig,
    enabled: true,
    model: options.model || baseConfig.model,
    timeoutMs: options.timeoutMs,
  };
  await preflightGroq(config);

  const datasetHash = sha256(datasetText);
  const selectedCases = options.limit
    ? dataset.cases.slice(0, options.limit)
    : dataset.cases;
  const results = await loadCheckpoint({
    checkpointPath: options.checkpointPath,
    datasetHash,
    model: config.model,
    fresh: options.fresh,
  });

  if (results.length > selectedCases.length) {
    results.length = selectedCases.length;
  }

  console.log(
    `Benchmark Groq ${config.model}: ${selectedCases.length} kasus, mulai dari ${results.length + 1}`,
  );
  console.log(
    `Jeda ${options.delayMs} ms, timeout ${config.timeoutMs} ms, retry ${options.retries}x`,
  );

  for (let index = results.length; index < selectedCases.length; index += 1) {
    const testCase = selectedCases[index];
    const requestStartedAt = Date.now();
    const result = await classifyWithRetry({
      testCase,
      config,
      retries: options.retries,
      delayMs: options.delayMs,
    });

    if (
      result.error &&
      FATAL_HTTP_STATUSES.has(Number(result.error.status || 0))
    ) {
      throw new Error(
        `Groq menolak request (${result.error.status} ${result.error.code}): ${result.error.message}. Benchmark dihentikan agar tidak mengulang error yang sama.`,
      );
    }

    results.push(result);

    await writeJson(options.checkpointPath, {
      dataset_hash: datasetHash,
      model: config.model,
      updated_at: new Date().toISOString(),
      results,
    });

    const prediction = result.predicted_intent || result.error?.code || "ERROR";
    console.log(
      `[${index + 1}/${selectedCases.length}] ${testCase.expected_intent} -> ${prediction} | confidence=${result.confidence ?? "-"} | ${result.latency_ms} ms`,
    );

    if (index < selectedCases.length - 1) {
      const elapsed = Date.now() - requestStartedAt;
      await sleep(Math.max(0, options.delayMs - elapsed));
    }
  }

  const metrics = buildMetrics(results);
  const report = {
    generated_at: new Date().toISOString(),
    provider: "groq",
    model: config.model,
    dataset: {
      source: dataset.source || null,
      sha256: datasetHash,
      full_case_count: dataset.cases.length,
      evaluated_case_count: selectedCases.length,
    },
    settings: {
      delay_ms: options.delayMs,
      timeout_ms: config.timeoutMs,
      retries: options.retries,
    },
    metrics,
    errors: results.filter((result) => !result.correct),
    results,
  };

  await writeJson(options.resultPath, report);
  await unlink(options.checkpointPath).catch(() => {});

  console.log("");
  console.log(`Accuracy : ${(metrics.accuracy * 100).toFixed(2)}%`);
  console.log(`Macro F1 : ${(metrics.macro_f1 * 100).toFixed(2)}%`);
  console.log(
    `Success  : ${metrics.successes}/${metrics.total} (${metrics.failures} API failure)`,
  );
  console.log(
    `Latency  : avg ${metrics.latency_ms.average} ms, p95 ${metrics.latency_ms.p95} ms`,
  );
  console.log(`Tokens   : ${metrics.usage.total_tokens}`);
  console.log(`Report   : ${options.resultPath}`);
}

main().catch((error) => {
  console.error(`BENCHMARK ERROR: ${error.message}`);
  process.exitCode = 1;
});
