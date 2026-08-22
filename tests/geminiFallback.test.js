import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyGeminiFailure,
  geminiGenerateContentWithFallback,
  shouldTryAnotherGeminiModel,
} from "../lib/chatbot/gemini.js";

test("unknown Gemini quota errors get only one alternate model", () => {
  assert.equal(
    shouldTryAnotherGeminiModel({ status: 429, message: "Too many requests" }),
    true,
  );
  assert.equal(
    shouldTryAnotherGeminiModel(
      new Error("RESOURCE_EXHAUSTED: quota exceeded"),
      { attempt: 2 },
    ),
    false,
  );
});

test("per-model quota may use the bounded Gemini model pool", () => {
  const error = {
    status: 429,
    message:
      "Quota GenerateRequestsPerDayPerProjectPerModel-FreeTier exceeded",
  };
  const failure = classifyGeminiFailure(error);

  assert.equal(failure.modelScoped, true);
  assert.equal(failure.daily, true);
  assert.equal(shouldTryAnotherGeminiModel(error, { attempt: 2 }), true);
});

test("project-wide quota switches provider without trying another Gemini model", () => {
  const error = {
    status: 429,
    message: "Project-wide spend rate limit exceeded",
  };
  const failure = classifyGeminiFailure(error);

  assert.equal(failure.projectScoped, true);
  assert.equal(shouldTryAnotherGeminiModel(error), false);
});

test("Gemini unavailable-model errors may try the next configured model", () => {
  assert.equal(shouldTryAnotherGeminiModel({ status: 404 }), true);
  assert.equal(shouldTryAnotherGeminiModel({ status: 503 }), true);
});

test("Gemini fallback skips failed models and caps one call at three attempts", async () => {
  const calls = [];
  const client = {
    models: {
      async generateContent({ model, config }) {
        calls.push(model);
        assert.ok(config.httpOptions.timeout >= 10000);
        const error = new Error(
          "Quota GenerateRequestsPerDayPerProjectPerModel-FreeTier exceeded",
        );
        error.status = 429;
        throw error;
      },
    },
  };

  await assert.rejects(
    geminiGenerateContentWithFallback({
      models: ["test-gemini-a", "test-gemini-b", "test-gemini-c", "test-gemini-d"],
      contents: [{ role: "user", parts: [{ text: "test" }] }],
      client,
    }),
    (error) => {
      assert.deepEqual(error.attemptedModels, [
        "test-gemini-a",
        "test-gemini-b",
        "test-gemini-c",
      ]);
      return true;
    },
  );

  assert.deepEqual(calls, [
    "test-gemini-a",
    "test-gemini-b",
    "test-gemini-c",
  ]);

  calls.length = 0;
  const recovered = await geminiGenerateContentWithFallback({
    models: ["test-gemini-a", "test-gemini-b", "test-gemini-c", "test-gemini-d"],
    contents: [{ role: "user", parts: [{ text: "test" }] }],
    client: {
      models: {
        async generateContent({ model }) {
          calls.push(model);
          return { text: "ok" };
        },
      },
    },
  });

  assert.equal(recovered.model, "test-gemini-d");
  assert.deepEqual(calls, ["test-gemini-d"]);
});
