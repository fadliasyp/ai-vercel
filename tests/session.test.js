import test from "node:test";
import assert from "node:assert/strict";

import { resolveSessionId } from "../lib/chatbot/session.js";

test("keeps valid sessions and never shares the anonymous fallback", () => {
  assert.equal(resolveSessionId("sess_customer-123"), "sess_customer-123");

  const first = resolveSessionId("");
  const second = resolveSessionId("invalid session id");
  assert.match(first, /^anon_[a-f0-9-]+$/i);
  assert.match(second, /^anon_[a-f0-9-]+$/i);
  assert.notEqual(first, second);
});
