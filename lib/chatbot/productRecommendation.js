import {
  formatRupiah,
  stripHtml2,
  stripRobotJadulStoreName,
} from "./utils.js";
import {
  deriveRecommendationMetadata,
  extractRecommendationMetadata,
  filterByRecommendationMetadata,
  selectDiverseBudgetRecommendations,
} from "./recommendationMetadata.js";
import {
  analyzeCompoundQuestion,
  productMatchesCompoundConstraints,
} from "./compoundQuestion.js";
import { extractBudgetRange } from "./priceIntent.js";
import { hasSpecificProductSearchTerms } from "./productSearch.js";
import { isPriceOrderingFollowUp } from "./catalogIntent.js";
import { extractProductComparisonNotes } from "./productFormatter.js";

const stripHtml = stripHtml2;

export function extractRecommendationTopic(rawQuestion = "") {
  const s = stripRobotJadulStoreName(rawQuestion).toLowerCase().trim();

  const removeWords = [
    "rekomendasi",
    "rekomen",
    "recommended",
    "dong",
    "buat",
    "untuk",
    "yang",
    "yg",
    "apa",
    "dong",
    "nih",
    "kak",
    "min",
    "aku",
    "saya",
    "mau",
    "cari",
    "cariin",
    "tolong",
  ];

  const words = s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !removeWords.includes(w));

  return words.join(" ").trim();
}

export function isPopularityStyleQuestion(q = "") {
  const s = q.toLowerCase();
  return (
    s.includes("paling dicari") ||
    s.includes("terpopuler") ||
    s.includes("best seller") ||
    s.includes("bestseller") ||
    s.includes("paling laku") ||
    s.includes("yang paling banyak dicari")
  );
}

export function basePopularityScore(p) {
  let score = 0;
  if (p.stock === "instock") score += 3;
  score += Number(p.totalSales || 0) * 5;
  score += Number(p.ratingCount || 0) * 2;
  score += Number(p.averageRating || 0);
  return score;
}

export function buildProductOpinionReasoning(product, rawQuestion = "") {
  if (!product) return "";

  const q = String(rawQuestion || "").toLowerCase();
  const parts = [];

  const isDisplay = q.includes("pajangan") || q.includes("display");
  const isWorthIt = q.includes("worth it") || q.includes("layak");
  const isCollection =
    q.includes("koleksi") || q.includes("kolektor") || q.includes("collect");
  const isGift = q.includes("hadiah") || q.includes("kado");
  const isBeginner = q.includes("pemula") || q.includes("baru mulai");
  const asksTradeoffs =
    q.includes("kelebihan") ||
    q.includes("kekurangan") ||
    q.includes("pertimbangan") ||
    q.includes("perlu diperhatikan");

  parts.push(
    `Kalau dilihat dari data yang ada, **${product.name}** cukup menarik.`,
  );

  if (product.stock === "instock") {
    parts.push(`Stoknya saat ini **ready** ✅, jadi bisa langsung diproses.`);
  } else {
    parts.push(
      `Saat ini stoknya belum ready ⚠️, jadi itu perlu jadi pertimbangan.`,
    );
  }

  if (Number(product.numericPrice || 0) > 0) {
    parts.push(`Harganya ada di **${formatRupiah(product.numericPrice)}**.`);
  }

  if (product.condition) {
    parts.push(`Kondisinya tercatat **${product.condition}**.`);
  }

  const catalogNotes = extractProductComparisonNotes(product);
  if (catalogNotes.strengths.length) {
    parts.push(
      `Kelebihan yang tertulis di deskripsi katalog: **${catalogNotes.strengths.slice(0, 3).join("; ")}**.`,
    );
  }
  if (catalogNotes.caveats.length) {
    parts.push(
      `Kekurangan atau pertimbangannya: **${catalogNotes.caveats.slice(0, 3).join("; ")}**.`,
    );
  }

  const desc = stripHtml(product.description || "");
  if (!catalogNotes.strengths.length && !catalogNotes.caveats.length && desc) {
    const shortDesc =
      desc.length > 180 ? desc.slice(0, 180).trim() + "…" : desc;
    parts.push(`Dari deskripsinya, poin yang terlihat adalah: *${shortDesc}*`);
  }

  if (isDisplay) {
    parts.push(
      `Kalau tujuanmu untuk **pajangan**, produk ini bisa cocok kalau kamu memang suka karakter/seri ini dan mencari item display yang simpel.`,
    );
  }

  if (isCollection) {
    parts.push(
      `Kalau untuk **koleksi**, nilai menariknya lebih terasa kalau kamu memang suka lini atau seri produknya.`,
    );
  }

  if (isWorthIt) {
    parts.push(
      `Dari sisi value, produk ini lebih cocok kalau kamu memang mencari item yang spesifik dan sesuai selera koleksimu, bukan sekadar cari yang paling murah.`,
    );
  }

  if (isGift) {
    parts.push(
      product.stock === "instock" && !/\bjunk\b/i.test(product.condition || "")
        ? "Untuk **hadiah**, produk ini cukup layak dipertimbangkan karena ready dan tidak tercatat sebagai kondisi JUNK."
        : "Untuk **hadiah**, perhatikan lagi status stok dan kondisi fisiknya sebelum membeli.",
    );
  }

  if (isBeginner) {
    parts.push(
      "Untuk **kolektor pemula**, pertimbangkan apakah karakter, kondisi, dan harganya sesuai dengan fokus koleksi yang ingin kamu mulai.",
    );
  }

  if (
    asksTradeoffs &&
    !catalogNotes.strengths.length &&
    !catalogNotes.caveats.length
  ) {
    parts.push(
      "Kelebihannya dinilai dari fakta katalog seperti stok, kondisi, dan deskripsi yang tersedia. Kekurangannya, data yang tidak tercantum tetap perlu dikonfirmasi ke admin sebelum membeli.",
    );
  }

  if (
    !isDisplay &&
    !isCollection &&
    !isWorthIt &&
    !isGift &&
    !isBeginner &&
    !asksTradeoffs
  ) {
    parts.push(
      `Secara umum, produk ini cukup oke kalau kamu memang suka seri tersebut dan mencari item koleksi yang ready.`,
    );
  }

  parts.push(
    `Kalau kamu mau, aku juga bisa bantu nilai apakah produk ini lebih cocok untuk **koleksi, pajangan, atau dibandingkan dengan produk lain**.`,
  );

  return parts.join(" ");
}

// ====================
// FITUR PROMO
// ====================

export function buildPromoReasoning(products = []) {
  console.log("NO PRODUCT FOUND HIT");
  if (!products.length) return "";

  const lines = products.map((p, i) => {
    const percent = p.discountPercent || 0;
    const hemat = p.discountAmount || 0;

    let tag = "";

    // 🔥 kasih label pintar
    if (percent >= 30) tag = "🔥 BEST DEAL";
    else if (percent >= 20) tag = "⭐ HOT PROMO";
    else if (percent >= 10) tag = "💸 HEMAT";
    else tag = "🎯 PROMO";

    return (
      `${tag} **${p.name}**\n` +
      `• Diskon **${percent}%**\n` +
      `• Hemat **${formatRupiah(hemat)}**\n` +
      `• ${getPromoInsight(p)}`
    );
  });

  return lines.join("\n\n");
}

function getPromoInsight(p) {
  const percent = p.discountPercent || 0;

  if (percent >= 30) return "Diskonnya besar banget, ini jarang terjadi 👀";
  if (percent >= 20) return "Diskon cukup tinggi, worth it untuk dibeli 👍";
  if (percent >= 10) return "Lumayan hemat dibanding harga normal";
  return "Promo ringan, tapi tetap menarik";
}

export function getPromoIntro(products) {
  const maxDiscount = Math.max(...products.map((p) => p.discountPercent || 0));

  if (maxDiscount >= 30) return "🔥 Lagi ada diskon besar-besaran nih!";
  if (maxDiscount >= 20) return "⭐ Banyak promo menarik hari ini!";
  return "💸 Ada beberapa promo yang bisa kamu cek nih!";
}

export function detectPriceMode(q = "") {
  const s = String(q).toLowerCase();

  if (
    s.includes("termurah") ||
    s.includes("paling murah") ||
    s.includes("murah apa") ||
    s.includes("yang murah")
  ) {
    return "cheapest";
  }

  if (
    s.includes("termahal") ||
    s.includes("paling mahal") ||
    s.includes("mahal apa") ||
    s.includes("yang mahal")
  ) {
    return "expensive";
  }

  if (
    s.includes("promo") ||
    s.includes("diskon") ||
    s.includes("sale") ||
    s.includes("cashback")
  ) {
    return "promo";
  }

  return null;
}

function scoreCheapestProduct(p) {
  let score = 0;

  const price = Number(p.numericPrice || 0);
  if (price <= 0) return -9999;

  // makin murah makin bagus
  score += 100000000 / price;

  // bonus ready stock
  if (p.stock === "instock") score += 50;

  // bonus promo
  if (p.discountPercent > 0) score += p.discountPercent * 2;

  // bonus rating & sales
  score += Number(p.averageRating || 0) * 5;
  score += Math.min(Number(p.ratingCount || 0), 20);
  score += Math.min(Number(p.totalSales || 0), 20);

  return score;
}

function scoreExpensiveProduct(p) {
  let score = 0;

  const price = Number(p.numericPrice || 0);
  if (price <= 0) return -9999;

  // makin mahal makin tinggi
  score += price / 10000;

  // bonus ready stock
  if (p.stock === "instock") score += 40;

  // bonus kondisi
  const cond = String(p.condition || "").toLowerCase();
  if (cond.includes("misb")) score += 20;
  else if (cond.includes("mint")) score += 15;
  else if (cond) score += 8;

  // bonus rating & sales
  score += Number(p.averageRating || 0) * 5;
  score += Math.min(Number(p.ratingCount || 0), 20);
  score += Math.min(Number(p.totalSales || 0), 20);

  // bonus deskripsi kuat
  if (stripHtml(p.description || "").length > 80) score += 10;

  return score;
}

function buildCheapestReasoning(products = []) {
  console.log("NO PRODUCT FOUND HIT");
  if (!products.length) return "";

  return products
    .map((p, i) => {
      const parts = [];
      parts.push(`**${i + 1}. ${p.name}**`);
      parts.push(`• Harga: **${formatRupiah(p.numericPrice)}**`);

      if (p.discountPercent > 0) {
        parts.push(
          `• Diskon: **${p.discountPercent}%** (hemat ${formatRupiah(p.discountAmount)})`,
        );
      }

      if (p.stock === "instock") {
        parts.push(`• Stok: **ready** ✅`);
      } else {
        parts.push(`• Stok: belum ready ⚠️`);
      }

      if (Number(p.averageRating || 0) > 0) {
        parts.push(`• Rating: **${Number(p.averageRating).toFixed(1)} / 5**`);
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

function buildExpensiveReasoning(products = []) {
  console.log("NO PRODUCT FOUND HIT");
  if (!products.length) return "";

  return products
    .map((p, i) => {
      const parts = [];
      parts.push(`**${i + 1}. ${p.name}**`);
      parts.push(`• Harga: **${formatRupiah(p.numericPrice)}**`);

      if (p.condition) {
        parts.push(`• Kondisi: **${p.condition}**`);
      }

      if (p.stock === "instock") {
        parts.push(`• Stok: **ready** ✅`);
      } else {
        parts.push(`• Stok: belum ready ⚠️`);
      }

      if (Number(p.averageRating || 0) > 0) {
        parts.push(`• Rating: **${Number(p.averageRating).toFixed(1)} / 5**`);
      }

      if (Number(p.totalSales || 0) > 0) {
        parts.push(
          `• Penjualan: **${Number(p.totalSales).toLocaleString("id-ID")}**`,
        );
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

export async function handlePriceRecommendationMode({
  rawQuestion,
  cleanProducts,
  send,
}) {
  const q = String(rawQuestion || "").toLowerCase();
  const mode = detectPriceMode(q);

  if (!mode || mode === "promo") return false;

  let candidates = cleanProducts.filter((p) => Number(p.numericPrice || 0) > 0);

  if (!candidates.length) {
    await send({
      type: "text",
      message: "Aku belum menemukan produk yang punya data harga 🙏",
    });
    return true;
  }

  if (mode === "cheapest") {
    const ranked = candidates
      .map((p) => ({ ...p, aiScore: scoreCheapestProduct(p) }))
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 5);

    await send(
      {
        type: "products",
        intro: "💸 Ini pilihan produk paling hemat yang aku rekomendasikan:",
        products: ranked,
        reasoning_text:
          "Aku pilih berdasarkan harga yang paling rendah, lalu diprioritaskan ke stok yang ready, promo aktif, dan sinyal kualitas seperti rating atau penjualan.\n\n" +
          buildCheapestReasoning(ranked),
        _noTruncateReasoning: true,
      },
      "price_promo",
    );
    return true;
  }

  if (mode === "expensive") {
    const ranked = candidates
      .map((p) => ({ ...p, aiScore: scoreExpensiveProduct(p) }))
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 5);

    await send(
      {
        type: "products",
        intro:
          "👑 Ini pilihan produk premium / harga tertinggi yang paling menonjol:",
        products: ranked,
        reasoning_text:
          "Aku pilih berdasarkan harga tertinggi, lalu aku utamakan stok ready, kondisi produk, dan sinyal kualitas seperti rating, penjualan, serta kelengkapan data produk.\n\n" +
          buildExpensiveReasoning(ranked),
        _noTruncateReasoning: true,
      },
      "price_promo",
    );
    return true;
  }

  return false;
}

export function parseMoneyToNumber(raw = "") {
  let s = String(raw || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();

  let multiplier = 1;
  if (s.includes("juta") || /\bjt\b/.test(s)) multiplier = 1000000;
  else if (s.includes("ribu") || /\brb\b/.test(s)) multiplier = 1000;

  s = s
    .replace(/rp/gi, "")
    .replace(/rupiah/gi, "")
    .replace(/juta|jt|ribu|rb/gi, "")
    .replace(/[^\d.]/g, "")
    .trim();

  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  if (multiplier === 1 && n >= 100 && n < 10000) {
    return n * 1000;
  }

  return Math.round(n * multiplier);
}

//============================
// RECOMMENDATION SMART FITUR
// ============================
function extractRecommendationUseCase(q = "") {
  const s = String(q || "").toLowerCase();

  if (
    s.includes("pajangan") ||
    s.includes("display") ||
    s.includes("dipajang")
  ) {
    return "display";
  }

  if (
    s.includes("koleksi") ||
    s.includes("collector") ||
    s.includes("kolektor")
  ) {
    return "collection";
  }

  if (s.includes("hadiah") || s.includes("kado") || s.includes("gift")) {
    return "gift";
  }

  if (s.includes("pemula") || s.includes("baru mulai")) {
    return "beginner";
  }

  return null;
}

function scoreRecommendationProduct(product, recNeeds = {}) {
  const price = Number(product.numericPrice || 0);
  const stockReady = String(product.stock || "").toLowerCase() === "instock";
  const totalSales = Number(product.totalSales || 0);
  const averageRating = Number(product.averageRating || 0);
  const ratingCount = Number(product.ratingCount || 0);
  const discountPercent = Number(product.discountPercent || 0);
  const text = getProductSearchText(product);
  const recommendationMetadata = deriveRecommendationMetadata(product);

  let score = 0;
  const reasons = [];

  // =========================
  // 1) Stock
  // =========================
  if (stockReady) {
    score += 35;
    reasons.push("ready stock");
  } else {
    score -= 100;
  }

  // =========================
  // 2) Promo
  // =========================
  if (discountPercent > 0) {
    score += Math.min(discountPercent, 20);
    reasons.push(`diskon ${discountPercent}%`);
  }

  // =========================
  // 3) Sales / rating
  // =========================
  score += Math.min(totalSales, 20);

  if (averageRating > 0) {
    score += averageRating * 4; // max sekitar 20
  }

  if (ratingCount > 0) {
    score += Math.min(ratingCount, 10);
  }

  // =========================
  // 4) Budget fit
  // =========================
  if (recNeeds.budgetMin != null || recNeeds.budgetMax != null) {
    if (price <= 0) {
      score -= 100;
    }

    if (recNeeds.budgetMin != null && price < recNeeds.budgetMin) {
      score -= 120;
    }

    if (recNeeds.budgetMax != null && price > recNeeds.budgetMax) {
      score -= 120;
    }

    // kalau masuk range, kasih bonus
    const inMin = recNeeds.budgetMin == null || price >= recNeeds.budgetMin;
    const inMax = recNeeds.budgetMax == null || price <= recNeeds.budgetMax;

    if (inMin && inMax) {
      score += 35;
      reasons.push("masuk budget");
    }

    // bonus kedekatan ke budget atas (bagus untuk recommendation)
    if (recNeeds.budgetMax != null && inMin && inMax) {
      const ratio = price / recNeeds.budgetMax;
      if (ratio >= 0.7 && ratio <= 1) {
        score += 10;
      }
    }

    // untuk "7 juta ke atas", makin jauh di atas min sedikit bisa lebih relevan
    if (
      recNeeds.budgetMin != null &&
      recNeeds.budgetMax == null &&
      price >= recNeeds.budgetMin
    ) {
      const ratio = price / recNeeds.budgetMin;
      if (ratio >= 1 && ratio <= 1.5) {
        score += 8;
      }
    }
  }

  // =========================
  // 5) Use case
  // =========================
  if (recNeeds.wantsDisplay) {
    if (recommendationMetadata.displaySuitable) {
      score += 18;
      reasons.push("cocok untuk pajangan");
    }
  }

  if (recNeeds.wantsCollection) {
    if (
      text.includes("koleksi") ||
      text.includes("collector") ||
      text.includes("collectible") ||
      text.includes("limited") ||
      text.includes("misb") ||
      text.includes("chogokin")
    ) {
      score += 18;
      reasons.push("menarik untuk koleksi");
    }
  }

  if (recNeeds.wantsGift) {
    if (price > 0 && price <= 2500000) {
      score += 10;
      reasons.push("range harga cocok untuk hadiah");
    }
    if (stockReady) {
      score += 5;
    }
    if (recommendationMetadata.giftSuitable) {
      score += 8;
      reasons.push("ready dan bukan kondisi JUNK");
    }
  }

  if (
    recNeeds.requestedDecade != null &&
    recommendationMetadata.decades.includes(recNeeds.requestedDecade)
  ) {
    score += 30;
    reasons.push(`sesuai era franchise ${recNeeds.requestedDecade}-an`);
  }

  if (
    recNeeds.requestedFranchiseIds?.some((id) =>
      recommendationMetadata.franchiseIds.includes(id),
    )
  ) {
    score += 35;
    reasons.push(
      `sesuai franchise ${recommendationMetadata.franchiseLabels.join("/")}`,
    );
  }

  if (
    recNeeds.requestedSizeClass &&
    recommendationMetadata.sizeClass === recNeeds.requestedSizeClass
  ) {
    score += 20;
    reasons.push(`ukuran ${recNeeds.requestedSizeClass} sesuai kebutuhan`);
  }

  if (recNeeds.wantsBeginner) {
    if (price > 0 && price <= 1500000) {
      score += 16;
      reasons.push("ramah untuk pemula");
    }
  }

  if (recNeeds.conditionPreference === "good") {
    score += 15;
    reasons.push("kondisi katalog sesuai permintaan");
  }

  // =========================
  // 6) Preference murah / premium
  // =========================
  if (recNeeds.wantsCheap) {
    if (price > 0) {
      score += Math.max(0, 25 - Math.floor(price / 500000));
    }
  }

  if (recNeeds.wantsPremium) {
    if (price >= 3000000) {
      score += 15;
      reasons.push("kelas premium");
    }
    if (
      text.includes("limited") ||
      text.includes("diecast") ||
      text.includes("chogokin")
    ) {
      score += 10;
    }
  }

  // =========================
  // 7) Promo only
  // =========================
  if (recNeeds.promoOnly && discountPercent <= 0) {
    score -= 80;
  }

  return {
    ...product,
    recommendationScore: score,
    recommendationReasons: reasons,
    recommendationMetadata,
  };
}

export function pickRecommendedProducts(products = [], recNeeds = {}, limit = 3) {
  let source = filterByRecommendationMetadata(products, recNeeds);
  source = source.filter((product) =>
    productMatchesCompoundConstraints(
      product,
      recNeeds.compoundConstraints || {},
    ),
  );

  // Hard filter budget
  if (recNeeds.budgetMin != null) {
    source = source.filter(
      (p) => Number(p.numericPrice || 0) >= recNeeds.budgetMin,
    );
  }

  if (recNeeds.budgetMax != null) {
    source = source.filter(
      (p) => Number(p.numericPrice || 0) <= recNeeds.budgetMax,
    );
  }

  // Hard filter promo kalau user eksplisit cari promo
  if (recNeeds.promoOnly) {
    source = source.filter((p) => Number(p.discountPercent || 0) > 0);
  }

  if (!source.length) return [];

  const ranked = source
    .map((p) => scoreRecommendationProduct(p, recNeeds))
    .sort((a, b) => {
      if ((b.recommendationScore || 0) !== (a.recommendationScore || 0)) {
        return (b.recommendationScore || 0) - (a.recommendationScore || 0);
      }

      // tie breaker
      return (b.totalSales || 0) - (a.totalSales || 0);
    });

  return selectDiverseBudgetRecommendations(ranked, recNeeds, limit);
}

export function buildRecommendationReasoning(products = [], recNeeds = {}) {
  console.log("NO PRODUCT FOUND HIT");
  if (!products.length) return "";

  const top = products[0];
  const reasons = top.recommendationReasons || [];

  const lines = [];

  if (recNeeds.budgetMin != null && recNeeds.budgetMax == null) {
    lines.push(
      `Aku memprioritaskan produk dengan harga **di atas ${formatRupiah(recNeeds.budgetMin)}**.`,
    );
  } else if (recNeeds.budgetMax != null && recNeeds.budgetMin == null) {
    lines.push(
      `Aku memprioritaskan produk dengan harga **di bawah ${formatRupiah(recNeeds.budgetMax)}**.`,
    );
  } else if (recNeeds.budgetMin != null && recNeeds.budgetMax != null) {
    lines.push(
      `Aku memprioritaskan produk pada rentang **${formatRupiah(recNeeds.budgetMin)} - ${formatRupiah(recNeeds.budgetMax)}**.`,
    );
  }

  if (recNeeds.wantsDisplay) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang lebih cocok untuk **pajangan/display**.",
    );
  }

  if (recNeeds.wantsCollection) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang lebih menarik untuk **koleksi**.",
    );
  }

  if (recNeeds.wantsGift) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang cocok untuk **hadiah**.",
    );
  }

  if (recNeeds.wantsBeginner) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang lebih ramah untuk **pemula**.",
    );
  }

  if (recNeeds.readyOnly) {
    lines.push("Pilihan disaring hanya ke produk yang tercatat **ready stock**.");
  }

  if (recNeeds.conditionPreference === "good") {
    lines.push(
      "Pilihan disaring ke produk yang kondisi bagusnya tercantum di katalog.",
    );
  }

  if (recNeeds.requestedDecade != null) {
    lines.push(
      `Pilihan disaring berdasarkan **era franchise ${recNeeds.requestedDecade}-an**, bukan tahun produksi barangnya.`,
    );
  }

  if (recNeeds.requestedSizeClass) {
    lines.push(
      `Pilihan disaring ke ukuran **${recNeeds.requestedSizeClass}** berdasarkan dimensi katalog yang tersedia.`,
    );
  }

  if (reasons.length) {
    lines.push(`Pilihan teratas unggul karena: **${reasons.join(", ")}**.`);
  }

  const catalogNotes = products.slice(0, 3).flatMap((product) => {
    const { strengths, caveats } = extractProductComparisonNotes(product);
    const details = [];
    if (strengths.length) {
      details.push(`Kelebihan: ${strengths.slice(0, 2).join("; ")}`);
    }
    if (caveats.length) {
      details.push(`Pertimbangan: ${caveats.slice(0, 2).join("; ")}`);
    }
    return details.length
      ? [`- **${product.name}** - ${details.join(". ")}.`]
      : [];
  });

  if (catalogNotes.length) {
    lines.push(
      "**Kelebihan dan pertimbangan dari deskripsi katalog:**",
      ...catalogNotes,
    );
  }

  return lines.join("\n");
}

export function buildReasonFirstRecommendationIntro({
  heading = "Ini rekomendasi yang aku temukan:",
  reasoning = "",
  productLead = "Berikut produk yang aku rekomendasikan:",
} = {}) {
  return [heading, String(reasoning || "").trim(), productLead]
    .filter(Boolean)
    .join("\n\n");
}

export function needsReasoningRecommendation(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    s.includes("alasan") ||
    s.includes("alasannya") ||
    s.includes("kenapa") ||
    s.includes("mengapa") ||
    s.includes("worth it") ||
    s.includes("cocok")
  );
}

export function extractRecommendationNeeds(
  rawQuestion = "",
  semantic = null,
  compoundAnalysis = null,
) {
  const q = String(rawQuestion || "").toLowerCase();

  const compound = compoundAnalysis || analyzeCompoundQuestion(rawQuestion);
  const budget = extractBudgetRange(q);
  const metadata = extractRecommendationMetadata(q);

  const wantsDisplay =
    compound.constraints.purposes.includes("display") ||
    q.includes("display") ||
    q.includes("pajangan") ||
    q.includes("dipajang");

  const wantsCollection =
    compound.constraints.purposes.includes("collection") ||
    q.includes("koleksi") ||
    q.includes("kolektor") ||
    q.includes("collector");

  const wantsGift =
    compound.constraints.purposes.includes("gift") ||
    q.includes("hadiah") ||
    q.includes("kado") ||
    q.includes("gift");

  const wantsBeginner =
    compound.constraints.purposes.includes("beginner") ||
    q.includes("pemula") ||
    q.includes("baru mulai") ||
    q.includes("beginner");

  const wantsCheap =
    q.includes("murah") || q.includes("hemat") || q.includes("worth it");

  const wantsPremium =
    q.includes("premium") ||
    q.includes("terbaik") ||
    q.includes("bagus banget") ||
    q.includes("kelas atas");

  const promoOnly = compound.constraints.promoOnly;

  const needsReasoning =
    q.includes("rekom") ||
    q.includes("rekomendasi") ||
    q.includes("bagus") ||
    q.includes("worth it") ||
    wantsDisplay ||
    wantsCollection ||
    wantsGift ||
    wantsBeginner;

  return {
    budgetMin:
      compound.constraints.budgetMin ?? (budget.detected ? budget.min : null),
    budgetMax:
      compound.constraints.budgetMax ?? (budget.detected ? budget.max : null),
    readyOnly: compound.constraints.stock === "ready",
    conditionPreference: compound.constraints.condition,
    compoundConstraints: compound.constraints,
    wantsDisplay,
    wantsCollection,
    wantsGift,
    wantsBeginner,
    wantsCheap,
    wantsPremium,
    promoOnly,
    needsReasoning,
    ...metadata,
    semantic,
  };
}

export function getProductSearchText(p = {}) {
  return [
    p.name || "",
    p.category || "",
    stripHtml(p.description || ""),
    p.condition || "",
  ]
    .join(" ")
    .toLowerCase();
}

// ====================
//  Universal follow-up
// ===================
export function detectUniversalFollowUp(
  text = "",
  { usesPreviousProducts = false } = {},
) {
  const s = String(text || "")
    .toLowerCase()
    .trim();

  if (!s) return null;
  if (!usesPreviousProducts && hasSpecificProductSearchTerms(s)) return null;

  if (isPriceOrderingFollowUp(s)) {
    return { type: "price_refine", mode: "cheapest" };
  }

  if (
    s.includes("yang paling murah") ||
    s.includes("termurah") ||
    s.includes("lebih murah")
  ) {
    return { type: "price_refine", mode: "cheapest" };
  }

  if (
    s.includes("yang paling mahal") ||
    s.includes("premium") ||
    s.includes("lebih mahal")
  ) {
    return { type: "price_refine", mode: "expensive" };
  }

  if (
    s.includes("ready stock") ||
    s.includes("stok aja") ||
    s.includes("yang ada stok")
  ) {
    return { type: "stock_refine", mode: "instock" };
  }

  if (
    s.includes("promo aja") ||
    s.includes("yang promo") ||
    s.includes("produk promo") ||
    s.includes("sedang promo") ||
    s.includes("diskon terbesar")
  ) {
    return { type: "promo_refine", mode: "promo_only" };
  }

  if (
    s.includes("yang terbaik") ||
    s.includes("paling cocok") ||
    s.includes("worth it") ||
    s.includes("pilih yang mana")
  ) {
    return { type: "pick_best", mode: "best" };
  }

  if (
    s.includes("detailnya") ||
    s.includes("detail dong") ||
    s.includes("spesifikasinya")
  ) {
    return { type: "detail_followup", mode: "detail" };
  }

  if (s.includes("bandingkan") || s.includes("compare")) {
    return { type: "compare_followup", mode: "compare" };
  }

  return null;
}
