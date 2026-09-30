import test from "node:test";
import assert from "node:assert/strict";

import {
  GEMINI_MODEL_FALLBACKS,
  classifyGeminiFailure,
  geminiGenerateContentWithFallback,
  shouldTryAnotherGeminiModel,
} from "../lib/chatbot/gemini.js";

test("default Gemini pools use the account-supported text model IDs", () => {
  for (const models of Object.values(GEMINI_MODEL_FALLBACKS)) {
    assert.equal(models.includes("gemini-2.5-flash-lite"), false);
    assert.equal(models.includes("gemini-2.5-flash"), true);
    assert.equal(models.includes("gemini-3-flash-preview"), true);
    assert.equal(models.includes("gemini-3.5-flash-lite"), true);
  }

  for (const poolName of ["FAST", "SMART", "TEXT"]) {
    const models = GEMINI_MODEL_FALLBACKS[poolName];
    assert.equal(models.includes("gemini-3.8-flash"), true);
    assert.equal(models.includes("gemini-3.7-flash"), true);
    assert.equal(models.includes("gemma-4-26b-a4b-it"), true);
    assert.equal(models.includes("gemma-4-31b-it"), false);
  }

  assert.equal(
    GEMINI_MODEL_FALLBACKS.VISION.includes("gemini-3.8-flash"),
    false,
  );
  assert.equal(
    GEMINI_MODEL_FALLBACKS.VISION.some((model) => model.startsWith("gemma-4-")),
    false,
  );
});

test("Gemini 3.7 and 3.8 use low thinking without sampling config", async () => {
  for (const model of ["gemini-3.8-flash", "gemini-3.7-flash"]) {
    let receivedConfig = null;
    const result = await geminiGenerateContentWithFallback({
      models: [model],
      contents: [{ role: "user", parts: [{ text: "test" }] }],
      config: {
        temperature: 0,
        topP: 0.8,
        topK: 20,
        candidateCount: 1,
        responseMimeType: "application/json",
      },
      client: {
        models: {
          async generateContent({ config }) {
            receivedConfig = config;
            return { text: "{}" };
          },
        },
      },
    });

    assert.equal(result.model, model);
    assert.equal(receivedConfig.temperature, undefined);
    assert.equal(receivedConfig.topP, undefined);
    assert.equal(receivedConfig.topK, undefined);
    assert.equal(receivedConfig.candidateCount, undefined);
    assert.equal(receivedConfig.responseMimeType, "application/json");
    assert.equal(receivedConfig.thinkingConfig.thinkingLevel, "LOW");
  }
});

test("Gemma fallback uses minimal thinking and prompt-validated JSON", async () => {
  let receivedConfig = null;
  const result = await geminiGenerateContentWithFallback({
    models: ["gemma-4-26b-a4b-it"],
    contents: [{ role: "user", parts: [{ text: "Return JSON" }] }],
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: { type: "object" },
      responseJsonSchema: { type: "object" },
    },
    client: {
      models: {
        async generateContent({ config }) {
          receivedConfig = config;
          return { text: "{}" };
        },
      },
    },
  });

  assert.equal(result.model, "gemma-4-26b-a4b-it");
  assert.equal(receivedConfig.temperature, undefined);
  assert.equal(receivedConfig.responseMimeType, undefined);
  assert.equal(receivedConfig.responseSchema, undefined);
  assert.equal(receivedConfig.responseJsonSchema, undefined);
  assert.equal(receivedConfig.thinkingConfig.thinkingLevel, "MINIMAL");
});

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

test("Gemini vision call can reserve time for another provider", async () => {
  const calls = [];
  const client = {
    models: {
      async generateContent({ model, config }) {
        calls.push(model);
        assert.ok(config.httpOptions.timeout <= 12000);
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
      models: ["vision-a", "vision-b", "vision-c"],
      contents: [{ role: "user", parts: [{ text: "test" }] }],
      client,
      maxAttempts: 2,
      timeoutMs: 12000,
    }),
    (error) => {
      assert.deepEqual(error.attemptedModels, ["vision-a", "vision-b"]);
      return true;
    },
  );
  assert.deepEqual(calls, ["vision-a", "vision-b"]);
});
