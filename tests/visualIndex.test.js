import test from "node:test";
import assert from "node:assert/strict";

import {
  canReuseVisualIndexProduct,
  scoreProductVisualIndex,
} from "../lib/chatbot/visualIndex.js";

test("reuses only complete v2 entries whose catalog images are unchanged", () => {
  const product = { date_modified_gmt: "2026-08-22T10:00:00" };
  const images = [{ url: "https://example.com/front.jpg" }];
  const existing = {
    visualIndexVersion: 2,
    catalogModifiedAt: product.date_modified_gmt,
    images: [{ ...images[0], scanProvider: "gemini" }],
  };

  assert.equal(
    canReuseVisualIndexProduct({ existing, product, images }),
    true,
  );
  assert.equal(
    canReuseVisualIndexProduct({
      existing: { ...existing, visualIndexVersion: 1 },
      product,
      images,
    }),
    false,
  );
  assert.equal(
    canReuseVisualIndexProduct({
      existing: {
        ...existing,
        images: [{ ...images[0], scanProvider: "none" }],
      },
      product,
      images,
    }),
    false,
  );
});

test("generic Mazinger evidence does not overfit to Energer GX-47T", () => {
  const results = scoreProductVisualIndex({
    analysis: {
      possible_names: ["Mazinger Z"],
      colors: ["black", "red"],
      distinctive_features: ["robot head"],
    },
    question: "carikan yang mirip",
    limit: 5,
  });

  assert.ok(results.length > 0);
  assert.doesNotMatch(results[0].name, /Energer Z Test Type/i);
});

test("explicit Energer and GX-47T evidence still selects the exact product", () => {
  const results = scoreProductVisualIndex({
    analysis: {
      possible_names: ["Energer Z"],
      visible_text: ["GX-47T"],
      distinctive_features: ["test type"],
    },
    question: "carikan produk ini",
    limit: 3,
  });

  assert.match(results[0]?.name || "", /GX-47T Energer Z Test Type/i);
});
