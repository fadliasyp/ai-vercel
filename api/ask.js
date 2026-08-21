import { createClient } from "@supabase/supabase-js";

import {
  getSession,
  resolveSessionId,
  setPending,
  clearPending,
  getPending,
} from "../lib/chatbot/session.js";

import {
  loadSessionState,
  saveSessionState,
} from "../lib/chatbot/sessionStore.js";

import {
  GEMINI_MODE,
  GEMINI_MODELS,
  classifyCommerceScopeWithGemini,
  genai,
  geminiText,
  naturalizeWithGemini,
  explainCompareWithGemini,
  explainStepWithGemini,
} from "../lib/chatbot/gemini.js";

import {
  assessLocalCommerceScope,
  buildOutOfScopeMessage,
  isCommerceIntent,
} from "../lib/chatbot/scopeGuard.js";

import {
  classifyCommerceWithGroqFallback,
  resolveGroqRouterConfig,
} from "../lib/chatbot/groq.js";

import {
  chooseSemanticIntent,
  detectExplicitIntentOverride,
  semanticRouteToLegacy,
  shouldUseSemanticRouter,
} from "../lib/chatbot/intentFusion.js";

import { getHowToBuy } from "../lib/chatbot/howToBuy.js";

import {
  fetchBiteshipPublicTracking,
  mapBiteshipTracking,
  buildTrackingMessage,
  extractCourierCode,
  extractTrackingNumber,
  looksLikeTrackingQuestion,
} from "../lib/chatbot/tracking.js";

import {
  normalizeLite,
  normalizeQuestion as normalizeCustomerQuestion,
  formatRupiah,
  isYesAnswer,
  isNoAnswer,
  stripRobotJadulStoreName,
} from "../lib/chatbot/utils.js";

import {
  formatDimensions,
  extractSpecsFromDescription,
  buildProductConsiderationsMessage,
  buildProductDetailMessage,
  buildProductTransactionSummary,
} from "../lib/chatbot/productFormatter.js";

import {
  buildOrderVerificationFailedMessage,
  buildOrderVerificationPrompt,
  extractOrderId,
  extractOrderVerification,
  fetchWooOrderById,
  buildTransactionStatusMessage,
  looksLikeTransactionStatusQuestion,
  matchesOrderVerification,
  redactOrderVerification,
} from "../lib/chatbot/transactionStatus.js";

import {
  isGreetingOnly,
  buildGreetingMessage,
} from "../lib/chatbot/conversationUi.js";

import {
  isCODQuestion,
  looksLikePaymentMethodQuestion,
  looksLikeInsuranceQuestion,
  looksLikeShippingEstimateQuestion,
  looksLikeTransactionPolicyQuestion,
  looksLikeProductTransactionCompoundQuestion,
  looksLikeHowToBuyQuestion,
  looksLikeCompareQuestion,
  looksLikeShippingOriginQuestion,
  looksLikeProductManufacturingOriginQuestion,
  looksLikeShippingCoverageQuestion,
  looksLikeRecommendationRequest,
  needsRecommendationBudgetClarification,
  buildTransactionTopicClarification,
  buildTransactionPolicyMessage,
  buildInternationalShippingMessage,
  extractInternationalShippingDestination,
  looksLikeInternationalShippingQuestion,
} from "../lib/chatbot/transactionIntent.js";

import {
  applyControlledFollowUpPolicy,
  buildControlledActions,
  buildBudgetOptions,
  buildStandaloneAffirmationResponse,
  dedupeSuggestedActions,
  filterAnsweredSuggestedActions,
  isOptionalFollowUpType,
  isRequiredClarificationPayload,
  serializeSuggestedActions,
  suggestedActionIntent,
  validateSuggestedActionSelection,
} from "../lib/chatbot/followUpClosings.js";
import {
  extractRecommendationBudgetAnswer,
  extractBudgetRange,
  isRecommendationBudgetFollowUp,
} from "../lib/chatbot/priceIntent.js";
import {
  applyCustomerStateAcknowledgement,
  detectCustomerState,
} from "../lib/chatbot/customerState.js";
import {
  buildCatalogOverview,
  extractPromoSubjectKeywords,
  isCatalogOverviewQuestion,
  isPriceOrderingFollowUp,
  resolveProductQueryScope,
  isStoreAssortmentQuestion,
} from "../lib/chatbot/catalogIntent.js";
import {
  naturalizeResponseWithGroq,
  resolveGroqNaturalizerConfig,
} from "../lib/chatbot/responseNaturalizer.js";
import {
  assessProductSearchConfidence,
  buildProductSearchClarification,
  buildProductSearchOptions,
  findVerifiedPageProduct,
  extractRequestedCatalogTerm,
  hasSpecificProductSearchTerms,
  looksLikeCurrentProductDetailQuestion,
  looksLikeCurrentProductReference,
  looksLikeCatalogAvailabilityQuestion,
  looksLikeSpecificCatalogAvailabilityQuestion,
  searchProductsForDiscovery,
} from "../lib/chatbot/productSearch.js";
import {
  analyzeIndonesianQuestion,
  compactLinguisticAnalysis,
} from "../lib/chatbot/linguisticAnalysis.js";
import {
  buildQuestionUnderstanding,
  compactQuestionUnderstanding,
  resolveContextualIntent,
} from "../lib/chatbot/questionUnderstanding.js";
import {
  buildGeneralStockPolicyMessage,
  buildNegotiationPolicyMessage,
  buildReturnPolicyMessage,
  getReturnActionContext,
  looksLikeGeneralStockPolicyQuestion,
  looksLikeNegotiationPolicyQuestion,
  looksLikeReturnPolicyQuestion,
} from "../lib/chatbot/storePolicy.js";
import {
  buildStoreHoursMessage,
  buildStoreVisitMessage,
  looksLikeStoreBackgroundQuestion,
  looksLikeStoreHoursQuestion,
  looksLikeStoreLocationQuestion,
} from "../lib/chatbot/storeInfo.js";
import {
  buildCatalogNoMatchResponse,
  buildUnknownAnswerResponse,
  looksLikeAdminContactQuestion,
} from "../lib/chatbot/fallbackResponses.js";
import {
  buildAssistantCapabilitiesMessage,
  looksLikeAssistantCapabilitiesQuestion,
} from "../lib/chatbot/assistantCapabilities.js";
import {
  getWooProductsCached,
} from "../lib/chatbot/wooCatalog.js";
import { buildChatMetric } from "../lib/chatbot/observability.js";
import {
  extractDistrictFollowUp,
  findCityWithDistrict,
  extractShippingDestination,
  isShippingQuotePending,
  normalizeLocationText,
  splitCityDistrict,
} from "../lib/chatbot/shippingLocation.js";
import {
  beginDistrictSelection,
  buildOptionsPayload,
  getShippingQuote as getShippingQuoteFromWP_OKID,
  normalizeCityName,
  resolveShippingLocation,
  searchCities as searchCitiesFromWP,
  searchDistricts as searchDistrictsFromWP,
} from "../lib/chatbot/shippingApi.js";
import { shouldInterruptPendingFlow } from "../lib/chatbot/pendingContext.js";
import {
  buildActiveConversationGoal,
  focusActiveConversationGoal,
  resolveConversationTurn,
} from "../lib/chatbot/conversationGoal.js";
import {
  analyzeCompoundQuestion,
  appendAnswerSections,
  answerPlanIncludes,
  buildAnswerPlan,
  compactAnswerPlan,
  compactCompoundQuestionAnalysis,
  prependAnswerSections,
  productMatchesCompoundConstraints,
} from "../lib/chatbot/compoundQuestion.js";
import { repairAnswerCoverage } from "../lib/chatbot/answerCoverage.js";
import {
  buildLlmToolPlan,
  resolveLlmAssistantConfig,
  runLlmAnswerComposer,
  shouldUseLlmUnderstanding,
} from "../lib/chatbot/llmAssistant.js";
import {
  CORRECTION_WORDS,
  TYPO_MAP,
  classifyIntentHybrid,
  fuzzyCorrectWord,
  getProductImageUrl,
  isDiscoveryStyleQuestion,
  isOpinionQuestion,
  levenshtein,
  looksLikeShippingQuoteQuestion,
  normalize,
  parseUserIntentWithGemini,
  recommendWithGemini,
} from "../lib/chatbot/askLanguage.js";
import {
  bestMatchByName,
  explainBestRuleBased,
} from "../lib/chatbot/productRanking.js";
import {
  clearLastBotQuestion,
  expireStaleLastBotQuestion,
  isShortFollowUp,
  isSpecFollowUpQuestion,
  resetConversationContext,
  setLastBotQuestion,
  updateSlot,
} from "../lib/chatbot/conversationState.js";
import {
  basePopularityScore,
  buildProductOpinionReasoning,
  buildPromoReasoning,
  buildReasonFirstRecommendationIntro,
  buildRecommendationReasoning,
  detectPriceMode,
  detectUniversalFollowUp,
  extractRecommendationNeeds,
  extractRecommendationTopic,
  getProductSearchText,
  getPromoIntro,
  handlePriceRecommendationMode,
  isPopularityStyleQuestion,
  needsReasoningRecommendation,
  parseMoneyToNumber,
  pickRecommendedProducts,
} from "../lib/chatbot/productRecommendation.js";
import {
  applyContextProductRefine,
  detectContextFollowUp,
  humanizeResponse,
  looksLikeBudgetAnswer,
  looksLikeCheapRefine,
  looksLikeCompareAnswer,
  looksLikeDisplayRefine,
  looksLikePremiumRefine,
  looksLikeShippingAnswer,
  looksLikeStockCheckAnswer,
} from "../lib/chatbot/responsePresentation.js";

console.log("ASK.JS LOADED");

export const config = {
  runtime: "nodejs",
  maxDuration: 90,
};

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      )
    : null;

async function logChatMetricToSupabase(input) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from("chat_observability")
      .insert(buildChatMetric(input));

    if (error) console.error("OBSERVABILITY INSERT ERROR:", error.message);
  } catch (error) {
    console.error("OBSERVABILITY INSERT ERROR:", error?.message || error);
  }
}

console.log("SUPABASE URL:", process.env.SUPABASE_URL);

async function getProductsCached() {
  return getWooProductsCached({ timeoutMs: 15000 });
}

function withTimeout(promise, ms) {
  let timer = null;

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("LLM_TIMEOUT")), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function calcDiscountPercent(regularPrice, salePrice) {
  const regular = Number(regularPrice || 0);
  const sale = Number(salePrice || 0);

  if (!regular || !sale) return 0;
  if (sale >= regular) return 0;

  return Math.round(((regular - sale) / regular) * 100);
}

function isPromoProduct(p) {
  const regular = Number(p.regular_price || 0);
  const sale = Number(p.sale_price || 0);

  return regular > 0 && sale > 0 && sale < regular;
}

function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldExplainWithGemini(rawQuestion = "") {
  const q = String(rawQuestion).toLowerCase().trim();

  if (!genai) return false;
  if (q.length < 15) return false;

  return (
    q.includes("kenapa") ||
    q.includes("alasan") ||
    q.includes("bagus") ||
    q.includes("lebih baik") ||
    q.includes("worth it") ||
    q.includes("bingung") ||
    q.includes("rekomendasi") ||
    q.includes("bandingkan") ||
    q.includes("dicari") ||
    q.includes("vs") ||
    q.includes("versus")
  );
}

function setFollowUpOffer(session, followUpType, meta = {}) {
  setLastBotQuestion(session, followUpType, meta);
}

function clearFollowUpOffer(session) {
  clearLastBotQuestion(session);
}

function isFreshCheapProductQuery(q = "") {
  const s = String(q || "")
    .toLowerCase()
    .trim();
  return (
    s.includes("produk termurah") ||
    s.includes("produk paling murah") ||
    s.includes("yang termurah apa") ||
    s.includes("barang termurah") ||
    s.includes("produk murah apa")
  );
}

function isGenericProductWord(s = "") {
  const x = String(s || "")
    .toLowerCase()
    .trim();
  return (
    x === "produk" ||
    x === "barang" ||
    x === "item" ||
    x === "pesanan" ||
    x === "produk ini" ||
    x === "barang ini" ||
    x === "item ini"
  );
}

function buildUnknownResponseForQuestion(question = "") {
  if (looksLikeStoreBackgroundQuestion(question)) {
    return buildUnknownAnswerResponse({
      message:
        "Maaf, aku belum memiliki informasi resmi tentang asal-usul atau sejarah Robot Jadul. Supaya tidak memberi cerita yang keliru, silakan tanyakan langsung ke Admin Robot Jadul.",
      topic: "asal-usul atau sejarah Robot Jadul",
    });
  }

  return buildUnknownAnswerResponse();
}

function hasProductManufacturingOriginInfo(product = {}) {
  const sourceText = [
    product.description,
    product.shortDescription,
    product.short_description,
    product.condition,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]*>/g, " ");

  return /\b(?:made\s+in|diproduksi|produksi\s+di|produsen|manufacturer|manufactured|buatan|negara\s+asal|asal\s+produksi|diimpor|impor|import|imported|produk\s+impor|barang\s+impor)\b/i.test(
    sourceText,
  );
}

function isGlobalStockQuestion(q = "") {
  q = q.toLowerCase();

  return (
    q.includes("ready apa aja") ||
    q.includes("ready stock apa aja") ||
    q.includes("stok apa aja") ||
    q.includes("apa aja stok") ||
    q.includes("apa saja stok") ||
    q.includes("stok yg ada") ||
    q.includes("stok yang ada") ||
    q.includes("barang apa aja") ||
    q.includes("yang tersedia apa aja") ||
    q.includes("produk tersedia") ||
    q.includes("stok tersedia")
  );
}

export default async function handler(req, res) {
  const requestStartedAt = Date.now();
  console.log("ASK HIT:", req.method, req.url);
  // ===============================
  // 🔥 CORS FIX
  // ===============================

  console.log("METHOD:", req.method);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-Id",
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const isSuggestionClick = !!body.isSuggestionClick;
  const isBootstrapRequest = body.isBootstrap === true;
  const pageContext =
    body.pageContext && typeof body.pageContext === "object"
      ? body.pageContext
      : null;

  let rawQuestion = String(body.question || "").trim();
  if (!rawQuestion) {
    return res.status(400).json({ type: "text", message: "Pertanyaan kosong" });
  }
  const selectedSuggestion = isSuggestionClick
    ? validateSuggestedActionSelection(body.suggestedAction, rawQuestion)
    : null;
  const isBootstrapGreeting =
    isBootstrapRequest && isGreetingOnly(rawQuestion);

  const privacySafeQuestion = () => redactOrderVerification(rawQuestion);
  let customerState = detectCustomerState(privacySafeQuestion());
  let resumedProductClarification = false;

  function normalizeQuestion(rawQuestion = "") {
    const q = normalizeCustomerQuestion(rawQuestion);

    const words = q.split(/\s+/);

    const fixed = words.map((w) => {
      if (TYPO_MAP[w]) return TYPO_MAP[w];
      return fuzzyCorrectWord(w, CORRECTION_WORDS);
    });

    return fixed.join(" ");
  }

  let effectiveQuestion = normalizeQuestion(privacySafeQuestion());
  let q = effectiveQuestion.toLowerCase();
  let productQueryScope = resolveProductQueryScope(rawQuestion);
  let usesPreviousProductContext = productQueryScope === "previous";
  let linguisticAnalysis = analyzeIndonesianQuestion(privacySafeQuestion());
  let linguisticHint = compactLinguisticAnalysis(linguisticAnalysis);

  const sessionId = resolveSessionId(req.headers["x-session-id"]);
  const session = getSession(sessionId);
  console.log("SESSION ID:", sessionId);
  console.log("PENDING:", session.pending);
  console.log("QUESTION:", privacySafeQuestion());
  console.log("SESSION PENDING:", session.pending);

  const persisted = await loadSessionState(supabase, sessionId);
  if (persisted && typeof persisted === "object") {
    session.lastIntent = persisted.lastIntent ?? session.lastIntent;
    session.lastStep = persisted.lastStep ?? session.lastStep;

    session.lastTopic = persisted.lastTopic ?? session.lastTopic;
    session.lastProducts = persisted.lastProducts ?? session.lastProducts;
    session.lastSuggestedActions = Array.isArray(persisted.lastSuggestedActions)
      ? persisted.lastSuggestedActions
      : session.lastSuggestedActions;
    session.lastBotQuestionType =
      persisted.lastBotQuestionType ?? session.lastBotQuestionType;
    session.lastBotQuestionMeta =
      persisted.lastBotQuestionMeta ?? session.lastBotQuestionMeta;
    session.lastFilters = persisted.lastFilters ?? session.lastFilters;
    session.slots = persisted.slots ?? session.slots;
    session.activeGoal = persisted.activeGoal ?? session.activeGoal;
    session.pending = persisted.pending ?? session.pending;
    console.log(
      "PENDING AFTER RESTORE:",
      JSON.stringify(session.pending, null, 2),
    );

    session.history = Array.isArray(persisted.history)
      ? persisted.history
      : session.history;
  }

  const productClarificationPending = getPending(session);
  if (
    productClarificationPending?.type === "product_clarification" &&
    productClarificationPending?.stage === "choose_product"
  ) {
    const candidates = productClarificationPending.data?.candidates || [];
    const selectedId = Number(selectedSuggestion?.product_id);
    const selectedName = String(selectedSuggestion?.product_name || "").trim();
    const selectedProduct = selectedName
      ? candidates.find(
          (candidate) =>
            Number(candidate?.id) === selectedId &&
            String(candidate?.name || "").trim() === selectedName,
        )
      : assessProductSearchConfidence(rawQuestion, candidates).product;

    if (selectedProduct) {
      rawQuestion = [
        String(
          productClarificationPending.data?.originalQuestion || "",
        ).trim(),
        `Produk yang dipilih: ${selectedProduct.name}.`,
      ]
        .filter(Boolean)
        .join("\n");
      effectiveQuestion = normalizeQuestion(privacySafeQuestion());
      q = effectiveQuestion.toLowerCase();
      productQueryScope = resolveProductQueryScope(rawQuestion);
      usesPreviousProductContext = false;
      linguisticAnalysis = analyzeIndonesianQuestion(privacySafeQuestion());
      linguisticHint = compactLinguisticAnalysis(linguisticAnalysis);
      customerState = detectCustomerState(privacySafeQuestion());
      resumedProductClarification = true;
      clearPending(session);
    }
  }

  session.activeGoal = buildActiveConversationGoal(session.activeGoal, {
    intent: session.lastIntent,
    products: session.lastProducts,
    slots: session.slots,
    filters: session.lastFilters,
  });
  const conversationTurn = resolveConversationTurn(rawQuestion, {
    activeGoal: session.activeGoal,
    lastIntent: session.lastIntent,
    lastProducts: session.lastProducts,
  });
  if (conversationTurn.changed) {
    rawQuestion = conversationTurn.question;
    effectiveQuestion = normalizeQuestion(privacySafeQuestion());
    q = effectiveQuestion.toLowerCase();
    productQueryScope = conversationTurn.usesPreviousProducts
      ? "previous"
      : resolveProductQueryScope(rawQuestion);
    usesPreviousProductContext =
      conversationTurn.usesPreviousProducts || productQueryScope === "previous";
    linguisticAnalysis = analyzeIndonesianQuestion(privacySafeQuestion());
    linguisticHint = compactLinguisticAnalysis(linguisticAnalysis);
  }
  if (conversationTurn.referencedProducts.length === 1) {
    session.activeGoal = focusActiveConversationGoal(
      session.activeGoal,
      conversationTurn.referencedProducts[0],
    );
  }

  expireStaleLastBotQuestion(session);

  let compoundAnalysis = analyzeCompoundQuestion(privacySafeQuestion(), {
    recentProducts:
      session.activeGoal?.products?.length
        ? session.activeGoal.products
        : session.lastProducts,
    focusedProductName: session.activeGoal?.focusedProductName || "",
  });
  let answerPlan = buildAnswerPlan(compoundAnalysis);
  let queuedAnswerSections = [];

  function currentProductClarification(productMatch) {
    const destination =
      extractInternationalShippingDestination(rawQuestion) ||
      extractShippingDestination(rawQuestion);
    return buildProductSearchClarification(productMatch, {
      question: privacySafeQuestion(),
      facets: compoundAnalysis.facets,
      destination,
    });
  }

  function beginProductClarification(productMatch, intent) {
    const options = buildProductSearchOptions(productMatch, intent);
    setPending(session, {
      type: "product_clarification",
      stage: "choose_product",
      data: {
        originalQuestion: privacySafeQuestion(),
        candidates: options.map((option) => ({
          id: option.product_id,
          name: option.product_name,
        })),
      },
    });
    return {
      type: "options",
      intro: currentProductClarification(productMatch),
      options,
      intent,
      _deferCoverageUntilProductSelection: true,
    };
  }
  let answerPlanProduct = null;
  let plannedProductFactsPrepared = false;
  let cleanProducts = null;

  const keepsRecommendationAsPrimary = () =>
    answerPlan.isMultiSection &&
    compoundAnalysis.primaryIntent === "recommendation" &&
    answerPlanIncludes(answerPlan, "recommendation");

  const directBudgetInfo = extractBudgetRange(rawQuestion);
  const recommendationBudgetFollowUp = isRecommendationBudgetFollowUp(
    session.lastBotQuestionType,
    rawQuestion,
  );
  const budgetInfo = recommendationBudgetFollowUp
    ? extractRecommendationBudgetAnswer(rawQuestion)
    : directBudgetInfo;
  const directExplicitIntent = detectExplicitIntentOverride(rawQuestion);
  const compoundExplicitIntent =
    compoundAnalysis.isCompound &&
    compoundAnalysis.primaryIntent &&
    compoundAnalysis.confidence >= 0.8
      ? {
          intent: compoundAnalysis.primaryIntent,
          method: "compound_question_rule",
          confidence: compoundAnalysis.confidence,
        }
      : null;
  const contextualIntent = resolveContextualIntent(rawQuestion, {
    explicitIntent: directExplicitIntent?.intent || "",
    lastIntent: session.lastIntent,
    lastBotQuestionType: session.lastBotQuestionType,
    lastBotQuestionMeta: session.lastBotQuestionMeta,
    hasRecentProducts:
      Array.isArray(session.lastProducts) && session.lastProducts.length > 0,
    productQueryScope,
  });
  const initialExplicitIntent =
    contextualIntent ||
    (recommendationBudgetFollowUp
      ? {
          intent: "recommendation",
          method: "recommendation_budget_followup_rule",
        }
      : compoundExplicitIntent || directExplicitIntent);
  let questionUnderstanding = buildQuestionUnderstanding(
    privacySafeQuestion(),
    {
      explicitIntent: initialExplicitIntent?.intent || "",
      linguisticAnalysis,
      productQueryScope,
      hasRecentProducts:
        Array.isArray(session.lastProducts) && session.lastProducts.length > 0,
      hasPageProduct: Boolean(
        pageContext?.productId || pageContext?.productName || pageContext?.url,
      ),
      hasPending: Boolean(getPending(session)),
    },
  );
  if (questionUnderstanding.reference_scope === "previous_products") {
    usesPreviousProductContext = true;
  } else if (questionUnderstanding.reference_scope === "specific_product") {
    usesPreviousProductContext = false;

    // A named product starts a new topic. Do not let the previous result list,
    // focused product, or optional follow-up leak into matching or suggestions.
    session.lastProducts = null;
    session.lastTopic = null;
    session.activeGoal = null;
    clearFollowUpOffer(session);
    updateSlot(session, "productName", null);

    compoundAnalysis = analyzeCompoundQuestion(privacySafeQuestion(), {
      recentProducts: [],
      focusedProductName: "",
    });
    answerPlan = buildAnswerPlan(compoundAnalysis);
  }
  if (compoundAnalysis.needsClarification) {
    questionUnderstanding = {
      ...questionUnderstanding,
      confidence: Math.min(
        questionUnderstanding.confidence,
        compoundAnalysis.confidence,
      ),
      needs_clarification: true,
      clarification_kind: compoundAnalysis.clarificationKind,
    };
  }

  const previousCommerceContext = {
    lastIntent: usesPreviousProductContext ? session.lastIntent || "" : "",
    lastTopic: usesPreviousProductContext ? session.lastTopic || "" : "",
    hasPending: Boolean(getPending(session)),
    hasRecentProducts:
      usesPreviousProductContext &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0,
  };

  const localScopeDecision = assessLocalCommerceScope(effectiveQuestion, {
    ...previousCommerceContext,
  });

  const groqConfig = resolveGroqRouterConfig();
  const llmAssistantConfig = resolveLlmAssistantConfig();
  const groqContext = {
    lastIntent: previousCommerceContext.lastIntent,
    lastTopic: previousCommerceContext.lastTopic,
    hasPending: previousCommerceContext.hasPending,
    recentProducts:
      usesPreviousProductContext && Array.isArray(session.lastProducts)
      ? session.lastProducts.map((product) => product?.name).filter(Boolean)
      : [],
    linguistic: linguisticHint,
    understanding: compactQuestionUnderstanding(questionUnderstanding),
    compound: compactCompoundQuestionAnalysis(compoundAnalysis),
    customerState,
    recentActions: session.lastSuggestedActions || [],
    contextualTurn: contextualIntent,
    activeGoal: usesPreviousProductContext ? session.activeGoal : null,
  };

  const localIntentTask =
    localScopeDecision === "out_of_scope"
      ? Promise.resolve({
          intent: "general",
          method: "out_of_scope_guard",
          score: 1,
        })
      : classifyIntentHybrid(effectiveQuestion);

  const useLlmLedUnderstanding = shouldUseLlmUnderstanding(
    privacySafeQuestion(),
    {
      mode: llmAssistantConfig.mode,
      routerEnabled: groqConfig.enabled,
    },
  );
  const groqRouteTask =
    (useLlmLedUnderstanding ||
    shouldUseSemanticRouter({
      enabled: groqConfig.enabled,
      localScope: localScopeDecision,
      question: privacySafeQuestion(),
    }))
    ? classifyCommerceWithGroqFallback({
        question: privacySafeQuestion(),
        context: groqContext,
        config: groqConfig,
      }).catch((error) => {
        console.error("GROQ SEMANTIC ROUTER ERROR:", {
          code: error?.code || "UNKNOWN",
          status: error?.status || 0,
          message: error?.message || String(error),
        });
        return null;
      })
    : Promise.resolve(null);

  const [localIntentResult, groqRoute] = await Promise.all([
    localIntentTask,
    groqRouteTask,
  ]);
  const configuredSemanticConfidence = Number(
    process.env.GROQ_ROUTER_MIN_CONFIDENCE,
  );
  const minSemanticConfidence = Number.isFinite(configuredSemanticConfidence)
    ? configuredSemanticConfidence
    : 0.65;

  const legacyIntentResult = chooseSemanticIntent({
    question: privacySafeQuestion(),
    localScope: localScopeDecision,
    local: localIntentResult,
    semantic: groqRoute,
    minSemanticConfidence,
  });
  const llmLedIntentResult = chooseSemanticIntent({
    question: privacySafeQuestion(),
    localScope: localScopeDecision,
    local: localIntentResult,
    semantic: groqRoute,
    minSemanticConfidence,
    llmLed: true,
  });
  let intentResult =
    llmAssistantConfig.mode === "active"
      ? llmLedIntentResult
      : legacyIntentResult;
  const llmToolPlan = buildLlmToolPlan(groqRoute, {
    internationalShipping: looksLikeInternationalShippingQuestion(rawQuestion),
  });

  const semanticDecisionIsPrimary =
    groqRoute?.scope === "in_scope" &&
    Number(groqRoute.confidence || 0) >= minSemanticConfidence &&
    String(intentResult.method || "").startsWith("groq_semantic:");

  if (semanticDecisionIsPrimary) {
    const semanticFacets = Array.isArray(groqRoute.goals)
      ? groqRoute.goals
      : [];
    compoundAnalysis = {
      ...compoundAnalysis,
      isCompound:
        compoundAnalysis.isCompound ||
        semanticFacets.length > 1 ||
        (groqRoute.intents || []).length > 1,
      facets: [...new Set([...compoundAnalysis.facets, ...semanticFacets])],
      primaryIntent: intentResult.intent,
      confidence: Number(groqRoute.confidence || 0),
    };
    answerPlan = buildAnswerPlan(compoundAnalysis);
    groqContext.compound = compactCompoundQuestionAnalysis(compoundAnalysis);
    groqContext.semanticDecision = groqRoute;
  } else if (contextualIntent) {
    intentResult = {
      ...intentResult,
      intent: contextualIntent.intent,
      method: contextualIntent.method,
      score: contextualIntent.confidence,
      scope: "in_scope",
    };
  } else if (compoundExplicitIntent) {
    intentResult = {
      ...intentResult,
      intent: compoundExplicitIntent.intent,
      method: compoundExplicitIntent.method,
      score: compoundExplicitIntent.confidence,
      scope: "in_scope",
    };
  }

  session.lastIntent = intentResult.intent || "general";
  session.lastIntentMethod =
    intentResult.method || "fallback_rule_low_confidence";
  session.lastIntentScore = intentResult.score ?? 0;

  console.log("INITIAL INTENT RESULT:", intentResult);

  function rebuildQuestion(newText) {
    rawQuestion = String(newText || "").trim();
    effectiveQuestion = normalizeQuestion(privacySafeQuestion());
    q = effectiveQuestion.toLowerCase();
    linguisticAnalysis = analyzeIndonesianQuestion(privacySafeQuestion());
    linguisticHint = compactLinguisticAnalysis(linguisticAnalysis);
    groqContext.linguistic = linguisticHint;
    compoundAnalysis = analyzeCompoundQuestion(privacySafeQuestion(), {
      recentProducts:
        session.activeGoal?.products?.length
          ? session.activeGoal.products
          : session.lastProducts,
      focusedProductName: session.activeGoal?.focusedProductName || "",
    });
    answerPlan = buildAnswerPlan(compoundAnalysis);
    groqContext.compound = compactCompoundQuestionAnalysis(compoundAnalysis);
    questionUnderstanding = buildQuestionUnderstanding(
      privacySafeQuestion(),
      {
        explicitIntent:
          detectExplicitIntentOverride(rawQuestion)?.intent || "",
        linguisticAnalysis,
        productQueryScope,
        hasRecentProducts:
          Array.isArray(session.lastProducts) &&
          session.lastProducts.length > 0,
        hasPageProduct: Boolean(
          pageContext?.productId || pageContext?.productName || pageContext?.url,
        ),
        hasPending: Boolean(getPending(session)),
      },
    );
    groqContext.understanding =
      compactQuestionUnderstanding(questionUnderstanding);
  }

  const isPromoQuery =
    q.includes("promo") ||
    q.includes("diskon") ||
    q.includes("sale") ||
    q.includes("cashback");

  const isCheapQuery =
    q.includes("murah") || q.includes("termurah") || q.includes("hemat");
  let pending = getPending(session);
  console.log("PENDING AFTER GET:", JSON.stringify(pending, null, 2));

  console.log("SESSION.PENDING:", JSON.stringify(session.pending, null, 2));

  console.log("PENDING AFTER LOAD:", pending);
  console.log("SESSION PENDING AFTER LOAD:", session.pending);
  console.log("INTENT BEFORE ROUTING:", intentResult);

  const isShippingQuoteQuestion = looksLikeShippingQuoteQuestion(rawQuestion);

  if (
    !semanticDecisionIsPrimary &&
    isShippingQuoteQuestion &&
    !keepsRecommendationAsPrimary()
  ) {
    clearPending(session); // keluar dari pending status transaksi
    intentResult = {
      intent: "shipping_transaction",
      method: "shipping_quote_override_rule",
      score: 0.99,
    };
  }

  if (
    !semanticDecisionIsPrimary &&
    looksLikePaymentMethodQuestion(rawQuestion) &&
    !keepsRecommendationAsPrimary()
  ) {
    clearPending(session);
    intentResult = {
      intent: "shipping_transaction",
      method: "payment_methods_override_rule",
      score: 0.99,
    };
  }

  if (
    !semanticDecisionIsPrimary &&
    (looksLikeTransactionPolicyQuestion(rawQuestion) ||
      looksLikeHowToBuyQuestion(rawQuestion)) &&
    !keepsRecommendationAsPrimary()
  ) {
    clearPending(session);
    intentResult = {
      intent: "shipping_transaction",
      method: "transaction_info_override_rule",
      score: 0.99,
    };
  }

  if (!semanticDecisionIsPrimary && looksLikeShippingOriginQuestion(rawQuestion)) {
    clearPending(session);
    intentResult = {
      intent: "shipping_origin",
      method: "shipping_origin_override_rule",
      score: 0.99,
    };
  }

  if (!semanticDecisionIsPrimary && looksLikeCompareQuestion(rawQuestion)) {
    clearPending(session);
    intentResult = {
      intent: "compare",
      method: "compare_override_rule",
      score: 0.99,
    };
  }

  if (
    !semanticDecisionIsPrimary &&
    looksLikeSpecificCatalogAvailabilityQuestion(rawQuestion)
  ) {
    intentResult = {
      intent: "product_discovery",
      method: "specific_catalog_availability_override_rule",
      score: 0.99,
    };
  }

  if (
    !semanticDecisionIsPrimary &&
    intentResult.score < 0.3 &&
    intentResult.ml_intent === "shipping_transaction"
  ) {
    intentResult = {
      ...intentResult,
      intent: "shipping_transaction",
      method: "ml_low_confidence_shipping_override",
    };
  }
  const budgetCanOverrideIntent = ![
    "compare",
    "shipping_transaction",
    "shipping_origin",
    "return_product",
    "transaction_status",
    "shipment_tracking",
  ].includes(intentResult.intent);

  if (
    !semanticDecisionIsPrimary &&
    budgetInfo.detected &&
    budgetCanOverrideIntent
  ) {
    session.slots.budgetMin = budgetInfo.min;
    session.slots.budgetMax = budgetInfo.max;

    if (
      intentResult.intent === "recommendation" ||
      looksLikeRecommendationRequest(rawQuestion)
    ) {
      intentResult = {
        ...intentResult,
        intent: "recommendation",
        method: "recommendation_budget_override_rule",
        score: 0.99,
      };
    } else {
      intentResult = {
        ...intentResult,
        intent: "price_promo",
        method: "budget_query_override_rule",
        score: 0.99,
      };
    }
  }
  console.log(
    "BUDGET CHECK:",
    privacySafeQuestion(),
    extractBudgetRange(rawQuestion),
  );
  console.log("AFTER ALL OVERRIDES:", intentResult);

  const isReturnProductQuestion = looksLikeReturnPolicyQuestion(rawQuestion);

  // 🔥 FORCE INTENT
  if (!semanticDecisionIsPrimary && isReturnProductQuestion) {
    intentResult = {
      intent: "return_product",
      method: "return_product_override_rule",
      score: 0.99,
    };
  }

  if (
    !semanticDecisionIsPrimary &&
    pageContext &&
    looksLikeCurrentProductDetailQuestion(rawQuestion)
  ) {
    intentResult = {
      intent: "product_detail",
      method: "current_page_product_detail_override_rule",
      score: 0.99,
    };
  }

  if (looksLikeTransactionStatusQuestion(rawQuestion)) {
    clearPending(session);
    intentResult = {
      intent: "transaction_status",
      method: "transaction_status_override_rule",
      score: 0.99,
    };
  }

  if (
    !semanticDecisionIsPrimary &&
    (q.includes("asuransi") ||
      q.includes("proteksi pengiriman") ||
      q.includes("barang diasuransikan") ||
      q.includes("bisa diasuransikan") ||
      q.includes("pakai asuransi")) &&
    !keepsRecommendationAsPrimary()
  ) {
    intentResult = {
      intent: "shipping_transaction",
      method: "insurance_override_rule",
      score: 0.99,
    };
  }

  const extractedResi = extractTrackingNumber(rawQuestion);

  const trackingQuestion = looksLikeTrackingQuestion(rawQuestion);

  if (
    trackingQuestion ||
    (extractedResi && /\b(resi|lacak|tracking|paket)\b/i.test(rawQuestion))
  ) {
    intentResult = {
      intent: "shipment_tracking",
      method: extractedResi
        ? "shipment_tracking_override_by_resi"
        : "shipment_tracking_override_rule",
      score: 0.99,
    };
  }

  const selectedSuggestionIntent =
    selectedSuggestion && !resumedProductClarification
    ? suggestedActionIntent(selectedSuggestion)
    : null;
  const explicitCurrentIntent = initialExplicitIntent;
  const pendingExplicitIntent =
    selectedSuggestionIntent ||
    explicitCurrentIntent?.intent ||
    (isReturnProductQuestion ? "return_product" : "") ||
    (looksLikeSpecificCatalogAvailabilityQuestion(rawQuestion)
      ? "product_discovery"
      : "");

  let activePendingAfterOverrides = getPending(session);
  if (
    shouldInterruptPendingFlow({
      pending: activePendingAfterOverrides,
      explicitIntent: pendingExplicitIntent,
      explicitMethod: explicitCurrentIntent?.method || "",
      detectedIntent: intentResult.intent,
      detectedScore: intentResult.score,
      localScope: localScopeDecision,
      question: rawQuestion,
    })
  ) {
    clearPending(session);
    session.lastStep = null;
    pending = null;
    activePendingAfterOverrides = null;
  }

  if (isShippingQuotePending(activePendingAfterOverrides)) {
    pending = activePendingAfterOverrides;
    intentResult = {
      intent: "shipping_transaction",
      method: "shipping_pending_state_rule",
      score: 1,
    };
    session.lastIntent = "shipping_transaction";
    session.lastIntentMethod = "shipping_pending_state_rule";
    session.lastIntentScore = 1;
  }

  if (selectedSuggestionIntent) {
    intentResult = {
      ...intentResult,
      intent: selectedSuggestionIntent,
      method: `suggested_action_${selectedSuggestion.action_key}_rule`,
      score: 1,
    };
    session.lastIntent = intentResult.intent;
    session.lastIntentMethod = intentResult.method;
    session.lastIntentScore = intentResult.score;
  }

  const isContextualPriceOrdering = isPriceOrderingFollowUp(rawQuestion);
  if (
    explicitCurrentIntent &&
    !isYesAnswer(rawQuestion) &&
    !isContextualPriceOrdering &&
    !recommendationBudgetFollowUp
  ) {
    clearLastBotQuestion(session);
  }

  if (isSuggestionClick) {
    let pending = getPending(session);

    // jangan hapus pending kalau user sedang ada di flow multi-step penting
    const protectedPending =
      pending?.type === "shipping_quote" ||
      pending?.type === "product_clarification" ||
      pending?.type === "compare" ||
      pending?.type === "checkout_flow" ||
      pending?.type === "shipment_tracking" ||
      pending?.type === "transaction_status";

    if (!protectedPending) {
      clearPending(session);
      session.lastStep = null;
    }
  }

  try {
    console.log("RAW QUESTION:", privacySafeQuestion());
    console.log("NORMALIZED QUESTION:", effectiveQuestion);

    let semantic = semanticRouteToLegacy(groqRoute);

    if (
      !semantic &&
      GEMINI_MODE.enableSemanticParse &&
      localScopeDecision !== "out_of_scope"
    ) {
      semantic = await parseUserIntentWithGemini(
        rawQuestion,
        usesPreviousProductContext
          ? session
          : {
              ...session,
              lastTopic: null,
              lastProducts: [],
              slots: { ...session.slots, productName: null },
            },
      );
    }

    console.log("SEMANTIC RESULT:", semantic);

    if ((intentResult?.score || 0) < 0.55 && semantic?.intent) {
      intentResult = {
        intent: semantic.intent,
        method: "semantic_fallback",
        score: 0.6,
        semantic,
      };
    } else {
      intentResult = {
        ...intentResult,
        semantic,
      };
    }

    session.lastIntent = intentResult.intent || session.lastIntent;
    session.lastIntentMethod = intentResult.method || session.lastIntentMethod;
    session.lastIntentScore = intentResult.score ?? session.lastIntentScore;

    console.log("FINAL INTENT RESULT:", intentResult);

    // ✅ GREETING GUARD (BIAR "HALO/HAI" GA MASUK SEARCH)
    if (!isSuggestionClick && isGreetingOnly(rawQuestion)) {
      let pending = getPending(session);

      if (pending?.type === "shipping_quote") {
        if (pending.stage === "need_location") {
          const resolved = await resolveShippingLocation(rawQuestion);

          if (resolved.kind === "single_city") {
            const city = resolved.city;

            return send(
              await beginDistrictSelection(
                session,
                city.city_id,
                city.name,
              ),
              "shipping_transaction",
            );
          }

          if (resolved.kind === "multi_city") {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_city",
              data: {
                candidates: resolved.cities.slice(0, 8),
              },
            });

            return send(
              buildOptionsPayload(
                `Aku nemu beberapa hasil untuk **${rawQuestion}**. Pilih kota/kabupaten yang benar ya:`,
                resolved.cities.slice(0, 8).map((c) => ({
                  label: c.name,
                  value: c.name,
                })),
              ),
              "shipping_transaction",
            );
          }

          if (resolved.kind === "single_district") {
            const d = resolved.district;

            const quote = await getShippingQuoteFromWP_OKID({
              city_id: d.city_id,
              district_id: d.district_id,
              weight_grams: 1000,
            });

            const rates = quote.rates || [];
            const list = rates
              .map(
                (r) =>
                  `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
              )
              .join("\n");

            clearPending(session);

            return send(
              {
                type: "text",
                message:
                  `Oke, aku anggap tujuan **${d.title}, ${d.city_name}** ya.\n\n` +
                  `Ongkir estimasi (±1kg):\n\n${list}`,
              },
              "shipping_transaction",
            );
          }

          if (resolved.kind === "multi_district") {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district",
              data: {
                candidates: resolved.districts.slice(0, 8),
              },
            });

            return send(
              buildOptionsPayload(
                `Aku nemu beberapa kecamatan yang mirip dengan **${rawQuestion}**. Pilih yang benar ya:`,
                resolved.districts.slice(0, 8).map((d) => ({
                  label: `${d.title} - ${d.city_name}`,
                  value: `${d.title} - ${d.city_name}`,
                })),
              ),
              "shipping_transaction",
            );
          }

          return send(
            {
              type: "text",
              message:
                "Lokasinya belum ketemu 🙏 Coba tulis nama kota/kabupaten atau kecamatan yang lebih lengkap ya.",
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "choose_city") {
          const candidates = pending.data?.candidates || [];

          const picked = candidates.find(
            (c) => normalizeCityName(c.name) === normalizeCityName(rawQuestion),
          );

          if (!picked) {
            return send({
              type: "text",
              message:
                "Aku belum yakin kota yang dipilih. Coba klik salah satu opsi ya 😊",
            });
          }

          return send(
            await beginDistrictSelection(
              session,
              picked.city_id,
              picked.name,
            ),
            "shipping_transaction",
          );
        }

        if (pending.stage === "need_district") {
          const districtQuery = extractDistrictFollowUp(rawQuestion);
          const data = await searchDistrictsFromWP(
            pending.data.city_id,
            districtQuery,
          ).catch(() => null);

          const districts = data?.districts || [];

          if (!districts.length) {
            return send(
              await beginDistrictSelection(
                session,
                pending.data.city_id,
                pending.data.city_name,
              ),
              "shipping_transaction",
            );
          }

          if (districts.length > 1) {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district_in_city",
              data: {
                city_id: pending.data.city_id,
                city_name: pending.data.city_name,
                candidates: districts.slice(0, 8),
              },
            });

            return send(
              buildOptionsPayload(
                `Aku nemu beberapa kecamatan di **${pending.data.city_name}**. Pilih yang benar ya:`,
                districts.slice(0, 8).map((d) => ({
                  label: d.title,
                  value: d.title,
                })),
              ),
              "shipping_transaction",
            );
          }

          const top = districts[0];

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: pending.data.city_id,
            district_id: top.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${top.title}**:\n\n${list}`,
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "choose_district_in_city") {
          const candidates = pending.data?.candidates || [];
          const picked = candidates.find(
            (d) =>
              normalizeLocationText(d.title) ===
              normalizeLocationText(rawQuestion),
          );

          if (!picked) {
            return send(
              buildOptionsPayload(
                `Aku belum yakin kecamatan yang kamu pilih di **${pending.data.city_name}**. Coba pilih salah satu ini ya:`,
                candidates.map((d) => ({
                  label: d.title,
                  value: d.title,
                })),
              ),
              "shipping_transaction",
            );
          }

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: pending.data.city_id,
            district_id: picked.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${picked.title}**:\n\n${list}`,
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "choose_district") {
          const candidates = pending.data?.candidates || [];
          const picked = candidates.find(
            (d) =>
              normalizeLocationText(`${d.title} - ${d.city_name}`) ===
                normalizeLocationText(rawQuestion) ||
              normalizeLocationText(d.title) ===
                normalizeLocationText(rawQuestion),
          );

          if (!picked) {
            return send(
              buildOptionsPayload(
                "Aku belum yakin kecamatan yang kamu pilih. Coba pilih salah satu ini ya:",
                candidates.map((d) => ({
                  label: `${d.title} - ${d.city_name}`,
                  value: `${d.title} - ${d.city_name}`,
                })),
              ),
              "shipping_transaction",
            );
          }

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: picked.city_id,
            district_id: picked.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${picked.title} - ${picked.city_name}**:\n\n${list}`,
            },
            "shipping_transaction",
          );
        }
      }

      session.lastIntent = "greeting";

      return await send(
        {
          type: "text",
          intent: "greeting",
          message: buildGreetingMessage(),
        },
        "greeting",
      );
    }

    // ===============================
    // ✅ POSTCODE GUARD (ANTI MASUK SEARCH PRODUK)
    // taruh sebelum SMART SEARCH MODE
    // ===============================
    const postcodeOnly = rawQuestion.trim().match(/^\d{5}$/);

    if (postcodeOnly) {
      const postcode = postcodeOnly[0];

      // set pending supaya step berikutnya minta produk (karena dummy product_id nanti saja)
      setPending(session, {
        type: "shipping_quote",
        stage: "need_product",
        data: { postcode },
      });

      return await send(
        {
          type: "text",
          message: `Sip, kode pos **${postcode}** ✅\n\nSekarang mau cek ongkir untuk **produk apa**? (kirim nama produk / link)`,
        },
        "shipping_transaction",
      );
    }

    async function logIntentToSupabase({
      sessionId,
      rawQuestion,
      intent = null,
      method = null,
      score = null,
    }) {
      if (!supabase) return;

      try {
        const { error } = await supabase.from("intent_logs").insert({
          session_id: sessionId,
          rawquestion: rawQuestion,
          intent,
          method,
          score,
        });

        if (error) {
          console.error("SUPABASE INSERT ERROR:", error.message);
        }
      } catch (e) {
        console.error("SUPABASE INSERT ERROR:", e?.message || e);
      }
    }

    function rememberSuggestedActions(actions = []) {
      const values = [...(session.lastSuggestedActions || []), ...actions]
        .map((action) =>
          String(
            action && typeof action === "object"
              ? action.value || action.label || ""
              : action || "",
          ).trim(),
        )
        .filter(Boolean);
      session.lastSuggestedActions = values.slice(-30);
    }

    // ✅ bikin send() dulu supaya bisa dipakai state handler
    async function preparePlannedProductFacts(payload = {}) {
      if (
        plannedProductFactsPrepared ||
        !answerPlan.isMultiSection ||
        !answerPlanIncludes(answerPlan, "product_facts")
      ) {
        return;
      }

      plannedProductFactsPrepared = true;
      if (answerPlanProduct) return;

      const payloadProduct = Array.isArray(payload.products)
        ? payload.products[0]
        : null;
      if (payloadProduct) {
        answerPlanProduct = payloadProduct;
        return;
      }

      let catalog = [];
      try {
        catalog = await getCleanProducts();
      } catch (error) {
        console.error(
          "ANSWER PLAN PRODUCT FETCH ERROR:",
          error?.message || error,
        );
      }

      const productMatch = catalog.length
        ? resolveRequestedProduct(rawQuestion, catalog, { compound: true })
        : { product: null, status: "unavailable" };
      const product = productMatch.product;

      if (product) {
        answerPlanProduct = product;
        session.lastProducts = [product];
        queuedAnswerSections.push(
          `**Informasi produk**\n${buildProductTransactionSummary(product, rawQuestion)}`,
        );
        return;
      }

      queuedAnswerSections.push(
        productMatch.status === "ambiguous"
          ? currentProductClarification(productMatch)
          : productMatch.status === "unavailable"
            ? "**Informasi produk**\nMaaf, data katalog sedang sulit diakses sehingga kondisi atau kelengkapan produk belum bisa dipastikan sekarang."
            : "**Informasi produk**\nMaaf, produk yang dimaksud belum bisa dipastikan dari katalog, jadi kondisi atau kelengkapannya belum dapat dikonfirmasi.",
      );
    }

    async function send(payload, forceIntent = null) {
      const finalIntent =
        forceIntent ?? payload.intent ?? session.lastIntent ?? "general";

      if (finalIntent === "general") {
        queuedAnswerSections = [];
      } else {
        await preparePlannedProductFacts(payload);
      }

      if (queuedAnswerSections.length) {
        payload =
          forceIntent === "recommendation" &&
          answerPlanIncludes(answerPlan, "recommendation")
            ? appendAnswerSections(payload, queuedAnswerSections)
            : prependAnswerSections(payload, queuedAnswerSections);
        queuedAnswerSections = [];
      }

      if (
        payload.type === "products" &&
        Array.isArray(payload.products) &&
        payload.products.length
      ) {
        payload.products = payload.products.map((p) => ({
          ...p,
          image: getProductImageUrl(p),
        }));

        session.lastProducts = payload.products.map((p) => ({
          id: p.id,
          name: p.name,
          image: getProductImageUrl(p),
          stock: p.stock,
          stockQuantity: p.stockQuantity ?? null,
          numericPrice: p.numericPrice,
          effectivePrice: p.effectivePrice,
          regular_price: p.regular_price,
          sale_price: p.sale_price,
          discountPercent: p.discountPercent || 0,
          discountAmount: p.discountAmount || 0,
          isPromo: !!p.isPromo,
          condition: p.condition,
          description: p.description || "",
          shortDescription:
            p.shortDescription || p.short_description || "",
          category: p.category || "",
          weight: p.weight,
          dimensions: p.dimensions,
          link: p.link,
        }));

        session.lastTopic = payload.products[0]?.name || session.lastTopic;
        updateSlot(session, "productName", payload.products[0]?.name || null);

        session.lastFilters = {
          priceMode:
            forceIntent === "price_promo"
              ? payload.reasoning_text?.toLowerCase().includes("diskon")
                ? "promo"
                : null
              : null,
          stockOnly: payload.products.every((p) => p.stock === "instock"),
          promoOnly: payload.products.every(
            (p) => Number(p.discountPercent || 0) > 0,
          ),
          keyword: rawQuestion,
          source: finalIntent,
        };
      }

      console.log("SEND PAYLOAD:", {
        forceIntent,
        payloadIntent: payload.intent,
        sessionLastIntent: session.lastIntent,
        payloadType: payload.type,
        productCount: payload.products?.length || 0,
      });

      if (finalIntent !== session.lastIntent) {
        session.lastIntentMethod = `response_${finalIntent}_route`;
        session.lastIntentScore = 1;
      }
      session.lastIntent = finalIntent;
      session.activeGoal = buildActiveConversationGoal(session.activeGoal, {
        intent: finalIntent,
        products: session.lastProducts,
        slots: session.slots,
        filters: session.lastFilters,
      });
      const suggestionLimit = finalIntent === "greeting" ? 6 : 3;
      let finalPayload = humanizeResponse(payload, {
        intent: finalIntent,
        rawQuestion,
      });

      const suggestionQuestion = privacySafeQuestion();
      const suppressSuggestedActions =
        Boolean(finalPayload.admin_handoff) ||
        (!finalPayload._actionContext &&
          isRequiredClarificationPayload(finalPayload));
      const actionCandidates =
        suppressSuggestedActions
          ? []
          : buildControlledActions(finalIntent, finalPayload, {
              recentActions: session.lastSuggestedActions || [],
              limit: finalIntent === "greeting" ? 12 : 8,
              userQuestion: suggestionQuestion,
            });

      finalPayload = applyControlledFollowUpPolicy(finalPayload, {
        intent: finalIntent,
        recentActions: session.lastSuggestedActions || [],
        limit: suggestionLimit,
        userQuestion: suggestionQuestion,
      });

      if (isOptionalFollowUpType(session.lastBotQuestionType)) {
        clearFollowUpOffer(session);
      }

      // simpan follow-up state jika humanizer memberi tawaran lanjutan
      if (finalPayload._followUpType) {
        setFollowUpOffer(
          session,
          finalPayload._followUpType,
          finalPayload._followUpMeta || {},
        );
      }

      const naturalizerConfig = resolveGroqNaturalizerConfig();
      let assistantMeta = {
        provider: "template",
        naturalized: false,
        reason: "groq_disabled",
      };

      if (llmAssistantConfig.mode === "active") {
        assistantMeta = {
          provider: "template",
          naturalized: false,
          reason: "deferred_to_llm_composer",
        };
      } else if (finalIntent === "transaction_status") {
        assistantMeta = {
          provider: "template",
          naturalized: false,
          reason: "sensitive_intent",
        };
      } else if (naturalizerConfig.enabled) {
        finalPayload = await naturalizeResponseWithGroq(finalPayload, {
          userQuestion: privacySafeQuestion(),
          intent: finalIntent,
          conversationContext: groqContext,
          actionCandidates,
          config: naturalizerConfig,
          onStatus(status) {
            assistantMeta = status;
          },
        });
      } else {
        finalPayload = await naturalizeWithGemini(
          finalPayload,
          privacySafeQuestion(),
        );
        assistantMeta = {
          provider: genai ? "gemini" : "template",
          naturalized: null,
          reason: genai ? "groq_disabled" : "no_llm_configured",
        };
      }

      if (!suppressSuggestedActions && finalIntent === "greeting") {
        const fallbackActions = buildControlledActions(
          finalIntent,
          finalPayload,
          {
            recentActions: session.lastSuggestedActions || [],
            limit: 12,
            userQuestion: suggestionQuestion,
          },
        );
        finalPayload.actions = dedupeSuggestedActions([
            ...(Array.isArray(finalPayload.actions)
              ? finalPayload.actions
              : []),
            ...fallbackActions,
          ]).slice(0, suggestionLimit);
      }

      if (suppressSuggestedActions) {
        delete finalPayload.actions;
        delete finalPayload.suggestions;
      }

      finalPayload = applyCustomerStateAcknowledgement(finalPayload, {
        state: customerState,
        intent: finalIntent,
      });

      const coverageProduct =
        finalPayload.products?.[0] || answerPlanProduct || null;
      const productCoverageSection = coverageProduct
        ? `**Informasi produk yang belum tercantum**\n${buildProductTransactionSummary(
            coverageProduct,
            rawQuestion,
          )}`
        : "";
      const transactionCoverageSection = buildTransactionPolicyMessage(
        privacySafeQuestion(),
        {
          codEnabled:
            String(process.env.COD_ENABLED || "false").toLowerCase() ===
            "true",
        },
      );
      const storeAddress =
        process.env.STORE_ADDRESS_TEXT ||
        "Robot Jadul. Blok M Square lt 3A blok A no 36-37. Jl Melawai 5. Jakarta Selatan 12160. Indonesia";
      const storeCoverageSection = buildStoreVisitMessage({
        hoursText: process.env.STORE_HOURS_TEXT || "",
        addressText: storeAddress,
      });
      const shippingDestination = extractShippingDestination(rawQuestion);
      const productClarification =
        "Sebutkan nama produk atau kode produknya agar data katalog yang benar bisa diperiksa.";
      const coverageRepair = repairAnswerCoverage(
        privacySafeQuestion(),
        finalPayload,
        {
          answerSections: {
            material: productCoverageSection,
            dimensions: productCoverageSection,
            product_condition: productCoverageSection,
            completeness: productCoverageSection,
            price: productCoverageSection,
            stock: productCoverageSection,
            promo: productCoverageSection,
            bulk_discount: transactionCoverageSection,
            free_shipping: transactionCoverageSection,
            insurance: transactionCoverageSection,
            packing: transactionCoverageSection,
            shipping_estimate: transactionCoverageSection,
            same_day: transactionCoverageSection,
            cod: transactionCoverageSection,
            payment_methods: transactionCoverageSection,
            store_location: storeCoverageSection,
            store_hours: storeCoverageSection,
            return_policy: buildReturnPolicyMessage(rawQuestion),
            refund: buildReturnPolicyMessage(rawQuestion),
          },
          clarificationSections: {
            material: productClarification,
            dimensions: productClarification,
            product_condition: productClarification,
            completeness: productClarification,
            price: productClarification,
            stock: productClarification,
            promo: productClarification,
            shipping_quote: shippingDestination
              ? `Untuk menghitung ongkir ke **${shippingDestination}**, sebutkan juga kecamatan tujuan.`
              : "Untuk melengkapi cek ongkir, sebutkan kota/kabupaten dan kecamatan tujuan.",
          },
        },
      );
      finalPayload = coverageRepair.payload;

      let llmComposerMeta = {
        mode: llmAssistantConfig.mode,
        status:
          llmAssistantConfig.mode === "legacy"
            ? "disabled"
            : finalIntent === "transaction_status"
              ? "sensitive_intent"
              : "not_run",
        accepted: false,
      };
      const canReuseShadowComposition =
        llmAssistantConfig.mode === "shadow" &&
        coverageRepair.repaired.length === 0 &&
        coverageRepair.clarified.length === 0;

      if (canReuseShadowComposition) {
        llmComposerMeta = {
          mode: "shadow",
          status: assistantMeta.naturalized
            ? "shadow_reused_legacy_composer"
            : assistantMeta.reason || "not_composed",
          accepted: Boolean(assistantMeta.naturalized),
          changed: Boolean(assistantMeta.naturalized),
          provider: assistantMeta.provider,
          model: assistantMeta.model,
          safety_issue: assistantMeta.validation_reason || null,
        };
      } else if (
        llmAssistantConfig.mode !== "legacy" &&
        finalIntent !== "transaction_status"
      ) {
        const composed = await runLlmAnswerComposer({
          payload: finalPayload,
          question: privacySafeQuestion(),
          intent: finalIntent,
          conversationContext: groqContext,
          actionCandidates,
          config: llmAssistantConfig,
        });
        finalPayload = composed.payload;
        llmComposerMeta = composed.meta;

        if (llmAssistantConfig.mode === "active") {
          assistantMeta = {
            provider: composed.meta.provider || "template",
            model: composed.meta.model,
            naturalized: composed.meta.accepted,
            reason: composed.meta.status,
          };
        }
      }

      for (const field of ["actions", "suggestions"]) {
        if (Array.isArray(finalPayload[field])) {
          finalPayload[field] = filterAnsweredSuggestedActions(
            finalPayload[field],
            finalPayload,
          );
          if (!finalPayload[field].length) delete finalPayload[field];
        }
      }

      if (isRequiredClarificationPayload(finalPayload)) {
        delete finalPayload.actions;
        delete finalPayload.suggestions;
      }

      finalPayload = serializeSuggestedActions(finalPayload);
      const finalSuggestedActions =
        finalPayload.actions || finalPayload.suggestions || [];
      if (finalSuggestedActions.length) {
        rememberSuggestedActions(finalSuggestedActions);
      }

      assistantMeta = {
        ...assistantMeta,
        customer_state: customerState,
        understanding: compactQuestionUnderstanding(questionUnderstanding),
        compound: compactCompoundQuestionAnalysis(compoundAnalysis),
        answer_plan: compactAnswerPlan(answerPlan),
        answer_coverage: {
          requested: coverageRepair.after.requested,
          repaired: coverageRepair.repaired,
          clarified: coverageRepair.clarified,
          unresolved: coverageRepair.unresolved,
          coverage: coverageRepair.after.coverage,
        },
        router:
          groqRoute?.provider === "groq"
            ? {
                provider: "groq",
                model: groqRoute.model || naturalizerConfig.model,
              }
            : {
                provider: "local_rules_ml",
              },
        llm_led: {
          mode: llmAssistantConfig.mode,
          understanding_provider: groqRoute?.provider || "local_rules_ml",
          understanding_intent: llmLedIntentResult.intent,
          understanding_confidence: llmLedIntentResult.score,
          understanding_goals: Array.isArray(groqRoute?.goals)
            ? groqRoute.goals
            : [],
          topic_relation: groqRoute?.topic_relation || "new_topic",
          tool_plan: llmToolPlan.map((step) => step.tool),
          composer_status: llmComposerMeta.status,
          composer_accepted: Boolean(llmComposerMeta.accepted),
          composer_changed: Boolean(llmComposerMeta.changed),
          composer_validation: llmComposerMeta.validation || null,
          composer_safety_issue: llmComposerMeta.safety_issue || null,
        },
      };

      console.log("AI RESPONSE EDITOR:", assistantMeta);

      await Promise.all([
        logIntentToSupabase({
          sessionId,
          rawQuestion: privacySafeQuestion(),
          intent: finalIntent,
          method: session.lastIntentMethod || "fallback_rule_low_confidence",
          score: session.lastIntentScore ?? 0,
        }),
        isBootstrapGreeting
          ? Promise.resolve()
          : logChatMetricToSupabase({
              sessionId,
              status: "success",
              intent: finalIntent,
              intentMethod:
                session.lastIntentMethod || "fallback_rule_low_confidence",
              intentScore: session.lastIntentScore,
              responseType: finalPayload.type,
              assistantProvider: assistantMeta.provider,
              assistantModel: assistantMeta.model,
              assistantReason: assistantMeta.reason,
              routerProvider: assistantMeta.router?.provider,
              routerModel: assistantMeta.router?.model,
              latencyMs: Date.now() - requestStartedAt,
              productCount: finalPayload.products?.length,
              optionCount: finalPayload.options?.length,
              actionCount: finalPayload.actions?.length,
              answerCoverageBefore: coverageRepair.before.coverage,
              answerCoverageAfter: coverageRepair.after.coverage,
              coverageRequested: coverageRepair.after.requested,
              coverageRepaired: coverageRepair.repaired,
              coverageClarified: coverageRepair.clarified,
              coverageUnresolved: coverageRepair.unresolved,
              llmAssistantMode: llmAssistantConfig.mode,
              llmComposerStatus: llmComposerMeta.status,
              llmComposerAccepted: llmComposerMeta.accepted,
            }),
      ]);

      await saveSessionState(supabase, sessionId, {
        lastIntent: session.lastIntent,
        lastTopic: session.lastTopic,
        lastStep: session.lastStep,
        lastProducts: session.lastProducts,
        lastSuggestedActions: session.lastSuggestedActions,
        lastBotQuestionType: session.lastBotQuestionType,
        lastBotQuestionMeta: session.lastBotQuestionMeta,
        lastFilters: session.lastFilters,
        slots: session.slots,
        activeGoal: session.activeGoal,
        pending: session.pending,
        history: session.history?.slice(-50) || [],
      });

      delete finalPayload._noTruncateReasoning;
      delete finalPayload._followUpType;
      delete finalPayload._followUpMeta;
      delete finalPayload._deferCoverageUntilProductSelection;

      console.log("SAVING SESSION PENDING:", session.pending);
      console.log(
        "HUMANIZER INTENT:",
        forceIntent ?? payload.intent ?? session.lastIntent,
      );
      return res.json({
        ...finalPayload,
        intent: finalIntent,
        assistant_meta: assistantMeta,
      });
    }

    if (
      compoundAnalysis.needsClarification &&
      !getPending(session)
    ) {
      const payload = compoundAnalysis.clarificationOptions.length
        ? buildOptionsPayload(
            compoundAnalysis.clarificationQuestion,
            compoundAnalysis.clarificationOptions,
          )
        : {
            type: "text",
            message: compoundAnalysis.clarificationQuestion,
          };
      return await send(payload, compoundAnalysis.primaryIntent || "general");
    }

    if (
      questionUnderstanding.needs_clarification &&
      questionUnderstanding.clarification_kind === "origin_meaning" &&
      !getPending(session)
    ) {
      const recentProductNames = (session.lastProducts || [])
        .map((product) => String(product?.name || "").trim())
        .filter(Boolean);
      const productOriginQuestion =
        recentProductNames.length === 1
          ? `${recentProductNames[0]} dibuat atau diproduksi di negara mana?`
          : "Saya menanyakan negara produksi salah satu produk sebelumnya";

      return await send(
        buildOptionsPayload(
          "Yang kamu maksud asal pengiriman dari toko atau negara produksi produknya?",
          [
            {
              label: "Asal pengiriman",
              value: "Pengiriman pesanan diproses dari mana?",
            },
            {
              label: "Negara produksi produk",
              value: productOriginQuestion,
            },
          ],
        ),
        "general",
      );
    }

    if (
      semantic?.needs_followup &&
      semantic.followup_question &&
      !getPending(session) &&
      !recommendationBudgetFollowUp &&
      !isGreetingOnly(rawQuestion)
    ) {
      return await send(
        {
          type: "text",
          message: semantic.followup_question,
        },
        semantic.intent || intentResult.intent || "general",
      );
    }

    async function verifyOrderStatus(orderId, verification, attempts = 0) {
      let order = null;
      try {
        order = await fetchWooOrderById(orderId);
      } catch (error) {
        if (Number(error?.status || 0) !== 404) {
          console.error("ORDER FETCH ERROR:", error?.message || error);
          return await send(
            {
              type: "text",
              message:
                "Maaf, layanan status pesanan sedang sulit diakses. Data verifikasi tidak disimpan; coba lagi beberapa saat ya.",
            },
            "transaction_status",
          );
        }
      }

      if (!matchesOrderVerification(order, verification)) {
        const nextAttempts = Number(attempts || 0) + 1;
        const locked = nextAttempts >= 3;

        if (locked) {
          clearPending(session);
        } else {
          setPending(session, {
            type: "transaction_status",
            stage: "need_verification",
            data: { orderId, attempts: nextAttempts },
          });
        }

        return await send(
          {
            type: "text",
            message: buildOrderVerificationFailedMessage({ locked }),
          },
          "transaction_status",
        );
      }

      clearPending(session);
      session.lastIntent = "transaction_status";
      session.lastTopic = "pesanan terverifikasi";

      return await send(
        {
          type: "text",
          message: buildTransactionStatusMessage(order),
        },
        "transaction_status",
      );
    }

    const activeOrderPending = getPending(session);
    if (activeOrderPending?.type === "transaction_status") {
      if (/^(?:batal|batalkan|cancel)$/i.test(rawQuestion.trim())) {
        clearPending(session);
        return await send(
          {
            type: "text",
            message: "Pengecekan status pesanan dibatalkan.",
          },
          "transaction_status",
        );
      }

      if (activeOrderPending.stage === "need_verification") {
        const verification = extractOrderVerification(rawQuestion);
        if (verification) {
          return await verifyOrderStatus(
            activeOrderPending.data?.orderId,
            verification,
            activeOrderPending.data?.attempts,
          );
        }

        if (intentResult.intent === "transaction_status") {
          return await send(
            {
              type: "text",
              message: buildOrderVerificationPrompt(
                activeOrderPending.data?.orderId,
              ),
            },
            "transaction_status",
          );
        }

        clearPending(session);
      }

      if (activeOrderPending.stage === "need_order_id") {
        const orderId = extractOrderId(rawQuestion);
        if (orderId) {
          const verification = extractOrderVerification(rawQuestion);
          if (verification) {
            return await verifyOrderStatus(orderId, verification);
          }

          setPending(session, {
            type: "transaction_status",
            stage: "need_verification",
            data: { orderId, attempts: 0 },
          });
          return await send(
            {
              type: "text",
              message: buildOrderVerificationPrompt(orderId),
            },
            "transaction_status",
          );
        }

        if (intentResult.intent !== "transaction_status") {
          clearPending(session);
        }
      }
    }

    if (isYesAnswer(rawQuestion) && !isSuggestionClick) {
      const clarification = buildStandaloneAffirmationResponse({
        pending: getPending(session),
        lastBotQuestionType: session.lastBotQuestionType,
        lastIntent: session.lastIntent || "general",
        lastProducts: session.lastProducts || [],
        recentActions: session.lastSuggestedActions || [],
      });

      if (isOptionalFollowUpType(session.lastBotQuestionType)) {
        clearFollowUpOffer(session);
      }

      return await send(
        clarification,
        clarification.intent || session.lastIntent || "general",
      );
    }

    let finalScopeDecision = intentResult.scope || localScopeDecision;

    if (finalScopeDecision === "ambiguous") {
      const geminiScope = await withTimeout(
        classifyCommerceScopeWithGemini({
          question: privacySafeQuestion(),
          lastIntent: previousCommerceContext.lastIntent,
          lastTopic: previousCommerceContext.lastTopic,
        }),
        5000,
      ).catch((err) => {
        console.error("SCOPE CHECK TIMEOUT:", err?.message || err);
        return null;
      });

      if (geminiScope) {
        finalScopeDecision = geminiScope;
      } else {
        const intentMethod = String(intentResult.method || "");
        const trustedLocalIntent =
          isCommerceIntent(intentResult.intent) &&
          (previousCommerceContext.hasPending ||
            (Number(intentResult.score || 0) >= 0.9 &&
              (intentMethod.includes("override_rule") ||
                intentMethod.includes("phrase_rule"))));

        finalScopeDecision = trustedLocalIntent ? "in_scope" : "out_of_scope";
      }
    }

    console.log("COMMERCE SCOPE:", {
      local: localScopeDecision,
      final: finalScopeDecision,
      previousIntent: previousCommerceContext.lastIntent,
    });

    if (finalScopeDecision === "out_of_scope") {
      clearPending(session);
      session.lastIntent = "general";
      session.lastIntentMethod = "out_of_scope_guard";
      session.lastIntentScore = 1;

      return await send(
        {
          type: "text",
          intent: "general",
          message: buildOutOfScopeMessage(rawQuestion),
        },
        "general",
      );
    }

    // ===============================
    // ✅ HANDLE PENDING SHIPPING QUOTE DULU
    // WAJIB sebelum intent produk / getCleanProducts()
    // ===============================
    if (pending?.type === "shipping_quote") {
      console.log("SHIPPING PENDING HANDLER HIT:", pending);

      // user sedang diminta kecamatan
      if (pending.stage === "need_district") {
        const districtQuery = extractDistrictFollowUp(rawQuestion);
        let districtLookupFailed = false;
        const data = await searchDistrictsFromWP(
          pending.data.city_id,
          districtQuery,
        ).catch((err) => {
          console.error("SEARCH DISTRICT ERROR:", err?.message || err);
          districtLookupFailed = true;
          return null;
        });

        if (districtLookupFailed) {
          return await send(
            {
              type: "text",
              message:
                "Maaf, layanan pencarian kecamatan sedang mengalami gangguan. Coba lagi beberapa saat ya.",
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        const districts = data?.districts || [];

        if (!districts.length) {
          return await send(
            await beginDistrictSelection(
              session,
              pending.data.city_id,
              pending.data.city_name,
            ),
            "shipping_transaction",
          );
        }

        if (districts.length > 1) {
          setPending(session, {
            type: "shipping_quote",
            stage: "choose_district_in_city",
            data: {
              city_id: pending.data.city_id,
              city_name: pending.data.city_name,
              candidates: districts.slice(0, 8),
            },
          });

          return await send(
            {
              type: "options",
              intro: `Aku menemukan beberapa kecamatan di **${pending.data.city_name}**. Pilih yang benar ya:`,
              options: districts.slice(0, 8).map((d) => ({
                label: d.title,
                value: d.title,
              })),
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        const top = districts[0];

        const quote = await getShippingQuoteFromWP_OKID({
          city_id: pending.data.city_id,
          district_id: top.district_id,
          weight_grams: 1000,
        });

        clearPending(session);

        const rates = quote.rates || [];
        const list = rates
          .map(
            (r) =>
              `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
          )
          .join("\n");

        return await send(
          {
            type: "text",
            message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${top.title}**:\n\n${list}`,
            intent: "shipping_transaction",
          },
          "shipping_transaction",
        );
      }

      // user memilih kecamatan dari tombol pilihan
      if (pending.stage === "choose_district_in_city") {
        const candidates = pending.data?.candidates || [];

        const picked = candidates.find(
          (d) =>
            normalizeLocationText(d.title) ===
            normalizeLocationText(rawQuestion),
        );

        if (!picked) {
          return await send(
            {
              type: "options",
              intro: `Aku belum yakin kecamatan yang kamu pilih di **${pending.data.city_name}**. Coba pilih salah satu ini ya:`,
              options: candidates.map((d) => ({
                label: d.title,
                value: d.title,
              })),
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        const quote = await getShippingQuoteFromWP_OKID({
          city_id: pending.data.city_id,
          district_id: picked.district_id,
          weight_grams: 1000,
        });

        clearPending(session);

        const rates = quote.rates || [];
        const list = rates
          .map(
            (r) =>
              `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
          )
          .join("\n");

        return await send(
          {
            type: "text",
            message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${picked.title}**:\n\n${list}`,
            intent: "shipping_transaction",
          },
          "shipping_transaction",
        );
      }
    }

    console.log("ONGKIR PENDING:", JSON.stringify(session.pending, null, 2));

    // ===============================
    // ✅ UNIVERSAL STATE HANDLER (RUN FIRST)
    // ===============================
    if (pending) {
      // contoh 1: shipping quote flow
      if (pending?.type === "shipping_quote") {
        if (
          pending.stage === "need_city" ||
          pending.stage === "need_location"
        ) {
          const { cityText, districtText } = splitCityDistrict(rawQuestion);

          let resolved = await resolveShippingLocation(cityText);
          console.log("RESOLVED LOCATION:", JSON.stringify(resolved, null, 2));

          if (resolved.kind === "multi_city" && districtText) {
            const match = await findCityWithDistrict(
              resolved.cities,
              districtText,
              searchDistrictsFromWP,
            );
            if (match) {
              resolved = {
                kind: "single_city",
                city: match.city,
              };
            }
          }

          if (resolved.kind === "single_city") {
            const city = resolved.city;

            if (districtText) {
              const data = await searchDistrictsFromWP(
                city.city_id,
                districtText,
              ).catch(() => null);

              const districts = data?.districts || [];

              if (!districts.length) {
                return send(
                  await beginDistrictSelection(
                    session,
                    city.city_id,
                    city.name,
                  ),
                  "shipping_transaction",
                );
              }

              if (districts.length > 1) {
                setPending(session, {
                  type: "shipping_quote",
                  stage: "choose_district_in_city",
                  data: {
                    city_id: city.city_id,
                    city_name: city.name,
                    candidates: districts.slice(0, 8),
                  },
                });

                return send(
                  {
                    type: "options",
                    intro: `Aku menemukan beberapa kecamatan di **${city.name}**. Pilih yang benar ya:`,
                    options: districts.slice(0, 8).map((d) => ({
                      label: d.title,
                      value: d.title,
                    })),
                    intent: "shipping_transaction",
                  },
                  "shipping_transaction",
                );
              }

              const top = districts[0];

              const quote = await getShippingQuoteFromWP_OKID({
                city_id: city.city_id,
                district_id: top.district_id,
                weight_grams: 1000,
              });

              clearPending(session);

              const rates = quote.rates || [];
              const list = rates
                .map(
                  (r) =>
                    `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
                )
                .join("\n");

              return send(
                {
                  type: "text",
                  message: `Ongkir estimasi (±1kg) ke **${city.name} - ${top.title}**:\n\n${list}`,
                  intent: "shipping_transaction",
                },
                "shipping_transaction",
              );
            }

            return send(
              await beginDistrictSelection(
                session,
                city.city_id,
                city.name,
              ),
              "shipping_transaction",
            );
          }

          if (resolved.kind === "multi_city") {
            const candidates = resolved.cities.slice(0, 8);
            setPending(session, {
              type: "shipping_quote",
              stage: districtText ? "choose_city_with_district" : "choose_city",
              data: {
                candidates,
                districtText,
              },
            });

            return send(
              {
                type: "options",
                intro: `Aku menemukan beberapa hasil untuk **${cityText}**. Pilih kota/kabupaten yang benar ya:`,
                options: candidates.map((city) => ({
                  label: city.name,
                  value: city.name,
                })),
                intent: "shipping_transaction",
              },
              "shipping_transaction",
            );
          }

          if (resolved.kind === "single_district") {
            const district = resolved.district;
            const quote = await getShippingQuoteFromWP_OKID({
              city_id: district.city_id,
              district_id: district.district_id,
              weight_grams: 1000,
            });

            clearPending(session);
            const list = (quote.rates || [])
              .map(
                (rate) =>
                  `• ${rate.label}: Rp ${Number(rate.cost || 0).toLocaleString("id-ID")}`,
              )
              .join("\n");

            return send(
              {
                type: "text",
                message:
                  `Oke, tujuan **${district.title}, ${district.city_name}**.\n\n` +
                  `Ongkir estimasi (±1kg):\n\n${list}`,
                intent: "shipping_transaction",
              },
              "shipping_transaction",
            );
          }

          if (resolved.kind === "multi_district") {
            const candidates = resolved.districts.slice(0, 8);
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district",
              data: { candidates },
            });

            return send(
              {
                type: "options",
                intro: `Aku menemukan beberapa kecamatan untuk **${cityText}**. Pilih tujuan yang benar ya:`,
                options: candidates.map((district) => ({
                  label: `${district.title} - ${district.city_name}`,
                  value: `${district.title} - ${district.city_name}`,
                })),
                intent: "shipping_transaction",
              },
              "shipping_transaction",
            );
          }

          const unavailable = resolved.kind === "unavailable";
          return send(
            {
              type: "text",
              message: unavailable
                ? "Maaf, layanan pencarian kota dan kecamatan sedang mengalami gangguan. Coba lagi beberapa saat ya."
                : `Aku belum menemukan tujuan **${rawQuestion}**. Coba tulis dengan format **Kabupaten/Kota, Kecamatan**, misalnya **Kabupaten Tangerang, Rajeg**.`,
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        if (
          pending.stage === "choose_city" ||
          pending.stage === "choose_city_with_district"
        ) {
          const candidates = pending.data?.candidates || [];
          const parsedAnswer = splitCityDistrict(rawQuestion);
          const districtText = String(
            pending.data?.districtText || parsedAnswer.districtText || "",
          ).trim();
          let picked = candidates.find(
            (city) =>
              normalizeCityName(city.name) === normalizeCityName(rawQuestion),
          );

          if (!picked && districtText) {
            const match = await findCityWithDistrict(
              candidates,
              districtText,
              searchDistrictsFromWP,
            );
            picked = match?.city || null;
          }

          if (!picked) {
            return send(
              {
                type: "options",
                intro:
                  "Aku belum yakin kota/kabupaten yang dipilih. Pilih salah satu hasil berikut ya:",
                options: candidates.map((city) => ({
                  label: city.name,
                  value: city.name,
                })),
                intent: "shipping_transaction",
              },
              "shipping_transaction",
            );
          }

          if (!districtText) {
            return send(
              await beginDistrictSelection(
                session,
                picked.city_id,
                picked.name,
              ),
              "shipping_transaction",
            );
          }

          const districtData = await searchDistrictsFromWP(
            picked.city_id,
            districtText,
          ).catch(() => null);
          const districts = districtData?.districts || [];

          if (!districts.length) {
            return send(
              await beginDistrictSelection(
                session,
                picked.city_id,
                picked.name,
              ),
              "shipping_transaction",
            );
          }

          if (districts.length > 1) {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district_in_city",
              data: {
                city_id: picked.city_id,
                city_name: picked.name,
                candidates: districts.slice(0, 8),
              },
            });

            return send(
              {
                type: "options",
                intro: `Aku menemukan beberapa kecamatan di **${picked.name}**. Pilih yang benar ya:`,
                options: districts.slice(0, 8).map((district) => ({
                  label: district.title,
                  value: district.title,
                })),
                intent: "shipping_transaction",
              },
              "shipping_transaction",
            );
          }

          const district = districts[0];
          const quote = await getShippingQuoteFromWP_OKID({
            city_id: picked.city_id,
            district_id: district.district_id,
            weight_grams: 1000,
          });
          clearPending(session);

          const list = (quote.rates || [])
            .map(
              (rate) =>
                `• ${rate.label}: Rp ${Number(rate.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${picked.name} - ${district.title}**:\n\n${list}`,
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "choose_district") {
          const candidates = pending.data?.candidates || [];
          const normalizedAnswer = normalizeLocationText(rawQuestion);
          const picked = candidates.find((district) => {
            const fullLabel = `${district.title} ${district.city_name}`;
            return (
              normalizeLocationText(fullLabel) === normalizedAnswer ||
              normalizeLocationText(district.title) === normalizedAnswer
            );
          });

          if (!picked) {
            return send(
              {
                type: "options",
                intro:
                  "Aku belum yakin kecamatan yang dipilih. Pilih salah satu hasil berikut ya:",
                options: candidates.map((district) => ({
                  label: `${district.title} - ${district.city_name}`,
                  value: `${district.title} - ${district.city_name}`,
                })),
                intent: "shipping_transaction",
              },
              "shipping_transaction",
            );
          }

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: picked.city_id,
            district_id: picked.district_id,
            weight_grams: 1000,
          });
          clearPending(session);

          const list = (quote.rates || [])
            .map(
              (rate) =>
                `• ${rate.label}: Rp ${Number(rate.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${picked.title}, ${picked.city_name}**:\n\n${list}`,
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        if (resolved.kind === "multi_city") {
          const candidates = resolved.cities.slice(0, 8);
          setPending(session, {
            type: "shipping_quote",
            stage: "choose_city",
            data: { candidates },
          });

          return await send(
            {
              type: "options",
              intro: `Aku menemukan beberapa hasil untuk **${locationText}**. Pilih kota/kabupaten yang benar ya:`,
              options: candidates.map((city) => ({
                label: city.name,
                value: city.name,
              })),
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        if (resolved.kind === "single_district") {
          const district = resolved.district;
          const quote = await getShippingQuoteFromWP_OKID({
            city_id: district.city_id,
            district_id: district.district_id,
            weight_grams: 1000,
          });
          clearPending(session);

          const list = (quote.rates || [])
            .map(
              (rate) =>
                `• ${rate.label}: Rp ${Number(rate.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return await send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${district.title}, ${district.city_name}**:\n\n${list}`,
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        if (resolved.kind === "multi_district") {
          const candidates = resolved.districts.slice(0, 8);
          setPending(session, {
            type: "shipping_quote",
            stage: "choose_district",
            data: { candidates },
          });

          return await send(
            {
              type: "options",
              intro: `Aku menemukan beberapa kecamatan untuk **${locationText}**. Pilih tujuan yang benar ya:`,
              options: candidates.map((district) => ({
                label: `${district.title} - ${district.city_name}`,
                value: `${district.title} - ${district.city_name}`,
              })),
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        if (resolved.kind === "unavailable") {
          setPending(session, {
            type: "shipping_quote",
            stage: "need_city",
            data: {},
          });

          return await send(
            {
              type: "text",
              message:
                "Maaf, layanan pencarian kota dan kecamatan sedang mengalami gangguan. Coba lagi beberapa saat ya.",
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }
      }

      // kalau pending type lain, tambahkan handler lain di sini...
    }

    if (isFreshCheapProductQuery(rawQuestion)) {
      session.lastIntent = "price_promo";
      clearFollowUpOffer(session);
      clearPending(session);
      session.lastProducts = null;
    }

    async function hydrateMissingProductImages(products = []) {
      if (!Array.isArray(products) || !products.length) return products;
      if (products.every((p) => getProductImageUrl(p))) return products;

      const catalog = await getProductsCached().catch(() => []);
      if (!Array.isArray(catalog) || !catalog.length) return products;

      return products.map((p) => {
        if (getProductImageUrl(p)) return p;

        const match = catalog.find(
          (item) =>
            String(item.id || "") === String(p.id || "") ||
            String(item.name || "").toLowerCase() ===
              String(p.name || "").toLowerCase(),
        );

        return {
          ...p,
          image: getProductImageUrl(match),
        };
      });
    }

    // ===============================
    // UNIVERSAL CONVERSATION FOLLOW-UP
    // ===============================
    const universalFollowUp = detectUniversalFollowUp(rawQuestion, {
      usesPreviousProducts: usesPreviousProductContext,
    });
    const contextFollowUp =
      usesPreviousProductContext || !hasSpecificProductSearchTerms(rawQuestion)
        ? detectContextFollowUp(rawQuestion)
        : null;
    const excludedAlternativeProductIds = new Set(
      productQueryScope === "catalog" &&
      /\b(?:alternatif|opsi|pilihan)\s+(?:lain\s+)?(?:yang\s+)?(?:lebih\s+)?(?:worth\s+it|value\s+for\s+money|bagus|baik|murah|hemat)\b/i.test(
        rawQuestion,
      ) &&
      Array.isArray(session.lastProducts)
        ? session.lastProducts.map((product) => String(product?.id || ""))
        : [],
    );

    if (
      (universalFollowUp || contextFollowUp) &&
      !usesPreviousProductContext
    ) {
      clearFollowUpOffer(session);
      session.lastProducts = null;
      session.lastTopic = null;
      updateSlot(session, "productName", null);
    }

    const PRODUCT_CONTEXT_INTENTS = new Set([
      "product_discovery",
      "recommendation",
      "price_promo",
      "stock_availability",
      "product_detail",
    ]);

    if (
      universalFollowUp &&
      usesPreviousProductContext &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0
    ) {
      let refined = [...session.lastProducts];
      const PRODUCT_CONTEXT_INTENTS = new Set([
        "product_discovery",
        "recommendation",
        "price_promo",
        "stock_availability",
        "product_detail",
      ]);

      const baseIntent =
        universalFollowUp.type === "pick_best"
          ? "recommendation"
          : PRODUCT_CONTEXT_INTENTS.has(previousCommerceContext.lastIntent)
            ? previousCommerceContext.lastIntent
            : "product_discovery";
      let reasoningText = "";

      if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "cheapest"
      ) {
        refined = refined
          .filter((p) => Number(p.numericPrice || 0) > 0)
          .sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0))
          .slice(0, 3);
      }

      if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "expensive"
      ) {
        refined = refined
          .filter((p) => Number(p.numericPrice || 0) > 0)
          .sort((a, b) => (b.numericPrice || 0) - (a.numericPrice || 0))
          .slice(0, 3);
      }

      if (universalFollowUp.type === "stock_refine") {
        refined = refined
          .filter((p) => String(p.stock || "").toLowerCase() === "instock")
          .slice(0, 3);
      }

      if (
        universalFollowUp.type === "promo_refine" &&
        universalFollowUp.mode === "promo_only"
      ) {
        refined = refined
          .filter((p) => Number(p.discountPercent || 0) > 0)
          .slice(0, 3);
      }

      if (universalFollowUp.type === "pick_best") {
        const comparedProducts = [...refined];
        const recNeeds = extractRecommendationNeeds(rawQuestion);
        refined = pickRecommendedProducts(
          comparedProducts,
          recNeeds,
          comparedProducts.length,
        ).slice(0, 1);

        const best = refined[0];
        const pricedProducts = comparedProducts.filter(
          (product) => Number(product.numericPrice || 0) > 0,
        );
        const lowestPrice = pricedProducts.length
          ? Math.min(
              ...pricedProducts.map((product) =>
                Number(product.numericPrice || 0),
              ),
            )
          : 0;
        const reasons = [
          best?.stock === "instock" ? "ready stock" : "stok terbatas",
          best && Number(best.numericPrice || 0) === lowestPrice
            ? `harganya paling hemat, ${formatRupiah(best.numericPrice)}`
            : best?.numericPrice
              ? `harganya ${formatRupiah(best.numericPrice)}`
              : "harga belum tercantum",
          Number(best?.discountPercent || 0) > 0
            ? `sedang diskon ${best.discountPercent}%`
            : "",
        ].filter(Boolean);

        reasoningText =
          `Aku membandingkan ${comparedProducts.length} produk yang sebelumnya ditampilkan berdasarkan stok, harga, promo, serta data produk yang tersedia. ` +
          `**${best?.name || "Pilihan teratas"}** paling worth it karena ${reasons.join(", ")}.`;
      }

      if (universalFollowUp.type === "detail_followup") {
        const p = refined[0];
        if (p) {
          session.lastIntent = "product_detail";
          session.lastTopic = p.name;
          session.lastProducts = [p];

          return await send(
            {
              type: "text",
              message:
                `Detail singkat untuk **${p.name}**:\n\n` +
                `• Harga: ${formatRupiah(p.numericPrice)}\n` +
                `• Stok: ${p.stock === "instock" ? "Ready" : "Tidak ready"}\n` +
                `${p.condition ? `• Kondisi: ${p.condition}\n` : ""}` +
                `${p.link ? `• Link: ${p.link}` : ""}`,
            },
            "product_detail",
          );
        }
      }

      if (!refined.length) {
        return await send(
          {
            type: "text",
            message:
              "Dari hasil sebelumnya, aku belum menemukan yang cocok dengan lanjutan pertanyaan itu 🙏",
          },
          baseIntent,
        );
      }

      refined = await hydrateMissingProductImages(refined);

      let intro = "Oke, aku lanjutkan dari hasil sebelumnya ya:";

      if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "cheapest"
      ) {
        intro = "Oke, ini yang paling murah dari hasil sebelumnya:";
      } else if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "expensive"
      ) {
        intro = "Oke, ini yang paling mahal dari hasil sebelumnya:";
      } else if (universalFollowUp.type === "stock_refine") {
        intro = "Oke, ini yang ready stock dari hasil sebelumnya:";
      } else if (universalFollowUp.type === "promo_refine") {
        intro = "Oke, ini yang sedang promo dari hasil sebelumnya:";
      } else if (universalFollowUp.type === "pick_best") {
        intro = "Kalau dari hasil sebelumnya, ini yang paling layak dipilih:";
      }

      session.lastIntent = baseIntent;
      session.lastTopic = "universal_context_refine";
      session.lastProducts = refined;

      return await send(
        {
          type: "products",
          intro,
          products: refined,
          ...(reasoningText ? { reasoning_text: reasoningText } : {}),
          closing:
            "Kalau mau, kamu bisa lanjutkan lagi misalnya: yang paling murah, yang ready stock, yang promo, atau minta detail 😊",
        },
        baseIntent,
      );
    }

    // ===============================
    // CONTEXT FOLLOW-UP FROM LAST PRODUCTS
    // ===============================
    if (
      contextFollowUp &&
      usesPreviousProductContext &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0
    ) {
      let refined = applyContextProductRefine(
        session.lastProducts,
        contextFollowUp,
      );

      if (refined.length > 0) {
        refined = await hydrateMissingProductImages(refined);

        let intro = "Oke, aku filter dari hasil sebelumnya ya:";

        if (
          contextFollowUp.type === "price_refine" &&
          contextFollowUp.mode === "cheapest"
        ) {
          intro = "Oke, ini yang paling murah dari hasil sebelumnya:";
        } else if (
          contextFollowUp.type === "price_refine" &&
          contextFollowUp.mode === "expensive"
        ) {
          intro = "Oke, ini yang paling mahal dari hasil sebelumnya:";
        } else if (contextFollowUp.type === "stock_refine") {
          intro = "Oke, ini yang ready stock dari hasil sebelumnya:";
        } else if (
          contextFollowUp.type === "promo_refine" &&
          contextFollowUp.mode === "promo_only"
        ) {
          intro = "Oke, ini yang sedang promo dari hasil sebelumnya:";
        } else if (
          contextFollowUp.type === "promo_refine" &&
          contextFollowUp.mode === "biggest_discount"
        ) {
          intro = "Oke, ini yang diskonnya paling besar dari hasil sebelumnya:";
        }

        const followIntent = session.lastIntent || "product_discovery";

        session.lastIntent = followIntent;
        session.lastTopic = "context_refine";
        session.lastProducts = refined;

        return await send(
          {
            type: "products",
            intro,
            products: refined,
            closing:
              "Kalau mau, aku bisa bantu lanjut filter lagi dari hasil ini 😊",
          },
          followIntent,
        );
      }

      return await send(
        {
          type: "text",
          message:
            "Dari hasil sebelumnya, aku belum menemukan produk yang cocok dengan filter itu 🙏",
        },
        "product_discovery",
      );
    }

    // ===============================
    // HUMAN FOLLOW-UP STATE HANDLER
    // ===============================
    if (session.lastBotQuestionType) {
      const followType = session.lastBotQuestionType;
      const meta = session.lastBotQuestionMeta || {};

      // 1) user menjawab iya untuk refine budget
      if (
        followType === "offer_budget_refine" &&
        (isYesAnswer(rawQuestion) || looksLikeBudgetAnswer(rawQuestion))
      ) {
        const recTopic =
          session.lastBotQuestionMeta?.recTopic ||
          session.slots?.category ||
          session.lastTopic ||
          "";

        clearFollowUpOffer(session);

        if (looksLikeBudgetAnswer(rawQuestion) && !isYesAnswer(rawQuestion)) {
          if (recTopic) {
            rebuildQuestion(`rekomendasi ${recTopic} budget ${rawQuestion}`);
          } else {
            rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
          }
        } else {
          setLastBotQuestion(session, "ask_budget_value", {
            source: "recommendation",
            recTopic: recTopic || null,
          });

          return await send(
            {
              type: "options",
              intro:
                "Oke, pilih kisaran budget yang paling sesuai atau ketik nominalmu sendiri:",
              options: buildBudgetOptions(),
            },
            "recommendation",
          );
        }
      }

      // 2) user menjawab budget setelah bot minta nominal
      if (
        followType === "ask_budget_value" &&
        looksLikeBudgetAnswer(rawQuestion)
      ) {
        const recommendationQuery = String(
          session.lastBotQuestionMeta?.recommendationQuery || "",
        ).trim();
        const recTopic =
          session.lastBotQuestionMeta?.recTopic ||
          session.slots?.category ||
          session.lastTopic ||
          "";

        clearFollowUpOffer(session);

        const budget = extractRecommendationBudgetAnswer(rawQuestion);

        if (budget.detected) {
          updateSlot(session, "budgetMin", budget.min);
          updateSlot(session, "budgetMax", budget.max);
        } else {
          updateSlot(session, "budgetMax", rawQuestion);
        }

        if (recommendationQuery) {
          rebuildQuestion(`${recommendationQuery} ${rawQuestion}`);
        } else if (recTopic) {
          rebuildQuestion(`rekomendasi ${recTopic} budget ${rawQuestion}`);
        } else {
          rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
        }

        intentResult = {
          ...intentResult,
          intent: "recommendation",
          method: "recommendation_budget_followup_rule",
          score: 0.99,
        };
        session.lastIntent = "recommendation";
        session.lastIntentMethod = intentResult.method;
        session.lastIntentScore = intentResult.score;
      }

      // 3) refine murah
      if (
        followType === "offer_cheaper_refine" &&
        (isYesAnswer(rawQuestion) || looksLikeCheapRefine(rawQuestion))
      ) {
        clearFollowUpOffer(session);

        if (!isYesAnswer(rawQuestion) && looksLikeBudgetAnswer(rawQuestion)) {
          rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
        } else {
          setLastBotQuestion(session, "ask_budget_value", {
            source: "recommendation",
          });

          return await send(
            {
              type: "options",
              intro:
                "Siap, pilih kisaran budget yang paling sesuai atau ketik nominalmu sendiri:",
              options: buildBudgetOptions(),
            },
            "recommendation",
          );
        }
      }

      // 4) refine display / pajangan
      if (
        followType === "offer_display_refine" &&
        (isYesAnswer(rawQuestion) || looksLikeDisplayRefine(rawQuestion))
      ) {
        clearFollowUpOffer(session);
        rebuildQuestion("rekomendasi robot untuk pajangan");
      }

      // 5) refine koleksi
      if (
        followType === "offer_collection_refine" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("koleksi") ||
          looksLikePremiumRefine(rawQuestion))
      ) {
        clearFollowUpOffer(session);
        rebuildQuestion("rekomendasi robot untuk koleksi");
      }

      // 6) cek stok dari detail / harga
      if (
        followType === "offer_check_stock" &&
        looksLikeStockCheckAnswer(rawQuestion)
      ) {
        clearFollowUpOffer(session);

        const productName =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName;

        if (productName) {
          rebuildQuestion(`${productName} stok`);
        } else {
          setLastBotQuestion(session, "ask_product_name", {
            source: "stock",
          });

          return await send(
            {
              type: "text",
              message:
                "Boleh 😊 Mau cek stok produk apa? Sebutkan nama produknya ya.",
            },
            "stock_availability",
          );
        }
      }

      // 7) cek harga dari stok
      if (
        followType === "offer_check_price" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("harga"))
      ) {
        clearFollowUpOffer(session);

        const productName =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName;

        if (productName) {
          rebuildQuestion(`harga ${productName}`);
        }
      }

      // 8) compare
      if (
        followType === "offer_compare" &&
        looksLikeCompareAnswer(rawQuestion)
      ) {
        clearFollowUpOffer(session);

        const firstProduct =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName ||
          "";

        setLastBotQuestion(session, "ask_product_name", {
          source: "compare_second",
          first_product: firstProduct,
        });

        return await send(
          {
            type: "text",
            message: firstProduct
              ? `Siap 😊 Mau dibandingkan dengan produk apa? Misalnya: bandingkan ${firstProduct} dengan produk lain.`
              : "Siap 😊 Mau dibandingkan dengan produk apa? Tulis nama produknya ya.",
          },
          "compare",
        );
      }

      // 9) cek ongkir
      if (
        followType === "offer_check_shipping" &&
        looksLikeShippingAnswer(rawQuestion)
      ) {
        clearFollowUpOffer(session);

        setPending(session, {
          type: "shipping_quote",
          stage: "need_city",
          data: {},
        });

        return await send(
          {
            type: "text",
            message:
              "Oke 😊 Untuk cek ongkir, sebutkan dulu kota atau kabupaten tujuan ya.",
          },
          "shipping_transaction",
        );
      }

      // 10) lanjut flow shipping
      // if (
      //   followType === "offer_continue_shipping" &&
      //   looksLikeShippingAnswer(rawQuestion)
      // ) {
      //   clearFollowUpOffer(session);

      //   setPending(session, {
      //     type: "shipping_quote",
      //     stage: "need_city",
      //     data: {},
      //   });

      //   return await send(
      //     {
      //       type: "text",
      //       message:
      //         "Siap 😊 Sebutkan kota atau kabupaten tujuan dulu ya, nanti aku bantu lanjut cek ongkirnya.",
      //     },
      //     "shipping_transaction",
      //   );
      // }

      // 11) alternatif ready stock
      if (
        followType === "offer_ready_alternative" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("alternatif") ||
          normalizeLite(rawQuestion).includes("yang ready"))
      ) {
        clearFollowUpOffer(session);

        const productName =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName ||
          "";

        if (productName) {
          rebuildQuestion(
            `rekomendasi produk seperti ${productName} yang ready stock`,
          );
        } else {
          rebuildQuestion("produk ready stock");
        }
      }

      // 12) pilih pemenang dari compare
      if (
        followType === "offer_pick_winner" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("pilih") ||
          normalizeLite(rawQuestion).includes("mana yang lebih worth it"))
      ) {
        clearFollowUpOffer(session);

        const names = Array.isArray(meta.products)
          ? meta.products.map((x) => x.name).filter(Boolean)
          : [];

        if (names.length >= 2) {
          rebuildQuestion(
            `dari ${names[0]} dan ${names[1]}, mana yang lebih worth it?`,
          );
        } else {
          return await send(
            {
              type: "text",
              message:
                "Boleh 😊 Sebutkan lagi dua produk yang mau difokuskan, nanti aku bantu pilihkan.",
            },
            "compare",
          );
        }
      }

      // 13) fokus compare harga/stok
      if (followType === "offer_compare_focus" && !isNoAnswer(rawQuestion)) {
        const s = normalizeLite(rawQuestion);

        if (isYesAnswer(rawQuestion)) {
          return await send(
            {
              type: "text",
              message:
                "Boleh. Kamu mau perbandingannya difokuskan ke **harga** atau **stok**?",
            },
            "compare",
          );
        } else if (s.includes("harga")) {
          clearFollowUpOffer(session);
          const names = Array.isArray(meta.products)
            ? meta.products.map((x) => x.name).filter(Boolean)
            : [];

          if (names.length >= 2) {
            rebuildQuestion(
              `bandingkan ${names[0]} dengan ${names[1]} dari sisi harga`,
            );
          }
        } else if (s.includes("stok")) {
          clearFollowUpOffer(session);
          const names = Array.isArray(meta.products)
            ? meta.products.map((x) => x.name).filter(Boolean)
            : [];

          if (names.length >= 2) {
            rebuildQuestion(
              `bandingkan ${names[0]} dengan ${names[1]} dari sisi stok`,
            );
          }
        }
      }
    }

    // =====================
    // Reset Ingatan obrolan
    // =====================
    if (["reset", "mulai lagi", "batal", "clear"].includes(q)) {
      resetConversationContext(session);

      return await send({
        type: "text",
        message:
          "Siap 😊 Konteks percakapan sudah aku reset. Kamu bisa mulai tanya lagi dari awal.",
        intent: "general",
      });
    }

    // =====================
    // Fitur COD
    // =====================
    if (
      isCODQuestion(rawQuestion) &&
      !looksLikeProductTransactionCompoundQuestion(rawQuestion)
    ) {
      const codEnabled =
        String(process.env.COD_ENABLED || "false").toLowerCase() === "true";

      return await send(
        {
          type: "text",
          message: buildTransactionPolicyMessage(rawQuestion, {
            codEnabled,
          }),
          intent: "shipping_transaction",
          _actionContext: "payment_methods",
        },
        "shipping_transaction",
      );
    }

    // =====================
    // Estimasi barang
    // =====================
    if (looksLikeAssistantCapabilitiesQuestion(rawQuestion)) {
      return await send(
        {
          type: "text",
          message: buildAssistantCapabilitiesMessage(),
          intent: "general",
          _actionContext: "assistant_capabilities",
        },
        "general",
      );
    }

    if (looksLikeStoreLocationQuestion(rawQuestion)) {
      return await send(
        {
          type: "text",
          message: buildStoreVisitMessage({
            hoursText: process.env.STORE_HOURS_TEXT,
            addressText: process.env.STORE_ADDRESS_TEXT,
          }),
          intent: "general",
          _actionContext: "store_location",
        },
        "general",
      );
    }

    if (looksLikeStoreHoursQuestion(rawQuestion)) {
      return await send(
        {
          type: "text",
          message: buildStoreHoursMessage({
            hoursText: process.env.STORE_HOURS_TEXT,
            addressText: process.env.STORE_ADDRESS_TEXT,
          }),
          intent: "general",
          _actionContext: "store_hours",
        },
        "general",
      );
    }

    if (
      looksLikeShippingEstimateQuestion(rawQuestion) &&
      !looksLikeProductTransactionCompoundQuestion(rawQuestion)
    ) {
      return await send(
        {
          type: "text",
          message: buildTransactionPolicyMessage(rawQuestion),
          intent: "shipping_transaction",
        },
        "shipping_transaction",
      );
    }

    // ==========================
    // Nanya lokasi toko offline
    // ==========================
    function isStoreBranchQuestion(q = "") {
      const s = String(q || "").toLowerCase();
      return (
        s.includes("cabang toko") ||
        s.includes("cabang robot jadul") ||
        (s.includes("cabang") &&
          (s.includes("jakarta") || s.includes("luar kota")))
      );
    }
    if (isStoreBranchQuestion(rawQuestion)) {
      const storeText =
        process.env.STORE_ADDRESS_TEXT ||
        "Robot Jadul, Blok M Square lt 3A blok A no 36-37, Jl. Melawai 5, Jakarta Selatan 12160. Buka setiap hari pukul 11.00-20.00.";
      return await send(
        buildUnknownAnswerResponse({
          message:
            `Informasi toko fisik yang tercatat saat ini:\n\n${storeText}\n\n` +
            "Untuk memastikan apakah ada cabang lain di luar lokasi tersebut, silakan konfirmasi ke Admin Robot Jadul.",
          topic: "cabang dan lokasi toko Robot Jadul",
        }),
        "general",
      );
    }

    // 1) lokasi toko offline
    // 2) asal pengiriman
    if (looksLikeShippingOriginQuestion(rawQuestion)) {
      const originText =
        process.env.SHIP_ORIGIN_TEXT ||
        "Pengiriman diproses dari TOKO ROBOT JADUL di **JAKARTA SELATAN**.";
      return await send({
        type: "text",
        message: `${originText}\n\nKalau mau cek ongkir, sebutkan kota/kab tujuan ya 😊`,
        intent: "shipping_transaction",
      });
    }

    if (intentResult.intent === "return_product") {
      session.lastIntent = "return_product";
      session.lastTopic = "return_product";

      return await send(
        {
          type: "text",
          message: buildReturnPolicyMessage(rawQuestion),
          _actionContext: getReturnActionContext(rawQuestion),
        },
        "return_product",
      );
    }

    // ===========================
    // Satu pintu untuk pertanyaan yang tidak punya handler tepercaya.
    // ===========================

    console.log("INTENT BEFORE PRODUCT GUARD:", intentResult.intent);

    const ROUTABLE_INTENTS = new Set([
      "product_discovery",
      "product_detail",
      "price_promo",
      "stock_availability",
      "recommendation",
      "compare",
      "shipping_transaction",
      "shipping_origin",
      "shipment_tracking",
      "transaction_status",
      "return_product",
    ]);

    const SAFE_LOW_CONFIDENCE_INTENTS = new Set([
      "general",
      "product_discovery",
    ]);
    const hasStrongRule =
      String(intentResult.method || "").includes("override_rule") ||
      String(intentResult.method || "").includes("rule");
    const isNonsense =
      Number(intentResult.score || 0) < 0.13 &&
      !looksLikeShippingQuoteQuestion(rawQuestion) &&
      !looksLikeTrackingQuestion(rawQuestion);
    const isLowConfidence =
      Number(intentResult.score || 0) < 0.35 &&
      !hasStrongRule &&
      !SAFE_LOW_CONFIDENCE_INTENTS.has(intentResult.intent);
    const shouldUseGeneralFallback =
      intentResult.intent === "general" ||
      looksLikeAdminContactQuestion(rawQuestion) ||
      !ROUTABLE_INTENTS.has(intentResult.intent) ||
      isNonsense ||
      isLowConfidence;

    if (shouldUseGeneralFallback) {
      console.log("GENERAL FALLBACK HIT:", {
        intent: intentResult.intent,
        isNonsense,
        isLowConfidence,
      });

      return await send(
        buildUnknownResponseForQuestion(rawQuestion),
        "general",
      );
    }

    async function getCleanProducts() {
      if (cleanProducts) return cleanProducts;

      let products;
      try {
        products = await getProductsCached();
      } catch (e) {
        console.error("WC FETCH ERROR:", e?.message || e);
        throw new Error("WC_PRODUCTS_UNAVAILABLE");
      }

      function getMetaValue(metaData, key) {
        if (!Array.isArray(metaData)) return "";
        const found = metaData.find((m) => m?.key === key);
        return found?.value ?? "";
      }

      function cleanNumberString(x) {
        if (x == null) return "";
        const s = String(x).trim();
        return s === "0" ? "" : s;
      }

      function toNum(x) {
        const n = parseFloat(String(x ?? "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      }

      cleanProducts = products.map((p) => {
        const condition = stripHtml(
          p.condition || getMetaValue(p.meta_data, "condition") || "",
        );

        const length = cleanNumberString(p.dimensions?.length);
        const width = cleanNumberString(p.dimensions?.width);
        const height = cleanNumberString(p.dimensions?.height);

        const price = toNum(p.price);
        const regular = toNum(p.regular_price);
        const sale = toNum(p.sale_price);
        const effectivePrice = sale ?? price ?? regular ?? null;
        const discountPercent = calcDiscountPercent(regular, sale);
        const discountAmount =
          regular && sale && sale < regular ? regular - sale : 0;

        return {
          id: p.id,
          name: p.name,
          price: p.price,
          regular_price: p.regular_price,
          sale_price: p.sale_price,
          numericPrice: effectivePrice ?? 0,
          effectivePrice,
          stock: p.stock_status,
          stockQuantity:
            typeof p.stock_quantity === "number" ? p.stock_quantity : null,
          totalSales: Number(p.total_sales || 0),
          averageRating: Number(p.average_rating || 0),
          ratingCount: Number(p.rating_count || 0),
          description: p.description || "",
          shortDescription: p.short_description || "",
          link: p.permalink,
          image: getProductImageUrl(p),
          category: p.categories?.map((c) => c.name.toLowerCase()).join(" "),
          categoryNames: p.categories?.map((c) => c.name).filter(Boolean) || [],
          condition,
          weight: cleanNumberString(p.weight),
          dimensions: { length, width, height },
          type: p.type,
          discountPercent,
          discountAmount,
          isPromo: discountPercent > 0,
        };
      });

      return cleanProducts;
    }

    function resolveRequestedProduct(
      question,
      products,
      { compound = false } = {},
    ) {
      const catalog = Array.isArray(products) ? products : [];
      const recentProducts = Array.isArray(session.lastProducts)
        ? session.lastProducts
        : [];
      const recentKeys = new Set();
      const lookupProducts = recentProducts.map((recent) => {
        const catalogMatch = catalog.find(
          (product) =>
            (recent?.id && product?.id === recent.id) ||
            String(product?.name || "").toLowerCase() ===
              String(recent?.name || "").toLowerCase(),
        );
        const key = catalogMatch?.id || recent?.id || recent?.name;
        if (key) recentKeys.add(String(key).toLowerCase());
        return { ...recent, ...(catalogMatch || {}) };
      });
      lookupProducts.push(
        ...catalog.filter((product) => {
          const key = product?.id || product?.name;
          return key && !recentKeys.has(String(key).toLowerCase());
        }),
      );

      const selectedProductId = Number(selectedSuggestion?.product_id);
      const selectedProductName = String(
        selectedSuggestion?.product_name || "",
      ).trim();
      const selectedProduct =
        Number.isInteger(selectedProductId) && selectedProductId > 0
          ? lookupProducts.find(
              (product) =>
                Number(product?.id) === selectedProductId &&
                normalize(product?.name || "") ===
                  normalize(selectedProductName),
            )
          : null;

      if (selectedProduct) {
        return {
          status: "matched",
          confidence: 1,
          reason: "validated_product_option",
          product: selectedProduct,
          candidates: [selectedProduct],
        };
      }

      const catalogMatch = assessProductSearchConfidence(
        question,
        lookupProducts,
        {
          preferPromo: compound && /\b(?:promo|diskon)\b/i.test(question),
        },
      );

      // A product named in the latest turn must beat stale page/session context.
      if (catalogMatch.status !== "not_found") return catalogMatch;

      const pageProduct = looksLikeCurrentProductReference(question)
        ? findVerifiedPageProduct(pageContext, lookupProducts)
        : null;

      if (pageProduct) {
        return {
          status: "matched",
          confidence: 1,
          reason: "verified_page_context",
          product: pageProduct,
          candidates: [pageProduct],
        };
      }

      return catalogMatch;
    }

    // ==============================
    // ALAMAT TOKO (SHIPPING ORIGIN) HANDLER
    // ==============================
    // ---- ROUTE ORIGIN (GLOBAL) ----
    if (looksLikeShippingOriginQuestion(rawQuestion)) {
      const originText =
        process.env.SHIP_ORIGIN_TEXT ||
        "Pengiriman kami diproses dari TOKO Robot Jadul di **JAKARTA SELATAN**.";

      return await send(
        {
          type: "text",
          message: `${originText}\n\nKalau kamu mau, sebutkan kota tujuan—nanti aku bantu cek ongkir & estimasinya 😊`,
        },
        "shipping_transaction",
      );
    }

    // =================================
    // Universal Follow up handler
    // ================================

    if (isShortFollowUp(rawQuestion) && session.lastBotQuestionType) {
      // 1) bot sebelumnya menanyakan kecamatan
      if (session.lastBotQuestionType === "ask_district") {
        const cityId = session.lastBotQuestionMeta?.city_id;
        const cityName = session.lastBotQuestionMeta?.city_name;

        if (cityId) {
          const districtQuery = extractDistrictFollowUp(rawQuestion);
          const data = await searchDistrictsFromWP(
            cityId,
            districtQuery,
          ).catch(() => null);
          const top = data?.districts?.[0];

          if (top) {
            clearLastBotQuestion(session);
            updateSlot(session, "district", top.title);

            const quote = await getShippingQuoteFromWP_OKID({
              city_id: cityId,
              district_id: top.district_id,
              weight_grams: 1000,
            });

            const rates = quote.rates || [];
            const list = rates
              .map(
                (r) =>
                  `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
              )
              .join("\n");

            return await send(
              {
                type: "text",
                message: `Ongkir estimasi (±1kg) ke **${cityName} - ${top.title}**:\n\n${list}`,
              },
              "shipping_transaction",
            );
          }
        }
      }

      // 2) bot sebelumnya menanyakan kota
      if (session.lastBotQuestionType === "ask_city") {
        const data = await searchCitiesFromWP(rawQuestion).catch(() => null);
        const top = data?.cities?.[0];

        if (top) {
          clearLastBotQuestion(session);
          updateSlot(session, "city", top.name);

          return await send(
            await beginDistrictSelection(
              session,
              top.city_id,
              top.name,
            ),
            "shipping_transaction",
          );
        }
      }
    }

    // ===============================
    // UNIVERSAL FOLLOW UP: PRODUCT NAME
    // ===============================

    if (session.lastBotQuestionType === "ask_product_name") {
      const meta = session.lastBotQuestionMeta || {};
      const source = meta.source;
      const acceptsProductName =
        isShortFollowUp(rawQuestion) ||
        source === "stock" ||
        source === "detail" ||
        source === "compare_second";

      if (acceptsProductName) {
        clearLastBotQuestion(session);
        updateSlot(session, "productName", rawQuestion);

        if (source === "stock") {
          rebuildQuestion(`${rawQuestion} stok`);
        } else if (source === "detail") {
          rebuildQuestion(`${rawQuestion} detail`);
        } else if (source === "compare_second" && meta.first_product) {
          rebuildQuestion(
            `bandingkan ${meta.first_product} dengan ${rawQuestion}`,
          );
        }
      }
    }

    if (
      needsRecommendationBudgetClarification(
        rawQuestion,
        extractBudgetRange(rawQuestion).detected,
      )
    ) {
      clearLastBotQuestion(session);
      session.lastIntent = "recommendation";
      session.lastIntentMethod = "recommendation_budget_clarification_rule";
      session.lastIntentScore = 0.99;
      session.lastTopic = "recommendation_budget";
      setLastBotQuestion(session, "ask_budget_value", {
        source: "recommendation",
        recommendationQuery: rawQuestion,
      });

      return await send(
        {
          type: "options",
          intro:
            "Boleh. Kamu mau cari robot dengan kisaran budget berapa? Pilih salah satu atau ketik nominalmu sendiri:",
          options: buildBudgetOptions(),
        },
        "recommendation",
      );
    }

    // Universal Follow Up : Recommend
    if (
      isShortFollowUp(rawQuestion) &&
      session.lastBotQuestionType === "ask_budget"
    ) {
      const meta = session.lastBotQuestionMeta || {};
      const recTopic =
        meta.recTopic || session.slots?.category || session.lastTopic || "";

      clearLastBotQuestion(session);

      const budget = extractRecommendationBudgetAnswer(rawQuestion);

      if (budget.detected) {
        updateSlot(session, "budgetMin", budget.min);
        updateSlot(session, "budgetMax", budget.max);
      } else {
        // fallback lama tetap dipertahankan
        updateSlot(session, "budgetMax", rawQuestion);
      }

      if (recTopic) {
        rebuildQuestion(`rekomendasi ${recTopic} budget ${rawQuestion}`);
      } else {
        rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
      }
    }

    if (
      isSpecFollowUpQuestion(q) &&
      usesPreviousProductContext &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0
    ) {
      // kalau sebelumnya compare, tanya dulu produk mana
      if (
        session.lastTopic === "compare" &&
        session.lastProducts.length === 2
      ) {
        setLastBotQuestion(session, "ask_product_for_spec", {
          products: session.lastProducts.map((p) => p.name),
        });

        return await send(
          {
            type: "text",
            message:
              `Kamu mau cek spesifikasi produk yang mana dulu?\n\n` +
              `• ${session.lastProducts[0].name}\n` +
              `• ${session.lastProducts[1].name}\n\n` +
              `Balas nama produknya ya 😊`,
          },
          "product_detail",
        );
      }

      function formatSpec(p) {
        const dims = p.dimensions || {};
        const dimText =
          dims.length || dims.width || dims.height
            ? `${dims.length || "-"} x ${dims.width || "-"} x ${dims.height || "-"}`
            : "";

        const parts = [];
        if (p.condition) parts.push(`• Kondisi: ${p.condition}`);
        if (p.weight) parts.push(`• Berat: ${p.weight} gram`);
        if (dimText) parts.push(`• Dimensi (P x L x T): ${dimText}`);
        return parts.length ? parts.join("\n") : "";
      }

      const top = session.lastProducts[0];
      const specText = formatSpec(top);

      session.lastIntent = "product_detail";

      if (!specText) {
        return await send(
          {
            type: "text",
            message: `Produk terakhir yang sedang kita bahas adalah **${top.name}**, tapi info berat/dimensi/kondisinya belum tercantum di data 🙏`,
          },
          "product_detail",
        );
      }

      return await send(
        {
          type: "products",
          intro: `Detail **${top.name}**:\n${specText}`,
          products: [top],
          _noTruncateReasoning: true,
        },
        "product_detail",
      );
    }

    if (
      session.lastBotQuestionType === "ask_product_for_spec" &&
      isShortFollowUp(rawQuestion) &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0
    ) {
      const picked = bestMatchByName(rawQuestion, session.lastProducts);

      if (picked.best) {
        clearLastBotQuestion(session);
        session.lastProducts = [picked.best];
        session.lastTopic = "product_detail";
        session.lastIntent = "product_detail";

        const specText = formatSpec(picked.best);

        if (!specText) {
          return await send(
            {
              type: "text",
              message: `Produk **${picked.best.name}** ditemukan, tapi info berat/dimensi/kondisinya belum tercantum di data 🙏`,
            },
            "product_detail",
          );
        }

        return await send(
          {
            type: "products",
            intro: `Detail **${picked.best.name}**:\n${specText}`,
            products: [picked.best],
            _noTruncateReasoning: true,
          },
          "product_detail",
        );
      }

      return await send(
        {
          type: "text",
          message:
            "Aku belum yakin produk yang kamu maksud. Coba tulis nama yang lebih lengkap ya 😊",
        },
        "product_detail",
      );
    }
    // ===============================
    // Recommendation + transaction/shipping sections
    // ===============================
    if (keepsRecommendationAsPrimary()) {
      if (answerPlanIncludes(answerPlan, "transaction_policy")) {
        const policyMessage = buildTransactionPolicyMessage(rawQuestion, {
          codEnabled:
            String(process.env.COD_ENABLED || "false").toLowerCase() ===
            "true",
        });
        if (policyMessage) queuedAnswerSections.push(policyMessage);
      }

      if (answerPlanIncludes(answerPlan, "shipping_quote")) {
        const destination = extractShippingDestination(rawQuestion);
        queuedAnswerSections.push(
          destination
            ? `**Ongkir ke ${destination}**\nAku sudah menangkap kota tujuannya. Agar tarifnya tepat, sebutkan **kota/kabupaten dan kecamatan** secara lengkap, misalnya **Kota Bandung, Coblong**.`
            : "**Cek ongkir**\nSebutkan **kota/kabupaten dan kecamatan** tujuan agar tarifnya bisa dihitung dengan tepat.",
        );
        setPending(session, {
          type: "shipping_quote",
          stage: "need_city",
          data: { destination: destination || "" },
        });
      }
    }

    // ===============================
    // Product facts + transaction policy
    // ===============================
    if (
      answerPlan.isMultiSection &&
      answerPlanIncludes(answerPlan, "product_facts") &&
      answerPlanIncludes(answerPlan, "shipping_quote")
    ) {
      plannedProductFactsPrepared = true;
      let catalog = [];
      try {
        catalog = await getCleanProducts();
      } catch (error) {
        console.error("ANSWER PLAN PRODUCT FETCH ERROR:", error?.message || error);
      }

      const productMatch = catalog.length
        ? resolveRequestedProduct(rawQuestion, catalog, { compound: true })
        : { product: null, status: "unavailable" };
      const product = productMatch.product;

      if (product) {
        session.lastProducts = [product];
        answerPlanProduct = product;
        queuedAnswerSections.push(
          `**Informasi produk**\n${buildProductTransactionSummary(product, rawQuestion)}`,
        );
      } else if (productMatch.status === "ambiguous") {
        queuedAnswerSections = [];
        return await send(
          beginProductClarification(productMatch, "shipping_transaction"),
          "shipping_transaction",
        );
      } else {
        queuedAnswerSections.push(
          "**Informasi produk**\nMaaf, produk yang dimaksud belum bisa dipastikan dari katalog, jadi kondisi, stok, harga, atau promonya belum dapat dikonfirmasi.",
        );
      }
    }

    if (
      answerPlan.isMultiSection &&
      answerPlanIncludes(answerPlan, "product_facts") &&
      answerPlanIncludes(answerPlan, "transaction_policy") &&
      !answerPlanIncludes(answerPlan, "shipping_quote")
    ) {
      const policyMessage = buildTransactionPolicyMessage(rawQuestion, {
        codEnabled:
          String(process.env.COD_ENABLED || "false").toLowerCase() === "true",
      });

      let catalog = [];
      try {
        catalog = await getCleanProducts();
      } catch (error) {
        console.error("COMPOUND PRODUCT FETCH ERROR:", error?.message || error);
      }

      if (!catalog.length) {
        return await send(
          {
            type: "text",
            message: [
              "Maaf, data produk sedang sulit diakses sehingga stok, harga, atau promonya belum bisa dipastikan sekarang.",
              policyMessage,
            ]
              .filter(Boolean)
              .join("\n\n"),
            intent: "shipping_transaction",
          },
          "shipping_transaction",
        );
      }

      const productMatch = resolveRequestedProduct(rawQuestion, catalog, {
        compound: true,
      });
      const product = productMatch.product;

      if (!product) {
        if (productMatch.status === "ambiguous") {
          return await send(
            beginProductClarification(productMatch, "shipping_transaction"),
            "shipping_transaction",
          );
        }
        const requestedTerm = extractRequestedCatalogTerm(rawQuestion);
        return await send(
          {
            type: "text",
            message: [
              `Maaf, ${requestedTerm ? `produk **${requestedTerm}**` : "produk yang kamu maksud"} belum ditemukan di katalog Robot Jadul, jadi stok, harga, atau promonya belum bisa dipastikan.`,
              policyMessage,
            ]
              .filter(Boolean)
              .join("\n\n"),
            intent: "shipping_transaction",
          },
          "shipping_transaction",
        );
      }

      return await send(
        {
          type: "products",
          intro: [
            buildProductTransactionSummary(product, rawQuestion),
            policyMessage,
          ]
            .filter(Boolean)
            .join("\n\n"),
          products: [product],
          product_match: {
            status: productMatch.status,
            confidence: productMatch.confidence,
            reason: productMatch.reason,
          },
          intent: "shipping_transaction",
          _noTruncateReasoning: true,
        },
        "shipping_transaction",
      );
    }

    // ===============================
    // Shipping Transaction / Cek Ongkir
    // ===============================
    if (intentResult.intent === "shipping_transaction") {
      const transactionPolicyMessage = buildTransactionPolicyMessage(
        privacySafeQuestion(),
        {
          codEnabled:
            String(process.env.COD_ENABLED || "false").toLowerCase() ===
            "true",
          includeShippingOffer: true,
        },
      );

      if (transactionPolicyMessage) {
        if (answerPlanIncludes(answerPlan, "shipping_quote")) {
          queuedAnswerSections.push(transactionPolicyMessage);
        } else {
          return await send(
            {
              type: "text",
              intent: "shipping_transaction",
              message: transactionPolicyMessage,
              _actionContext: looksLikePaymentMethodQuestion(rawQuestion)
                ? "payment_methods"
                : looksLikeInsuranceQuestion(rawQuestion)
                  ? "shipping_insurance"
                : looksLikeShippingEstimateQuestion(rawQuestion)
                  ? "shipping_estimate"
                  : undefined,
            },
            "shipping_transaction",
          );
        }
      }

      if (looksLikeHowToBuyQuestion(rawQuestion)) {
        const steps = await getHowToBuy();

        if (!steps) {
          return await send({
            type: "text",
            message:
              "Saya bisa jelaskan cara belinya, tapi halaman panduannya sedang sulit diakses. Coba lagi sebentar ya, atau bilang kamu stuck di langkah mana (login, cart, checkout, pembayaran).",
          });
        }

        session.lastIntent = "how_to_buy";
        session.lastStep = null;

        return await send({
          type: "how_to_buy",
          intro: "Berikut panduan cara beli di Robot Jadul (step-by-step):",
          steps,
          _noTruncateReasoning: true,
          _actionContext: "how_to_buy",
        });
      }

      const shippingQuoteRequested =
        looksLikeShippingQuoteQuestion(rawQuestion) ||
        answerPlanIncludes(answerPlan, "shipping_quote");

      if (!shippingQuoteRequested) {
        return await send(
          {
            type: "text",
            intent: "shipping_transaction",
            message: buildTransactionTopicClarification(),
            _actionContext: "transaction_topic_selection",
          },
          "shipping_transaction",
        );
      }

      const internationalDestination =
        extractInternationalShippingDestination(rawQuestion);
      if (
        internationalDestination &&
        looksLikeInternationalShippingQuestion(rawQuestion)
      ) {
        clearPending(session);
        return await send(
          {
            type: "text",
            intent: "shipping_transaction",
            message: buildInternationalShippingMessage(
              internationalDestination,
            ),
            admin_handoff: {
              label: "Tanya Admin soal Pengiriman Internasional",
              topic: `pengiriman internasional ke ${internationalDestination}`,
            },
          },
          "shipping_transaction",
        );
      }

      // kalau user langsung menulis "Tangerang, Pasar Kemis"
      const plannedDestination = answerPlanIncludes(answerPlan, "shipping_quote")
        ? extractShippingDestination(rawQuestion)
        : "";
      const { cityText, districtText } = splitCityDistrict(
        plannedDestination || rawQuestion,
      );

      // kalau ada format kota, kecamatan
      if (cityText && districtText) {
        const resolved = await resolveShippingLocation(cityText);

        if (resolved.kind === "single_city") {
          const city = resolved.city;

          const data = await searchDistrictsFromWP(
            city.city_id,
            districtText,
          ).catch(() => null);

          const districts = data?.districts || [];

          if (!districts.length) {
            return await send(
              await beginDistrictSelection(
                session,
                city.city_id,
                city.name,
              ),
              "shipping_transaction",
            );
          }

          if (districts.length > 1) {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district_in_city",
              data: {
                city_id: city.city_id,
                city_name: city.name,
                candidates: districts.slice(0, 8),
              },
            });

            return await send(
              {
                type: "options",
                intro: `Aku menemukan beberapa kecamatan di **${city.name}**. Pilih yang benar ya:`,
                options: districts.slice(0, 8).map((d) => ({
                  label: d.title,
                  value: d.title,
                })),
                intent: "shipping_transaction",
              },
              "shipping_transaction",
            );
          }

          const top = districts[0];

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: city.city_id,
            district_id: top.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return await send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${city.name} - ${top.title}**:\n\n${list}`,
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }

        if (resolved.kind === "multi_city") {
          setPending(session, {
            type: "shipping_quote",
            stage: "choose_city_with_district",
            data: {
              districtText,
              candidates: resolved.cities.slice(0, 8),
            },
          });

          return await send(
            {
              type: "options",
              intro: `Aku menemukan beberapa hasil untuk **${cityText}**. Pilih kota/kabupaten yang benar ya:`,
              options: resolved.cities.slice(0, 8).map((c) => ({
                label: c.name,
                value: c.name,
              })),
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }
      }

      // kalau hanya kota, misalnya "tangerang"
      if (cityText && !districtText) {
        const resolved = await resolveShippingLocation(cityText);

        if (resolved.kind === "single_city") {
          return await send(
            await beginDistrictSelection(
              session,
              resolved.city.city_id,
              resolved.city.name,
            ),
            "shipping_transaction",
          );
        }

        if (resolved.kind === "multi_city") {
          setPending(session, {
            type: "shipping_quote",
            stage: "choose_city",
            data: {
              candidates: resolved.cities.slice(0, 8),
            },
          });

          return await send(
            {
              type: "options",
              intro: `Aku menemukan beberapa hasil untuk **${cityText}**. Pilih kota/kabupaten yang benar ya:`,
              options: resolved.cities.slice(0, 8).map((c) => ({
                label: c.name,
                value: c.name,
              })),
              intent: "shipping_transaction",
            },
            "shipping_transaction",
          );
        }
      }

      // fallback kalau belum jelas
      setPending(session, {
        type: "shipping_quote",
        stage: "need_city",
        data: {},
      });

      return await send(
        {
          type: "text",
          message:
            "Untuk cek ongkir, kamu bisa kirim sekaligus **kota/kabupaten, kecamatan**, " +
            "misalnya **Kabupaten Tangerang, Rajeg**. Kalau baru tahu kota/kabupatennya, " +
            "kirim itu dulu dan aku bantu lanjutkan.",
          intent: "shipping_transaction",
        },
        "shipping_transaction",
      );
    }

    if (intentResult.intent === "shipping_origin") {
      const storeText =
        process.env.STORE_ADDRESS_TEXT ||
        "📍Robot Jadul. Blok M Square lt 3A blok A no 36-37. Jl Melawai 5. Jakarta Selatan 12160. Indonesia\n🗓️Every day\n🕰️11:00-20:00";

      const originText =
        process.env.SHIP_ORIGIN_TEXT ||
        "Pengiriman diproses dari TOKO Robot Jadul di **JAKARTA SELATAN**.";

      if (looksLikeStoreLocationQuestion(rawQuestion)) {
        return await send(
          {
            type: "text",
            message: storeText,
            _actionContext: "store_location",
          },
          "general",
        );
      }

      return await send(
          {
            type: "text",
            message: `${originText}\n\nAlamat toko kami jika kamu ingin datang langsung:\n\n${storeText}`,
            _actionContext: "shipping_origin",
          },
        "shipping_transaction",
      );
    }

    // ===============================
    // Shipment Tracking
    // ===============================
    if (intentResult.intent === "shipment_tracking") {
      const trackingNumber = extractTrackingNumber(rawQuestion);

      if (!trackingNumber) {
        setPending(session, {
          type: "shipment_tracking",
          stage: "need_tracking_number",
          data: {},
        });

        return await send(
          {
            type: "text",
            message:
              "Siap 😊 Kirim nomor resinya dulu ya. Kalau bisa sekalian tulis kurirnya juga, misalnya: **JNE 123456789**.",
          },
          "shipment_tracking",
        );
      }

      const courierCode = extractCourierCode(rawQuestion); // buat helper sederhana: jne, jnt, sicepat, pos, dll

      if (!courierCode) {
        setPending(session, {
          type: "shipment_tracking",
          stage: "need_courier_code",
          data: { trackingNumber },
        });

        return await send(
          {
            type: "text",
            message: `Nomor resi **${trackingNumber}** sudah aku terima.\nSekarang kurirnya apa ya? Contoh: **JNE**, **J&T**, **SiCepat**, **Anteraja**, atau **POS**.`,
          },
          "shipment_tracking",
        );
      }

      try {
        const raw = await fetchBiteshipPublicTracking({
          trackingNumber,
          courierCode,
        });

        const tracking = mapBiteshipTracking(raw);

        return await send(
          {
            type: "text",
            message: buildTrackingMessage(tracking),
          },
          "shipment_tracking",
        );
      } catch (err) {
        return await send(
          {
            type: "text",
            message: `Maaf, resi **${trackingNumber}** belum bisa dicek saat ini 🙏\nAlasannya: ${err.message}`,
          },
          "shipment_tracking",
        );
      }
    }

    // ==================
    // Transaction_status
    // =================
    if (intentResult.intent === "transaction_status") {
      const orderId = extractOrderId(rawQuestion);

      if (!orderId) {
        setPending(session, {
          type: "transaction_status",
          stage: "need_order_id",
          data: {},
        });
        return await send(
          {
            type: "text",
            message:
              "Tentu, aku bisa bantu cek status transaksi. Kirim **Order ID / nomor pesanan** terlebih dahulu, misalnya **Order #6864**.",
          },
          "transaction_status",
        );
      }

      const verification = extractOrderVerification(rawQuestion);
      if (!verification) {
        setPending(session, {
          type: "transaction_status",
          stage: "need_verification",
          data: { orderId, attempts: 0 },
        });
        return await send(
          {
            type: "text",
            message: buildOrderVerificationPrompt(orderId),
          },
          "transaction_status",
        );
      }

      return await verifyOrderStatus(orderId, verification);
    }

    // simpan untuk follow-up / riset
    const previousIntent = session.lastIntent;
    session.lastIntent = intentResult.intent;
    session.lastIntentMethod = intentResult.method || null;
    session.lastIntentScore = intentResult.score ?? null;

    // log (buat penelitian)
    session.history.push({
      type: "user",
      text: privacySafeQuestion(),
      intent: intentResult.intent,
      method: intentResult.method,
      score: intentResult.score,
      at: Date.now(),
    });

    // optional: batasi history biar ga bengkak
    if (session.history.length > 50)
      session.history = session.history.slice(-50);

    // debug export (opsional, matikan di production)
    if (q === "__export_intent_log__") {
      return res.json({ type: "intent_log", history: session.history });
    }

    //===========================
    // Intent Follow up Detection
    // ===========================

    const isFollowUp =
      session.lastIntent === "how_to_buy_help" &&
      (q.includes("lanjut") ||
        q.includes("berikut") ||
        q.includes("next") ||
        q.includes("step selanjutnya"));

    if (isFollowUp && session.lastStep) {
      const nextStepNum = session.lastStep + 1;
      const steps = await getHowToBuy();
      const nextStep = steps?.find((s) => s.step === nextStepNum);

      if (nextStep) {
        session.lastStep = nextStepNum;

        return await send({
          type: "how_to_buy_help",
          intro: `Oke kita lanjut ke Step ${nextStepNum}.`,
          message: nextStep.text,
          step: nextStep,
          _noTruncateReasoning: true,
        });
      }
    }

    // ============================
    // Deteksi produk murah/mahal tanpa intent price_promo
    // ============================
    function extractMeaningfulKeywords(q = "") {
      const stopWords = [
        "ada",
        "produk",
        "barang",
        "yang",
        "yg",
        "paling",
        "murah",
        "termurah",
        "mahal",
        "termahal",
        "harga",
        "berapa",
        "dong",
        "nih",
        "kak",
        "min",
        "disini",
        "di",
        "bawah",
        "atas",
        "antara",
        "sampai",
        "dibawah",
        "diatas",
        "kurang",
        "dari",
        "maksimal",
        "max",
        "juta",
        "jt",
        "ribu",
        "rb",
        "ready",
        "stock",
        "stok",
        "tersedia",
        "apa",
        "saja",
        "promo",
        "diskon",
        "sale",
        "cashback",
        "toko",
        "store",
        "sini",
        "ini",
      ];

      return q
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !stopWords.includes(w));
    }

    // ===============================
    // 🔹 DETEKSI INTENT HARGA
    // ===============================
    let isMostExpensive = q.includes("termahal") || q.includes("paling mahal");
    let isCheapest = q.includes("termurah") || q.includes("paling murah");

    const isAbove =
      q.includes("diatas") || q.includes("di atas") || q.includes("lebih dari");
    const isBelow =
      q.includes("dibawah") ||
      q.includes("di bawah") ||
      q.includes("kurang dari");
    const budgetInfo = extractBudgetRange(q);

    const isBetween =
      budgetInfo.detected && budgetInfo.min != null && budgetInfo.max != null;
    const includeOOS =
      q.includes("termasuk habis") ||
      q.includes("out of stock") ||
      q.includes("habis juga");

    let hasPriceIntent =
      isMostExpensive ||
      isCheapest ||
      isAbove ||
      isBelow ||
      isBetween ||
      budgetInfo.detected;

    const meaningfulKeywords = extractMeaningfulKeywords(q);
    const hasScopedKeyword = meaningfulKeywords.length > 0;

    // default: kalau termurah/termahal, ambil yang ready dulu (kecuali user bilang "termasuk habis")

    function isCheapWordPresent(q = "") {
      return (
        q.includes("murah") ||
        q.includes("termurah") ||
        q.includes("paling murah") ||
        q.includes("hemat")
      );
    }

    // ===============================
    // PRIORITAS INTENT HARGA (FIX)
    // ===============================
    if (intentResult?.intent === "price_promo") {
      // paksa mode harga aktif
      if (!hasPriceIntent) {
        // deteksi tambahan dari intent classifier
        if (q.includes("murah") || q.includes("termurah")) {
          isCheapest = true;
        }
        if (q.includes("mahal") || q.includes("termahal")) {
          isMostExpensive = true;
        }
      }
    }

    if (hasScopedKeyword && isCheapWordPresent(q)) {
      isCheapest = true;
    }

    hasPriceIntent =
      isMostExpensive ||
      isCheapest ||
      isAbove ||
      isBelow ||
      isBetween ||
      budgetInfo.detected;
    // =============================
    // Handle "how to buy" intent
    // =============================

    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    // const isHowToBuy = detectHowToBuyIntent(q, history);

    function extractStepNumber(q) {
      const m =
        q.match(/\bstep\s*(\d{1,2})\b/i) || q.match(/\blangkah\s*(\d{1,2})\b/i);
      return m ? parseInt(m[1], 10) : null;
    }

    const n = extractStepNumber(q);

    const isHowToBuy = looksLikeHowToBuyQuestion(rawQuestion);

    // follow-up hanya kalau konteks sebelumnya how_to_buy
    const wasHowToBuy = session.lastIntent === "how_to_buy";

    const isHowToBuyFollowup =
      wasHowToBuy &&
      (n !== null ||
        q.includes("stuck") ||
        q.includes("bingung") ||
        q.includes("gagal") ||
        q.includes("error") ||
        q.includes("lanjut") ||
        q.includes("next") ||
        q.includes("selanjutnya"));

    if (isHowToBuy || isHowToBuyFollowup) {
      const steps = await getHowToBuy();

      if (!steps) {
        return await send({
          type: "text",
          message:
            "Saya bisa jelaskan cara belinya, tapi halaman panduannya sedang sulit diakses. Coba lagi sebentar ya, atau bilang kamu stuck di langkah mana (login, cart, checkout, pembayaran).",
        });
      }

      // ✅ Kalau user sebut step: jelasin step itu
      if (n !== null) {
        const step = steps.find((x) => Number(x.step) === Number(n));

        if (!step) {
          return await send({
            type: "text",
            message: `Aku tidak menemukan Step ${n} di panduan. Kamu ingat step-nya tentang apa?`,
          });
        }

        let aiHelp = null;
        if (
          GEMINI_MODE.enableStepExplain &&
          /bingung|stuck|gagal|error/i.test(rawQuestion)
        ) {
          try {
            aiHelp = await explainStepWithGemini({ rawQuestion, step });
          } catch (e) {
            aiHelp = null;
          }
        }

        session.lastIntent = "how_to_buy";
        session.lastStep = n;

        return await send({
          type: "text",
          message:
            aiHelp ||
            `Oke, kamu stuck di Step ${n}. Ini penjelasan versi gampangnya:\n\n${step.text}\n\nKalau mentoknya di bagian mana?`,
        });
      }

      // ✅ Kalau tidak sebut step: tampilkan semua steps
      session.lastIntent = "how_to_buy";
      session.lastStep = null;

      return await send({
        type: "how_to_buy",
        intro: "Berikut panduan cara beli di Robot Jadul (step-by-step):",
        steps,
        _noTruncateReasoning: true,
        _actionContext: "how_to_buy",
      });
    }

    // ===============================
    // 🔹 Dynamic Intro & Closing
    // ===============================
    function randomItem(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    const intros = [
      "Berikut beberapa produk yang mungkin cocok untuk Anda:",
      "Saya menemukan beberapa pilihan menarik untuk Anda:",
      "Berdasarkan pencarian Anda, ini rekomendasinya:",
      "Ini beberapa produk yang sesuai dengan kebutuhan Anda:",
      "Saya rekomendasikan produk berikut:",
    ];

    const closings = [
      "Silakan pilih sesuai kebutuhan Anda 😊",
      "Jika ingin detail lebih lanjut, klik salah satu produknya ya.",
      "Butuh rekomendasi lain? Saya siap bantu 👍",
      "Kalau masih ragu, saya bisa bantu bandingkan juga.",
      "Semoga membantu! Ada yang ingin ditanyakan lagi?",
    ];

    // ===============================
    // 🔹 Ambil produk WooCommerce
    // ===============================

    // Store-policy questions do not refer to one catalog product.
    if (looksLikeNegotiationPolicyQuestion(rawQuestion)) {
      return await send(
        {
          type: "text",
          message: buildNegotiationPolicyMessage(),
        },
        "price_promo",
      );
    }

    if (looksLikeGeneralStockPolicyQuestion(rawQuestion)) {
      let policyProducts = [];
      try {
        policyProducts = await getCleanProducts();
      } catch (error) {
        console.error("STOCK POLICY CATALOG ERROR:", error?.message || error);
      }

      return await send(
        {
          type: "text",
          message: buildGeneralStockPolicyMessage(policyProducts),
        },
        "stock_availability",
      );
    }

    try {
      cleanProducts = await getCleanProducts();
    } catch (e) {
      console.error("WC FETCH ERROR:", e?.message || e);
      return await send(
        {
          type: "text",
          message:
            "Server lagi sibuk mengambil data produk. Coba ulangi 10-20 detik lagi ya.",
        },
        intentResult.intent,
      );
    }

    // ===============================
    // 🔎 TYPO MATCH CHECK
    // ===============================
    function isFuzzyMatch(word, target) {
      if (!word || !target) return false;

      word = word.toLowerCase();
      target = target.toLowerCase();

      // direct include
      if (target.includes(word)) return true;

      // batasi typo tolerance hanya untuk kata > 4 huruf
      if (word.length <= 4) return false;

      return levenshtein(word, target) <= 2;
    }

    // ===============================
    //  FITUR BANDINGKAN TAPI PAKAI LLM GEMINI UNTUK PENJELASAN
    // ===============================

    function pickCompareIntent(q) {
      const s = q.toLowerCase();
      return {
        preferCheap:
          s.includes("murah") || s.includes("termurah") || s.includes("hemat"),
        preferPremium:
          s.includes("mahal") ||
          s.includes("premium") ||
          s.includes("koleksi") ||
          s.includes("rare"),
        wantReady:
          s.includes("ready") || s.includes("stok") || s.includes("tersedia"),
      };
    }

    function keywordScore(q, product) {
      // kata “umum” yang sering muncul di pertanyaan compare
      const stop = new Set([
        "bandingkan",
        "vs",
        "versus",
        "mana",
        "yang",
        "bagus",
        "lebih",
        "baik",
        "dengan",
        "dan",
        "produk",
        "pilih",
        "rekomendasi",
      ]);

      const words = q
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !stop.has(w));

      if (!words.length) return 0;

      const text =
        `${product.name} ${product.category || ""} ${stripHtml(product.description || "")}`.toLowerCase();

      let score = 0;
      for (const w of words) {
        // supaya tidak terlalu agresif untuk kata pendek, minimal 4 huruf untuk include
        if (w.length >= 4 && text.includes(w)) score += 2;
      }
      return score;
    }

    function compareRuleBased(q, A, B) {
      const intent = pickCompareIntent(q);

      const reasonsA = [];
      const reasonsB = [];
      let scoreA = 0;
      let scoreB = 0;

      // 1) Stock
      if (A.stock === "instock") {
        scoreA += 3;
        reasonsA.push("Ready stock (bisa langsung diproses).");
      } else reasonsA.push("Stok tidak ready / out of stock.");

      if (B.stock === "instock") {
        scoreB += 3;
        reasonsB.push("Ready stock (bisa langsung diproses).");
      } else reasonsB.push("Stok tidak ready / out of stock.");

      // 2) Keyword relevance
      const kA = keywordScore(q, A);
      const kB = keywordScore(q, B);
      scoreA += kA;
      scoreB += kB;
      if (kA)
        reasonsA.push("Lebih relevan dengan kata kunci yang kamu sebutkan.");
      if (kB)
        reasonsB.push("Lebih relevan dengan kata kunci yang kamu sebutkan.");

      // 3) Price preference
      const pA = Number(A.numericPrice || 0);
      const pB = Number(B.numericPrice || 0);

      if (pA > 0 && pB > 0) {
        if (intent.preferCheap) {
          if (pA < pB) {
            scoreA += 2;
            reasonsA.push("Lebih hemat dibanding alternatif.");
          } else if (pB < pA) {
            scoreB += 2;
            reasonsB.push("Lebih hemat dibanding alternatif.");
          }
        } else if (intent.preferPremium) {
          if (pA > pB) {
            scoreA += 1;
            reasonsA.push("Cenderung premium (harga lebih tinggi).");
          } else if (pB > pA) {
            scoreB += 1;
            reasonsB.push("Cenderung premium (harga lebih tinggi).");
          }
        } else {
          // default: value for money (sedikit condong yang lebih murah)
          if (pA < pB) {
            scoreA += 1;
            reasonsA.push("Value lebih baik (harga lebih rendah).");
          } else if (pB < pA) {
            scoreB += 1;
            reasonsB.push("Value lebih baik (harga lebih rendah).");
          }
        }
      } else {
        reasonsA.push("Info harga tidak lengkap, penilaian harga terbatas.");
        reasonsB.push("Info harga tidak lengkap, penilaian harga terbatas.");
      }

      // Winner
      let winner = "A";
      if (scoreB > scoreA) winner = "B";
      else if (scoreA === scoreB) {
        // tie-breaker: instock, lalu lebih murah
        if (A.stock !== B.stock) winner = A.stock === "instock" ? "A" : "B";
        else if (pA > 0 && pB > 0) winner = pA <= pB ? "A" : "B";
      }

      const facts = {
        A: {
          name: A.name,
          price: pA,
          stock: A.stock,
          category: A.category || "",
          link: A.link,
          // tambahan penting:
          description: stripHtml(A.description || "").slice(0, 250),
          condition: A.condition || "(tidak tercantum)",
          weight: A.weight || "",
          dimensions: A.dimensions || {},
          discountPercent: A.discountPercent || 0,
          discountAmount: A.discountAmount || 0,
          totalSales: A.totalSales || 0,
          averageRating: A.averageRating || 0,
          ratingCount: A.ratingCount || 0,
        },
        B: {
          name: B.name,
          price: pB,
          stock: B.stock,
          category: B.category || "",
          link: B.link,
          description: stripHtml(B.description || "").slice(0, 250),
          condition: B.condition || "(tidak tercantum)",
          weight: B.weight || "",
          dimensions: B.dimensions || {},
          discountPercent: B.discountPercent || 0,
          discountAmount: B.discountAmount || 0,
          totalSales: B.totalSales || 0,
          averageRating: B.averageRating || 0,
          ratingCount: B.ratingCount || 0,
        },
      };

      return {
        winner,
        scores: { A: scoreA, B: scoreB },
        reasons: { A: reasonsA, B: reasonsB },
        facts,
        intent,
      };
    }

    function summarizeCompareProduct(label, product, reasons = []) {
      const lines = [];
      const price = Number(product.numericPrice || 0);
      const stockText =
        product.stock === "instock"
          ? "ready stock, jadi lebih aman kalau ingin langsung diproses"
          : "stoknya tidak ready, jadi perlu konfirmasi/alternatif";
      const condition = product.condition || "kondisi belum tercantum detail";
      const category = product.category || "kategori belum tercantum";
      const dims = product.dimensions || {};
      const dimText =
        dims.length || dims.width || dims.height
          ? `${dims.length || "-"} x ${dims.width || "-"} x ${dims.height || "-"}`
          : "";

      lines.push(`**Produk ${label}: ${product.name}**`);
      if (price > 0) lines.push(`- Harga: **${formatRupiah(price)}**.`);
      lines.push(`- Stok: ${stockText}.`);
      lines.push(`- Kondisi: ${condition}.`);
      if (category) lines.push(`- Kategori: ${category}.`);
      if (product.weight)
        lines.push(`- Berat: sekitar ${product.weight} gram.`);
      if (dimText) lines.push(`- Dimensi: ${dimText}.`);
      if (Number(product.discountPercent || 0) > 0) {
        lines.push(
          `- Promo: diskon ${product.discountPercent}% (hemat ${formatRupiah(product.discountAmount || 0)}).`,
        );
      }
      if (Number(product.averageRating || 0) > 0) {
        lines.push(
          `- Rating: ${Number(product.averageRating).toFixed(1)} / 5 dari ${Number(product.ratingCount || 0).toLocaleString("id-ID")} ulasan.`,
        );
      }
      if (Number(product.totalSales || 0) > 0) {
        lines.push(
          `- Sinyal toko: terjual ${Number(product.totalSales).toLocaleString("id-ID")}x.`,
        );
      }
      if (reasons.length) {
        lines.push(`- Catatan: ${reasons.join(" ")}`);
      }

      return lines.join("\n");
    }

    function buildCompareReasoning(rawQuestion, A, B, rule) {
      const pA = Number(A.numericPrice || 0);
      const pB = Number(B.numericPrice || 0);
      const winnerProduct = rule.winner === "B" ? B : A;
      const loserProduct = rule.winner === "B" ? A : B;
      const priceLine =
        pA > 0 && pB > 0
          ? `Secara harga, **${pA <= pB ? A.name : B.name}** lebih hemat (${formatRupiah(Math.min(pA, pB))}) dibanding **${pA <= pB ? B.name : A.name}** (${formatRupiah(Math.max(pA, pB))}).`
          : "Data harga salah satu produk belum lengkap, jadi penilaian harga dibuat terbatas.";

      const lines = [
        `Aku bandingkan berdasarkan stok, harga/value, kondisi, kategori, dan data produk yang tersedia.`,
        "",
        summarizeCompareProduct("A", A, rule.reasons?.A || []),
        "",
        summarizeCompareProduct("B", B, rule.reasons?.B || []),
        "",
        priceLine,
        `**Rekomendasi sementara: ${winnerProduct.name}** lebih unggul untuk kebutuhan umum saat ini. Pilih **${loserProduct.name}** kalau kamu lebih suka karakter/seri tersebut atau kondisinya lebih sesuai selera koleksi kamu.`,
      ];

      if (/pajangan|display|koleksi/i.test(rawQuestion || "")) {
        lines.push(
          "Untuk pajangan/koleksi, kondisi fisik dan kelengkapan box tetap penting dicek dari foto produk sebelum checkout.",
        );
      }

      return lines.join("\n");
    }

    // ===============================
    // FITUR BERAT< TINGGI DLL
    // ===============================
    function isSpecQuestion(q) {
      const s = q.toLowerCase();
      return [
        "berat",
        "weight",
        "ukuran",
        "dimensi",
        "size",
        "panjang",
        "length",
        "lebar",
        "width",
        "tinggi",
        "height",
        "kondisi",
        "condition",
        "misb",
        "mint in box",
      ].some((k) => s.includes(k));
    }

    // ===============================
    // 🔥 FITUR COMPARE
    // ===============================

    function cleanupCompareName(s = "") {
      let x = String(s).trim();

      // buang tanda kutip
      x = x.replace(/^["'“”]+|["'“”]+$/g, "").trim();

      // potong ekor pertanyaan yang sering “nempel”
      // contoh: "Grendizer U mana yg lebih bagus untuk saya beli?"
      x = x
        .split(
          /\b(mana|yang|yg|lebih|bagus|proper|cocok|rekomendasi|recommend|terbaik|rekomen|dicari|recommended|recommendation|pilih|beli|buy)\b/i,
        )[0]
        .trim();

      // rapikan spasi
      x = x.replace(/\s+/g, " ").trim();

      return x;
    }

    function extractCompareNames(rawQuestion = "") {
      const q = rawQuestion.trim();

      // pola: bandingkan/compare A dengan B, A vs B, A atau B mana yang lebih bagus
      let m =
        q.match(
          /(?:bandingkan|compare)\s+(.+?)\s+(?:dengan|sama|dan|atau|vs|versus)\s+(.+)$/i,
        ) ||
        q.match(/(.+?)\s+(?:vs|versus)\s+(.+)$/i) ||
        q.match(
          /(?:apa\s+)?bedanya\s+(.+?)\s+(?:dengan|sama|dan|atau|vs|versus)\s+(.+)$/i,
        ) ||
        q.match(
          /(.+?)\s+(?:dengan|sama|dan|atau)\s+(.+?)\s+(?:mana|yang\s+lebih|lebih\s+bagus|lebih\s+baik|bagusan|worth|recommended|rekomendasi|rekomen)\b.*$/i,
        ) ||
        q.match(
          /mana\s+(?:yang\s+)?(?:lebih\s+)?(?:bagus|baik|worth|recommended|rekomen|cocok).*?\s+(.+?)\s+(?:dengan|sama|dan|atau|vs|versus)\s+(.+)$/i,
        ) ||
        q.match(
          /antara\s+(.+?)\s+(?:dengan|sama|dan|atau|vs|versus)\s+(.+)$/i,
        ) ||
        q.match(/(.+?)\s+(?:dengan|sama|dan|atau)\s+(.+)$/i);

      if (!m) return null;

      const a = cleanupCompareName(m[1]);
      const b = cleanupCompareName(m[2]);

      if (!a || !b) return null;

      return { a, b };
    }

    console.log("RJ_SHIP_TOKEN exists?", !!process.env.RJ_SHIP_TOKEN);

    // fuzzy sederhana: exact / include / typo ringan
    if (
      q.includes("bandingkan") &&
      !q.includes("dengan") &&
      !q.includes("vs")
    ) {
      const name = q.replace("bandingkan", "").trim();

      if (name) {
        setLastBotQuestion(session, "ask_product_name", {
          source: "compare_second",
          first_product: name,
        });

        return await send({
          type: "text",
          message: `Mau dibandingkan dengan produk apa? (misalnya: bandingkan ${name} dengan produk lain)`,
        });
      }
    }

    /**
     * Pilih produk dengan:
     * - minimal 1 "anchor token" match (token terpanjang dari query)
     * - skor keseluruhan tinggi (rata-rata token match)
     */

    const compareFollowUpContext =
      session.lastIntent === "compare" ||
      session.lastTopic === "compare" ||
      session.lastBotQuestionMeta?.source === "compare_second";

    const isCompareIntent =
      intentResult.intent === "compare" ||
      q.includes("bandingkan") ||
      /\bcompare\b/.test(q) ||
      q.includes(" vs ") ||
      q.includes("versus") ||
      q.includes("apa bedanya") ||
      q.includes("bedanya") ||
      q.includes("perbedaan") ||
      (compareFollowUpContext &&
        /\b(dengan|sama|dan|atau)\b/.test(q) &&
        q.split(/\s+/).filter(Boolean).length >= 3) ||
      (q.includes(" beda ") && q.includes(" dengan "));

    if (isCompareIntent) {
      const pair = extractCompareNames(rawQuestion); // pakai rawQuestion asli
      if (!pair) {
        session.lastIntent = "compare";
        session.lastTopic = "compare";

        return await send(
          {
            type: "text",
            intent: "compare",
            message: "Formatnya: bandingkan [Produk A] dengan [Produk B]",
          },
          "compare",
        );
      }
      const list = await getCleanProducts();
      const aPick = bestMatchByName(pair.a, list);
      const bPick = bestMatchByName(pair.b, list);

      console.log("COMPARE PICK:", {
        a: { q: pair.a, best: aPick.best?.name, score: aPick.bestScore },
        b: { q: pair.b, best: bPick.best?.name, score: bPick.bestScore },
      });

      // threshold (kalau sudah exact match harusnya 1.0)
      if (
        !aPick.best ||
        !bPick.best ||
        aPick.bestScore < 0.35 ||
        bPick.bestScore < 0.35
      ) {
        session.lastIntent = "compare";
        session.lastTopic = "compare";

        return await send(
          {
            type: "text",
            intent: "compare",
            message:
              "Maaf, satu atau kedua produk itu belum ada di katalog atau namanya belum cocok dengan data Robot Jadul. " +
              `Aku belum menemukan: ${[
                !aPick.best || aPick.bestScore < 0.35 ? `"${pair.a}"` : "",
                !bPick.best || bPick.bestScore < 0.35 ? `"${pair.b}"` : "",
              ]
                .filter(Boolean)
                .join(" dan ")}. ` +
              "Coba periksa namanya atau copy-paste judul persis dari halaman produk.",
          },
          "compare",
        );
      }

      const A = aPick.best;
      const B = bPick.best;

      const rule = compareRuleBased(rawQuestion.toLowerCase(), A, B);
      const fallbackCompareReasoning = buildCompareReasoning(
        rawQuestion,
        A,
        B,
        rule,
      );

      let aiText = null;
      if (GEMINI_MODE.enableCompareExplain) {
        try {
          aiText = await explainCompareWithGemini({
            rawQuestion,
            facts: rule.facts,
            winner: rule.winner,
            reasons: rule.reasons,
            scores: rule.scores,
            intent: rule.intent,
          });
        } catch (err) {
          console.error("GEMINI COMPARE EXPLAIN ERROR:", err?.message || err);
          aiText = null;
        }
      }

      session.lastProducts = [A, B];
      session.lastTopic = "compare";
      session.lastIntent = "compare";

      return await send({
        type: "compare_reasoned",
        intro: "Berikut perbandingan dua produk yang kamu pilih:",
        products: [A, B],
        winner: rule.winner,
        scores: rule.scores,
        reasoning_text: aiText || fallbackCompareReasoning,
        _noTruncateReasoning: true,
      });
    }

    // ===============================
    // KETIKA BERTANYA PRODUK YG READY BANYAK BARANG
    // ===============================
    if (isGlobalStockQuestion(rawQuestion)) {
      const products = await getCleanProducts();
      const readyProducts = products
        .filter((p) => p.stock === "instock")
        .slice(0, 10);

      return send(
        {
          type: "products",
          intro: "Berikut produk yang saat ini ready stock:",
          products: readyProducts,
        },
        "stock_availability",
      );
    }

    // ===============================
    // RINGKASAN KATALOG / JUMLAH PRODUK
    // ===============================
    if (isCatalogOverviewQuestion(rawQuestion)) {
      const products = await getCleanProducts();
      const overview = buildCatalogOverview(products, 10);

      if (!overview.total) {
        return await send(
          {
            type: "text",
            message:
              "Data katalog belum tersedia saat ini. Coba cek lagi beberapa saat ya.",
          },
          "product_discovery",
        );
      }

      if (isStoreAssortmentQuestion(rawQuestion)) {
        const categoryText = overview.categories
          .map((category) => `**${category.name}**`)
          .join(", ");

        return await send(
          {
            type: "text",
            message:
              "Robot Jadul memang fokus pada koleksi robot dan mecha, tapi barangnya tidak hanya satu jenis. " +
              (categoryText
                ? `Kategori yang tersedia saat ini mencakup ${categoryText}. `
                : "Koleksinya mencakup beberapa jenis figure dan barang koleksi. ") +
              `Totalnya ada **${overview.total} produk**, dengan **${overview.ready} produk** yang tercatat ready stock.`,
          },
          "product_discovery",
        );
      }

      return await send(
        {
          type: "products",
          intro:
            `Saat ini katalog Robot Jadul memuat **${overview.total} produk**. ` +
            `Sebanyak **${overview.ready} produk** tercatat ready stock` +
            (overview.promo
              ? ` dan **${overview.promo} produk** sedang memiliki promo.`
              : ".") +
            "\n\nBerikut beberapa produk ready yang bisa kamu lihat:",
          products: overview.displayProducts,
          closing:
            "Kamu bisa menyempitkan daftar ini berdasarkan nama robot, seri, harga, promo, atau stok.",
        },
        "product_discovery",
      );
    }

    // ===============================
    // Rekomendasi Hybird dengan Gemini dan Ruled based
    // ==============================
    if (intentResult.intent === "recommendation") {
      const list = await getCleanProducts();

      let candidates = [...list].filter(
        (p) =>
          p.stock === "instock" &&
          !excludedAlternativeProductIds.has(String(p.id || "")),
      );
      const isPopularityQuery = isPopularityStyleQuestion(rawQuestion);
      const recNeeds = extractRecommendationNeeds(
        rawQuestion,
        semantic,
        compoundAnalysis,
      );
      const hasStructuredCatalogPreference =
        recNeeds.requestedDecade != null ||
        recNeeds.requestedFranchiseIds.length > 0 ||
        Boolean(recNeeds.requestedSizeClass);
      const isExplicitCatalogRequest =
        /\b(?:ada|jual|menjual|punya|tersedia|cari|carikan)\b/i.test(
          rawQuestion,
        );
      const requestedProductMatch = assessProductSearchConfidence(
        rawQuestion,
        list,
      );

      if (
        isExplicitCatalogRequest &&
        !hasStructuredCatalogPreference &&
        hasSpecificProductSearchTerms(rawQuestion) &&
        ["no_catalog_match", "partial_query_match"].includes(
          requestedProductMatch.reason,
        )
      ) {
        return await send(
          {
            type: "text",
            message:
              "Maaf, robot atau produk yang kamu minta belum ada di katalog Robot Jadul saat ini. Aku tidak akan menggantinya dengan produk lain yang tidak sesuai.",
          },
          "recommendation",
        );
      }

      let shortlist = [];

      if (isPopularityQuery) {
        shortlist = candidates
          .map((p) => ({
            ...p,
            popularityScore: basePopularityScore(p),
          }))
          .sort((a, b) => b.popularityScore - a.popularityScore)
          .slice(0, 10);
      } else {
        // shortlist = candidates
        //   .sort((a, b) => (b.numericPrice || 0) - (a.numericPrice || 0))
        //   .slice(0, 8);

        shortlist = candidates.slice(0, 50);
      }

      console.log(
        "shortlist:",
        shortlist.map((p) => ({
          id: p.id,
          name: p.name,
          totalSales: p.totalSales,
          ratingCount: p.ratingCount,
          averageRating: p.averageRating,
        })),
      );

      if (recNeeds.budgetMin != null) {
        updateSlot(session, "budgetMin", recNeeds.budgetMin);
      }
      if (recNeeds.budgetMax != null) {
        updateSlot(session, "budgetMax", recNeeds.budgetMax);
      }
      if (recNeeds.conditionPreference) {
        updateSlot(session, "condition", recNeeds.conditionPreference);
      }

      // pakai sumber kandidat yang lebih luas, jangan langsung shortlist mahal
      let recommendationSource = [...candidates];

      recommendationSource = recommendationSource.filter((product) =>
        productMatchesCompoundConstraints(
          product,
          recNeeds.compoundConstraints,
        ),
      );

      // 🔥 FILTER BUDGET (INI YANG PALING PENTING)
      if (recNeeds.budgetMin != null) {
        recommendationSource = recommendationSource.filter(
          (p) => Number(p.numericPrice || 0) >= recNeeds.budgetMin,
        );
      }

      if (recNeeds.budgetMax != null) {
        recommendationSource = recommendationSource.filter(
          (p) => Number(p.numericPrice || 0) <= recNeeds.budgetMax,
        );
      }

      // kalau ada kebutuhan display / pajangan, boleh bantu sempitkan sedikit
      // sempitkan sedikit kalau ada use-case tertentu
      if (recNeeds.wantsDisplay || recNeeds.wantsCollection) {
        const narrowed = recommendationSource.filter((p) => {
          const text = getProductSearchText(p);

          if (recNeeds.wantsDisplay) {
            return (
              text.includes("display") ||
              text.includes("pajangan") ||
              text.includes("figure") ||
              text.includes("diecast") ||
              text.includes("chogokin") ||
              text.includes("misb")
            );
          }

          if (recNeeds.wantsCollection) {
            return (
              text.includes("koleksi") ||
              text.includes("collector") ||
              text.includes("collectible") ||
              text.includes("limited") ||
              text.includes("misb") ||
              text.includes("chogokin")
            );
          }

          return true;
        });

        if (narrowed.length) {
          recommendationSource = narrowed;
        }
      }

      // selalu ranking pintar
      let recommendedProducts = pickRecommendedProducts(
        recommendationSource,
        recNeeds,
        5,
      );

      // Ulangi dari kandidat penuh, tetapi tetap pertahankan semua constraint keras.
      if (!recommendedProducts.length) {
        const constrainedCandidates = candidates.filter((product) =>
          productMatchesCompoundConstraints(
            product,
            recNeeds.compoundConstraints,
          ),
        );
        recommendedProducts = pickRecommendedProducts(
          constrainedCandidates,
          recNeeds,
          5,
        );
        recommendationSource = constrainedCandidates;
      }

      if (!recommendedProducts.length) {
        return await send(
          {
            type: "text",
            message:
              "Maaf, belum ada produk yang memenuhi stok, kondisi, tujuan penggunaan, dan budget yang kamu minta. Aku tidak akan menggantinya dengan produk di luar kriteria.",
          },
          "recommendation",
        );
      }

      recommendationSource = recommendationSource
        .map((p) => ({
          ...p,
          score:
            (p.stock === "instock" ? 30 : 0) +
            (Number(p.discountPercent || 0) > 0 ? 10 : 0) +
            Math.min(Number(p.totalSales || 0), 10),
        }))
        .sort((a, b) => b.score - a.score);

      let geminiResult = null;
      try {
        geminiResult = await recommendWithGemini({
          rawQuestion,
          candidates: recommendedProducts,
          mode: isPopularityQuery
            ? "popularity"
            : recNeeds.wantsDisplay
              ? "display_recommendation"
              : "recommendation",
        });
      } catch (e) {
        console.error("GEMINI FAIL:", e?.message || e);
        geminiResult = null;
      }

      console.log("geminiResult:", geminiResult);

      let chosen = [];

      if (geminiResult?.chosen_product_ids?.length) {
        chosen = geminiResult.chosen_product_ids
          .map((id) => recommendedProducts.find((p) => p.id === id))
          .filter(Boolean)
          .slice(0, 3);
      }

      const fallbackProducts = recommendedProducts.slice(0, 3);
      const finalProducts = chosen.length ? chosen : fallbackProducts;

      if (!finalProducts.length) {
        return await send(
          {
            type: "text",
            message: "Aku belum menemukan rekomendasi yang cocok 🙏",
          },
          "recommendation",
        );
      }

      let geminiReasoning = null;

      // try {
      //   const explain = await explainRecommendationWithGemini({
      //     rawQuestion,
      //     chosenProducts: finalProducts,
      //     recNeeds,
      //   });
      //   console.log("RECOMMENDATION EXPLAIN: 7287");
      //   console.log(explain);
      //   geminiReasoning = explain?.reasoning_text || null;
      // } catch (e) {
      //   console.error("GEMINI EXPLAIN FAIL:", e?.message || e);
      //   geminiReasoning = null;
      // }

      session.lastProducts = finalProducts;
      session.lastTopic = isPopularityQuery ? "popularity" : "recommendation";
      session.lastIntent = "recommendation";

      console.log("geminiReasoning:", geminiReasoning);
      console.log("geminiResult.reasoning_text:", geminiResult?.reasoning_text);
      console.log(
        "fallbackReasoning:",
        buildRecommendationReasoning(finalProducts, recNeeds),
      );

      console.log("FINAL RESPONSE:");
      console.log(
        JSON.stringify(
          {
            intro: isPopularityQuery ? "..." : "....",
            reasoning_text:
              // geminiReasoning ||
              geminiResult?.reasoning_text ||
              buildRecommendationReasoning(finalProducts, recNeeds),
            productCount: finalProducts.length,
          },
          null,
          2,
        ),
      );
      const recommendationReasoning =
        geminiReasoning ||
        geminiResult?.reasoning_text ||
        buildRecommendationReasoning(finalProducts, recNeeds);

      const recommendationHeading = isPopularityQuery
        ? "Ini produk yang paling menonjol berdasarkan analisis AI dan data toko yang tersedia:"
        : productQueryScope === "catalog" && recNeeds.wantsCheap
          ? "Dari seluruh produk ready di katalog, ini pilihan yang paling worth it berdasarkan harga dan data produk yang tersedia:"
        : recNeeds.requestedDecade != null
          ? `Ini rekomendasi ${recNeeds.wantsGift ? "hadiah " : ""}${recNeeds.wantsDisplay ? "untuk pajangan " : ""}dari era franchise ${recNeeds.requestedDecade}-an:`
          : recNeeds.wantsDisplay &&
            recNeeds.budgetMin != null &&
            recNeeds.budgetMax != null
          ? `Ini rekomendasi untuk pajangan dengan budget ${formatRupiah(recNeeds.budgetMin)} - ${formatRupiah(recNeeds.budgetMax)}:`
          : recNeeds.wantsDisplay
            ? "Ini rekomendasi yang cocok untuk pajangan:"
            : "Ini rekomendasi terbaik yang aku temukan:";

      return await send(
        {
          type: "products",
          intro: buildReasonFirstRecommendationIntro({
            heading: recommendationHeading,
            reasoning: recommendationReasoning,
          }),
          products: finalProducts,
        },
        "recommendation",
      );
    }

    // semantic gemini untuk rekomendasi
    if (semantic?.intent === "recommendation") {
      const allProducts = await getCleanProducts();

      let candidates = [...allProducts];

      const semanticKeywords = [
        ...(semantic.keywords || []),
        semantic.category_hint || "",
        session?.slots?.category || "",
      ]
        .map((x) =>
          String(x || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);

      if (semanticKeywords.length) {
        candidates = candidates.filter((p) => {
          const text =
            `${p.name} ${p.category || ""} ${stripHtml(p.description || "")}`.toLowerCase();

          return semanticKeywords.some((kw) => text.includes(kw));
        });
      }

      if (semantic.sort_preference === "ready_stock") {
        candidates = candidates.filter((p) => p.stock === "instock");
      }

      if (semantic.sort_preference === "cheapest") {
        candidates.sort(
          (a, b) => (a.numericPrice || 0) - (b.numericPrice || 0),
        );
      }

      if (!candidates.length) {
        candidates = [...allProducts];
      }

      const shortlist = candidates.slice(0, 8);

      const facts = shortlist.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.numericPrice || 0),
        stock: p.stock,
        stockQuantity: p.stockQuantity ?? null,
        category: p.category || "",
        condition: p.condition || "",
        weight: p.weight || "",
        dimensions: p.dimensions || {},
        description: stripHtml(p.description || "").slice(0, 500),
        link: p.link,
      }));

      let explain = null;
      let chosenNames = [];

      try {
        const prompt = `
Kamu adalah asisten rekomendasi produk Robot Jadul.

TUGAS:
Pilih maksimal 3 produk terbaik dari DATA berdasarkan kebutuhan user.
Gunakan HANYA data yang ada.
Jangan mengarang.
- Boleh gunakan simbol sederhana seperti: • ✅ ⚠️ 💰 📦

PERTANYAAN USER:
${rawQuestion}

HASIL PEMAHAMAN USER:
${JSON.stringify(semantic, null, 2)}

DATA PRODUK:
${JSON.stringify(facts, null, 2)}

Kembalikan JSON valid:
{
  "chosen_product_names": ["nama1", "nama2", "nama3"],
  "reasoning_text": "penjelasan kenapa produk ini dipilih berdasarkan kebutuhan user, bukan template umum"
}
`;

        let txt = await geminiText({
          model: GEMINI_MODELS.FAST,
          prompt,
          temperature: 0.2,
          taskName: "semantic_recommend",
        });

        txt = (txt || "").trim();
        txt = txt
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();
        console.log("GEMINI RAW RESPONSE: 7423");
        console.log(txt);

        const parsed = JSON.parse(txt);
        chosenNames = Array.isArray(parsed.chosen_product_names)
          ? parsed.chosen_product_names
          : [];
        explain = parsed.reasoning_text || null;
      } catch (e) {
        console.error("SEMANTIC RECOMMEND ERROR:", e?.message || e);
      }

      let finalProducts = shortlist;

      if (chosenNames.length) {
        const picked = [];
        for (const name of chosenNames) {
          const found = shortlist.find(
            (p) => p.name.toLowerCase() === String(name).toLowerCase(),
          );
          if (found && !picked.some((x) => x.id === found.id))
            picked.push(found);
        }
        if (picked.length) finalProducts = picked;
      }

      finalProducts = finalProducts.slice(0, 3);

      session.lastProducts = finalProducts;
      session.lastTopic = "recommendation";
      session.lastIntent = "recommendation";

      console.log("RECOMMENDATION EXPLAIN:7456");
      console.log(explain);

      const semanticRecommendationReasoning =
        explain ||
        "Aku pilih produk ini karena paling relevan dengan kebutuhan yang kamu sebutkan dan stoknya juga lebih aman.";

      return await send(
        {
          type: "products",
          intro: buildReasonFirstRecommendationIntro({
            heading:
              "Ini rekomendasi yang menurutku paling cocok untuk kebutuhan kamu:",
            reasoning: semanticRecommendationReasoning,
          }),
          products: finalProducts,
        },
        "recommendation",
      );
    }

    // ===============================
    // follow up ketika user nanya step selanjutnya agar tidak masuk kesearch mode
    // ===============================
    const isNext =
      q.includes("lanjut") || q.includes("next") || q.includes("selanjutnya");

    if (isNext && session.lastIntent === "how_to_buy") {
      const steps = await getHowToBuy();
      const nextStep = (session.lastStep || 0) + 1;
      const step = steps?.find((x) => Number(x.step) === Number(nextStep));

      if (step) {
        session.lastStep = nextStep;
        let aiHelp = null;
        try {
          aiHelp = await explainStepWithGemini({ rawQuestion, step });
        } catch {}

        return await send({
          type: "text",
          message: aiHelp || `Step ${nextStep}: ${step.text}`,
        });
      }
    }

    // ===============================
    // PROMO FAST PATH (lebih ringan)
    // ===============================
    if (
      intentResult.intent === "price_promo" &&
      (q.includes("promo") ||
        q.includes("diskon") ||
        q.includes("sale") ||
        q.includes("cashback"))
    ) {
      const promoKeywords = extractPromoSubjectKeywords(q);
      const hasSpecificPromoKeyword = promoKeywords.length > 0;
      const subjectProducts = hasSpecificPromoKeyword
        ? searchProductsForDiscovery(
            promoKeywords.join(" "),
            cleanProducts,
            6,
          )
        : cleanProducts;
      const promoProducts = subjectProducts.filter((product) => product.isPromo);

      if (!promoProducts.length) {
        if (hasSpecificPromoKeyword && subjectProducts.length) {
          const visibleProducts = subjectProducts.slice(0, 5);
          const subjectLabel =
            visibleProducts.length === 1
              ? visibleProducts[0].name
              : promoKeywords.join(" ");
          return await send(
            {
              type: "products",
              intro:
                `Produk **${subjectLabel}** ditemukan di katalog, ` +
                "tetapi saat ini belum sedang promo. Berikut harga dan stok yang tercatat sekarang:",
              products: visibleProducts,
            },
            "price_promo",
          );
        }

        return await send(
          {
            type: "text",
            message: hasSpecificPromoKeyword
              ? "Saat ini aku belum menemukan produk promo untuk kata kunci itu 🙏"
              : "Saat ini belum ada produk yang sedang promo 🙏",
          },
          "price_promo",
        );
      }

      promoProducts.sort((a, b) => {
        if ((b.discountPercent || 0) !== (a.discountPercent || 0)) {
          return (b.discountPercent || 0) - (a.discountPercent || 0);
        }
        return (a.numericPrice || 0) - (b.numericPrice || 0);
      });

      const topPromo = promoProducts.slice(0, 5);

      return await send(
        {
          type: "products",
          intro: getPromoIntro(topPromo),
          products: topPromo,
          reasoning_text: buildPromoReasoning(topPromo),
          _noTruncateReasoning: true,
        },
        "price_promo",
      );
    }

    // =============================
    // Price recommendation
    // ============================
    const handledPriceRecommendation = await handlePriceRecommendationMode({
      rawQuestion,
      cleanProducts,
      send,
    });

    if (handledPriceRecommendation) return;

    // =====================
    // single matchnya
    // =====================

    if (intentResult.intent === "price_promo" && !hasPriceIntent) {
      const productMatch = resolveRequestedProduct(rawQuestion, cleanProducts);
      const bestProduct = productMatch.product;

      if (bestProduct) {
        session.lastProducts = [bestProduct];
        session.lastTopic = "price";
        session.lastIntent = "price_promo";

        return await send(
          {
            type: "products",
            products: [bestProduct],
            product_match: {
              status: productMatch.status,
              confidence: productMatch.confidence,
              reason: productMatch.reason,
            },
          },
          "price_promo",
        );
      }

      if (productMatch.status === "ambiguous") {
        return await send(
          beginProductClarification(productMatch, "price_promo"),
          "price_promo",
        );
      }

      if (hasSpecificProductSearchTerms(rawQuestion)) {
        return await send(
          {
            type: "text",
            message:
              "Maaf, robot atau produk yang kamu tanyakan belum ada di katalog Robot Jadul saat ini. Coba periksa kembali nama atau kode produknya.",
          },
          "price_promo",
        );
      }
    }

    if (intentResult.intent === "stock_availability") {
      const hasProductContext =
        usesPreviousProductContext ||
        Boolean(pageContext?.productId || pageContext?.productName);
      if (
        !hasSpecificProductSearchTerms(rawQuestion) &&
        !hasProductContext
      ) {
        setLastBotQuestion(session, "ask_product_name", { source: "stock" });
        return await send(
          {
            type: "text",
            message: "Mau cek stok produk apa? Sebutkan nama produknya ya.",
          },
          "stock_availability",
        );
      }

      const productMatch = resolveRequestedProduct(rawQuestion, cleanProducts);
      const bestProduct = productMatch.product;

      if (bestProduct) {
        session.lastProducts = [bestProduct];
        session.lastTopic = "stock";
        session.lastIntent = "stock_availability";

        const asksAdditionalProductDetails =
          /\b(?:kondisi(?:nya)?|kelengkapan(?:nya)?|lengkap|part|aksesori|aksesoris|senjata|isi\s+box|detail|spesifikasi)\b/i.test(
            q,
          );

        return await send(
          {
            type: "products",
            products: [bestProduct],
            product_match: {
              status: productMatch.status,
              confidence: productMatch.confidence,
              reason: productMatch.reason,
            },
            ...(asksAdditionalProductDetails
              ? {
                  reasoning_text: buildProductDetailMessage(bestProduct),
                  _noTruncateReasoning: true,
                }
              : {}),
          },
          "stock_availability",
        );
      }

      if (productMatch.status === "ambiguous") {
        return await send(
          beginProductClarification(productMatch, "stock_availability"),
          "stock_availability",
        );
      }

      if (hasSpecificProductSearchTerms(rawQuestion)) {
        return await send(
          {
            type: "text",
            message:
              "Maaf, robot atau produk yang kamu cari belum ada di katalog Robot Jadul saat ini, jadi stoknya belum bisa aku cek. Coba periksa kembali nama atau kode produknya.",
          },
          "stock_availability",
        );
      }
    }

    if (intentResult.intent === "product_detail") {
      const hasProductContext =
        usesPreviousProductContext ||
        Boolean(pageContext?.productId || pageContext?.productName);
      if (
        !hasSpecificProductSearchTerms(rawQuestion) &&
        !hasProductContext
      ) {
        setLastBotQuestion(session, "ask_product_name", { source: "detail" });
        return await send(
          {
            type: "text",
            message:
              "Mau cek detail produk apa? Sebutkan nama atau kode produknya ya.",
          },
          "product_detail",
        );
      }

      const asksManufacturingOrigin =
        looksLikeProductManufacturingOriginQuestion(rawQuestion);
      const productMatch = resolveRequestedProduct(
        effectiveQuestion,
        cleanProducts,
      );
      const bestProduct = productMatch.product;

      if (bestProduct) {
        if (
          asksManufacturingOrigin &&
          !hasProductManufacturingOriginInfo(bestProduct)
        ) {
          return await send(
            buildUnknownAnswerResponse({
              intent: "product_detail",
              message: `Maaf, informasi asal produksi atau status impor **${bestProduct.name}** belum tercantum di katalog. Supaya tidak memberi informasi yang keliru, silakan konfirmasi langsung ke Admin Robot Jadul.`,
              topic: `asal produksi atau status impor ${bestProduct.name}`,
            }),
            "product_detail",
          );
        }

        session.lastProducts = [bestProduct];
        session.lastTopic = "product_detail";
        session.lastIntent = "product_detail";

        const asksTradeoffs =
          /\b(?:kekurangan|kelebihan|pertimbangan|perlu\s+diperhatikan)\b/i.test(
            rawQuestion,
          );
        let reasoning_text = asksTradeoffs
          ? buildProductConsiderationsMessage(bestProduct)
          : buildProductDetailMessage(bestProduct);

        if (!asksTradeoffs && isOpinionQuestion(rawQuestion)) {
          const opinionText = buildProductOpinionReasoning(
            bestProduct,
            rawQuestion,
          );

          if (opinionText) {
            reasoning_text += `\n\n💡 **Pendapat / Pertimbangan:**\n${opinionText}`;
          }
        }

        return await send(
          {
            type: "products",
            products: [bestProduct],
            product_match: {
              status: productMatch.status,
              confidence: productMatch.confidence,
              reason: productMatch.reason,
            },
            reasoning_text,
            _noTruncateReasoning: true,
          },
          "product_detail",
        );
      }

      if (productMatch.status === "ambiguous") {
        return await send(
          beginProductClarification(productMatch, "product_detail"),
          "product_detail",
        );
      }

      if (
        asksManufacturingOrigin &&
        !hasSpecificProductSearchTerms(rawQuestion)
      ) {
        return await send(
          buildUnknownAnswerResponse({
            intent: "product_detail",
            message:
              "Maaf, aku belum punya informasi yang cukup untuk memastikan apakah produk Robot Jadul diproduksi sendiri atau diimpor. Supaya tidak memberi informasi yang keliru, silakan konfirmasi langsung ke Admin Robot Jadul.",
            topic: "asal produksi atau status impor produk Robot Jadul",
          }),
          "product_detail",
        );
      }

      return await send(
        buildCatalogNoMatchResponse({ intent: "product_detail" }),
        "product_detail",
      );
    }

    // ===============================
    // PRODUCT DISCOVERY HANDLER
    // ===============================
    if (
      intentResult.intent === "product_discovery" &&
      !isSpecQuestion(q) &&
      !hasPriceIntent &&
      !isCompareIntent
    ) {
      function cleanQueryForSearch(q = "") {
        return stripRobotJadulStoreName(q)
          .replace(
            /\b(?:rekomendasi|carikan|dong|yang|produk(?:nya)?|barang(?:nya)?|robot(?:nya)?|item(?:nya)?|mainan(?:nya)?|figur(?:e|in)?(?:nya)?)\b/gi,
            " ",
          )
          .replace(/\b(?:jutaan|ribu|murah|mahal|budget)\b/gi, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      const cleanedQuery = cleanQueryForSearch(effectiveQuestion);

      let discoveryMatches = searchProductsForDiscovery(
        cleanedQuery,
        cleanProducts,
      );

      if (!discoveryMatches.length && effectiveQuestion !== rawQuestion) {
        discoveryMatches = searchProductsForDiscovery(
          rawQuestion,
          cleanProducts,
        );
      }

      const discoveryConfidence = assessProductSearchConfidence(
        rawQuestion,
        cleanProducts,
      );
      if (discoveryConfidence.reason === "partial_query_match") {
        discoveryMatches = [];
      }

      if (!discoveryMatches.length) {
        const semanticRequestedTerm = stripRobotJadulStoreName(
          intentResult.semantic?.product_name || "",
        ).trim();
        const requestedTerm = hasSpecificProductSearchTerms(
          semanticRequestedTerm,
        )
          ? semanticRequestedTerm
          : linguisticAnalysis.syntax?.object ||
            extractRequestedCatalogTerm(rawQuestion);
        const asksAvailability =
          looksLikeCatalogAvailabilityQuestion(rawQuestion);
        return await send(
          {
            type: "text",
            message: requestedTerm
              ? asksAvailability
                ? `Belum, saat ini **${requestedTerm}** tidak tersedia di katalog Robot Jadul. Toko kami berfokus pada robot, mecha, figure, model kit, dan barang koleksi terkait.`
                : `Untuk **${requestedTerm}**, saat ini aku belum menemukannya di katalog Robot Jadul. Toko kami memang berfokus pada robot, mecha, figure, model kit, dan barang koleksi terkait.`
              : "Maaf, produk yang kamu cari belum ada di katalog Robot Jadul saat ini. Coba periksa kembali nama atau kode produknya, atau cari seri lain yang tersedia.",
          },
          "product_discovery",
        );
      }

      const top = discoveryMatches[0];
      const topName = top?.name || "produk";

      let intro = "Aku nemu beberapa produk yang relevan buat kamu:";
      const rawLower = rawQuestion.toLowerCase();

      if (rawLower.includes("goldrake")) {
        intro =
          "Kalau kamu lagi cari **Goldrake**, ini beberapa pilihan yang paling relevan:";
      } else if (rawLower.includes("voltes")) {
        intro =
          "Kalau kamu lagi cari produk seperti **Voltes V**, ini beberapa pilihan yang aku temukan:";
      } else if (rawLower.includes("getter")) {
        intro =
          "Kalau kamu lagi cari **Getter Robo**, ini beberapa pilihan yang ada:";
      } else if (rawLower.includes("chogokin")) {
        intro =
          "Untuk kategori **Chogokin**, ini beberapa produk yang relevan:";
      }

      session.lastProducts = discoveryMatches;
      session.lastTopic = "product_discovery";
      session.lastIntent = "product_discovery";

      return await send(
        {
          type: "products",
          intro,
          products: discoveryMatches.slice(0, 5),
          closing:
            "Kalau mau, aku juga bisa bantu sempitkan lagi berdasarkan harga, stok ready, atau seri tertentu 😊",
        },
        "product_discovery",
      );
    }

    if (isCheapest) {
      let candidates = cleanProducts.filter((p) => p.numericPrice > 0);

      if (!candidates.length) {
        return await send({
          type: "text",
          message: "Aku belum menemukan produk dengan data harga 🙏",
        });
      }

      // urutkan dari harga termurah
      candidates.sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0));

      const cheapest = candidates.slice(0, 5);

      return await send(
        {
          type: "products",
          intro: "💸 Ini produk dengan harga paling terjangkau:",
          products: cheapest,
          reasoning_text:
            "Aku urutkan berdasarkan harga paling rendah agar kamu bisa langsung lihat opsi paling hemat.",
          _noTruncateReasoning: true,
        },
        "price_promo", // atau bisa bikin intent baru
      );
    }

    // ===============================
    // 🔎 SMART SEARCH MODE (WORD BASED)
    // ===============================
    if (!hasPriceIntent) {
      // kata umum yang tidak penting
      const stopWords = [
        "adakah",
        "produk",
        "yang",
        "yg",
        "judul",
        "nama",
        "namanya",
        "ada",
        "kata",
        "cari",
        "berawalan",
        "mengandung",
        "diakhiri",
      ];

      // pecah jadi kata penting
      const words = q
        .replace(/nya/g, "")
        .split(" ")
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !stopWords.includes(w));

      if (words.length === 0) {
        return await send({
          type: "text",
          message: "Silakan sebutkan kata kunci produk yang ingin dicari 😊",
        });
      }

      const scored = cleanProducts.map((p) => {
        let score = 0;
        const productWords = p.name.toLowerCase().split(" ");
        const categoryWords = (p.category || "").split(" ");

        words.forEach((word) => {
          // 🔎 NAME MATCH
          productWords.forEach((pWord) => {
            if (isFuzzyMatch(word, pWord)) score += 3;
          });

          // 🔎 CATEGORY MATCH
          categoryWords.forEach((cWord) => {
            if (isFuzzyMatch(word, cWord)) score += 2;
          });
        });

        return { ...p, score };
      });

      const matched = scored
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score);

      // ===============================
      // 🎯 MODE REKOMENDASI (TAMBAHAN)
      // ===============================
      function isRecommendationQuestion(q) {
        const s = q.toLowerCase();
        return (
          s.includes("rekomendasi") ||
          s.includes("paling bagus") ||
          s.includes("paling rekomen") ||
          s.includes("paling recommen") ||
          s.includes("dicari") ||
          s.includes("recommended") ||
          s.includes("terbaik") ||
          s.includes("bagus yang mana") ||
          s.includes("pilih yang mana")
        );
      }

      const recTopic = extractRecommendationTopic(rawQuestion);

      if (
        isRecommendationQuestion(q) &&
        matched.length > 0 &&
        intentResult.intent !== "recommendation"
      ) {
        if (recTopic) {
          session.lastTopic = recTopic;
          updateSlot(session, "category", recTopic);
        }

        const candidates = matched.slice(0, 5);

        const best = candidates.slice().sort((a, b) => {
          const aStock = a.stock === "instock" ? 1 : 0;
          const bStock = b.stock === "instock" ? 1 : 0;
          if (aStock !== bStock) return bStock - aStock;
          return (b.numericPrice || 0) - (a.numericPrice || 0);
        })[0];

        const facts = candidates.map((p) => {
          const rawDesc = stripHtml(p.description || "");
          const fullDesc = rawDesc
            ? rawDesc.slice(0, 4000)
            : "(tidak tercantum)";

          return {
            name: p.name,
            price: Number(p.numericPrice || 0),
            stock: p.stock,
            stockQuantity: p.stockQuantity ?? null,
            condition: p.condition || "(tidak tercantum)",
            weight: p.weight || "(tidak tercantum)",
            dimensions: p.dimensions || {},
            description: fullDesc,
            link: p.link,
          };
        });

        let explain = null;

        if (
          GEMINI_MODE.enableRecommendationExplain &&
          shouldExplainWithGemini(rawQuestion)
        ) {
          const prompt = `
Kamu CS Robot Jadul.
Pilih 1 produk terbaik dari DATA dan jelaskan alasannya.
Gunakan hanya data yang ada. Jangan mengarang.

Format:
1) Produk terbaik
2) Alasan utama (bullet)
- Boleh gunakan simbol sederhana seperti: • ✅ ⚠️ 💰 📦
3) 2 alternatif + alasan singkat

DATA:
${JSON.stringify(facts, null, 2)}
`;

          if (genai) {
            try {
              explain = await withTimeout(
                geminiText({
                  model: GEMINI_MODELS.FAST,
                  prompt,
                  temperature: 0.3,
                  taskName: "recommend_explain",
                }),
                2500,
              );

              explain = explain || null;
            } catch (e) {
              console.error("RECOMMEND EXPLAIN ERROR:", e?.message || e);
            }
          }
        }

        const recommendedProducts = [
          best,
          ...candidates.filter((p) => p.id !== best.id).slice(0, 2),
        ];

        session.lastProducts = recommendedProducts;
        session.lastTopic = recTopic || "recommendation";
        session.lastIntent = "recommendation";

        const searchRecommendationReasoning =
          explain || explainBestRuleBased(best, candidates, rawQuestion);

        return await send({
          type: "products",
          intro: buildReasonFirstRecommendationIntro({
            heading: recTopic
              ? `Untuk kategori **${recTopic}**, ini rekomendasi yang paling cocok menurutku:`
              : `Ini rekomendasi yang menurutku paling cocok buat kamu:`,
            reasoning: searchRecommendationReasoning,
          }),
          products: recommendedProducts,
        });
      }

      if (isRecommendationQuestion(q) && !q.match(/\d/)) {
        session.lastTopic = recTopic || session.lastTopic;
        updateSlot(session, "category", recTopic || null);

        setLastBotQuestion(session, "ask_budget", {
          source: "recommendation",
          recTopic: recTopic || null,
        });

        return await send({
          type: "options",
          intro:
            "Kamu mau cari robot dengan kisaran budget berapa? Pilih salah satu atau ketik nominalmu sendiri:",
          options: buildBudgetOptions(),
        });
      }

      if (matched.length === 0) {
        return await send({
          type: "text",
          message: "Saya tidak menemukan produk dengan kata tersebut 🙏",
        });
      }

      // Jika user nanya spesifikasi (berat/ukuran/kondisi), jawab detail produk teratas
      if (isSpecQuestion(q)) {
        const top = matched[0]; // produk paling relevan

        const specText = formatSpec(top);

        if (!specText) {
          return await send({
            type: "text",
            message: `Saya sudah menemukan produknya: **${top.name}**.\nNamun info berat/dimensi/kondisi belum tercantum di data produk 🙏`,
          });
        }

        return await send({
          type: "products",
          intro: `Detail **${top.name}**:\n${specText}`,
          products: [top],
          _noTruncateReasoning: true,
        });
      }

      return await send({
        type: "products",
        intro: `Saya menemukan ${matched.length} produk yang relevan dengan pencarian Anda:`,
        products: matched.slice(0, 5),
        _noTruncateReasoning: true,
      });
    }
    // ===============================
    // 🔥 FILTER HARGA
    // ===============================

    // filter yang toleransi terhadap format harga alami seperti "10k", "2 juta", "500 ribu"
    function parsePrice(text) {
      if (!text) return null;
      const s = text
        .toLowerCase()
        .replace(/rp|\./g, "") // buang "rp" dan pemisah ribuan titik
        .replace(/,/g, "."); // koma jadi desimal (2,5jt)

      // cari semua pasangan: angka + opsional spasi + satuan
      // contoh match: "1.5 juta", "500 ribu", "10k", "2jt"
      const re = /(\d+(?:\.\d+)?)\s*(juta|jt|ribu|rb|k)\b/g;

      let total = 0;
      let matched = false;

      for (const m of s.matchAll(re)) {
        matched = true;
        const val = parseFloat(m[1]);
        const unit = m[2];

        if (Number.isNaN(val)) continue;

        if (unit === "juta" || unit === "jt") total += val * 1_000_000;
        else if (unit === "ribu" || unit === "rb" || unit === "k")
          total += val * 1_000;
      }

      // fallback: kalau tidak ada satuan, ambil angka panjang (mis. 150000)
      if (!matched) {
        const digits = s.match(/\d{4,}/); // minimal 4 digit biar bukan "2024"?? (sesuaikan)
        if (!digits) return null;
        return parseInt(digits[0], 10);
      }

      return Math.round(total);
    }

    function parsePriceRange(text) {
      // support "antara X sampai Y", "X - Y", "X s/d Y"
      const s = text.toLowerCase();

      let m = s.match(/antara\s+(.+?)\s+sampai\s+(.+)/);
      if (!m) m = s.match(/(.+?)\s*(?:-|s\/d|sd|sampai)\s*(.+)/);

      if (!m) return null;

      const min = parsePrice(m[1]);
      const max = parsePrice(m[2]);
      if (!min || !max) return null;

      return { min: Math.min(min, max), max: Math.max(min, max) };
    }

    const onlyReadyStock = ["ready", "stok", "tersedia"].some((k) =>
      q.split(" ").some((w) => isFuzzyMatch(w, k)),
    );
    q.includes("ready stock") ||
      q.includes("tersedia") ||
      q.includes("stok ada");

    // ===============================
    // 🔥 FILTER BASED ON INTENT
    // ===============================
    // 🔥 SMART PRODUCT KEYWORD FILTER
    // ===============================

    // kata umum yang tidak dianggap sebagai nama produk
    const stopWords = [
      "robot",
      "produk",
      "mainan",
      "yang",
      "paling",
      "termurah",
      "termahal",
      "mahal",
      "murah",
      "harga",
      "di",
      "atas",
      "bawah",
      "antara",
      "sampai",
      "dibawah",
      "diatas",
      "kurang",
      "dari",
      "maksimal",
      "max",
      "juta",
      "jt",
      "ribu",
      "rb",
      "apa",
      "saja",
      "ready",
      "stock",
      "tersedia",
    ];

    // ambil kata penting saja
    const keywords = q
      .split(" ")
      .map((w) => w.trim())
      .filter((word) => word.length > 2 && !stopWords.includes(word));

    // cek apakah ada keyword yg benar-benar match nama produk
    let keywordFiltered = [];

    if (!(hasPriceIntent && !hasScopedKeyword)) {
      keywordFiltered = cleanProducts.filter((p) => {
        const nameWords = p.name.toLowerCase().split(" ");
        const categoryWords = (p.category || "").split(" ");

        return keywords.some(
          (word) =>
            nameWords.some((nw) => isFuzzyMatch(word, nw)) ||
            categoryWords.some((cw) => isFuzzyMatch(word, cw)),
        );
      });
    }
    // ===============================
    // 🎯 LOGIC PENENTUAN SCOPE
    // ===============================

    // Jika user cari mahal/murah
    // tapi tidak ada keyword spesifik → GLOBAL
    let filteredProducts =
      keywordFiltered.length > 0 ? keywordFiltered : [...cleanProducts];

    // 🔹 Filter ready stock
    if (onlyReadyStock) {
      filteredProducts = filteredProducts.filter((p) => p.stock === "instock");
    }

    // 🔹 Filter harga range
    const priceRange = parsePriceRange(q);
    if (priceRange) {
      filteredProducts = filteredProducts.filter(
        (p) =>
          p.numericPrice >= priceRange.min && p.numericPrice <= priceRange.max,
      );
    }

    if (budgetInfo.min != null) {
      filteredProducts = filteredProducts.filter(
        (p) => p.numericPrice >= budgetInfo.min,
      );
    }

    if (budgetInfo.max != null) {
      filteredProducts = filteredProducts.filter(
        (p) => p.numericPrice <= budgetInfo.max,
      );
    }

    // 🔹 Filter di atas
    const extractedSinglePrice = parsePrice(q);

    if (isAbove && extractedSinglePrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.numericPrice > extractedSinglePrice,
      );
    }

    // 🔹 Filter di bawah
    if (isBelow && extractedSinglePrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.numericPrice < extractedSinglePrice,
      );
    }

    if ((isCheapest || isMostExpensive) && !includeOOS) {
      filteredProducts = filteredProducts.filter((p) => p.stock === "instock");
    }

    // ===============================
    // 🔥 SMART MATCH DEFAULT
    // ===============================

    let matched = filteredProducts;
    console.log(
      "MATCHED PRODUCTS:",
      matched.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.numericPrice,
      })),
    );

    if (matched.length === 0) {
      return await send(
        buildCatalogNoMatchResponse({ intent: intentResult.intent }),
        intentResult.intent,
      );
    }

    // 🔥 SORTING
    function priceForSort(p) {
      return Number.isFinite(p.effectivePrice)
        ? p.effectivePrice
        : Number.POSITIVE_INFINITY;
    }

    if (isMostExpensive) {
      matched = matched.sort((a, b) => priceForSort(b) - priceForSort(a));
    } else if (isCheapest) {
      matched = matched.sort((a, b) => priceForSort(a) - priceForSort(b));
    } else {
      matched = matched.sort((a, b) => priceForSort(b) - priceForSort(a));
    }

    const bestMatches = matched.slice(0, 3);

    let finalIntro = randomItem(intros);

    if (intentResult?.intent === "price_promo") {
      if (isCheapest && hasScopedKeyword) {
        finalIntro = `Berikut produk ${meaningfulKeywords.join(" ")} dengan harga paling murah yang saya temukan:`;
      } else if (isCheapest) {
        finalIntro =
          "Berikut produk dengan harga paling murah yang saya temukan:";
      } else if (isMostExpensive && hasScopedKeyword) {
        finalIntro = `Berikut produk ${meaningfulKeywords.join(" ")} dengan harga tertinggi yang saya temukan:`;
      } else if (isMostExpensive) {
        finalIntro = "Berikut produk dengan harga tertinggi:";
      } else {
        finalIntro = "Berikut produk sesuai rentang harga yang kamu cari:";
      }
    }

    session.lastProducts = bestMatches;
    session.lastTopic = "product_list";

    // kalau ada produk → tampilkan produk
    if (bestMatches.length > 0) {
      return await send(
        {
          type: "products",
          intro: finalIntro,
          products: bestMatches,
          closing: randomItem(closings),
        },
        intentResult.intent,
      );
    }

    // kalau benar-benar tidak ada hasil produk
    console.log("CATALOG NO MATCH FALLBACK HIT");

    return await send(
      buildCatalogNoMatchResponse({ intent: intentResult.intent }),
      intentResult.intent,
    );
  } catch (err) {
    console.error("FATAL ERROR:", err?.stack || err);
    await logChatMetricToSupabase({
      sessionId,
      status: "error",
      intent: session?.lastIntent || "general",
      intentMethod: session?.lastIntentMethod || "unknown",
      intentScore: session?.lastIntentScore,
      responseType: "error",
      assistantProvider: "none",
      assistantReason: "unhandled_error",
      routerProvider: "unknown",
      latencyMs: Date.now() - requestStartedAt,
      errorCode: err?.code || err?.name || "unhandled_error",
    });
    return res.status(500).json({
      type: "text",
      message: "Server error",
    });
  }
}
