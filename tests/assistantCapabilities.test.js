import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssistantCapabilitiesMessage,
  looksLikeAssistantCapabilitiesQuestion,
} from "../lib/chatbot/assistantCapabilities.js";

test("recognizes natural questions about chatbot capabilities", () => {
  const questions = [
    "chatbot ini bisaa apa aja?",
    "kamu bisa bantu apa?",
    "bot ini bisa ngapain?",
    "apa saja yang bisa kamu lakukan?",
    "fitur chatbot apa saja?",
  ];

  for (const question of questions) {
    assert.equal(
      looksLikeAssistantCapabilitiesQuestion(question),
      true,
      question,
    );
  }
  assert.equal(
    looksLikeAssistantCapabilitiesQuestion("bisa bayar pakai apa?"),
    false,
  );
});

test("lists only capabilities implemented by the chatbot", () => {
  const message = buildAssistantCapabilitiesMessage();
  assert.match(message, /foto/i);
  assert.match(message, /membandingkan produk/i);
  assert.match(message, /metode pembayaran/i);
  assert.match(message, /nomor resi/i);
  assert.match(message, /retur\/refund/i);
  assert.match(message, /jam operasional/i);
});
