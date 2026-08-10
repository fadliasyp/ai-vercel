import test from "node:test";
import assert from "node:assert/strict";

import {
  GroqRouterError,
  classifyCommerceWithGroq,
  classifyCommerceWithGroqFallback,
  isGroqRouterEnabled,
  resolveGroqRouterConfig,
} from "../lib/chatbot/groq.js";

const testConfig = {
  enabled: true,
  apiKey: "test-key",
  endpoint: "https://example.test/chat/completions",
  model: "qwen/test",
  timeoutMs: 100,
};

function mockResponse({
  status = 200,
  payload,
  retryAfter = null,
} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "retry-after" ? retryAfter : null;
      },
    },
    async json() {
      return payload;
    },
  };
}

test("Groq router remains disabled by default", () => {
  assert.equal(isGroqRouterEnabled({}), false);
  assert.equal(isGroqRouterEnabled({ GROQ_API_KEY: "secret" }), true);
  assert.equal(isGroqRouterEnabled({ GROQ_ROUTER_ENABLED: "true" }), true);
  assert.equal(
    isGroqRouterEnabled({
      GROQ_API_KEY: "secret",
      GROQ_ROUTER_ENABLED: "false",
    }),
    false,
  );
});

test("resolves Groq config without exposing it to production routing", () => {
  const config = resolveGroqRouterConfig({
    GROQ_ROUTER_ENABLED: "1",
    GROQ_API_KEY: "secret",
    GROQ_ROUTER_MODEL: "custom/model",
    GROQ_ROUTER_TIMEOUT_MS: "5000",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.model, "custom/model");
  assert.equal(config.timeoutMs, 5000);
});

test("uses one valid router model when a Vercel env value contains duplicate lines", () => {
  const config = resolveGroqRouterConfig({
    GROQ_API_KEY: "secret",
    GROQ_ROUTER_MODEL:
      "qwen/qwen3.6-27b\nqwen/qwen3.6-27b\nqwen/qwen3.6-27b",
  });

  assert.equal(config.model, "qwen/qwen3.6-27b");
});

test("returns a validated semantic route from Groq", async () => {
  let capturedRequest;
  const route = await classifyCommerceWithGroq({
    question: "produk di bawah 500 ribu apa saja?",
    config: testConfig,
    fetchImpl: async (_url, request) => {
      capturedRequest = JSON.parse(request.body);
      return mockResponse({
        payload: {
          model: "qwen/test",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scope: "in_scope",
                  intent: "price_promo",
                  confidence: 0.96,
                  entities: {
                    product_names: [],
                    budget_min: null,
                    budget_max: 500000,
                    location: null,
                    order_id: null,
                    tracking_number: null,
                  },
                  needs_clarification: false,
                  clarification_question: null,
                }),
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 40 },
        },
      });
    },
  });

  assert.equal(capturedRequest.response_format.type, "json_object");
  assert.equal(capturedRequest.reasoning_effort, "none");
  assert.equal(route.intent, "price_promo");
  assert.equal(route.entities.budget_max, 500000);
  assert.equal(route.provider, "groq");
});

test("uses low reasoning for GPT-OSS and omits it for non-reasoning models", async () => {
  const capturedBodies = [];
  const response = () =>
    mockResponse({
      payload: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                scope: "in_scope",
                intent: "greeting",
                confidence: 0.9,
                entities: {},
                needs_clarification: false,
                clarification_question: null,
              }),
            },
          },
        ],
      },
    });

  for (const model of ["openai/gpt-oss-20b", "llama/test"]) {
    await classifyCommerceWithGroq({
      question: "halo",
      config: { ...testConfig, model },
      fetchImpl: async (_url, request) => {
        capturedBodies.push(JSON.parse(request.body));
        return response();
      },
    });
  }

  assert.equal(capturedBodies[0].reasoning_effort, "low");
  assert.equal("reasoning_effort" in capturedBodies[1], false);
});

test("reports rate limits as retryable without trying another model", async () => {
  await assert.rejects(
    classifyCommerceWithGroq({
      question: "rekomendasikan robot",
      config: testConfig,
      fetchImpl: async () =>
        mockResponse({
          status: 429,
          retryAfter: "30",
          payload: { error: { message: "rate limit exceeded" } },
        }),
    }),
    (error) => {
      assert.ok(error instanceof GroqRouterError);
      assert.equal(error.code, "GROQ_RATE_LIMITED");
      assert.equal(error.retryable, true);
      assert.equal(error.retryAfter, "30");
      return true;
    },
  );
});

test("falls back to the next Groq model only for model-level failures", async () => {
  const requestedModels = [];
  const route = await classifyCommerceWithGroqFallback({
    question: "cek stok",
    config: {
      ...testConfig,
      model: "openai/gpt-oss-20b",
      fallbackModels: ["qwen/qwen3.6-27b"],
    },
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      requestedModels.push(body.model);
      if (requestedModels.length === 1) {
        return mockResponse({
          status: 429,
          retryAfter: "2",
          payload: { error: { message: "rate limit exceeded" } },
        });
      }
      return mockResponse({
        payload: {
          model: body.model,
          choices: [
            {
              message: {
                content: JSON.stringify({
                  scope: "in_scope",
                  intent: "stock_availability",
                  confidence: 0.94,
                  entities: {},
                  needs_clarification: false,
                  clarification_question: null,
                }),
              },
            },
          ],
        },
      });
    },
  });

  assert.deepEqual(requestedModels, [
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
  ]);
  assert.deepEqual(route.fallback_from, ["openai/gpt-oss-20b"]);
});

test("reports access denial separately from an invalid request", async () => {
  await assert.rejects(
    classifyCommerceWithGroq({
      question: "cek produk",
      config: testConfig,
      fetchImpl: async () =>
        mockResponse({
          status: 403,
          payload: {
            error: {
              message: "Access denied. Please check your network settings.",
            },
          },
        }),
    }),
    (error) => {
      assert.equal(error.code, "GROQ_ACCESS_DENIED");
      assert.equal(error.status, 403);
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("rejects invalid Groq JSON before it reaches chatbot routing", async () => {
  await assert.rejects(
    classifyCommerceWithGroq({
      question: "halo",
      config: testConfig,
      fetchImpl: async () =>
        mockResponse({
          payload: {
            choices: [{ message: { content: "bukan json" } }],
          },
        }),
    }),
    (error) => {
      assert.equal(error.code, "GROQ_INVALID_OUTPUT");
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test("times out a stalled Groq request", async () => {
  await assert.rejects(
    classifyCommerceWithGroq({
      question: "cek stok",
      config: { ...testConfig, timeoutMs: 10 },
      fetchImpl: async (_url, request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    }),
    (error) => {
      assert.equal(error.code, "GROQ_TIMEOUT");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});
