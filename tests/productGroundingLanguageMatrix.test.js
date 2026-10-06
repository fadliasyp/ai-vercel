import test from "node:test";
import assert from "node:assert/strict";

import { assessProductSearchConfidence } from "../lib/chatbot/productSearch.js";

const catalog = [
  {
    id: 1,
    name: "Soul of Chogokin GX-92 Ideon Full Action",
    stock: "instock",
  },
  {
    id: 2,
    name: "Soul of Chogokin GX-91 Getter 2 & 3 Dynamic Classic",
    stock: "instock",
  },
  {
    id: 3,
    name: "Fewture Getter Set 1,2,3 Black Version",
    stock: "instock",
  },
  {
    id: 4,
    name: "Fewture Shin Getter 1 Changing Black Getter",
    stock: "instock",
  },
  {
    id: 5,
    name: "Jumbo Machinder Mazinger Z",
    stock: "instock",
  },
  {
    id: 6,
    name: "Shokugan Modeling Project Grendizer U",
    stock: "instock",
  },
  {
    id: 7,
    name: "POSE+ METAL series SASURAIGER",
    stock: "instock",
  },
];

test("grounds compact model codes and natural product fact questions", () => {
  const cases = [
    ["harga gx92 ideon berapa", 1],
    ["gx 92 ideon ready gak", 1],
    ["Ideon bahannya metal atau plastik?", 1],
    ["ideon tingginya berapa cm", 1],
    ["ideonn full action minusnya apa", 1],
    ["getter 2 3 dynamic classic stoknya", 2],
    ["Fewture Getter Set 1,2,3 Black Version lengkap gak", 3],
    ["Mazinger Z yang Jumbo Machinder harganya", 5],
    ["grendizr u shokugan beratnya berapa", 6],
    ["cari pose metal sasuraiger", 7],
  ];

  for (const [question, productId] of cases) {
    const result = assessProductSearchConfidence(question, catalog);
    assert.equal(result.status, "matched", question);
    assert.equal(result.product?.id, productId, question);
  }
});

test("keeps ambiguous and unknown product references conservative", () => {
  const ambiguous = assessProductSearchConfidence(
    "getter black ready gak",
    catalog,
  );
  const unknown = assessProductSearchConfidence(
    "ideon ultraman bahannya apa",
    catalog,
  );
  const wrongModel = assessProductSearchConfidence(
    "gx99 ideon harganya berapa",
    catalog,
  );

  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.product, null);
  assert.equal(unknown.status, "not_found");
  assert.equal(unknown.product, null);
  assert.equal(wrongModel.status, "not_found");
  assert.equal(wrongModel.product, null);
});
