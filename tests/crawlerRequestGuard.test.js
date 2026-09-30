import test from "node:test";
import assert from "node:assert/strict";

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    ended: false,
    payload: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return null;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };
}

test("blocks Meta external crawler before processing chatbot requests", async () => {
  const originalEnv = { ...process.env };

  process.env.GROQ_ROUTER_ENABLED = "false";
  process.env.GROQ_NATURALIZER_ENABLED = "false";
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const { default: handler } = await import(
      `../api/ask.js?crawler-guard-test=${Date.now()}`
    );
    const response = createResponse();

    await handler(
      {
        method: "POST",
        url: "/api/ask",
        headers: {
          "x-session-id": "crawler_test_session",
          "user-agent":
            "Mozilla/5.0 AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36 (compatible; meta-externalagent/1.1)",
        },
        body: { question: "halo", history: [], isBootstrap: true },
      },
      response,
    );

    assert.equal(response.statusCode, 204);
    assert.equal(response.ended, true);
    assert.equal(response.payload, undefined);

    const customerResponse = createResponse();
    await handler(
      {
        method: "POST",
        url: "/api/ask",
        headers: {
          "x-session-id": "customer_test_session",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
        },
        body: { question: "halo", history: [], isBootstrap: true },
      },
      customerResponse,
    );

    assert.equal(customerResponse.statusCode, 200);
    assert.equal(customerResponse.payload.intent, "greeting");
  } finally {
    process.env = originalEnv;
  }
});
