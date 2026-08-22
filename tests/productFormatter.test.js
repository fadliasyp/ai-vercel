import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProductConsiderationsMessage,
  buildProductDetailMessage,
  buildProductTransactionSummary,
  extractProductComparisonNotes,
  extractProductConsiderations,
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
    description:
      "Kondisi cat masih bagus. Fungsi normal. Kelengkapan termasuk pedang.",
  };
  const question =
    "Mazinger Z yang promo masih ready, bagaimana kondisi dan kelengkapannya? Bisa dikirim hari ini?";
  const summary = buildProductTransactionSummary(product, question);

  assert.match(summary, /Super Robot Chogokin Mazinger Z/);
  assert.match(summary, /tersisa \*\*2 pcs\*\*/);
  assert.match(summary, /Rp\s*900\.000/);
  assert.match(summary, /diskon \*\*10%\*\*/);
  assert.match(summary, /Kondisi: \*\*BIB\*\*/);
  assert.match(summary, /Catatan kondisi dari deskripsi/);
  assert.match(summary, /Fungsi normal/);
  assert.match(summary, /Kelengkapan dari deskripsi/);
  assert.match(summary, /termasuk pedang/);
  assert.doesNotMatch(summary, /dikirim hari ini/i);
});

test("keeps an undocumented completeness facet explicit", () => {
  const summary = buildProductTransactionSummary(
    {
      name: "Robot Test",
      stock: "instock",
      condition: "Vintage",
      description: "Kondisi cat masih baik.",
    },
    "Bagaimana kondisi dan kelengkapannya?",
  );

  assert.match(summary, /Kondisi: \*\*Vintage\*\*/);
  assert.match(summary, /Kelengkapan:.*belum tercantum secara rinci/i);
});

test("answers requested dimensions from WooCommerce catalog data", () => {
  const summary = buildProductTransactionSummary(
    {
      name: "Robot Damashii Voltes V Legacy",
      dimensions: { length: "30", width: "20", height: "40" },
    },
    "Ukurannya berapa cm, terutama tingginya?",
  );

  assert.match(summary, /Dimensi katalog/);
  assert.match(summary, /T: 40 cm/);
});

test("answers condition and completeness before a return-policy follow-up", () => {
  const summary = buildProductTransactionSummary(
    {
      name: "DX Chogokin Getter Robo",
      condition: "BIB, bukan JUNK",
      description:
        "Kondisi baik dan fungsi normal. Kelengkapan part sesuai foto dan tidak ada part yang hilang.",
    },
    "Part-nya lengkap dan bukan barang JUNK? Kalau ada part hilang, syarat retur bagaimana?",
  );

  assert.match(summary, /Kondisi: \*\*BIB, bukan JUNK\*\*/);
  assert.match(summary, /Kelengkapan dari deskripsi/);
  assert.match(summary, /tidak ada part yang hilang/i);
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

test("cleans WooCommerce HTML and explains an unspecified incomplete JUNK item", () => {
  const message = buildProductDetailMessage({
    name: "Popy ST Dynaman",
    condition:
      '<p><b>Condition:</b> JUNK (Missing Components)</p><p><b>Note:</b> sold for parts or restoration only.</p>',
    stock: "instock",
    numericPrice: 500000,
  });

  assert.match(message, /Condition: JUNK \(Missing Components\)/);
  assert.match(message, /produk tidak lengkap/i);
  assert.match(message, /bagian yang hilang belum dirinci/i);
  assert.doesNotMatch(message, /<\/?(?:p|b)>/i);
});

test("grounds purchase considerations in WooCommerce descriptions", () => {
  const product = {
    name: "Vintage Gashapon Sasuraiger",
    condition: "Vintage",
    stock: "instock",
    shortDescription: "Kondisi display.",
    description:
      "Minus: box penyok. Tangan kanan hilang. Kelengkapan sesuai foto.",
  };
  const considerations = extractProductConsiderations(product);
  const message = buildProductConsiderationsMessage(product);

  assert.equal(
    considerations.caveats.some((line) => /box penyok/i.test(line)),
    true,
  );
  assert.equal(
    considerations.caveats.some((line) => /tangan kanan hilang/i.test(line)),
    true,
  );
  assert.match(message, /box penyok/i);
  assert.match(message, /tangan kanan hilang/i);
  assert.match(message, /Kondisinya tercatat \*\*Vintage\*\*/i);
});

test("does not invent flaws when the catalog explicitly negates them", () => {
  const product = {
    name: "Robot Test Mulus",
    condition: "BIB",
    stock: "instock",
    description:
      "Tidak ada cacat. Tidak ada part hilang. Fungsi normal. Kelengkapan lengkap.",
  };
  const considerations = extractProductConsiderations(product);
  const message = buildProductConsiderationsMessage(product);

  assert.deepEqual(considerations.caveats, []);
  assert.match(message, /tidak mencantumkan kekurangan/i);
  assert.match(message, /tidak akan mengarang/i);
});

test("extracts explicit comparison strengths and caveats from WooCommerce descriptions", () => {
  const notes = extractProductComparisonNotes({
    condition: "BIB, bukan JUNK",
    shortDescription: "Kelebihan: fungsi normal dan aksesori lengkap.",
    description:
      "<ul><li>Kekurangan: sudut box sedikit penyok</li><li>Tidak ada part yang hilang</li></ul>",
  });

  assert.equal(notes.strengths.some((line) => /aksesori lengkap/i.test(line)), true);
  assert.equal(notes.strengths.some((line) => /bukan junk/i.test(line)), true);
  assert.equal(notes.strengths.some((line) => /tidak ada part yang hilang/i.test(line)), true);
  assert.equal(notes.caveats.some((line) => /box sedikit penyok/i.test(line)), true);
  assert.equal(notes.caveats.some((line) => /bukan junk|tidak ada part/i.test(line)), false);
});

test("splits WooCommerce sections and ignores empty strength or caveat headings", () => {
  const notes = extractProductComparisonNotes({
    description:
      "<p>Detail & Keunggulan:</p><p>Kualitas dus mulus tanpa cacat.</p>" +
      "<br>Kekurangan / Catatan yang Perlu Diperhatikan:<br>Sudut box penyok ringan.",
  });

  assert.deepEqual(notes.strengths, ["Kualitas dus mulus tanpa cacat"]);
  assert.deepEqual(notes.caveats, ["Sudut box penyok ringan"]);
});
