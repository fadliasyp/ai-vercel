import test from "node:test";
import assert from "node:assert/strict";

import {
  applyVisualMatches,
  buildImageAnalysisPrompt,
  buildVisualIndexRerankResult,
  buildVisualRerankPrompt,
} from "../api/ask-image.js";

test("keeps the strongest image angle once per reranked product", () => {
  const product = { id: 10, name: "Getter Robo", imageMatchScore: 50 };
  const result = applyVisualMatches(
    {
      summary: "matched",
      matches: [
        { candidate_index: 1, visual_score: 62, confidence: "medium" },
        { candidate_index: 2, visual_score: 91, confidence: "high" },
        { candidate_index: 3, visual_score: 45, confidence: "low" },
      ],
    },
    [
      { product, image: { index: 0, url: "front.jpg" } },
      { product, image: { index: 1, url: "side.jpg" } },
      {
        product: { id: 20, name: "Mazinger Z", imageMatchScore: 40 },
        image: { index: 0, url: "mazinger.jpg" },
      },
    ],
    { provider: "gemini" },
  );

  assert.deepEqual(result.products.map((item) => item.id), [10, 20]);
  assert.equal(result.products[0].visualScore, 91);
  assert.equal(result.products[0].visualImageUrl, "side.jpg");
  assert.equal(result.products[0].visualRerankProvider, "gemini");
});

test("caps description-only Cloudflare rerank confidence", () => {
  const result = applyVisualMatches(
    { matches: [{ candidate_index: 1, visual_score: 99, confidence: "high" }] },
    [{ product: { id: 1 }, image: { index: 0, url: "one.jpg" } }],
    { provider: "cloudflare_visual_index", scoreCap: 75 },
  );

  assert.equal(result.products[0].visualScore, 75);
});

test("keeps Visual Index v2 fallback below high confidence", () => {
  const result = buildVisualIndexRerankResult([
    { id: 1, name: "Getter Robo", visualIndexScore: 100 },
    { id: 2, name: "Mazinger Z", visualIndexScore: 50 },
  ]);

  assert.equal(result.provider, "visual_index_v2");
  assert.equal(result.products[0].visualScore, 74);
  assert.equal(result.products[0].visualConfidence, "low");
  assert.equal(result.products[1].visualScore, 37);
});

test("keeps nonvisual customer constraints out of visual prompts", () => {
  const customerQuestion = "Cari yang sama, budget maksimal 4 juta dan ready";
  const analysisPrompt = buildImageAnalysisPrompt({
    question: customerQuestion,
    imageName: "upload.jpg",
  });
  const rerankPrompt = buildVisualRerankPrompt({
    question: customerQuestion,
    analysis: { colors: ["merah"] },
    candidates: [],
  });

  assert.equal(analysisPrompt.includes(customerQuestion), false);
  assert.match(analysisPrompt, /setiap array maksimal 5 item/i);
  assert.equal(rerankPrompt.includes(customerQuestion), false);
  assert.match(rerankPrompt, /constraint pelanggan diterapkan terpisah/i);
});
