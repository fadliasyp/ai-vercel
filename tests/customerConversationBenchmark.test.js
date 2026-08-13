import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  evaluateCustomerConversationDataset,
  inspectCustomerConversationTurn,
  validateCustomerConversationDataset,
} from "../lib/chatbot/customerConversationBenchmark.js";

const dataset = JSON.parse(
  await readFile(
    new URL("../benchmarks/customer-conversations.json", import.meta.url),
    "utf8",
  ),
);

test("validates all customer simulation conversations", () => {
  assert.deepEqual(validateCustomerConversationDataset(dataset), {
    conversations: 12,
    turns: 22,
  });
});

test("passes deterministic customer conversation benchmark", () => {
  const report = evaluateCustomerConversationDataset(dataset);

  assert.equal(report.summary.conversations, 12);
  assert.equal(report.summary.turns, 22);
  assert.equal(report.summary.failed, 0, JSON.stringify(report.results.filter((item) => !item.passed), null, 2));
  assert.equal(report.summary.accuracy, 1);
});

test("does not expose synthetic order verification in benchmark observations", () => {
  const email = "pelanggan@example.invalid";
  const observation = inspectCustomerConversationTurn(
    `email tagihan saya ${email}`,
    { pendingType: "transaction_status" },
  );

  assert.equal(observation.signals.order_verification, true);
  assert.doesNotMatch(JSON.stringify(observation), new RegExp(email, "i"));

  const report = evaluateCustomerConversationDataset({
    conversations: [
      {
        id: "privacy",
        scenario: "Verifikasi",
        turns: [
          {
            question: `email tagihan saya ${email}`,
            expect: { signals: { order_verification: true } },
          },
        ],
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(report), new RegExp(email, "i"));
});
