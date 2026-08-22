import test from "node:test";
import assert from "node:assert/strict";

import { applyVisualMatches } from "../api/ask-image.js";

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
