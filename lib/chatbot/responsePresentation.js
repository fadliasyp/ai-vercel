import { isYesAnswer, normalizeLite } from "./utils.js";
import { pickSupportedClosing } from "./followUpClosings.js";
import { isOpinionQuestion } from "./askLanguage.js";
import { buildReasonFirstRecommendationIntro } from "./productRecommendation.js";

function randomFrom(arr = []) {
  if (!arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

export function looksLikeBudgetAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    /\d/.test(s) ||
    /\b\d+(?:[.,]\d+)?\s*(k|rb|ribu|jt|juta)\b/.test(s) ||
    s.includes("dibawah") ||
    s.includes("di bawah") ||
    s.includes("kurang dari") ||
    s.includes("antara") ||
    s.includes("sampai")
  );
}

export function looksLikeCheapRefine(text = "") {
  const s = normalizeLite(text);
  return (
    s.includes("murah") ||
    s.includes("hemat") ||
    s.includes("termurah") ||
    s.includes("budget") ||
    looksLikeBudgetAnswer(s)
  );
}

export function looksLikePremiumRefine(text = "") {
  const s = normalizeLite(text);
  return (
    s.includes("premium") ||
    s.includes("bagus") ||
    s.includes("terbaik") ||
    s.includes("mahal") ||
    s.includes("koleksi")
  );
}

export function looksLikeDisplayRefine(text = "") {
  const s = normalizeLite(text);
  return (
    s.includes("pajangan") ||
    s.includes("display") ||
    s.includes("dipajang") ||
    s.includes("buat pajangan")
  );
}

export function looksLikeStockCheckAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    isYesAnswer(s) ||
    s.includes("cek stok") ||
    s.includes("stoknya") ||
    s.includes("stok") ||
    s.includes("ready") ||
    s.includes("masih ada")
  );
}

export function looksLikeCompareAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    isYesAnswer(s) ||
    s.includes("bandingkan") ||
    s.includes("compare") ||
    s.includes("vs") ||
    s.includes("versus")
  );
}

export function looksLikeShippingAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    isYesAnswer(s) ||
    s.includes("cek ongkir") ||
    s.includes("ongkir") ||
    s.includes("kirim") ||
    s.includes("pengiriman")
  );
}

export function humanizeResponse(payload, ctx = {}) {
  if (!payload || typeof payload !== "object") return payload;

  const intent = ctx.intent || "general";
  const rawQuestion = String(ctx.rawQuestion || "");
  const q = normalizeLite(rawQuestion);

  const out = { ...payload };

  // =====================
  // Promo list
  // =====================

  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length > 1 &&
    intent === "price_promo" &&
    out.reasoning_text
  ) {
    return out;
  }

  // =========================
  // Produk tunggal + harga
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length === 1 &&
    (intent === "price_promo" || q.includes("harga"))
  ) {
    const p = out.products[0];
    const priceText = p?.numericPrice
      ? `Rp ${Number(p.numericPrice).toLocaleString("id-ID")}`
      : "belum tercantum";

    out.intro = randomFrom([
      "Oke, aku cekkan ya 😊",
      "Siap, aku sudah ketemu produknya.",
      "Aku ketemu produk yang kamu maksud ya.",
    ]);

    if (p?.discountPercent > 0 && p?.sale_price && p?.regular_price) {
      const regularText = `Rp ${Number(p.regular_price).toLocaleString("id-ID")}`;
      const saleText = `Rp ${Number(p.sale_price).toLocaleString("id-ID")}`;

      out.message =
        `Harga **${p.name}** saat ini **${saleText}** ` +
        `(diskon **${p.discountPercent}%** dari harga normal **${regularText}**).`;
    } else {
      out.message = `Harga **${p.name}** saat ini **${priceText}**.`;
    }

    if (!out.closing) {
      const chosen = pickSupportedClosing("price", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = { productName: p.name, productId: p.id };
      }
    }

    return out;
  }

  // ======================
  // Produk banyak
  // ======================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length > 1 &&
    intent === "stock_availability"
  ) {
    out.intro = out.intro || "Berikut produk yang saat ini ready stock:";

    return out;
  }

  // =========================
  // Produk tunggal + stok
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length === 1 &&
    intent === "stock_availability"
  ) {
    const p = out.products[0];
    let stockText = "saat ini **belum ready / out of stock** ⚠️";

    if (p.stock === "instock") {
      if (typeof p.stockQuantity === "number" && p.stockQuantity > 0) {
        stockText = `masih **ready stock** ✅ (sisa **${p.stockQuantity}** pcs)`;
      } else {
        stockText = "masih **ready stock** ✅";
      }
    }

    out.message = `Untuk **${p.name}**, stoknya ${stockText}.`;
    if (!out.closing) {
      const chosen = pickSupportedClosing("stock", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = { productName: p.name, productId: p.id };
      }
    }

    return out;
  }

  // =========================
  // Recommendation
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length >= 2 &&
    intent === "recommendation"
  ) {
    out.intro =
      out.intro ||
      randomFrom([
        "Kalau lihat kebutuhanmu, ini pilihan yang paling masuk menurutku 😊",
        "Aku pilihkan beberapa yang paling relevan buat kamu:",
        "Ini rekomendasi yang menurutku paling cocok buat kebutuhan kamu:",
      ]);

    if (out.reasoning_text) {
      out.intro = buildReasonFirstRecommendationIntro({
        heading: out.intro,
        reasoning: out.reasoning_text,
      });
      delete out.reasoning_text;
    }

    if (!out.closing) {
      const chosen = pickSupportedClosing("recommendation", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = {
          products: out.products.map((p) => ({ id: p.id, name: p.name })),
        };
      }
    }

    return out;
  }

  // =========================
  // Product detail
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length >= 1 &&
    intent === "product_detail"
  ) {
    const opinionAsked = isOpinionQuestion(rawQuestion);
    const p = out.products[0];

    out.intro =
      out.intro ||
      (opinionAsked
        ? randomFrom([
            `Oke, aku bantu nilai **${p?.name || "produk ini"}** ya 😊`,
            `Siap, aku coba bantu lihat apakah **${p?.name || "produk ini"}** cukup menarik atau tidak.`,
            `Aku bantu cek ya, apakah **${p?.name || "produk ini"}** cocok buat kamu.`,
          ])
        : randomFrom([
            "Ini detail produk yang aku temukan ya:",
            "Oke, aku bantu cek detailnya 😊",
            "Siap, ini info detail produknya:",
          ]));

    if (!out.closing) {
      if (opinionAsked) {
        out.closing =
          "Kalau mau, aku juga bisa bantu bandingkan dengan produk lain yang mirip biar lebih kelihatan mana yang paling cocok.";
        out._followUpType = "offer_compare";
        out._followUpMeta = {
          productName: p?.name || null,
          productId: p?.id || null,
        };
      } else {
        const chosen = pickSupportedClosing("product_detail", {
          products: out.products,
        });
        if (chosen) {
          out.closing = chosen.text;
          out._followUpType = chosen.followUpType;
          out._followUpMeta = {
            productName: p?.name || null,
            productId: p?.id || null,
          };
        }
      }
    }

    return out;
  }

  // =========================
  // Compare
  // =========================
  if (out.type === "compare_reasoned") {
    out.intro =
      out.intro ||
      randomFrom([
        "Oke, aku bantu bandingkan ya 😊",
        "Ini perbandingan dua produk yang kamu pilih:",
        "Aku sudah bandingkan dua produk ini buat kamu:",
      ]);

    if (!out.closing) {
      const chosen = pickSupportedClosing("compare", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = {
          products: Array.isArray(out.products)
            ? out.products.map((p) => ({ id: p.id, name: p.name }))
            : [],
        };
      }
    }

    return out;
  }

  // =========================
  // How to buy / shipping
  // =========================
  if (out.type === "how_to_buy" || intent === "shipping_transaction") {
    if (!out.closing) {
      const chosen = pickSupportedClosing("shipping", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = {};
      }
    }

    return out;
  }

  // =========================
  // Text biasa
  // =========================
  if (out.type === "text" && out.message) {
    return out;
  }

  return out;
}

export function detectContextFollowUp(text = "") {
  const s = normalizeLite(text);

  if (
    s === "yang murah" ||
    s === "murah" ||
    s === "yang termurah" ||
    s === "termurah" ||
    s.includes("lebih murah")
  ) {
    return { type: "price_refine", mode: "cheapest" };
  }

  if (
    s === "yang mahal" ||
    s === "mahal" ||
    s === "yang termahal" ||
    s === "termahal" ||
    s.includes("lebih mahal")
  ) {
    return { type: "price_refine", mode: "expensive" };
  }

  if (
    s === "yang ready" ||
    s === "ready" ||
    s === "ready aja" ||
    s.includes("ready stock") ||
    s.includes("stok ada")
  ) {
    return { type: "stock_refine", mode: "ready_only" };
  }

  if (
    s === "yang promo" ||
    s === "promo" ||
    s === "diskon" ||
    s.includes("yang diskon") ||
    s.includes("lagi promo")
  ) {
    return { type: "promo_refine", mode: "promo_only" };
  }

  if (
    s.includes("diskon paling besar") ||
    s.includes("promo paling besar") ||
    s.includes("potongan paling besar")
  ) {
    return { type: "promo_refine", mode: "biggest_discount" };
  }

  return null;
}

export function applyContextProductRefine(products = [], followUp) {
  if (!Array.isArray(products) || !products.length || !followUp) return [];

  let result = [...products];

  if (followUp.type === "price_refine") {
    result = result.filter((p) => Number(p.numericPrice || 0) > 0);

    if (followUp.mode === "cheapest") {
      result.sort(
        (a, b) => Number(a.numericPrice || 0) - Number(b.numericPrice || 0),
      );
    }

    if (followUp.mode === "expensive") {
      result.sort(
        (a, b) => Number(b.numericPrice || 0) - Number(a.numericPrice || 0),
      );
    }
  }

  if (followUp.type === "stock_refine" && followUp.mode === "ready_only") {
    result = result.filter((p) => p.stock === "instock");
  }

  if (followUp.type === "promo_refine") {
    result = result.filter((p) => Number(p.discountPercent || 0) > 0);

    if (followUp.mode === "biggest_discount") {
      result.sort(
        (a, b) =>
          Number(b.discountPercent || 0) - Number(a.discountPercent || 0),
      );
    }
  }

  return result.slice(0, 5);
}
