// lib/chatbot/utils.js

import { normalizeIndonesianCommerceText } from "./textNormalization.js";

export function normalizeLite(text = "") {
  return normalizeIndonesianCommerceText(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeQuestion(text = "") {
  return normalizeIndonesianCommerceText(text)
    .toLowerCase()
    .replace(/[^\w\s#.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COMMERCE_PRODUCT_NOUN_PATTERN =
  /\b(?:produk(?:nya)?|robot(?:nya)?|barang(?:nya)?|item(?:nya)?|mainan(?:nya)?|figur(?:e|in)?(?:nya)?|action\s+figure(?:nya)?)\b/i;
const ROBOT_JADUL_STORE_PATTERN = /\b(?:toko\s+)?robot\s+jadul\b/gi;

export function mentionsRobotJadulStore(text = "") {
  ROBOT_JADUL_STORE_PATTERN.lastIndex = 0;
  return ROBOT_JADUL_STORE_PATTERN.test(String(text || ""));
}

export function stripRobotJadulStoreName(text = "") {
  ROBOT_JADUL_STORE_PATTERN.lastIndex = 0;
  return String(text || "")
    .replace(ROBOT_JADUL_STORE_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasCommerceProductNoun(text = "") {
  return COMMERCE_PRODUCT_NOUN_PATTERN.test(String(text || ""));
}

export function expandCommerceProductNouns(text = "") {
  const original = String(text || "").trim();
  if (!original || !hasCommerceProductNoun(original)) return original;

  // Expansion is only for intent understanding. Keep the original words and
  // product names intact while making common customer terms equivalent.
  return `${original} produk robot barang item mainan`;
}

export function formatRupiah(value = 0) {
  const n = Number(value || 0);

  if (!Number.isFinite(n) || n <= 0) return "Rp 0";

  return n.toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
}

export function stripHtml2(html = "") {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function isYesAnswer(text = "") {
  const s = normalizeLite(text);

  const exactAnswers = [
    "ya",
    "iya",
    "boleh",
    "ok",
    "oke",
    "lanjut",
    "gas",
    "mau",
    "yuk",
  ];

  if (exactAnswers.includes(s)) return true;

  const compact = s
    .replace(/\b(?:dong|deh|kak|min|admin)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:i+y+a+p?|y+a+|boleh|oke?|mau)(?:\s+(?:i+y+a+p?|y+a+|boleh|oke?|mau))*$/i.test(
    compact,
  );
}

export function isNoAnswer(text = "") {
  const s = normalizeLite(text);

  return [
    "tidak",
    "nggak",
    "engga",
    "enggak",
    "ga",
    "gak",
    "skip",
    "batal",
  ].includes(s);
}
