import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOrderVerificationFailedMessage,
  buildOrderVerificationPrompt,
  buildTransactionStatusMessage,
  extractOrderId,
  extractOrderVerification,
  matchesOrderVerification,
  redactOrderVerification,
} from "../lib/chatbot/transactionStatus.js";

const order = {
  id: 5007,
  number: "5007",
  status: "processing",
  total: "3500000",
  date_created: "2026-08-10T10:00:00",
  billing: {
    first_name: "Pelanggan",
    last_name: "Rahasia",
    email: "buyer@example.com",
    phone: "+62 812-3456-7890",
  },
};

test("extracts order verification without mistaking a phone for an order ID", () => {
  assert.equal(extractOrderId("status Order #5007"), "5007");
  assert.equal(extractOrderId("081234567890"), "");
  assert.deepEqual(extractOrderVerification("buyer@example.com"), {
    type: "email",
    value: "buyer@example.com",
  });
  assert.deepEqual(extractOrderVerification("0812-3456-7890"), {
    type: "phone",
    value: "081234567890",
  });
});

test("verifies only billing email or phone and redacts both", () => {
  assert.equal(
    matchesOrderVerification(order, extractOrderVerification("BUYER@example.com")),
    true,
  );
  assert.equal(
    matchesOrderVerification(order, extractOrderVerification("081234567890")),
    true,
  );
  assert.equal(
    matchesOrderVerification(order, extractOrderVerification("wrong@example.com")),
    false,
  );

  const redacted = redactOrderVerification(
    "email buyer@example.com telepon 0812-3456-7890",
  );
  assert.doesNotMatch(redacted, /buyer@example\.com|0812-3456-7890/);
});

test("verification messages do not reveal whether an order exists", () => {
  assert.match(buildOrderVerificationPrompt("5007"), /email atau nomor telepon/);
  assert.match(
    buildOrderVerificationFailedMessage(),
    /belum cocok atau pesanan tidak ditemukan/,
  );

  const status = buildTransactionStatusMessage(order);
  assert.match(status, /Sedang diproses/);
  assert.doesNotMatch(status, /Pelanggan Rahasia/);
});
