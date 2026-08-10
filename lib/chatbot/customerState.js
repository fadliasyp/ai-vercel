import { normalizeIndonesianCommerceText } from "./textNormalization.js";

export const CUSTOMER_STATES = Object.freeze({
  NEUTRAL: "neutral",
  DISTRESSED: "distressed",
  URGENT: "urgent",
  WORRIED: "worried",
  CONFUSED: "confused",
});

export function detectCustomerState(question = "") {
  const text = normalizeIndonesianCommerceText(question).toLowerCase();

  if (
    /\b(?:panik|kecewa|kesal|marah|emosi|kapok|rusak|cacat|terkelupas|patah|pecah|salah\s+kirim)\b/.test(
      text,
    )
  ) {
    return CUSTOMER_STATES.DISTRESSED;
  }
  if (
    /\b(?:urgent|mendesak|buruan|segera|secepatnya|sekarang\s+juga|takut\s+kehabisan|keburu\s+habis)\b/.test(text) ||
    /\b(?:kirim|dikirim|diproses|checkout|bayar)\b.{0,35}\bhari\s+ini\b|\bhari\s+ini\b.{0,35}\b(?:kirim|dikirim|diproses|checkout|bayar)\b/.test(text)
  ) {
    return CUSTOMER_STATES.URGENT;
  }
  if (
    /\b(?:khawatir|cemas|waswas|ragu|takut|penipuan|ketipu|aman\s+(?:kan|kah|ga|gak|nggak|engga)|kok\b.{0,40}\bbelum)\b/.test(
      text,
    )
  ) {
    return CUSTOMER_STATES.WORRIED;
  }
  if (
    /\b(?:bingung|kurang\s+paham|tidak\s+paham|ga\s+tau|gak\s+tahu|nggak\s+tahu|engga\s+tahu|lupa\s+(?:nama|seri)(?:nya)?|pilih\s+yang\s+mana)\b/.test(
      text,
    )
  ) {
    return CUSTOMER_STATES.CONFUSED;
  }

  return CUSTOMER_STATES.NEUTRAL;
}

function acknowledgementFor(state, intent) {
  if (state === CUSTOMER_STATES.DISTRESSED) {
    return intent === "return_product"
      ? "Maaf, aku paham kondisi ini mengecewakan. Aku bantu arahkan langkah klaimnya."
      : "Maaf, aku paham ini membuat tidak nyaman. Aku bantu dari informasi yang bisa dipastikan.";
  }
  if (state === CUSTOMER_STATES.URGENT) {
    return "Aku paham kamu butuh kepastian cepat. Ini yang bisa dipastikan sekarang.";
  }
  if (state === CUSTOMER_STATES.WORRIED) {
    return "Wajar kalau kamu ingin memastikan semuanya aman dan jelas. Aku jawab berdasarkan data dan kebijakan toko.";
  }
  if (state === CUSTOMER_STATES.CONFUSED) {
    return intent === "recommendation"
      ? "Tidak apa-apa kalau masih bingung memilih. Aku bantu menyaringnya dari kebutuhanmu."
      : "Tidak apa-apa kalau masih bingung. Aku bantu jelaskan bagian yang bisa dipastikan.";
  }
  return "";
}

function alreadyAcknowledgesState(text, state) {
  const opening = String(text || "").slice(0, 180).toLowerCase();
  if (state === CUSTOMER_STATES.DISTRESSED) {
    return /^(?:maaf|aku paham)/.test(opening);
  }
  if (state === CUSTOMER_STATES.URGENT) {
    return /kepastian cepat|butuh cepat|akan aku prioritaskan/.test(opening);
  }
  if (state === CUSTOMER_STATES.WORRIED) {
    return /^(?:wajar|aku paham)|aman dan jelas/.test(opening);
  }
  if (state === CUSTOMER_STATES.CONFUSED) {
    return /^(?:tidak apa-apa|aku paham)|masih bingung/.test(opening);
  }
  return false;
}

export function applyCustomerStateAcknowledgement(
  payload,
  { state = CUSTOMER_STATES.NEUTRAL, intent = "general" } = {},
) {
  if (!payload || typeof payload !== "object") return payload;
  if (
    state === CUSTOMER_STATES.NEUTRAL ||
    intent === "greeting" ||
    intent === "general"
  ) {
    return payload;
  }

  const acknowledgement = acknowledgementFor(state, intent);
  if (!acknowledgement) return payload;

  const field = String(payload.intro || "").trim() ? "intro" : "message";
  const current = String(payload[field] || "").trim();
  if (!current) return payload;
  if (
    current.startsWith(acknowledgement) ||
    alreadyAcknowledgesState(current, state)
  ) {
    return payload;
  }

  return {
    ...payload,
    [field]: `${acknowledgement}\n\n${current}`,
  };
}
