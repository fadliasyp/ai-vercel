import nlpLangId from "@nlpjs/lang-id";

import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const { StemmerId } = nlpLangId;
const stemmer = new StemmerId();

const PROTECTED_TERMS = new Set([
  "action",
  "bandai",
  "chogokin",
  "gashapon",
  "getter",
  "godmars",
  "grendizer",
  "gundam",
  "mazinger",
  "medicom",
  "popy",
  "takara",
  "transformers",
  "vintage",
  "voltes",
  "voltron",
]);

const COMMERCE_STEMS = new Set([
  "ada",
  "banding",
  "bayar",
  "beli",
  "cari",
  "cek",
  "jual",
  "kembali",
  "kirim",
  "lacak",
  "pilih",
  "pesan",
  "rekomendasi",
  "retur",
  "sedia",
  "tawar",
  "tersedia",
]);

const COMMERCE_OVERRIDES = [
  [
    /^(?:pengiriman(?:nya)?|mengirim(?:kan)?|dikirim(?:kan)?|kiriman|kirim)$/,
    "kirim",
  ],
  [
    /^(?:pembayaran(?:nya)?|membayar(?:kan)?|dibayar(?:kan)?|bayaran|bayar)$/,
    "bayar",
  ],
  [
    /^(?:perbandingan(?:nya)?|membandingkan|dibandingkan|bandingkan|banding)$/,
    "banding",
  ],
  [
    /^(?:rekomendasi(?:nya)?|merekomendasikan|direkomendasikan)$/,
    "rekomendasi",
  ],
  [
    /^(?:ketersediaan(?:nya)?|tersedia|menyediakan|disediakan|sedia)$/,
    "tersedia",
  ],
  [
    /^(?:pengembalian(?:nya)?|mengembalikan|dikembalikan|kembalikan|kembali)$/,
    "kembali",
  ],
  [/^(?:pembelian(?:nya)?|membeli|dibelikan?|belikan?|beli)$/, "beli"],
  [/^(?:pemesanan(?:nya)?|memesan|dipesan|pesankan?|pesan)$/, "pesan"],
  [/^(?:pelacakan(?:nya)?|melacak|dilacak|lacakkan?|lacak)$/, "lacak"],
  [/^(?:penawaran(?:nya)?|menawar|ditawar|tawarkan?|tawar)$/, "tawar"],
  [/^(?:pencarian(?:nya)?|mencari|dicarikan?|carikan?|cari)$/, "cari"],
  [/^(?:pilihan(?:nya)?|memilih|dipilihkan?|pilihkan?|pilih)$/, "pilih"],
];

function overrideStem(word = "") {
  for (const [pattern, stem] of COMMERCE_OVERRIDES) {
    if (pattern.test(word)) return stem;
  }
  return "";
}

export function stemIndonesianWord(value = "") {
  const normalized = normalizeIndonesianCommerceText(value).toLowerCase();
  if (!/^[a-z]{3,}$/.test(normalized)) return normalized;
  if (PROTECTED_TERMS.has(normalized)) return normalized;

  const overridden = overrideStem(normalized);
  if (overridden) return overridden;

  try {
    const stem = String(stemmer.stemWord(normalized) || "").toLowerCase();
    return /^[a-z]{3,}$/.test(stem) ? stem : normalized;
  } catch {
    return normalized;
  }
}

export function extractIndonesianMorphologyHints(value = "", limit = 8) {
  const normalized = normalizeIndonesianCommerceText(value).toLowerCase();
  const words = normalized.match(/[a-z]{3,}/g) || [];
  const stems = [];

  for (const word of words) {
    const stem = stemIndonesianWord(word);
    if (
      stem !== word &&
      COMMERCE_STEMS.has(stem) &&
      !stems.includes(stem)
    ) {
      stems.push(stem);
    }
    if (stems.length >= Math.max(1, Number(limit) || 8)) break;
  }

  return stems;
}

export function buildIndonesianIntentText(value = "") {
  const normalized = normalizeIndonesianCommerceText(value);
  const stems = extractIndonesianMorphologyHints(normalized);
  return stems.length ? `${normalized} ${stems.join(" ")}` : normalized;
}

