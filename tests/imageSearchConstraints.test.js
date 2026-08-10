import test from "node:test";
import assert from "node:assert/strict";

import {
  applyImageSearchConstraints,
  extractImageSearchConstraints,
} from "../lib/chatbot/imageCandidatePool.js";

test("extracts budget, ready stock, and similar-size constraints from image requests", () => {
  assert.deepEqual(
    extractImageSearchConstraints(
      "Ada yang seukurannya dan ready stock? Budget di bawah 2 juta.",
    ),
    {
      budgetMin: null,
      budgetMax: 2000000,
      readyStockOnly: true,
      similarSizeRequested: true,
    },
  );
});

test("filters visual candidates without changing their ranking", () => {
  const products = [
    {
      id: 1,
      numericPrice: 1500000,
      stock: "instock",
      dimensions: { height: "20" },
    },
    {
      id: 2,
      numericPrice: 2200000,
      stock: "instock",
      dimensions: { height: "20" },
    },
    {
      id: 3,
      numericPrice: 1200000,
      stock: "outofstock",
      dimensions: { height: "18" },
    },
    {
      id: 4,
      numericPrice: 1800000,
      stock: "instock",
      dimensions: { height: "35" },
    },
  ];
  const constraints = extractImageSearchConstraints(
    "Cari yang seukuran, ready, dan maksimal 2 juta",
  );
  const result = applyImageSearchConstraints(products, constraints, {
    referenceProduct: products[0],
  });

  assert.deepEqual(result.products.map((product) => product.id), [1]);
  assert.deepEqual(result.applied, {
    budget: true,
    readyStock: true,
    similarSize: true,
  });
  assert.equal(result.similarSizeUnavailable, false);
});

test("keeps other constraints active when catalog dimensions are unavailable", () => {
  const products = [
    { id: 1, numericPrice: 900000, stock: "instock", dimensions: {} },
    { id: 2, numericPrice: 1200000, stock: "outofstock", dimensions: {} },
  ];
  const constraints = extractImageSearchConstraints(
    "Yang seukurannya dan ready di bawah 1 juta",
  );
  const result = applyImageSearchConstraints(products, constraints, {
    referenceProduct: products[0],
  });

  assert.deepEqual(result.products.map((product) => product.id), [1]);
  assert.equal(result.applied.similarSize, false);
  assert.equal(result.similarSizeUnavailable, true);
});

test("does not treat a general availability question as ready-stock only", () => {
  assert.deepEqual(extractImageSearchConstraints("Di toko ada jual robot ini?"), {
    budgetMin: null,
    budgetMax: null,
    readyStockOnly: false,
    similarSizeRequested: false,
  });
});
