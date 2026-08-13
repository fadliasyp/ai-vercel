import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveRecommendationMetadata,
  extractRecommendationMetadata,
  filterByRecommendationMetadata,
  selectDiverseBudgetRecommendations,
} from "../lib/chatbot/recommendationMetadata.js";

test("extracts decade, franchise, and size preferences from natural questions", () => {
  assert.deepEqual(
    extractRecommendationMetadata(
      "Cari kado robot lawas tahun 80-an untuk pajangan ukuran besar",
    ),
    {
      requestedDecade: 1980,
      requestedFranchiseIds: [],
      requestedSizeClass: "large",
    },
  );
  assert.deepEqual(
    extractRecommendationMetadata("Rekomendasi Voltron atau Golion 80an"),
    {
      requestedDecade: 1980,
      requestedFranchiseIds: ["voltron"],
      requestedSizeClass: null,
    },
  );
});

test("derives franchise era, display, gift, and size metadata from catalog facts", () => {
  const metadata = deriveRecommendationMetadata({
    name: "Action Gokin Godmars",
    description: "Diecast figure untuk display",
    numericPrice: 2800000,
    stock: "instock",
    dimensions: { height: "30" },
  });

  assert.deepEqual(metadata.franchiseIds, ["godmars"]);
  assert.deepEqual(metadata.decades, [1980]);
  assert.equal(metadata.sizeClass, "medium");
  assert.equal(metadata.displaySuitable, true);
  assert.equal(metadata.giftSuitable, true);
});

test("filters hard era and franchise preferences without unrelated fallback", () => {
  const products = [
    { id: 1, name: "Soul of Chogokin Mazinger Z" },
    { id: 2, name: "Action Gokin Godmars" },
    { id: 3, name: "Moderoid Voltron Golion" },
    { id: 4, name: "Unknown Robo", description: "Debut tahun 1986" },
  ];

  assert.deepEqual(
    filterByRecommendationMetadata(products, { requestedDecade: 1980 }).map(
      (product) => product.id,
    ),
    [2, 3, 4],
  );
  assert.deepEqual(
    filterByRecommendationMetadata(products, {
      requestedFranchiseIds: ["voltron"],
    }).map((product) => product.id),
    [3],
  );
  assert.deepEqual(
    filterByRecommendationMetadata(products, {
      requestedFranchiseIds: ["gavan"],
    }),
    [],
  );
});

test("does not mark a ready JUNK product as gift suitable", () => {
  const metadata = deriveRecommendationMetadata({
    name: "JUNK Godmars Part Only",
    numericPrice: 500000,
    stock: "instock",
  });

  assert.equal(metadata.giftSuitable, false);
});

test("keeps franchise era separate from product release years", () => {
  const metadata = deriveRecommendationMetadata({
    name: "DX Chogokin Grendizer Reissue",
    description: "Reissue tahun 1985 dan edisi tahun 2000",
  });

  assert.deepEqual(metadata.decades, [1970]);
});

test("hard-filters JUNK and non-display products from gift recommendations", () => {
  const products = [
    {
      id: 1,
      name: "Action Gokin Godmars",
      description: "Diecast figure untuk display",
      numericPrice: 2500000,
      stock: "instock",
    },
    {
      id: 2,
      name: "JUNK Godmars Part Only",
      description: "Diecast figure untuk display",
      numericPrice: 500000,
      stock: "instock",
    },
    {
      id: 3,
      name: "Godmars Accessory",
      numericPrice: 500000,
      stock: "instock",
    },
  ];

  assert.deepEqual(
    filterByRecommendationMetadata(products, {
      requestedDecade: 1980,
      wantsGift: true,
      wantsDisplay: true,
    }).map((product) => product.id),
    [1],
  );
});

test("diversifies similarly ranked recommendations across an explicit budget range", () => {
  const ranked = [
    { id: 1, numericPrice: 7000000, recommendationScore: 100 },
    { id: 2, numericPrice: 7300000, recommendationScore: 99 },
    { id: 3, numericPrice: 7500000, recommendationScore: 98 },
    { id: 4, numericPrice: 8300000, recommendationScore: 96 },
    { id: 5, numericPrice: 9200000, recommendationScore: 95 },
  ];

  assert.deepEqual(
    selectDiverseBudgetRecommendations(
      ranked,
      { budgetMin: 7000000, budgetMax: 9500000 },
      3,
    ).map((product) => product.id),
    [1, 4, 5],
  );
});

test("does not sacrifice recommendation quality only to fill a price bucket", () => {
  const ranked = [
    { id: 1, numericPrice: 7000000, recommendationScore: 100 },
    { id: 2, numericPrice: 7300000, recommendationScore: 98 },
    { id: 3, numericPrice: 7500000, recommendationScore: 96 },
    { id: 4, numericPrice: 8500000, recommendationScore: 40 },
    { id: 5, numericPrice: 9300000, recommendationScore: 35 },
  ];

  assert.deepEqual(
    selectDiverseBudgetRecommendations(
      ranked,
      { budgetMin: 7000000, budgetMax: 9500000 },
      3,
    ).map((product) => product.id),
    [1, 2, 3],
  );
});
