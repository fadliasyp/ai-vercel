const DEFAULT_UNKNOWN_MESSAGE =
  "Maaf, aku belum punya informasi yang cukup untuk menjawab pertanyaan itu dengan tepat. Supaya tidak memberi informasi yang keliru, silakan tanyakan langsung ke Admin Robot Jadul.";

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
