import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProductDetailMessage,
  buildProductTransactionSummary,
} from "../lib/chatbot/productFormatter.js";

test("summarizes requested live product facts without inventing promises", () => {
  const product = {
    name: "Super Robot Chogokin Mazinger Z",
    stock: "instock",
    stockQuantity: 2,
    numericPrice: 900000,
    regular_price: 1000000,
    discountPercent: 10,
    isPromo: true,
    condition: "BIB",
  };
  const question =
    "Mazinger Z yang promo masih ready dan kondisinya bagaimana? Bisa dikirim hari ini?";
  const summary = buildProductTransactionSummary(product, question);

  assert.match(summary, /Super Robot Chogokin Mazinger Z/);
  assert.match(summary, /tersisa \*\*2 pcs\*\*/);
  assert.match(summary, /Rp\s*900\.000/);
  assert.match(summary, /diskon \*\*10%\*\*/);
  assert.match(summary, /Kondisi: \*\*BIB\*\*/);
  assert.doesNotMatch(summary, /dikirim hari ini/i);
});

test("keeps documented JUNK defects in the product detail response", () => {
  const message = buildProductDetailMessage({
    name: "Robot Test JUNK",
    condition: "JUNK",
    stock: "instock",
    numericPrice: 500000,
    description:
      "Kondisi JUNK\nEngsel kaki kanan kendor\nCat bagian dada lecet\nTanpa aksesori pedang",
  });

  assert.match(message, /Kondisi: \*\*JUNK\*\*/);
  assert.match(message, /Engsel kaki kanan kendor/);
  assert.match(message, /Cat bagian dada lecet/);
  assert.match(message, /Tanpa aksesori pedang/);
  assert.match(message, /Kelengkapan: \*\*Tanpa aksesori pedang\*\*/);
});

test("states honestly when catalog completeness is not documented", () => {
  const message = buildProductDetailMessage({
    name: "Robot Test",
    condition: "BIB",
    stock: "instock",
    description: "Kondisi baik dan cat masih rapi.",
  });

  assert.match(message, /Kelengkapan:.*belum tercantum secara rinci/i);
  assert.match(message, /konfirmasikan ke admin/i);
});
