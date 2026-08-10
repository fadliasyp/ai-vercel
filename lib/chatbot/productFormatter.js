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

  const condition = product.condition || "(tidak tercantum)";
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

  msg += completeness
    ? `\nKelengkapan: **${completeness.replace(/^[-â€¢\d.)\s]+/, "")}**\n`
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
  const asksPrice = asksPromo || /\b(?:harga(?:nya)?|berapa)\b/.test(q);
  const asksCondition =
    /\b(?:kondisi(?:nya)?|detail(?:nya)?|spesifikasi(?:nya)?)\b/.test(q);

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
      `- Kondisi: **${product.condition || "belum tercantum di katalog"}**.`,
    );
  }

  return lines.join("\n");
}
