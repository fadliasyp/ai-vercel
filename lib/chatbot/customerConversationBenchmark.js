import { detectCustomerState } from "./customerState.js";
import {
  analyzeCompoundQuestion,
  buildAnswerPlan,
  compactAnswerPlan,
  compactCompoundQuestionAnalysis,
} from "./compoundQuestion.js";
import { detectExplicitIntentOverride } from "./intentFusion.js";
import { analyzeIndonesianQuestion } from "./linguisticAnalysis.js";
import { assessLocalCommerceScope, buildOutOfScopeMessage } from "./scopeGuard.js";
import {
  extractShippingDestination,
  splitCityDistrict,
} from "./shippingLocation.js";
import {
  buildStoreHoursMessage,
  buildStoreVisitMessage,
  looksLikeStoreHoursQuestion,
  looksLikeStoreLocationQuestion,
} from "./storeInfo.js";
import {
  buildReturnPolicyMessage,
  looksLikeReturnPolicyQuestion,
} from "./storePolicy.js";
import {
  buildTransactionPolicyMessage,
  isCODQuestion,
  looksLikeInsuranceQuestion,
  looksLikePackingProtectionQuestion,
  looksLikePaymentMethodQuestion,
  looksLikeRecommendationRequest,
  looksLikeSameDayDispatchQuestion,
  looksLikeShippingCoverageQuestion,
  looksLikeTransactionPolicyQuestion,
} from "./transactionIntent.js";
import {
  buildOrderVerificationPrompt,
  extractOrderId,
  extractOrderVerification,
  looksLikeTransactionStatusQuestion,
  redactOrderVerification,
} from "./transactionStatus.js";

function buildPolicyText(question, observation) {
  if (observation.scope === "out_of_scope") {
    return buildOutOfScopeMessage(question);
  }
  if (observation.signals.return_policy) {
    return buildReturnPolicyMessage(question);
  }
  if (observation.signals.transaction_status) {
    return buildOrderVerificationPrompt(observation.entities.order_id);
  }
  if (observation.signals.store_location) return buildStoreVisitMessage();
  if (observation.signals.store_hours) return buildStoreHoursMessage();
  if (observation.signals.transaction_policy) {
    return buildTransactionPolicyMessage(question);
  }
  return "";
}

export function inspectCustomerConversationTurn(question = "", context = {}) {
  const text = String(question || "").trim();
  const analysis = analyzeIndonesianQuestion(text);
  const explicitIntent = detectExplicitIntentOverride(text)?.intent || "";
  const shippingDestination = extractShippingDestination(text);
  const shippingFollowUp = context.pendingType === "shipping_quote";
  const followUpLocation = shippingFollowUp ? splitCityDistrict(text) : null;
  const orderVerification = extractOrderVerification(text);
  const compoundAnalysis = analyzeCompoundQuestion(text);
  const answerPlan = buildAnswerPlan(compoundAnalysis);

  const observation = {
    scope: assessLocalCommerceScope(text, {
      lastIntent: context.lastIntent || "",
      hasPending: Boolean(context.pendingType),
      hasRecentProducts: Boolean(context.hasRecentProducts),
    }),
    explicit_intent: explicitIntent,
    customer_state: detectCustomerState(text),
    compound: compactCompoundQuestionAnalysis(compoundAnalysis),
    answer_plan: {
      ...compactAnswerPlan(answerPlan),
      section_keys: answerPlan.sections.map((section) => section.key),
    },
    entities: {
      ...analysis.entities,
      shipping_destination: shippingDestination,
      followup_city: followUpLocation?.cityText || "",
      followup_district: followUpLocation?.districtText || "",
      order_id: extractOrderId(text),
    },
    signals: {
      return_policy: looksLikeReturnPolicyQuestion(text),
      transaction_status: looksLikeTransactionStatusQuestion(text),
      order_verification: Boolean(orderVerification),
      store_hours: looksLikeStoreHoursQuestion(text),
      store_location: looksLikeStoreLocationQuestion(text),
      recommendation: looksLikeRecommendationRequest(text),
      cod: isCODQuestion(text),
      payment_methods: looksLikePaymentMethodQuestion(text),
      insurance: looksLikeInsuranceQuestion(text),
      packing_protection: looksLikePackingProtectionQuestion(text),
      same_day_dispatch: looksLikeSameDayDispatchQuestion(text),
      shipping_coverage: looksLikeShippingCoverageQuestion(text),
      shipping_quote: Boolean(shippingDestination),
      shipping_quote_followup: shippingFollowUp,
      transaction_policy: looksLikeTransactionPolicyQuestion(text),
    },
  };

  return {
    ...observation,
    policy_text: buildPolicyText(text, observation),
  };
}

function compareSubset(expected, actual, path = "") {
  const failures = [];
  let assertions = 0;

  for (const [key, expectedValue] of Object.entries(expected || {})) {
    const nextPath = path ? `${path}.${key}` : key;
    const actualValue = actual?.[key];

    if (Array.isArray(expectedValue)) {
      assertions += expectedValue.length;
      for (const item of expectedValue) {
        if (!Array.isArray(actualValue) || !actualValue.includes(item)) {
          failures.push(`${nextPath} tidak memuat ${JSON.stringify(item)}`);
        }
      }
      continue;
    }

    if (expectedValue && typeof expectedValue === "object") {
      const nested = compareSubset(expectedValue, actualValue, nextPath);
      assertions += nested.assertions;
      failures.push(...nested.failures);
      continue;
    }

    assertions += 1;
    if (actualValue !== expectedValue) {
      failures.push(
        `${nextPath}: diharapkan ${JSON.stringify(expectedValue)}, diterima ${JSON.stringify(actualValue)}`,
      );
    }
  }

  return { assertions, failures };
}

export function validateCustomerConversationDataset(dataset) {
  if (!dataset || !Array.isArray(dataset.conversations)) {
    throw new Error("Dataset harus memiliki array conversations");
  }

  const ids = new Set();
  let turns = 0;
  for (const conversation of dataset.conversations) {
    if (!conversation.id || ids.has(conversation.id)) {
      throw new Error(`ID percakapan kosong atau duplikat: ${conversation.id || "-"}`);
    }
    ids.add(conversation.id);
    if (!Array.isArray(conversation.turns) || !conversation.turns.length) {
      throw new Error(`Percakapan ${conversation.id} tidak memiliki turn`);
    }
    for (const turn of conversation.turns) {
      if (!String(turn.question || "").trim() || !turn.expect) {
        throw new Error(`Turn tidak lengkap pada percakapan ${conversation.id}`);
      }
      turns += 1;
    }
  }

  return { conversations: ids.size, turns };
}

export function evaluateCustomerConversationDataset(dataset) {
  validateCustomerConversationDataset(dataset);
  const results = [];

  for (const conversation of dataset.conversations) {
    let context = {};
    conversation.turns.forEach((turn, index) => {
      const observation = inspectCustomerConversationTurn(turn.question, context);
      const expected = { ...turn.expect };
      const policyIncludes = expected.policy_includes || [];
      delete expected.policy_includes;
      const compared = compareSubset(expected, observation);

      for (const fragment of policyIncludes) {
        compared.assertions += 1;
        if (!observation.policy_text.toLowerCase().includes(String(fragment).toLowerCase())) {
          compared.failures.push(`policy_text tidak memuat ${JSON.stringify(fragment)}`);
        }
      }

      results.push({
        id: `${conversation.id}:${index + 1}`,
        scenario: conversation.scenario,
        question: redactOrderVerification(turn.question),
        passed: compared.failures.length === 0,
        assertions: compared.assertions,
        failures: compared.failures,
        observation,
      });
      context = { ...context, ...(turn.context_after || {}) };
    });
  }

  const assertions = results.reduce((sum, result) => sum + result.assertions, 0);
  const passed = results.filter((result) => result.passed).length;
  return {
    summary: {
      conversations: dataset.conversations.length,
      turns: results.length,
      assertions,
      passed,
      failed: results.length - passed,
      accuracy: results.length ? passed / results.length : 0,
    },
    results,
  };
}
