import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluateAnswerCoverage } from "../lib/chatbot/answerCoverage.js";

let localHandlerPromise = null;
const COD_POLICY_TEXT =
  String(process.env.COD_ENABLED || "false").toLowerCase() === "true"
    ? "COD / bayar di tempat tersedia"
    : "COD / bayar di tempat belum tersedia";

const CASES = [
  { id: "greeting", question: "halo", expectedIntent: "greeting" },
  {
    id: "store_visit",
    question:
      "Saya mau cek langsung kelengkapannya. Toko fisiknya di Blok M Square lantai berapa dan blok apa? Hari ini buka sampai jam berapa?",
    expectedIntent: "general",
    expectedType: "text",
    expectedCustomerState: "neutral",
    minActions: 3,
    requiredText: ["Blok M Square", "3A", "Blok A", "11.00", "20.00"],
  },
  {
    question: "maks budget saya 500rb, dapet apa",
    expectedIntent: "price_promo",
    maxProductPrice: 500000,
  },
  {
    id: "secure_shipping_policy",
    question: "barang ini bisa diasuransikan?",
    expectedIntent: "shipping_transaction",
    expectedCustomerState: "neutral",
    expectedAssistantProvider: "groq",
    allowedAssistantReasons: ["success", "unsafe_rewrite_rejected"],
    minActions: 3,
    requiredText: ["asuransi"],
  },
  {
    id: "safe_payment_policy",
    question:
      "Barangnya mahal sampai 8 juta. Bisa COD tidak? Metode pembayaran apa saja yang aman?",
    expectedIntent: "shipping_transaction",
    expectedType: "text",
    minActions: 3,
    checkCoverage: true,
    minRequestedFacets: 2,
    requiredText: [COD_POLICY_TEXT, "QRIS"],
  },
  {
    question: "ada cabang toko di luar jakarta tidak",
    expectedIntent: "general",
  },
  { id: "out_of_scope_math", question: "1 + 1 berapa?", expectedIntent: "general" },
  {
    id: "out_of_scope_fiction",
    question: "Robot yang paling kuat menang lawan Godzilla yang mana?",
    expectedIntent: "general",
    expectedType: "text",
    requiredText: ["di luar topik"],
  },
  {
    id: "return_policy",
    question: "Barang Getter Robo saya terkelupas dan cacat, bisa retur dan refund?",
    expectedIntent: "return_product",
    expectedCustomerState: "distressed",
    minActions: 3,
    requiredText: ["2 x 24 jam", "1-3 hari kerja", "3-7 hari kerja"],
  },
  {
    id: "return_policy_consistency",
    question:
      "Barang rusak bisa diretur atau refund? Apa syarat dan berapa lama prosesnya?",
    expectedIntent: "return_product",
    expectedType: "text",
    expectedCustomerState: "distressed",
    minActions: 3,
    requiredText: ["2 x 24 jam", "1-3 hari kerja", "3-7 hari kerja"],
  },
  {
    id: "junk_detail_transparency",
    question:
      "Popy ST Dynaman ini kondisi dan kelengkapannya gimana? Ada bagian yang hilang atau rusak?",
    expectedIntent: "product_detail",
    expectedType: "products",
    expectedProductName: "Popy ST Dynaman",
    minProducts: 1,
    requiredText: [
      "JUNK (Missing Components)",
      "bagian yang hilang belum dirinci",
    ],
    forbiddenText: ["<p data-path", "<b>Condition"],
  },
  {
    question: "boleh cek perkembangan pesanan",
    expectedIntent: "transaction_status",
  },
  {
    id: "order_requires_verification",
    question: "cek status pesanan Order #5007 dong",
    expectedIntent: "transaction_status",
    expectedType: "text",
    expectedAssistantProvider: "template",
    expectedAssistantReason: "sensitive_intent",
    requiredText: ["email atau nomor telepon", "tidak disimpan"],
    forbiddenText: ["Status Transaksi Pesanan", "Total:"],
  },
  {
    question: "gx 47 sama gx 48 beda apa",
    expectedIntent: "compare",
  },
  {
    question: "mending ambil yang mana kalau budget 1 jutaan",
    expectedIntent: "recommendation",
  },
  {
    id: "gift_display_recommendation",
    question:
      "Saya bingung cari kado untuk suami yang suka robot lawas tahun 80-an. Rekomendasikan yang cocok untuk pajangan, budget sekitar 3 jutaan.",
    expectedIntent: "recommendation",
    expectedType: "products",
    minProducts: 1,
    maxProductPrice: 3000000,
    expectedRecommendation: {
      decade: 1980,
      displaySuitable: true,
      giftSuitable: true,
    },
    requiredText: ["era franchise 1980-an", "hadiah", "pajangan"],
  },
  {
    question: "Bro apa aja stok yg ada",
    expectedIntent: "stock_availability",
    minProducts: 2,
  },
  {
    question: "Produknya ada berapa macem?",
    expectedIntent: "product_discovery",
    minProducts: 2,
  },
  {
    questions: [
      "Bro apa aja stok yg ada",
      "Iyaa boleh menurut harga",
    ],
    expectedIntent: "price_promo",
    minProducts: 2,
    ascendingPrices: true,
  },
  {
    id: "catalog_scope_overrides_history",
    questions: [
      "Bro apa aja stok yg ada",
      "adakah robot termurah disini",
    ],
    expectedIntent: "price_promo",
    minProducts: 1,
    forbiddenText: ["hasil sebelumnya"],
  },
  {
    id: "previous_scope_keeps_history",
    questions: [
      "Bro apa aja stok yg ada",
      "Urutkan hasil sebelumnya dari harga termurah",
    ],
    expectedIntent: "price_promo",
    minProducts: 2,
    ascendingPrices: true,
    requiredAnyText: ["hasil sebelumnya", "daftar sebelumnya"],
  },
  {
    id: "shipping_quote_multiturn",
    questions: ["cek ongkir ke Tangerang", "Tangerang, Rajeg"],
    expectedIntent: "shipping_transaction",
  },
  {
    id: "compound_secure_shipping_multiturn",
    questions: [
      "Ongkir ke Surabaya untuk Getter Robo GX-74 berapa? Pengirimannya aman kan, bisa asuransi dan packing kayu?",
      "Surabaya, Wonokromo",
    ],
    expectedIntent: "shipping_transaction",
    checkCoverage: true,
    minRequestedFacets: 3,
  },
  {
    id: "compound_product_detail_stock",
    question:
      "Soul of Chogokin GX-47T Energer Z Test Type kondisinya bagaimana, kelengkapannya apa saja, dan stoknya masih ready?",
    expectedIntent: "stock_availability",
    checkCoverage: true,
    minRequestedFacets: 3,
  },
  {
    id: "compound_transaction_policy",
    question:
      "Untuk barang mahal bisa COD dan bayar pakai apa? Bisa pakai asuransi, packing kayu, dan berapa lama pengirimannya?",
    expectedIntent: "shipping_transaction",
    checkCoverage: true,
    minRequestedFacets: 5,
  },
  {
    id: "compound_stock_promo_dispatch",
    question:
      "Soul of Chogokin GX-47T Energer Z Test Type sedang promo dan stoknya ready? Kalau bayar sekarang bisa dikirim hari ini?",
    expectedIntent: "shipping_transaction",
    checkCoverage: true,
    minRequestedFacets: 3,
  },
  {
    id: "confidence_exact_product",
    question:
      "cek stok Soul of Chogokin GX-47T Energer Z Test Type",
    expectedIntent: "stock_availability",
    expectedProductName: "Soul of Chogokin GX-47T Energer Z Test Type",
    minProducts: 1,
    expectedMatchStatus: "matched",
  },
  {
    id: "confidence_safe_typo",
    question:
      "cek stok Soul of Chogokinn GX-47T Energerr Z Test Type",
    expectedIntent: "stock_availability",
    expectedProductName: "Soul of Chogokin GX-47T Energer Z Test Type",
    minProducts: 1,
    expectedMatchStatus: "matched",
  },
  {
    id: "confidence_ambiguous_series",
    question: "cek stok Soul of Chogokin",
    expectedIntent: "stock_availability",
    expectedType: "options",
    minOptions: 2,
    maxProducts: 0,
    requiredText: ["beberapa produk", "nama atau kode produk"],
  },
  {
    id: "confidence_unknown_mixed_name",
    question: "apakah ada Soul of Chogokin Ultraman Hyper X?",
    expectedIntent: "product_discovery",
    maxProducts: 0,
    requiredAnyText: [
      "belum ada",
      "belum menemukan",
      "belum ditemukan",
      "tidak tersedia",
    ],
  },
];

const CONTROLLED_CASE_IDS = new Set([
  "catalog_scope_overrides_history",
  "previous_scope_keeps_history",
  "store_visit",
  "secure_shipping_policy",
  "safe_payment_policy",
  "return_policy",
  "junk_detail_transparency",
  "gift_display_recommendation",
  "out_of_scope_fiction",
  "order_requires_verification",
  "shipping_quote_multiturn",
]);

const CONSISTENCY_CASE_IDS = new Set([
  "store_visit",
  "safe_payment_policy",
  "return_policy_consistency",
  "out_of_scope_fiction",
  "order_requires_verification",
]);

const COMPOUND_CASE_IDS = new Set([
  "compound_secure_shipping_multiturn",
  "compound_product_detail_stock",
  "compound_transaction_policy",
  "compound_stock_promo_dispatch",
  "store_visit",
  "return_policy",
]);

const CONFIDENCE_CASE_IDS = new Set([
  "confidence_exact_product",
  "confidence_safe_typo",
  "confidence_ambiguous_series",
  "confidence_unknown_mixed_name",
]);

function selectedCases(argv = []) {
  const caseIndex = argv.indexOf("--case");
  if (caseIndex >= 0 && argv[caseIndex + 1]) {
    const caseId = String(argv[caseIndex + 1]).trim();
    return CASES.filter((testCase) => testCase.id === caseId);
  }

  if (argv.includes("--controlled")) {
    return CASES.filter((testCase) => CONTROLLED_CASE_IDS.has(testCase.id));
  }

  if (argv.includes("--compound")) {
    return CASES.filter((testCase) => COMPOUND_CASE_IDS.has(testCase.id));
  }

  if (argv.includes("--confidence")) {
    return CASES.filter((testCase) => CONFIDENCE_CASE_IDS.has(testCase.id));
  }

  if (argv.includes("--consistency")) {
    return CASES.filter((testCase) =>
      CONSISTENCY_CASE_IDS.has(testCase.id),
    ).flatMap((testCase) =>
      [1, 2].map((run) => ({
        ...testCase,
        id: `${testCase.id}_run_${run}`,
      })),
    );
  }

  const intentIndex = argv.indexOf("--intent");
  if (intentIndex < 0 || !argv[intentIndex + 1]) return CASES;
  const expectedIntent = String(argv[intentIndex + 1]).trim();
  return CASES.filter(
    (testCase) => testCase.expectedIntent === expectedIntent,
  );
}

async function getLocalHandler() {
  localHandlerPromise ||= import("../api/ask.js").then(
    (module) => module.default,
  );
  return localHandlerPromise;
}

async function invokeAskLocal(question, index, sessionId = null) {
  const handler = await getLocalHandler();
  return new Promise((resolve, reject) => {
    const originalLog = console.log;
    const originalError = console.error;
    let consoleRestored = false;
    const restoreConsole = () => {
      if (consoleRestored) return;
      consoleRestored = true;
      console.log = originalLog;
      console.error = originalError;
    };
    console.log = () => {};
    console.error = () => {};

    const timeout = setTimeout(
      () => {
        restoreConsole();
        reject(new Error(`Timeout untuk: ${question}`));
      },
      70000,
    );
    const req = {
      method: "POST",
      url: "/api/ask",
      headers: {
        "x-session-id": sessionId || `smoke_${Date.now()}_${index}`,
      },
      body: {
        question,
        history: [],
        isSuggestionClick: false,
      },
    };
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(payload) {
        clearTimeout(timeout);
        restoreConsole();
        resolve({ statusCode: this.statusCode, payload });
        return payload;
      },
      end() {
        clearTimeout(timeout);
        restoreConsole();
        resolve({ statusCode: this.statusCode, payload: null });
      },
    };

    Promise.resolve(handler(req, res)).catch((error) => {
      clearTimeout(timeout);
      restoreConsole();
      reject(error);
    });
  });
}

function isTransientCatalogPayload(payload = {}) {
  const message = String(payload?.message || payload?.intro || "").toLowerCase();
  return message.includes("server lagi sibuk ambil data produk");
}

async function invokeAskLocalWithRetry(question, index, sessionId) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await invokeAskLocal(question, index, sessionId);
    if (!isTransientCatalogPayload(response.payload) || attempt === 2) {
      return { ...response, attempts: attempt };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function invokeAskRemote(question, index, sessionId, endpoint) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 95000);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId || `smoke_${Date.now()}_${index}`,
        },
        body: JSON.stringify({
          question,
          history: [],
          isSuggestionClick: false,
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Respons endpoint bukan JSON (HTTP ${response.status})`);
      }

      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        isTransientCatalogPayload(payload);
      if (retryable && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }

      return { statusCode: response.status, payload, attempts: attempt };
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Request endpoint gagal setelah dua percobaan");
}

function endpointFromArgs(argv = []) {
  const index = argv.indexOf("--endpoint");
  if (index < 0 || !argv[index + 1]) return "";
  const endpoint = new URL(argv[index + 1]);
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("Endpoint smoke harus berupa URL HTTP/HTTPS");
  }
  return endpoint.toString();
}

function outputFromArgs(argv = []) {
  const index = argv.indexOf("--output");
  return index >= 0 && argv[index + 1]
    ? path.resolve(argv[index + 1])
    : "";
}

function responsePreview(payload = {}) {
  const text = responseText(payload);
  return String(text).replace(/\s+/g, " ").trim().slice(0, 100);
}

function responseText(payload = {}) {
  return [
    payload.message,
    payload.intro,
    payload.reasoning_text,
    payload.closing,
  ]
    .filter(Boolean)
    .join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const rulesOnly = argv.includes("--rules-only");
  if (rulesOnly) {
    process.env.GEMINI_API_KEY = "";
    process.env.GOOGLE_API_KEY = "";
    process.env.GROQ_ROUTER_ENABLED = "false";
    process.env.GROQ_NATURALIZER_ENABLED = "false";
  }
  const cases = selectedCases(argv);
  const endpoint = endpointFromArgs(argv);
  if (rulesOnly && endpoint) {
    throw new Error("--rules-only hanya tersedia untuk handler lokal");
  }
  const outputPath = outputFromArgs(argv);
  if (!cases.length) {
    throw new Error("Tidak ada smoke case untuk intent yang dipilih");
  }
  console.log(`Mode: ${endpoint ? `HTTP ${endpoint}` : "handler lokal"}`);
  const results = [];

  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    const questions = Array.isArray(testCase.questions)
      ? testCase.questions
      : [testCase.question];
    const label = questions.join(" -> ");
    const sessionId = `smoke_${Date.now()}_${index}`;
    try {
      let response = null;
      const responses = [];
      let requestAttempts = 0;
      for (const question of questions) {
        response = endpoint
          ? await invokeAskRemote(question, index, sessionId, endpoint)
          : await invokeAskLocalWithRetry(question, index, sessionId);
        responses.push(response.payload);
        requestAttempts += response.attempts || 1;
      }
      const actualIntent = response.payload?.intent || null;
      const productPrices = Array.isArray(response.payload?.products)
        ? response.payload.products
            .map((product) =>
              Number(
                product.numericPrice ||
                  product.effectivePrice ||
                  product.price ||
                  0,
              ),
            )
            .filter(Number.isFinite)
        : [];
      const validEmptyBudgetResponse =
        productPrices.length === 0 &&
        response.payload?.type === "text" &&
        /(?:tidak|belum)\s+(?:ada|menemukan)|tidak\s+ditemukan/i.test(
          String(response.payload?.message || ""),
        );
      const pricesValid =
        testCase.maxProductPrice == null ||
        validEmptyBudgetResponse ||
        (productPrices.length > 0 &&
          productPrices.every(
            (price) => price > 0 && price <= testCase.maxProductPrice,
          ));
      const productCount = Array.isArray(response.payload?.products)
        ? response.payload.products.length
        : 0;
      const optionCount = Array.isArray(response.payload?.options)
        ? response.payload.options.length
        : 0;
      const optionCountValid =
        testCase.minOptions == null || optionCount >= testCase.minOptions;
      const actionCount = Array.isArray(response.payload?.actions)
        ? response.payload.actions.length
        : 0;
      const actionCountValid =
        testCase.minActions == null || actionCount >= testCase.minActions;
      const productCountValid =
        testCase.minProducts == null ||
        productCount >= testCase.minProducts;
      const maxProductCountValid =
        testCase.maxProducts == null ||
        productCount <= testCase.maxProducts;
      const expectedProductNameValid =
        !testCase.expectedProductName ||
        (response.payload?.products || []).some(
          (product) =>
            String(product?.name || "").toLowerCase() ===
            String(testCase.expectedProductName).toLowerCase(),
        );
      const ascendingPricesValid =
        !testCase.ascendingPrices ||
        productPrices.every(
          (price, priceIndex) =>
            priceIndex === 0 || productPrices[priceIndex - 1] <= price,
        );
      const text = responseText(response.payload)
        .toLowerCase()
        .replace(/(\d{1,2}):(\d{2})/g, "$1.$2");
      const missingRequiredText = (testCase.requiredText || []).filter(
        (required) => !text.includes(String(required).toLowerCase()),
      );
      const presentForbiddenText = (testCase.forbiddenText || []).filter(
        (forbidden) => text.includes(String(forbidden).toLowerCase()),
      );
      const requiredAnyTextValid =
        !testCase.requiredAnyText?.length ||
        testCase.requiredAnyText.some((required) =>
          text.includes(String(required).toLowerCase()),
        );
      const responseTypeValid =
        !testCase.expectedType ||
        response.payload?.type === testCase.expectedType;
      const assistantProviderValid =
        !testCase.expectedAssistantProvider ||
        response.payload?.assistant_meta?.provider ===
          testCase.expectedAssistantProvider;
      const assistantReasonValid =
        !testCase.expectedAssistantReason ||
        response.payload?.assistant_meta?.reason ===
          testCase.expectedAssistantReason;
      const allowedAssistantReasonValid =
        !testCase.allowedAssistantReasons?.length ||
        testCase.allowedAssistantReasons.includes(
          response.payload?.assistant_meta?.reason,
        );
      const customerStateValid =
        !testCase.expectedCustomerState ||
        response.payload?.assistant_meta?.customer_state ===
          testCase.expectedCustomerState;
      const naturalizedValid =
        testCase.expectedNaturalized == null ||
        response.payload?.assistant_meta?.naturalized ===
          testCase.expectedNaturalized;
      const matchStatusValid =
        !testCase.expectedMatchStatus ||
        response.payload?.product_match?.status ===
          testCase.expectedMatchStatus;
      const expectedRecommendation = testCase.expectedRecommendation;
      const recommendationMetadataValid =
        !expectedRecommendation ||
        (productCount > 0 &&
          response.payload.products.every((product) => {
            const metadata = product?.recommendationMetadata || {};
            return (
              (expectedRecommendation.decade == null ||
                metadata.decades?.includes(expectedRecommendation.decade)) &&
              (expectedRecommendation.displaySuitable == null ||
                metadata.displaySuitable ===
                  expectedRecommendation.displaySuitable) &&
              (expectedRecommendation.giftSuitable == null ||
                metadata.giftSuitable === expectedRecommendation.giftSuitable)
            );
          }));
      const answerCoverage = testCase.checkCoverage
        ? evaluateAnswerCoverage(label, responses)
        : null;
      const coverageValid =
        !answerCoverage ||
        (answerCoverage.requested.length >=
          Number(testCase.minRequestedFacets || 1) &&
          answerCoverage.passed);
      const passed =
        response.statusCode === 200 &&
        actualIntent === testCase.expectedIntent &&
        pricesValid &&
        productCountValid &&
        optionCountValid &&
        actionCountValid &&
        maxProductCountValid &&
        expectedProductNameValid &&
        ascendingPricesValid &&
        responseTypeValid &&
        assistantProviderValid &&
        assistantReasonValid &&
        allowedAssistantReasonValid &&
        customerStateValid &&
        naturalizedValid &&
        matchStatusValid &&
        recommendationMetadataValid &&
        coverageValid &&
        missingRequiredText.length === 0 &&
        presentForbiddenText.length === 0 &&
        requiredAnyTextValid;
      results.push({
        ...testCase,
        question: label,
        passed,
        statusCode: response.statusCode,
        actualIntent,
        type: response.payload?.type || null,
        productCount,
        optionCount,
        optionCountValid,
        actionCount,
        actionCountValid,
        productPrices,
        maxProductCountValid,
        expectedProductNameValid,
        missingRequiredText,
        presentForbiddenText,
        assistantMeta: response.payload?.assistant_meta || null,
        allowedAssistantReasonValid,
        customerStateValid,
        naturalizedValid,
        matchStatusValid,
        recommendationMetadataValid,
        productMatch: response.payload?.product_match || null,
        requiredAnyTextValid,
        coverageValid,
        answerCoverage,
        requestAttempts,
        preview: responsePreview(response.payload),
      });
      console.log(
        `${passed ? "PASS" : "FAIL"} | ${testCase.expectedIntent} -> ${actualIntent || "-"} | ${label}`,
      );
    } catch (error) {
      results.push({
        ...testCase,
        passed: false,
        error: error?.message || String(error),
      });
      console.log(
        `FAIL | ${testCase.expectedIntent} -> ERROR | ${label}`,
      );
    }
  }

  console.log(JSON.stringify(results, null, 2));
  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify({
        endpoint: endpoint || "local",
        generated_at: new Date().toISOString(),
        passed: results.filter((result) => result.passed).length,
        total: results.length,
        results,
      }, null, 2)}\n`,
      "utf8",
    );
    console.log(`Report: ${outputPath}`);
  }
  const failed = results.filter((result) => !result.passed);
  if (failed.length) {
    throw new Error(`${failed.length}/${results.length} smoke case gagal`);
  }
}

main().catch((error) => {
  console.error(`SMOKE ERROR: ${error.message}`);
  process.exitCode = 1;
});
