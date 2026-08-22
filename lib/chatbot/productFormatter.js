// lib/chatbot/productFormatter.js

import { formatRupiah, stripHtml2 } from "./utils.js";

export function formatDimensions(dim = {}) {
  const l = dim?.length || "";
  const w = dim?.width || "";
  const h = dim?.height || "";

  if (!l && !w && !h) return "(tidak tercantum)";

  const parts = [];

  if (l) parts.push(`P: ${l} cm`);
  if (w) parts.push(`L: ${w} cm`);
  if (h) parts.push(`T: ${h} cm`);

  return parts.join(" • ");
}

export function extractSpecsFromDescription(desc = "") {
  const text = stripHtml2(desc || "")
    .replace(/\r/g, "")
    .trim();

  if (!text) return [];

  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const specPatterns = [
    /material/i,
    /bahan/i,
    /ukuran/i,
    /size/i,
    /tinggi/i,
    /panjang/i,
    /lebar/i,
    /berat/i,
    /scale/i,
    /skala/i,
    /artikulasi/i,
    /movable/i,
    /dapat digerakkan/i,
    /isi box/i,
    /include/i,
    /kelengkapan/i,
    /limited/i,
    /edition/i,
    /rilis/i,
    /release/i,
    /tahun/i,
    /kondisi/i,
    /condition/i,
    /junk/i,
    /minus/i,
    /cacat/i,
    /rusak/i,
    /patah/i,
    /retak/i,
    /lecet/i,
    /baret/i,
    /engsel/i,
    /aksesori/i,
    /ori/i,
    /original/i,
    /diecast/i,
    /plastic/i,
    /pvc/i,
    /abs/i,
  ];

  const picked = [];

  for (const line of lines) {
    if (specPatterns.some((re) => re.test(line))) {
      picked.push(line);
    }
  }

  if (!picked.length) {
    return lines.filter((l) => /^[-•\d.)]/.test(l)).slice(0, 8);
  }

  return picked.slice(0, 8);
}

const PRODUCT_CAVEAT_PATTERN =
  /\b(?:minus|kekurangan|cacat|defect|damage|rusak|patah|retak|lecet|baret|gores|penyok|menguning|yellowing|karat|noda|kotor|longgar|loose|hilang|missing|tidak\s+lengkap|incomplete|tanpa\s+box|repaint|repro|junk|mati|tidak\s+berfungsi)\b/i;
const NEGATED_CAVEAT_PATTERN =
  /\b(?:(?:tidak\s+ada|tanpa|bebas|no)\s+(?:minus|kekurangan|cacat|defect|damage|kerusakan|part\s+(?:yang\s+)?hilang|bagian\s+(?:yang\s+)?hilang|baret|lecet|retak|patah|karat|noda)|bukan\s+junk)\b/i;
const PRODUCT_STRENGTH_PATTERN =
  /\b(?:kelebihan|keunggulan|nilai\s+plus|pros?|mulus|lengkap|fungsi\s+normal|berfungsi\s+normal|tested\s+normal|original|orisinal|rare|limited\s+edition)\b/i;

function productCatalogStatements(product = {}) {
  const sources = [
    product.condition,
    product.shortDescription,
    product.short_description,
    product.description,
  ];
  const seen = new Set();

  return sources
    .flatMap((source) =>
      stripHtml2(
        String(source || "").replace(
          /<\/(?:li|div|h[1-6]|tr)>/gi,
          "\n",
        ),
      )
        .split(/\n+|(?<=[.!?])\s+/)
        .map((line) =>
          line
            .replace(/^[-*\d.)\s]+/, "")
            .trim()
            .replace(/[.!?]+$/, ""),
        ),
    )
    .filter((line) => {
      const key = line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (key.length < 4 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function extractProductComparisonNotes(product = {}) {
  const statements = productCatalogStatements(product);
  const strengths = [];
  const caveats = [];

  for (const statement of statements) {
    if (
      PRODUCT_CAVEAT_PATTERN.test(statement) &&
      !NEGATED_CAVEAT_PATTERN.test(statement)
    ) {
      caveats.push(statement);
    } else if (
      PRODUCT_STRENGTH_PATTERN.test(statement) ||
      NEGATED_CAVEAT_PATTERN.test(statement)
    ) {
      strengths.push(statement);
    }
  }

  return {
    strengths: strengths.slice(0, 5),
    caveats: caveats.slice(0, 5),
  };
}

export function extractProductConsiderations(product = {}) {
  const statements = productCatalogStatements(product);
  const caveats = statements
    .filter(
      (line) =>
        PRODUCT_CAVEAT_PATTERN.test(line) &&
        !NEGATED_CAVEAT_PATTERN.test(line),
    )
    .slice(0, 5);
  const condition = stripHtml2(product.condition || "");
  const catalogText = statements.join(" ");
  const cautions = [];
  const unknowns = [];

  if (/\b(?:vintage|bekas|second|used)\b/i.test(condition)) {
    cautions.push(
      `Kondisinya tercatat **${condition}**; perubahan kosmetik karena usia perlu diperiksa dari foto produk.`,
    );
  }
  if (product.stock && product.stock !== "instock") {
    cautions.push(
      "Stoknya sedang tidak ready, jadi waktu pembelian belum bisa dipastikan.",
    );
  }

  if (
    !/\b(?:isi\s+box|include|kelengkapan|aksesori|aksesoris|senjata|part)\b/i.test(
      catalogText,
    )
  ) {
    unknowns.push("kelengkapan atau isi box belum dirinci");
  }
  if (!/\b(?:berfungsi|fungsi|tested|tes|normal|mati)\b/i.test(catalogText)) {
    unknowns.push("fungsi setiap bagian belum dijelaskan");
  }

  return { caveats, cautions, unknowns };
}

export function buildProductConsiderationsMessage(product) {
  if (!product) return "Maaf, detail produk belum ditemukan.";

  const { caveats, cautions, unknowns } =
    extractProductConsiderations(product);
  const lines = [
    `**Pertimbangan sebelum membeli ${product.name || "produk ini"}:**`,
  ];

  if (caveats.length) {
    lines.push(
      "",
      "**Catatan yang tertulis di katalog:**",
      ...caveats.map((line) => `- ${line}`),
    );
  } else {
    lines.push(
      "",
      "Katalog tidak mencantumkan kekurangan fisik atau fungsi secara eksplisit. Jadi aku tidak akan mengarang kekurangannya.",
    );
  }

  if (cautions.length) {
    lines.push(
      "",
      "**Hal yang tetap perlu dipertimbangkan:**",
      ...cautions.map((line) => `- ${line}`),
    );
  }
  if (unknowns.length) {
    lines.push(
      "",
      `**Yang belum dapat dipastikan dari data katalog:** ${unknowns.join("; ")}.`,
    );
  }

  lines.push(
    "",
    caveats.length
      ? "Kesimpulannya, catatan di atas adalah kekurangan yang benar-benar terbaca dari data WooCommerce; cocokkan lagi dengan foto produk sebelum checkout."
      : "Sebelum checkout, periksa foto produk dan konfirmasikan bagian yang belum dirinci kepada admin.",
  );

  return lines.join("\n");
}

export function buildProductDetailMessage(product) {
  if (!product) return "Maaf, detail produk belum ditemukan 🙏";

  const price =
    Number(product.numericPrice || 0) > 0
      ? formatRupiah(product.numericPrice)
      : "(tidak tercantum)";

  const stockLabel =
    product.stock === "instock"
      ? "✅ Ready"
      : product.stock === "outofstock"
        ? "⚠️ Habis"
        : product.stock || "(tidak tercantum)";

  const condition =
    stripHtml2(product.condition || "") || "(tidak tercantum)";
  const weight = product.weight
    ? `${product.weight} gram`
    : "(tidak tercantum)";
  const dimensionsText = formatDimensions(product.dimensions);
  const category = product.category || "(tidak tercantum)";
  const specs = extractSpecsFromDescription(product.description || "");
  const completeness = specs.find((spec) =>
    /\b(?:isi\s+box|include|kelengkapan|aksesori|aksesoris|senjata|part)\b/i.test(spec),
  );

  let msg =
    `📦 **Detail Produk**\n\n` +
    `• Nama: **${product.name || "-"}**\n` +
    `• Harga: **${price}**\n` +
    `• Stok: **${stockLabel}**\n` +
    `• Kondisi: **${condition}**\n` +
    `• Berat: **${weight}**\n` +
    `• Dimensi: **${dimensionsText}**\n` +
    `• Kategori: **${category}**\n`;

  const incompleteWithoutDetails =
    /\b(?:junk|incomplete|missing components?|tidak lengkap)\b/i.test(condition);

  msg += completeness
    ? `\nKelengkapan: **${completeness.replace(/^[-â€¢\d.)\s]+/, "")}**\n`
    : incompleteWithoutDetails
      ? "\nKelengkapan: **katalog menyatakan produk tidak lengkap, tetapi bagian yang hilang belum dirinci; konfirmasikan ke admin sebelum membeli**\n"
      : "\nKelengkapan: **belum tercantum secara rinci di katalog; konfirmasikan ke admin sebelum membeli**\n";

  if (specs.length) {
    msg += `\n🛠️ **Spesifikasi / Info dari deskripsi:**\n`;
    msg += specs.map((s) => `• ${s.replace(/^[-•\d.)\s]+/, "")}`).join("\n");
  } else {
    const shortDesc = stripHtml2(product.description || "")
      .slice(0, 500)
      .trim();

    if (shortDesc) {
      msg += `\n📝 **Deskripsi singkat:**\n${shortDesc}\n`;
    }
  }

  if (product.link) {
    msg += `\n\n🔗 Lihat produk: ${product.link}`;
  }

  return msg.trim();
}

export function buildProductTransactionSummary(product, question = "") {
  if (!product) return "";

  const q = String(question || "").toLowerCase();
  const lines = [`**${product.name || "Produk"}**`];
  const asksStock = /\b(?:stok(?:nya)?|stock|ready|masih\s+ada)\b/.test(q);
  const asksPromo = /\b(?:promo(?:nya)?|diskon(?:nya)?)\b/.test(q);
  const asksPrice =
    asksPromo ||
    /\b(?:harga(?:nya)?|berapa|budget|anggaran|di\s*bawah|di\s*atas)\b/.test(q);
  const asksCondition =
    /\b(?:kondisi(?:nya)?|detail(?:nya)?|spesifikasi(?:nya)?|junk|rusak|cacat|patah|retak|lecet|baret|minus)\b/.test(
      q,
    );
  const asksMaterial =
    /\b(?:bahan(?:nya)?|material(?:nya)?|die[\s-]*cast|plastik|plastic|abs|metal|logam)\b/.test(
      q,
    );
  const asksDimensions =
    /\b(?:ukuran(?:nya)?|dimensi(?:nya)?|tinggi(?:nya)?|panjang(?:nya)?|lebar(?:nya)?|berapa\s+cm)\b/.test(
      q,
    );
  const asksCompleteness =
    /\b(?:kelengkapan(?:nya)?|lengkap|isi\s+box|aksesori|aksesoris|part)\b/.test(
      q,
    );
  const descriptionFacts = extractSpecsFromDescription(
    product.description || "",
  );

  if (asksMaterial) {
    const materialFacts = descriptionFacts
      .filter((fact) =>
        /\b(?:bahan|material|die[\s-]*cast|plastik|plastic|abs|metal|logam)\b/i.test(
          fact,
        ),
      )
      .slice(0, 3);
    lines.push(
      materialFacts.length
        ? `- Bahan/material dari deskripsi: ${materialFacts.join("; ")}.`
        : "- Bahan/material: **belum tercantum secara rinci di katalog**.",
    );
  }

  if (asksDimensions) {
    lines.push(`- Dimensi katalog: **${formatDimensions(product.dimensions)}**.`);
  }

  if (asksStock) {
    if (product.stock === "instock") {
      const quantity =
        Number.isFinite(Number(product.stockQuantity)) &&
        Number(product.stockQuantity) > 0
          ? `, tersisa **${Number(product.stockQuantity)} pcs**`
          : "";
      lines.push(`- Stok: **ready**${quantity}.`);
    } else {
      lines.push("- Stok: **belum ready** saat katalog terakhir diperbarui.");
    }
  }

  if (asksPrice) {
    const currentPrice = Number(product.numericPrice || product.effectivePrice || 0);
    const regularPrice = Number(product.regular_price || 0);
    const discount = Number(product.discountPercent || 0);

    if (asksPromo && product.isPromo && discount > 0) {
      lines.push(
        `- Promo: aktif, harga **${formatRupiah(currentPrice)}** dari harga normal **${formatRupiah(regularPrice)}** (diskon **${discount}%**).`,
      );
    } else if (asksPromo) {
      lines.push(
        `- Promo: belum ada promo aktif yang tercatat; harga saat ini **${formatRupiah(currentPrice)}**.`,
      );
    } else {
      lines.push(`- Harga saat ini: **${formatRupiah(currentPrice)}**.`);
    }
  }

  if (asksCondition) {
    lines.push(
      `- Kondisi: **${stripHtml2(product.condition || "") || "belum tercantum di katalog"}**.`,
    );
    const conditionFacts = descriptionFacts
      .filter((fact) =>
        /\b(?:kondisi|condition|junk|minus|cacat|rusak|patah|retak|lecet|baret|engsel|fungsi|normal)\b/i.test(
          fact,
        ),
      )
      .slice(0, 3);
    if (conditionFacts.length) {
      lines.push(
        `- Catatan kondisi dari deskripsi: ${conditionFacts.join("; ")}.`,
      );
    }
  }

  if (asksCompleteness) {
    const completenessFacts = descriptionFacts
      .filter((fact) =>
        /\b(?:kelengkapan|lengkap|isi\s+box|include|aksesori|aksesoris|part|senjata)\b/i.test(
          fact,
        ),
      )
      .slice(0, 3);
    lines.push(
      completenessFacts.length
        ? `- Kelengkapan dari deskripsi: ${completenessFacts.join("; ")}.`
        : "- Kelengkapan: **belum tercantum secara rinci di katalog**.",
    );
  }

  return lines.join("\n");
}
