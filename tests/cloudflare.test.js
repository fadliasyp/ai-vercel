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
            response: '```json\n{"possible_names":["Getter Robo"]}\n```',
          },
        }),
      };
    },
  });

  assert.equal(requestBody.image, "data:image/webp;base64,YWJj");
  assert.equal(requestBody.temperature, 0);
  assert.deepEqual(result.json.possible_names, ["Getter Robo"]);
});
