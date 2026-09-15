import test from "node:test";
import assert from "node:assert/strict";

import {
  generateVisionJsonWithCloudflare,
  resolveCloudflareVisionConfig,
} from "../lib/chatbot/cloudflare.js";

test("keeps Cloudflare vision disabled until credentials are configured", () => {
  assert.equal(resolveCloudflareVisionConfig({}).enabled, false);

  const config = resolveCloudflareVisionConfig({
    CLOUDFLARE_ACCOUNT_ID: "account-123",
    CLOUDFLARE_AI_API_TOKEN: "token-123",
  });
  assert.equal(config.enabled, true);
  assert.equal(config.model, "@cf/meta/llama-3.2-11b-vision-instruct");
  assert.match(config.endpoint, /accounts\/account-123\/ai\/run\/@cf\/meta/);
});

test("Cloudflare vision sends a data URL and parses JSON", async () => {
  let requestBody = null;
  const config = resolveCloudflareVisionConfig({
    CLOUDFLARE_ACCOUNT_ID: "account-123",
    CLOUDFLARE_AUTH_TOKEN: "token-123",
  });
  const result = await generateVisionJsonWithCloudflare({
    prompt: "Identify this product as JSON",
    image: { mimeType: "image/webp", data: "YWJj" },
    config,
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            response:
              'Berikut hasilnya:\n```json\n{"possible_names":["Getter Robo"]}\n```',
          },
        }),
      };
    },
  });

  assert.equal(requestBody.image, "data:image/webp;base64,YWJj");
  assert.equal(requestBody.temperature, 0);
  assert.deepEqual(result.json.possible_names, ["Getter Robo"]);
});

test("Cloudflare vision accepts a structured response object", async () => {
  const config = resolveCloudflareVisionConfig({
    CLOUDFLARE_ACCOUNT_ID: "account-123",
    CLOUDFLARE_AUTH_TOKEN: "token-123",
  });
  const result = await generateVisionJsonWithCloudflare({
    prompt: "Identify this product as JSON",
    image: { mimeType: "image/png", data: "YWJj" },
    config,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: { response: { possible_names: ["Getter Robo"] } },
      }),
    }),
  });

  assert.deepEqual(result.json.possible_names, ["Getter Robo"]);
});

test("Cloudflare vision recovers complete rerank matches from truncated JSON", async () => {
  const config = resolveCloudflareVisionConfig({
    CLOUDFLARE_ACCOUNT_ID: "account-123",
    CLOUDFLARE_AUTH_TOKEN: "token-123",
  });
  const result = await generateVisionJsonWithCloudflare({
    prompt: "Rerank as JSON",
    image: { mimeType: "image/jpeg", data: "YWJj" },
    config,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          response:
            '{"summary":"","matches":[{"candidate_index":1,"visual_score":88,"confidence":"high","reason":"same robot",},{"candidate_index":2',
        },
      }),
    }),
  });

  assert.deepEqual(result.json.matches, [
    {
      candidate_index: 1,
      visual_score: 88,
      confidence: "high",
      reason: "same robot",
    },
  ]);
});

test("Cloudflare vision recovers explicit scores from malformed match objects", async () => {
  const config = resolveCloudflareVisionConfig({
    CLOUDFLARE_ACCOUNT_ID: "account-123",
    CLOUDFLARE_AUTH_TOKEN: "token-123",
  });
  const result = await generateVisionJsonWithCloudflare({
    prompt: "Rerank as JSON",
    image: { mimeType: "image/jpeg", data: "YWJj" },
    config,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          response:
            '{matches:[{candidate_index: 1, visual_score: 91, reason: "same},{candidate_index: 2, visual_score: 22',
        },
      }),
    }),
  });

  assert.deepEqual(result.json.matches, [
    { candidate_index: 1, visual_score: 91 },
    { candidate_index: 2, visual_score: 22 },
  ]);
});
