import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCatalogOverview,
  isCatalogOverviewQuestion,
  isPriceOrderingFollowUp,
  isStoreAssortmentQuestion,
} from "../lib/chatbot/catalogIntent.js";
import {
  expandCommerceProductNouns,
  isYesAnswer,
} from "../lib/chatbot/utils.js";

test("recognizes catalog overview questions without treating them as one product", () => {
  assert.equal(isCatalogOverviewQuestion("Produknya ada berapa macem?"), true);
  assert.equal(isCatalogOverviewQuestion("Barang apa aja yang dijual?"), true);
  assert.equal(isCatalogOverviewQuestion("Robot apa saja yang dijual?"), true);
  assert.equal(isCatalogOverviewQuestion("Mainannya ada berapa jenis?"), true);
  assert.equal(isCatalogOverviewQuestion("Item apa aja yang tersedia?"), true);
  assert.equal(isCatalogOverviewQuestion("Berapa harga GX-91?"), false);
});

test("recognizes questions about the store assortment", () => {
  const question = "ini cuman jual robot aja kah? atau jual yg lain juga";
  assert.equal(isStoreAssortmentQuestion(question), true);
  assert.equal(isCatalogOverviewQuestion(question), true);
  assert.equal(isStoreAssortmentQuestion("jual Mazinger Z engga?"), false);
  assert.equal(
    isCatalogOverviewQuestion("di Robot Jadul ini jual apaaaa aja?"),
    true,
  );
});

test("expands customer product nouns without changing a product name", () => {
  const expanded = expandCommerceProductNouns(
    "Ada Robot Damashii Voltes V?",
  );

  assert.match(expanded, /^Ada Robot Damashii Voltes V\?/);
  assert.match(expanded, /produk robot barang item mainan$/);
});

test("recognizes conversational price ordering follow-up", () => {
  assert.equal(isPriceOrderingFollowUp("Iyaa boleh menurut harga"), true);
  assert.equal(isPriceOrderingFollowUp("urutkan berdasarkan harga"), true);
  assert.equal(isPriceOrderingFollowUp("harga GX-91 berapa"), false);
});

test("accepts natural affirmative variants", () => {
  assert.equal(isYesAnswer("iyaa boleh"), true);
  assert.equal(isYesAnswer("iya dong"), true);
  assert.equal(isYesAnswer("boleh menurut harga"), false);
});

test("catalog overview counts all products but displays ready products first", () => {
  const result = buildCatalogOverview(
    [
      {
        id: 1,
        stock: "outofstock",
        discountPercent: 0,
        categoryNames: ["Chogokin"],
      },
      {
        id: 2,
        stock: "instock",
        discountPercent: 10,
        categoryNames: ["Action Figure", "Chogokin"],
      },
      {
        id: 3,
        stock: "instock",
        discountPercent: 0,
        categoryNames: ["Stock Game &amp; CD", "Uncategorized"],
      },
    ],
    1,
  );

  assert.equal(result.total, 3);
  assert.equal(result.ready, 2);
  assert.equal(result.promo, 1);
  assert.deepEqual(
    result.displayProducts.map((product) => product.id),
    [2],
  );
  assert.deepEqual(result.categories, [
    { name: "Chogokin", count: 2 },
    { name: "Action Figure", count: 1 },
    { name: "Stock Game & CD", count: 1 },
  ]);
});
