import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCustomerStateAcknowledgement,
  CUSTOMER_STATES,
  detectCustomerState,
} from "../lib/chatbot/customerState.js";

test("detects distressed, urgent, worried, confused, and neutral customers", () => {
  assert.equal(
    detectCustomerState("Barangnya baru sampai tapi catnya terkelupas, saya kecewa"),
    CUSTOMER_STATES.DISTRESSED,
  );
  assert.equal(
    detectCustomerState("Stoknya masih ada? Saya takut kehabisan hari ini"),
    CUSTOMER_STATES.URGENT,
  );
  assert.equal(
    detectCustomerState("Saya ragu, pembayaran ini aman gak?"),
    CUSTOMER_STATES.WORRIED,
  );
  assert.equal(
    detectCustomerState("Saya bingung pilih yang mana untuk hadiah"),
    CUSTOMER_STATES.CONFUSED,
  );
  assert.equal(
    detectCustomerState("Harga Mazinger Z berapa?"),
    CUSTOMER_STATES.NEUTRAL,
  );
  assert.equal(
    detectCustomerState("Hari ini toko buka sampai jam berapa?"),
    CUSTOMER_STATES.NEUTRAL,
  );
  assert.equal(
    detectCustomerState("Kalau bayar sekarang bisa dikirim hari ini?"),
    CUSTOMER_STATES.URGENT,
  );
});

test("adds deterministic empathy without changing response facts", () => {
  const payload = {
    type: "products",
    intro: "Ini tiga produk yang sesuai budget Rp 3.000.000:",
    products: [{ id: 1, name: "Godmars" }],
  };
  const result = applyCustomerStateAcknowledgement(payload, {
    state: CUSTOMER_STATES.CONFUSED,
    intent: "recommendation",
  });

  assert.match(result.intro, /masih bingung memilih/i);
  assert.match(result.intro, /Rp 3\.000\.000/);
  assert.deepEqual(result.products, payload.products);
});

test("keeps existing return apology and neutral responses unchanged", () => {
  const returnPayload = {
    type: "text",
    message: "Maaf atas kendalanya. Retur bisa diajukan maksimal 2 x 24 jam.",
  };
  const neutralPayload = {
    type: "text",
    message: "Harga produk saat ini Rp 500.000.",
  };

  assert.deepEqual(
    applyCustomerStateAcknowledgement(returnPayload, {
      state: CUSTOMER_STATES.DISTRESSED,
      intent: "return_product",
    }),
    returnPayload,
  );
  assert.deepEqual(
    applyCustomerStateAcknowledgement(neutralPayload, {
      state: CUSTOMER_STATES.NEUTRAL,
      intent: "price_promo",
    }),
    neutralPayload,
  );
});

test("keeps out-of-scope general responses concise", () => {
  const payload = {
    type: "text",
    message: "Maaf, aku hanya dapat membantu topik ecommerce Robot Jadul.",
  };

  assert.deepEqual(
    applyCustomerStateAcknowledgement(payload, {
      state: CUSTOMER_STATES.CONFUSED,
      intent: "general",
    }),
    payload,
  );
});

test("does not duplicate equivalent empathy written by the LLM", () => {
  const payload = {
    type: "text",
    message:
      "Wajar kalau kamu ingin memastikan semuanya aman dan jelas. Metode pembayaran resmi tersedia saat checkout.",
  };

  assert.deepEqual(
    applyCustomerStateAcknowledgement(payload, {
      state: CUSTOMER_STATES.WORRIED,
      intent: "shipping_transaction",
    }),
    payload,
  );
});
