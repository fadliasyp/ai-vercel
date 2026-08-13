import test from "node:test";
import assert from "node:assert/strict";

import { shouldInterruptPendingFlow } from "../lib/chatbot/pendingContext.js";

const shippingPending = {
  type: "shipping_quote",
  stage: "need_city",
};

test("interrupts a pending shipping flow for an explicit new topic", () => {
  assert.equal(
    shouldInterruptPendingFlow({
      pending: shippingPending,
      explicitIntent: "price_promo",
      detectedIntent: "price_promo",
      detectedScore: 1,
      question: "kalau promo ada engga sih",
    }),
    true,
  );
});

test("keeps short pending answers in their current flow", () => {
  for (const question of ["Tangerang", "Kabupaten Tangerang, Rajeg", "JNE"]) {
    assert.equal(
      shouldInterruptPendingFlow({
        pending: shippingPending,
        detectedIntent: "general",
        detectedScore: 0.95,
        question,
      }),
      false,
    );
  }
});

test("allows a shipping customer to switch from ongkir to insurance", () => {
  assert.equal(
    shouldInterruptPendingFlow({
      pending: shippingPending,
      explicitIntent: "shipping_transaction",
      explicitMethod: "explicit_shipping_insurance_rule",
      question: "bisa pakai asuransi?",
    }),
    true,
  );
});

test("allows every transaction subtopic to leave a pending ongkir flow", () => {
  const methods = [
    "explicit_cod_rule",
    "explicit_payment_methods_rule",
    "explicit_shipping_insurance_rule",
    "explicit_shipping_packing_rule",
    "explicit_shipping_estimate_rule",
    "explicit_shipping_coverage_rule",
    "explicit_how_to_buy_rule",
  ];

  for (const explicitMethod of methods) {
    assert.equal(
      shouldInterruptPendingFlow({
        pending: shippingPending,
        explicitIntent: "shipping_transaction",
        explicitMethod,
        question: "Saya mau bahas hal lain",
      }),
      true,
      explicitMethod,
    );
  }

  assert.equal(
    shouldInterruptPendingFlow({
      pending: shippingPending,
      explicitIntent: "shipping_transaction",
      explicitMethod: "explicit_shipping_quote_rule",
      question: "Ongkir ke Surabaya berapa?",
    }),
    false,
  );
});

test("interrupts other protected flows only for a clear different intent", () => {
  assert.equal(
    shouldInterruptPendingFlow({
      pending: { type: "shipment_tracking", stage: "need_tracking_number" },
      explicitIntent: "stock_availability",
      question: "robot Mazinger masih ready?",
    }),
    true,
  );
  assert.equal(
    shouldInterruptPendingFlow({
      pending: { type: "transaction_status", stage: "need_verification" },
      detectedIntent: "general",
      detectedScore: 0.99,
      question: "pelanggan@example.com",
    }),
    false,
  );
});

test("lets a clear out-of-scope question leave a pending flow", () => {
  assert.equal(
    shouldInterruptPendingFlow({
      pending: shippingPending,
      localScope: "out_of_scope",
      question: "satu tambah satu berapa?",
    }),
    true,
  );
});
