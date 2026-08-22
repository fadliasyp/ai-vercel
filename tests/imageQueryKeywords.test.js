import test from "node:test";
import assert from "node:assert/strict";

import { extractImageQueryKeywords } from "../api/ask-image.js";

test("generic image-search wording does not become visual evidence", () => {
  assert.deepEqual(extractImageQueryKeywords("ada produk ini engga?"), []);
});

test("named entities remain available for image-search ranking", () => {
  assert.deepEqual(
    extractImageQueryKeywords("Ada Getter Robo ini engga?"),
    ["getter", "robo"],
  );
});
