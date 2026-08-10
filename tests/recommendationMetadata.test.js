import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveRecommendationMetadata,
  extractRecommendationMetadata,
  filterByRecommendationMetadata,
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
