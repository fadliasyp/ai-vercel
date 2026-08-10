import "dotenv/config";

import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildImageBenchmarkMetrics,
  evaluateImageBenchmarkCase,
  validateImageBenchmarkDataset,
} from "../lib/chatbot/imageBenchmark.js";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_DATASET_PATH = path.join(
  ROOT_DIR,
  "benchmarks",
  "image-search",
  "dataset.json",
);
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT_DIR,
  "benchmarks",
  "results",
  "image-search-report.json",
);
const DEFAULT_CHECKPOINT_PATH = path.join(
  ROOT_DIR,
  "benchmarks",
  "results",
  ".image-search-checkpoint.json",
);
const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function positiveInteger(value, fallback, allowZero = false) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  const minimum = allowZero ? 0 : 1;
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function parseArgs(argv) {
  const options = {
    delayMs: 5000,
    timeoutMs: 85000,
    retries: 1,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = argv[index + 1];

    if (argument === "--fresh") options.fresh = true;
    else if (argument === "--validate-only") options.validateOnly = true;
    else if (argument === "--dataset" && next) {
      options.datasetPath = path.resolve(next);
      index += 1;
    } else if (argument === "--output" && next) {
      options.outputPath = path.resolve(next);
      index += 1;
    } else if (argument === "--endpoint" && next) {
      options.endpoint = String(next).trim();
      index += 1;
    } else if (argument === "--source" && next) {
      options.sourceType = String(next).trim();
      index += 1;
    } else if (argument === "--view" && next) {
      options.viewType = String(next).trim();
      index += 1;
    } else if (argument === "--case" && next) {
      options.caseId = String(next).trim();
      index += 1;
    } else if (argument === "--limit" && next) {
      options.limit = positiveInteger(next, null);
      index += 1;
    } else if (argument === "--delay-ms" && next) {
      options.delayMs = positiveInteger(next, 5000, true);
      index += 1;
    } else if (argument === "--timeout-ms" && next) {
      options.timeoutMs = positiveInteger(next, 85000);
      index += 1;
    } else if (argument === "--retries" && next) {
      options.retries = positiveInteger(next, 1, true);
      index += 1;
    }
  }

  return {
    datasetPath: options.datasetPath || DEFAULT_DATASET_PATH,
    outputPath: options.outputPath || DEFAULT_OUTPUT_PATH,
    checkpointPath: DEFAULT_CHECKPOINT_PATH,
    endpoint: options.endpoint || null,
    sourceType: options.sourceType || null,
    viewType: options.viewType || null,
    caseId: options.caseId || null,
    limit: options.limit || null,
    delayMs: options.delayMs,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
    fresh: Boolean(options.fresh),
    validateOnly: Boolean(options.validateOnly),
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveImagePath(datasetPath, imagePath) {
  const datasetDir = path.dirname(datasetPath);
  const resolved = path.resolve(datasetDir, imagePath);
  const relative = path.relative(datasetDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path foto keluar dari folder dataset: ${imagePath}`);
  }
  return resolved;
}

async function validateImageFiles(datasetPath, cases) {
  for (const testCase of cases) {
    const imagePath = resolveImagePath(datasetPath, testCase.image);
    const extension = path.extname(imagePath).toLowerCase();
    if (!MIME_TYPES[extension]) {
      throw new Error(`${testCase.id}: format foto tidak didukung`);
    }
    const imageStat = await stat(imagePath);
    if (!imageStat.isFile()) {
      throw new Error(`${testCase.id}: image bukan file`);
    }
    if (imageStat.size > 5 * 1024 * 1024) {
      throw new Error(`${testCase.id}: ukuran foto melebihi 5 MB`);
    }
    const content = await readFile(imagePath);
    const validSignature =
      (extension === ".png" &&
        content.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )) ||
      ((extension === ".jpg" || extension === ".jpeg") &&
        content[0] === 0xff &&
        content[1] === 0xd8 &&
        content[2] === 0xff) ||
      (extension === ".webp" &&
        content.subarray(0, 4).toString("ascii") === "RIFF" &&
        content.subarray(8, 12).toString("ascii") === "WEBP");
    if (!validSignature) {
      throw new Error(`${testCase.id}: isi file tidak cocok dengan format foto`);
    }
  }
}

function selectCases(dataset, options) {
  let cases = dataset.cases.filter(
    (testCase) => testCase.enabled !== false,
  );
  if (options.sourceType) {
    cases = cases.filter(
      (testCase) => testCase.source_type === options.sourceType,
    );
  }
  if (options.viewType) {
    cases = cases.filter(
      (testCase) => testCase.view_type === options.viewType,
    );
  }
  if (options.caseId) {
    cases = cases.filter((testCase) => testCase.id === options.caseId);
  }
  if (options.limit) cases = cases.slice(0, options.limit);
  return cases;
}

async function datasetFingerprint(datasetText, datasetPath, cases) {
  const hash = createHash("sha256").update(datasetText);
  for (const testCase of cases) {
    const imagePath = resolveImagePath(datasetPath, testCase.image);
    hash.update(testCase.id);
    hash.update(await readFile(imagePath));
  }
  return hash.digest("hex");
}

async function imageBody(datasetPath, testCase) {
  const imagePath = resolveImagePath(datasetPath, testCase.image);
  const extension = path.extname(imagePath).toLowerCase();
  const content = await readFile(imagePath);
  const benchmarkImageName =
    testCase.expose_filename === true
      ? path.basename(imagePath)
      : `benchmark-upload${extension}`;
  return {
    question:
      String(testCase.question || "").trim() ||
      "Tolong carikan produk yang sama atau paling mirip dengan foto ini.",
    image: `data:${MIME_TYPES[extension]};base64,${content.toString("base64")}`,
    imageName: benchmarkImageName,
    history: [],
  };
}

async function invokeEndpoint(endpoint, body, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": `image_benchmark_${Date.now()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { statusCode: response.status, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function invokeLocalHandler(body, timeoutMs) {
  const { default: handler } = await import("../api/ask-image.js");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Handler lokal timeout setelah ${timeoutMs} ms`)),
      timeoutMs,
    );
    const req = {
      method: "POST",
      url: "/api/ask-image",
      headers: {
        "x-session-id": `image_benchmark_${Date.now()}`,
      },
      body,
    };
    const res = {
      statusCode: 200,
      setHeader() {},
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(payload) {
        clearTimeout(timeout);
        resolve({ statusCode: this.statusCode, payload });
        return payload;
      },
      end() {
        clearTimeout(timeout);
        resolve({ statusCode: this.statusCode, payload: null });
      },
    };

    Promise.resolve(handler(req, res)).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function runCase(testCase, options) {
  const startedAt = Date.now();
  const body = await imageBody(options.datasetPath, testCase);
  let attempts = 0;
  let lastError = null;
  let lastStatusCode = 0;
  let lastPayload = null;

  while (attempts <= options.retries) {
    attempts += 1;
    try {
      const response = options.endpoint
        ? await invokeEndpoint(options.endpoint, body, options.timeoutMs)
        : await invokeLocalHandler(body, options.timeoutMs);
      lastStatusCode = response.statusCode;
      lastPayload = response.payload;

      if (
        response.statusCode === 429 ||
        response.statusCode >= 500
      ) {
        const error = new Error(
          response.payload?.message ||
            `Image API HTTP ${response.statusCode}`,
        );
        error.code = `HTTP_${response.statusCode}`;
        error.retryable = true;
        throw error;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const error = new Error(
          response.payload?.message ||
            `Image API HTTP ${response.statusCode}`,
        );
        error.code = `HTTP_${response.statusCode}`;
        throw error;
      }

      const visionEvaluated =
        response.payload?.match_confidence?.visually_reranked === true &&
        response.payload?.image_analysis?.analysis_fallback !== true;
      if (!visionEvaluated) {
        const error = new Error(
          "Vision rerank tidak tersedia. Kemungkinan kuota Gemini habis atau waktu proses tidak cukup.",
        );
        error.code = "VISION_UNAVAILABLE";
        throw error;
      }

      return {
        result: evaluateImageBenchmarkCase({
          testCase,
          payload: response.payload,
          statusCode: response.statusCode,
          latencyMs: Date.now() - startedAt,
        }),
        attempts,
      };
    } catch (error) {
      lastError = error;
      const retryable =
        error?.retryable ||
        error?.name === "AbortError" ||
        /timeout|fetch|network/i.test(error?.message || "");
      if (!retryable || attempts > options.retries) break;
      await sleep(Math.max(1000, options.delayMs));
    }
  }

  return {
    result: evaluateImageBenchmarkCase({
      testCase,
      payload: lastPayload,
      statusCode: lastStatusCode,
      latencyMs: Date.now() - startedAt,
      error: {
        code: lastError?.code || lastError?.name || "IMAGE_API_ERROR",
        message: lastError?.message || "Image API error",
      },
    }),
    attempts,
  };
}

function productionGate(metrics, results) {
  const overall = metrics.overall;
  const internetCount = results.filter(
    (result) => result.source_type === "internet",
  ).length;
  const cropCount = results.filter(
    (result) => result.view_type === "crop",
  ).length;
  const checks = {
    at_least_30_positive_cases: overall.positive_cases >= 30,
    at_least_5_negative_cases: overall.negative_cases >= 5,
    at_least_10_internet_cases: internetCount >= 10,
    at_least_10_crop_cases: cropCount >= 10,
    top1_at_least_80_percent: overall.top1_accuracy >= 0.8,
    top3_at_least_95_percent: overall.top3_accuracy >= 0.95,
    false_confident_at_most_5_percent:
      overall.false_confident_rate <= 0.05,
    api_success_at_least_95_percent:
      overall.total > 0 &&
      overall.successes / overall.total >= 0.95,
    p95_latency_at_most_60_seconds:
      overall.latency_ms.p95 > 0 &&
      overall.latency_ms.p95 <= 60000,
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
  };
}

async function loadCheckpoint({
  checkpointPath,
  fingerprint,
  selectedCaseIds,
  target,
  fresh,
}) {
  if (fresh) {
    await unlink(checkpointPath).catch(() => {});
    return [];
  }

  try {
    const checkpoint = await readJson(checkpointPath);
    if (
      checkpoint.fingerprint !== fingerprint ||
      checkpoint.target !== target ||
      JSON.stringify(checkpoint.selected_case_ids) !==
        JSON.stringify(selectedCaseIds) ||
      !Array.isArray(checkpoint.results)
    ) {
      return [];
    }
    return checkpoint.results;
  } catch {
    return [];
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const datasetText = await readFile(options.datasetPath, "utf8");
  const dataset = JSON.parse(datasetText);
  const summary = validateImageBenchmarkDataset(dataset, {
    allowEmpty: options.validateOnly,
  });
  const selectedCases = selectCases(dataset, options);

  if (!options.validateOnly && !selectedCases.length) {
    throw new Error("Tidak ada case aktif yang cocok dengan filter benchmark");
  }

  await validateImageFiles(
    options.datasetPath,
    dataset.cases.filter((testCase) => testCase.enabled !== false),
  );

  if (options.validateOnly) {
    console.log(
      `Dataset valid: ${summary.enabled} aktif, ${summary.disabled} nonaktif.`,
    );
    return;
  }

  const fingerprint = await datasetFingerprint(
    datasetText,
    options.datasetPath,
    selectedCases,
  );
  const target = options.endpoint || "local-handler";
  const selectedCaseIds = selectedCases.map((testCase) => testCase.id);
  const results = await loadCheckpoint({
    checkpointPath: options.checkpointPath,
    fingerprint,
    selectedCaseIds,
    target,
    fresh: options.fresh,
  });

  console.log(
    `Benchmark image search: ${selectedCases.length} case, target ${target}`,
  );
  console.log(`Melanjutkan dari case ${results.length + 1}`);

  for (let index = results.length; index < selectedCases.length; index += 1) {
    const testCase = selectedCases[index];
    const requestStartedAt = Date.now();
    const { result, attempts } = await runCase(testCase, options);
    result.attempts = attempts;

    if (result.error?.code === "VISION_UNAVAILABLE") {
      throw new Error(
        `${testCase.id}: ${result.error.message} Checkpoint dipertahankan; lanjutkan saat vision tersedia.`,
      );
    }

    results.push(result);

    await writeJson(options.checkpointPath, {
      fingerprint,
      target,
      selected_case_ids: selectedCaseIds,
      updated_at: new Date().toISOString(),
      results,
    });

    console.log(
      `[${index + 1}/${selectedCases.length}] ${testCase.id} | expected rank=${result.expected_rank ?? "-"} | confidence=${result.confidence_level} | ${result.latency_ms} ms`,
    );

    if (index < selectedCases.length - 1) {
      const elapsed = Date.now() - requestStartedAt;
      await sleep(Math.max(0, options.delayMs - elapsed));
    }
  }

  const metrics = buildImageBenchmarkMetrics(results);
  const report = {
    generated_at: new Date().toISOString(),
    target,
    dataset: {
      path: options.datasetPath,
      fingerprint,
      total_cases: dataset.cases.length,
      evaluated_cases: selectedCases.length,
    },
    settings: {
      delay_ms: options.delayMs,
      timeout_ms: options.timeoutMs,
      retries: options.retries,
      source_filter: options.sourceType,
      view_filter: options.viewType,
      case_filter: options.caseId,
    },
    production_gate: productionGate(metrics, results),
    metrics,
    errors: results.filter(
      (result) => result.error || !result.correct,
    ),
    results,
  };

  await writeJson(options.outputPath, report);
  await unlink(options.checkpointPath).catch(() => {});

  const overall = metrics.overall;
  console.log("");
  console.log(
    `Top-1          : ${(overall.top1_accuracy * 100).toFixed(2)}%`,
  );
  console.log(
    `Top-3          : ${(overall.top3_accuracy * 100).toFixed(2)}%`,
  );
  console.log(
    `False confident: ${(overall.false_confident_rate * 100).toFixed(2)}%`,
  );
  console.log(
    `Latency        : avg ${round(overall.latency_ms.average)} ms, p95 ${overall.latency_ms.p95} ms`,
  );
  console.log(
    `Production gate: ${report.production_gate.passed ? "PASS" : "BELUM LULUS"}`,
  );
  console.log(`Report         : ${options.outputPath}`);
}

main().catch((error) => {
  console.error(`IMAGE BENCHMARK ERROR: ${error.message}`);
  process.exitCode = 1;
});
