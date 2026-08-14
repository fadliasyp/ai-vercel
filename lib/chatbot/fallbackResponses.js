const DEFAULT_UNKNOWN_MESSAGE =
  "Maaf, aku belum punya informasi yang cukup untuk menjawab pertanyaan itu dengan tepat. Supaya tidak memberi informasi yang keliru, silakan tanyakan langsung ke Admin Robot Jadul.";

export function looksLikeAdminContactQuestion(question = "") {
  const text = String(question || "").toLowerCase();

  return (
    /\b(?:kontak|hubungi|nomor)\s+admin\b/.test(text) ||
    /\b(?:wa|whatsapp)\s+admin\b/.test(text) ||
    /\b(?:kontak|hubungi)\s+(?:cs|customer service)\b/.test(text) ||
    /\bcs\b/.test(text) ||
    text.includes("customer service") ||
    text.includes("lebih yakin sebelum order") ||
    text.includes("mau tanya admin")
  );
}

export function buildUnknownAnswerResponse({
  message = DEFAULT_UNKNOWN_MESSAGE,
  intent = "general",
  topic = "informasi toko yang belum tersedia di chatbot",
} = {}) {
  return {
    type: "text",
    message,
    intent,
    admin_handoff: {
      label: "Tanya Admin di WhatsApp",
      topic,
    },
  };
}

export function buildCatalogNoMatchResponse({
  message =
    "Maaf, produk yang kamu cari belum ditemukan di katalog Robot Jadul saat ini. Coba periksa kembali nama atau kode produknya, atau gunakan kata kunci lain.",
  intent = "product_discovery",
} = {}) {
  return {
    type: "text",
    message,
    intent,
  };
}
