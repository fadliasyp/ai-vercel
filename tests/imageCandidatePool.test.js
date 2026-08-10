import test from "node:test";
import assert from "node:assert/strict";

import {
  interleaveUniqueProducts,
  plausibleVisualProducts,
} from "../lib/chatbot/imageCandidatePool.js";

test("balances visual, semantic, and lexical image candidates", () => {
  const result = interleaveUniqueProducts(
    [
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      [{ id: 10 }, { id: 11 }, { id: 12 }],
      [{ id: 20 }, { id: 21 }, { id: 22 }],
    ],
    6,
  );

  assert.deepEqual(
    result.map((product) => product.id),
    [1, 10, 20, 2, 11, 21],
  );
});

test("deduplicates candidates without starving later sources", () => {
  const result = interleaveUniqueProducts(
    [[{ id: 1 }, { id: 2 }], [{ id: 1 }, { id: 3 }], [{ id: 4 }]],
    4,
  );

  assert.deepEqual(
    result.map((product) => product.id),
    [1, 4, 2, 3],
  );
});

test("removes visually unrelated products from customer results", () => {
  const result = plausibleVisualProducts([
    { id: 1, visualScore: 82 },
    { id: 2, visualScore: 51 },
    { id: 3, visualScore: 39 },
    { id: 4, visualScore: 0 },
  ]);

  assert.deepEqual(
    result.map((product) => product.id),
    [1, 2],
  );
});
