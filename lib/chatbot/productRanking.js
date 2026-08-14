import { formatRupiah, stripHtml2 } from "./utils.js";

const stripHtml = stripHtml2;

function norm(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensForCompare(s = "") {
  return norm(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !COMPARE_STOP.has(t));
}

function jaccardSet(A, B) {
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

export function bestMatchByName(queryName, products) {
  const qn = norm(queryName);
  const qTokens = new Set(tokensForCompare(queryName));
  if (!qn || qTokens.size === 0) return { best: null, bestScore: 0, top: [] };

  let best = null;
  let bestScore = 0;
  const scored = [];

  for (const p of products) {
    const pn = norm(p.name || "");
    if (!pn) continue;

    // 1) exact
    if (pn === qn)
      return { best: p, bestScore: 1.0, top: [{ name: p.name, score: 1.0 }] };

    // 2) substring
    let score = 0;
    if (pn.includes(qn) || qn.includes(pn)) score = 0.95;
    else {
      // 3) jaccard token
      const pTokens = new Set(tokensForCompare(p.name || ""));
      score = jaccardSet(qTokens, pTokens);

      // bonus kecil kalau semua token query ada di produk
      let allIn = true;
      for (const t of qTokens) {
        if (!pTokens.has(t)) {
          allIn = false;
          break;
        }
      }
      if (allIn) score = Math.min(1, score + 0.15);
    }

    scored.push({ p, score });
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    best,
    bestScore,
    top: scored
      .slice(0, 4)
      .map((x) => ({ name: x.p.name, score: Number(x.score.toFixed(2)) })),
  };
}

export function explainBestRuleBased(best, candidates = [], rawQuestion = "") {
  const q = String(rawQuestion || "").toLowerCase();

  const isPopularity =
    q.includes("paling dicari") ||
    q.includes("terpopuler") ||
    q.includes("best seller") ||
    q.includes("bestseller") ||
    q.includes("paling laku") ||
    q.includes("yang paling banyak dicari");

  const isWorthIt =
    q.includes("worth it") ||
    q.includes("terbaik") ||
    q.includes("bagus") ||
    q.includes("rekomendasi");

  const reasons = [];
  const compareReasons = [];

  // ===== alasan utama produk =====
  if (isPopularity) {
    if (Number(best.totalSales || 0) > 0) {
      reasons.push(
        `punya penjualan toko yang kuat, yaitu **${Number(best.totalSales).toLocaleString("id-ID")}** transaksi`,
      );
    }

    if (
      Number(best.ratingCount || 0) > 0 &&
      Number(best.averageRating || 0) > 0
    ) {
      reasons.push(
        `punya rating **${Number(best.averageRating).toFixed(1)} / 5** dari **${Number(best.ratingCount).toLocaleString("id-ID")}** ulasan`,
      );
    }

    if (best.stock === "instock") {
      reasons.push(
        "stoknya masih ✅ **ready**, jadi lebih aman kalau ingin langsung checkout",
      );
    }

    if (best.condition) {
      reasons.push(
        `🫙 kondisinya tercatat **${best.condition}**, yang membuat nilainya lebih menarik untuk kolektor`,
      );
    }
  } else {
    if (best.stock === "instock") {
      reasons.push("stoknya ✅ **ready**, jadi bisa langsung diproses");
    } else {
      reasons.push("produknya menarik, walau saat ini stoknya belum ready");
    }

    if (best.condition) {
      reasons.push(`🫙 kondisinya tercatat **${best.condition}**`);
    }

    if (best.numericPrice) {
      reasons.push(`💰 harganya ada di **${formatRupiah(best.numericPrice)}**`);
    }

    if (best.weight) {
      reasons.push(`📦 berat produk sekitar **${best.weight} gram**`);
    }

    const d = best.dimensions || {};
    const dimText =
      d.length || d.width || d.height
        ? `${d.length || "-"} x ${d.width || "-"} x ${d.height || "-"}`
        : null;

    if (dimText) {
      reasons.push(`📦 dimensinya tercatat **${dimText}**`);
    }
  }

  const desc = stripHtml(best.description || "");
  if (desc) {
    const shortDesc =
      desc.length > 220 ? desc.slice(0, 220).trim() + "…" : desc.trim();

    if (isPopularity) {
      reasons.push(`deskripsinya juga cukup kuat 💪, yaitu: *${shortDesc}*`);
    } else if (isWorthIt) {
      reasons.push(
        `dari deskripsi produk, poin yang menonjol adalah: *${shortDesc}*`,
      );
    }
  }

  // ===== bandingkan dengan alternatif =====
  const alts = candidates.filter((p) => p.id !== best.id).slice(0, 2);

  for (const alt of alts) {
    const points = [];

    if (Number(best.totalSales || 0) > Number(alt.totalSales || 0)) {
      points.push("penjualannya lebih kuat");
    }

    if (Number(best.ratingCount || 0) > Number(alt.ratingCount || 0)) {
      points.push("ulasannya lebih banyak");
    }

    if (
      Number(best.averageRating || 0) > 0 &&
      Number(alt.averageRating || 0) > 0 &&
      Number(best.averageRating || 0) > Number(alt.averageRating || 0)
    ) {
      points.push("ratingnya lebih tinggi");
    }

    if (best.stock === "instock" && alt.stock !== "instock") {
      points.push("stoknya lebih aman");
    }

    if (
      Number(best.numericPrice || 0) > 0 &&
      Number(alt.numericPrice || 0) > 0 &&
      Number(best.numericPrice || 0) < Number(alt.numericPrice || 0) &&
      !isPopularity
    ) {
      points.push("harganya lebih menarik");
    }

    if (points.length) {
      compareReasons.push(
        `dibanding **${alt.name}**, produk ini unggul karena ${points.join(", ")}`,
      );
    }
  }

  // ===== pembuka =====
  let intro = "";

  if (isPopularity) {
    intro = `Kalau melihat **data toko yang tersedia**, produk yang paling menonjol adalah **${best.name}** 🎗️.`;
  } else if (isWorthIt) {
    intro = `Dari beberapa kandidat yang ada 🎗️, **${best.name}** terlihat paling menarik untuk direkomendasikan.`;
  } else {
    intro = `Produk yang paling cocok menurutku adalah **${best.name}** 🎗️.`;
  }

  // ===== blok alasan =====
  let reasonBlock = "";
  if (reasons.length) {
    reasonBlock =
      "\n\nAlasan utamanya:\n" + reasons.map((r) => `• ${r}`).join("\n");
  }

  let compareBlock = "";
  if (compareReasons.length) {
    compareBlock =
      "\n\nKalau dibandingkan dengan kandidat lain:\n" +
      compareReasons.map((r) => `• ${r}`).join("\n");
  }

  let altBlock = "";
  if (alts.length) {
    altBlock =
      "\n\nAlternatif lain yang masih layak dilihat:\n" +
      alts
        .map((p, i) => {
          const stockText = p.stock === "instock" ? "ready" : "tidak ready";
          const salesText =
            Number(p.totalSales || 0) > 0
              ? `, terjual ${Number(p.totalSales).toLocaleString("id-ID")}x`
              : "";

          return `• ${i + 1}. **${p.name}** — ${formatRupiah(p.numericPrice)} (${stockText}${salesText})`;
        })
        .join("\n");
  }

  // ===== penutup =====
  let closing = "";
  if (isPopularity) {
    closing =
      "\n\nJadi, kalau kamu cari yang paling kuat secara performa toko saat ini, ini yang paling layak diprioritaskan 🏷️.";
  } else {
    closing =
      "\n\nKalau mau, aku juga bisa bantu pilih mana yang paling cocok berdasarkan budget, stok, atau kondisi koleksinya 😊.";
  }

  return intro + reasonBlock + compareBlock + altBlock + closing;
}

const COMPARE_STOP = new Set([
  "robot",
  "by",
  "with",
  "the",
  "and",
  "dengan",
  "series",
  "seri",
  "ver",
  "version",
  "limited",
  "edition",
  "set",
  "figure",
  "figma",
  "model",
  "kit",
  "project",
  "modeling",
  "modelling",
  "toys",
  "toy",
  "actiontoys",
  "action-toys",
  // ❌ JANGAN masukin: grendizer/voltron/chogokin/gx/dll
]);
