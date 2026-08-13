const HUMAN_CLOSINGS = {
  recommendation: [
    {
      text: "Kalau kamu kasih budget, aku bisa sempitkan lagi pilihannya.",
      followUpType: "offer_budget_refine",
    },
    {
      text: "Kalau mau, aku bisa carikan versi yang lebih murah juga.",
      followUpType: "offer_cheaper_refine",
    },
    {
      text: "Kalau kamu mau, aku juga bisa pilihkan yang paling cocok buat pajangan.",
      followUpType: "offer_display_refine",
    },
    {
      text: "Kalau mau, aku bisa bantu pilih mana yang paling worth it buat koleksi.",
      followUpType: "offer_collection_refine",
    },
  ],

  product_detail: [
    {
      text: "Kalau mau, aku bisa bantu cek stoknya juga.",
      followUpType: "offer_check_stock",
    },
    {
      text: "Kalau kamu mau, aku juga bisa bantu bandingkan dengan produk lain.",
      followUpType: "offer_compare",
    },
    {
      text: "Kalau perlu, aku juga bisa bantu cek ongkirnya.",
      followUpType: "offer_check_shipping",
    },
  ],

  stock: [
    {
      text: "Kalau kamu mau, aku juga bisa bantu cek harganya.",
      followUpType: "offer_check_price",
    },
    {
      text: "Kalau perlu, aku bisa carikan alternatif lain yang ready juga.",
      followUpType: "offer_ready_alternative",
    },
  ],

  price: [
    {
      text: "Kalau mau, aku bisa bantu cek stok produk ini juga.",
      followUpType: "offer_check_stock",
    },
    {
      text: "Kalau kamu mau, aku juga bisa bandingkan dengan seri lain.",
      followUpType: "offer_compare",
    },
    {
      text: "Kalau perlu, aku bisa carikan opsi yang lebih murah.",
      followUpType: "offer_cheaper_refine",
    },
  ],

  compare: [
    {
      text: "Kalau kamu mau, aku bisa bantu pilih mana yang paling worth it buat dibeli.",
      followUpType: "offer_pick_winner",
    },
    {
      text: "Kalau mau, aku juga bisa fokus bandingkan dari sisi harga atau stok saja.",
      followUpType: "offer_compare_focus",
    },
  ],

  shipping: [
    {
      text: "Kalau kamu mau, lanjut kirim nama kota tujuan ya.",
      followUpType: "offer_continue_shipping",
    },
  ],

  return_product: [
    {
      text: "Kalau mau, jelaskan masalah barangnya ya, misalnya rusak, part kurang, atau mau refund.",
      followUpType: "offer_return_detail",
    },
  ],
};

function randomFrom(arr = []) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickSupportedClosing(intent, ctx = {}) {
  const candidates = HUMAN_CLOSINGS[intent] || [];
  if (!candidates.length) return null;

  const hasProduct = Array.isArray(ctx.products) && ctx.products.length > 0;

  const filtered = candidates.filter((item) => {
    if (
      [
        "offer_check_stock",
        "offer_compare",
        "offer_check_shipping",
        "offer_check_price",
      ].includes(item.followUpType) &&
      !hasProduct
    ) {
      return false;
    }

    return true;
  });

  return randomFrom(filtered.length ? filtered : candidates);
}

const INTENT_ACTIONS = {
  greeting: [
    "Cari robot yang ready stock",
    "Minta rekomendasi robot sesuai budget",
    "Cek ongkir ke kota tujuan",
    "Lihat metode pembayaran",
    "Rekomendasikan robot untuk pajangan",
    "Rekomendasikan robot untuk hadiah",
    "Lihat produk yang sedang promo",
    "Apa saja yang dijual Robot Jadul?",
    "Di mana alamat toko Robot Jadul?",
    "Toko Robot Jadul buka jam berapa?",
    "Bagaimana cara membeli produk?",
    "Apakah bisa bayar COD?",
  ],
  product_discovery: [
    "Cari robot yang ready stock",
    "Tampilkan robot dari harga termurah",
    "Lihat produk yang sedang promo",
    "Minta rekomendasi robot untuk pajangan",
    "Minta rekomendasi robot sesuai budget",
    "Rekomendasikan robot untuk hadiah",
    "Rekomendasikan robot untuk kolektor pemula",
    "Tampilkan robot dari harga termahal",
    "Cari dua robot untuk dibandingkan",
    "Lihat metode pembayaran",
    "Cek ongkir ke kota tujuan",
    "Bagaimana cara membeli produk?",
  ],
  product_detail: [
    "Cari robot yang ready stock",
    "Lihat produk yang sedang promo",
    "Minta rekomendasi robot sesuai budget",
    "Rekomendasikan robot untuk pajangan",
    "Rekomendasikan robot untuk hadiah",
    "Rekomendasikan robot untuk kolektor pemula",
    "Cari dua robot untuk dibandingkan",
    "Tampilkan robot dari harga termurah",
    "Cek ongkir ke kota tujuan",
    "Bagaimana cara membeli produk?",
  ],
  price_promo: [
    "Tampilkan robot dari harga termurah",
    "Lihat produk yang sedang promo",
    "Cari robot yang ready stock",
    "Minta rekomendasi robot sesuai budget",
    "Rekomendasikan robot yang paling worth it",
    "Rekomendasikan robot untuk pajangan",
    "Rekomendasikan robot untuk hadiah",
    "Tampilkan robot dari harga termahal",
    "Cari dua robot untuk dibandingkan",
    "Cek ongkir ke kota tujuan",
    "Bagaimana cara membeli produk?",
  ],
  stock_availability: [
    "Cari robot yang ready stock",
    "Tampilkan robot dari harga termurah",
    "Lihat produk yang sedang promo",
    "Minta rekomendasi robot sesuai budget",
    "Rekomendasikan robot untuk pajangan",
    "Rekomendasikan robot untuk hadiah",
    "Cari dua robot untuk dibandingkan",
    "Cek ongkir ke kota tujuan",
    "Berapa lama estimasi pengiriman?",
    "Bagaimana cara membeli produk?",
  ],
  recommendation: [
    "Rekomendasikan robot untuk pajangan",
    "Rekomendasikan robot sesuai budget",
    "Rekomendasikan robot untuk hadiah",
    "Rekomendasikan robot untuk kolektor pemula",
    "Rekomendasikan robot yang paling worth it",
    "Rekomendasikan robot premium untuk koleksi",
    "Rekomendasikan robot ready stock",
    "Lihat produk yang sedang promo",
    "Tampilkan robot dari harga termurah",
    "Cari dua robot untuk dibandingkan",
    "Rekomendasikan robot dari era vintage",
    "Cek ongkir ke kota tujuan",
  ],
  compare: [
    "Cari dua robot untuk dibandingkan",
    "Minta rekomendasi robot sesuai budget",
    "Tampilkan robot dari harga termurah",
    "Rekomendasikan robot yang paling worth it",
    "Rekomendasikan robot untuk pajangan",
    "Rekomendasikan robot untuk hadiah",
    "Lihat produk yang sedang promo",
    "Cari robot yang ready stock",
    "Cek ongkir ke kota tujuan",
  ],
  shipping_transaction: [
    "Cek ongkir ke kota tujuan",
    "Berapa lama estimasi pengiriman?",
    "Apakah pengiriman memakai asuransi?",
    "Apakah tersedia packing kayu?",
    "Lihat metode pembayaran",
    "Apakah bisa bayar COD?",
    "Bagaimana cara membeli produk?",
    "Apakah bisa kirim ke luar pulau?",
    "Pengiriman diproses dari mana?",
    "Apakah pembayaran saya sudah masuk?",
    "Bagaimana melacak paket pesanan saya?",
  ],
  shipping_origin: [
    "Cek ongkir ke kota tujuan",
    "Apakah bisa kirim ke luar pulau?",
    "Berapa lama estimasi pengiriman?",
    "Apakah pengiriman memakai asuransi?",
    "Apakah tersedia packing kayu?",
    "Lihat metode pembayaran",
    "Bagaimana cara membeli produk?",
    "Bagaimana melacak paket pesanan saya?",
  ],
  return_product: [
    "Bagaimana ketentuan retur di Robot Jadul?",
    "Apa bukti yang perlu disiapkan untuk retur?",
    "Berapa lama proses refund?",
    "Bagaimana status pengajuan retur saya?",
    "Bagaimana menghubungi admin untuk retur?",
    "Apakah barang salah bisa diretur?",
    "Apakah part yang kurang bisa diklaim?",
    "Apakah box penyok bisa diajukan retur?",
  ],
  transaction_status: [
    "Bagaimana melacak paket pesanan saya?",
    "Berapa lama estimasi pengiriman?",
    "Bagaimana menghubungi admin terkait pesanan?",
    "Apakah pembayaran saya sudah masuk?",
    "Berapa lama pesanan diproses?",
    "Apakah pengiriman memakai asuransi?",
    "Bagaimana menghubungi admin terkait pengiriman?",
  ],
  shipment_tracking: [
    "Cek status pesanan saya",
    "Berapa lama estimasi pengiriman?",
    "Apakah pengiriman memakai asuransi?",
    "Bagaimana menghubungi admin terkait pengiriman?",
    "Cek status pesanan saya",
    "Apakah tersedia packing kayu?",
    "Pengiriman diproses dari mana?",
    "Bagaimana menghubungi admin terkait pesanan?",
  ],
  image_product_search: [
    "Cari robot yang ready stock",
    "Minta rekomendasi robot sesuai budget",
    "Tampilkan robot dari harga termurah",
    "Kenapa hasil ini mirip dengan foto?",
    "Cari produk serupa yang ready stock",
    "Cari produk serupa sesuai budget",
    "Bandingkan dua hasil yang paling mirip",
    "Lihat produk yang sedang promo",
    "Rekomendasikan robot untuk pajangan",
  ],
  general: [
    "Chatbot ini bisa membantu apa saja?",
    "Apa saja yang dijual Robot Jadul?",
    "Di mana alamat toko Robot Jadul?",
    "Toko Robot Jadul buka jam berapa?",
    "Cari robot yang ready stock",
    "Minta rekomendasi robot sesuai budget",
    "Rekomendasikan robot untuk pajangan",
    "Rekomendasikan robot untuk hadiah",
    "Lihat produk yang sedang promo",
    "Cek ongkir ke kota tujuan",
    "Lihat metode pembayaran",
    "Bagaimana cara membeli produk?",
    "Apakah bisa bayar COD?",
  ],
};

const CONTROLLED_ACTION_INTENTS = new Set(Object.keys(INTENT_ACTIONS));
const PRODUCT_ACTION_INTENTS = new Set([
  "product_discovery",
  "recommendation",
  "product_detail",
  "price_promo",
  "stock_availability",
  "compare",
  "image_product_search",
]);

const CONTEXTUAL_ACTIONS = {
  assistant_capabilities: [
    "Cari robot yang ready stock",
    "Minta rekomendasi robot sesuai budget",
    "Cek ongkir ke kota tujuan",
    "Lihat metode pembayaran",
    "Bagaimana cara membeli produk?",
  ],
  store_location: [
    "Toko Robot Jadul buka jam berapa?",
    "Apa saja yang dijual Robot Jadul?",
    "Cari robot yang ready stock",
    "Cek ongkir ke kota tujuan",
    "Lihat metode pembayaran",
  ],
  store_hours: [
    "Di mana alamat toko Robot Jadul?",
    "Apa saja yang dijual Robot Jadul?",
    "Cari robot yang ready stock",
    "Cek ongkir ke kota tujuan",
    "Bagaimana cara membeli produk?",
  ],
  shipping_origin: [
    "Cek ongkir ke kota tujuan",
    "Apakah bisa kirim ke luar pulau?",
    "Berapa lama estimasi pengiriman?",
    "Apakah pengiriman memakai asuransi?",
    "Apakah tersedia packing kayu?",
  ],
  payment_methods: [
    "Bagaimana cara membeli produk?",
    "Apakah bisa bayar COD?",
    "Cek ongkir ke kota tujuan",
    "Apakah pembayaran saya sudah masuk?",
    "Cari robot yang ready stock",
  ],
  how_to_buy: [
    "Lihat metode pembayaran",
    "Cari robot yang ready stock",
    "Cek ongkir ke kota tujuan",
    "Apakah bisa bayar COD?",
    "Lihat produk promo",
  ],
  shipping_insurance: [
    "Apakah tersedia packing kayu?",
    "Berapa lama estimasi pengiriman?",
    "Cek ongkir ke kota tujuan",
    "Apakah bisa kirim ke luar pulau?",
    "Bagaimana cara membeli produk?",
  ],
  shipping_estimate: [
    "Cek ongkir ke kota tujuan",
    "Apakah bisa kirim ke luar pulau?",
    "Apakah pengiriman memakai asuransi?",
    "Apakah tersedia packing kayu?",
    "Pengiriman diproses dari mana?",
  ],
  return_issue_selection: [
    "Retur: barang rusak atau cacat",
    "Retur: part atau aksesori kurang",
    "Retur: barang salah atau tidak sesuai",
    "Retur: box atau kemasan penyok",
    "Retur karena berubah pikiran",
  ],
  return_claim_help: [
    "Apa bukti yang perlu disiapkan untuk retur?",
    "Berapa lama proses refund?",
    "Bagaimana menghubungi admin untuk retur?",
    "Bagaimana status pengajuan retur saya?",
  ],
  return_evidence_next: [
    "Bagaimana menghubungi admin untuk retur?",
    "Berapa lama proses refund?",
    "Bagaimana status pengajuan retur saya?",
  ],
  return_refund_next: [
    "Bagaimana status pengajuan retur saya?",
    "Bagaimana menghubungi admin untuk retur?",
    "Apa bukti yang perlu disiapkan untuk retur?",
  ],
  return_report_next: [
    "Apa bukti yang perlu disiapkan untuk retur?",
    "Berapa lama proses refund?",
    "Bagaimana status pengajuan retur saya?",
  ],
  return_status_next: [
    "Bagaimana menghubungi admin untuk retur?",
    "Apa bukti yang perlu disiapkan untuk retur?",
  ],
};

const SUGGESTED_ACTION_RULES = [
  {
    actionKey: "catalog_recommendation",
    intent: "recommendation",
    requiredFields: [],
    pattern:
      /(?=.*\b(?:rekomendasi(?:kan)?|rekomen|carikan|pilihkan|sarankan)\b)(?=.*\b(?:robot|produk|barang|mainan|figure|figur|item)\b)(?=.*\b(?:worth it|value for money)\b)/i,
  },
  {
    actionKey: "recommendation_budget",
    intent: "recommendation",
    requiredFields: ["budget"],
    pattern:
      /(?=.*\b(?:rekomendasi(?:kan)?|rekomen|pilihkan|sarankan)\b)(?=.*\b(?:budget|anggaran|dana)\b)/i,
  },
  {
    actionKey: "shipping_quote",
    intent: "shipping_transaction",
    requiredFields: ["destination"],
    pattern: /\b(?:ongkir|biaya kirim)\b/i,
  },
  {
    actionKey: "shipping_origin",
    intent: "shipping_origin",
    requiredFields: [],
    pattern:
      /\b(?:pengiriman|barang|produk).*(?:diproses|dikirim).*(?:dari mana|asal)|(?:dari mana|asal).*(?:pengiriman|dikirim)\b/i,
  },
  {
    actionKey: "shipping_coverage",
    intent: "shipping_transaction",
    requiredFields: [],
    pattern: /\b(?:kirim|pengiriman).*(?:luar pulau|luar kota|luar jawa|seluruh indonesia)\b/i,
  },
  {
    actionKey: "shipment_tracking",
    intent: "shipment_tracking",
    requiredFields: ["tracking_number"],
    pattern: /\b(?:lacak|melacak|tracking|resi|posisi paket|sampai mana)\b/i,
  },
  {
    actionKey: "transaction_status",
    intent: "transaction_status",
    requiredFields: ["order_id"],
    pattern:
      /\b(?:status|progres|pembayaran).*(?:pesanan|order|transaksi|masuk|diterima|terkonfirmasi)|(?:pesanan|order|transaksi).*(?:status|progres|pembayaran)\b/i,
  },
  {
    actionKey: "compare_products",
    intent: "compare",
    requiredFields: ["product_name"],
    pattern:
      /\b(?:bandingkan|dibandingkan|perbandingan|vs|versus)\b|(?=.*\bworth it\b)(?=.*\bmana\b)/i,
  },
  {
    actionKey: "recommendation",
    intent: "recommendation",
    requiredFields: [],
    pattern: /\b(?:worth it|value for money)\b/i,
  },
  {
    actionKey: "recommendation",
    intent: "recommendation",
    requiredFields: [],
    pattern:
      /\bdari\s+\d+\s+produk\s+sebelumnya\b.*\b(?:cocok|pajangan|hadiah|kolektor|pemula|kondisi)\b/i,
  },
  {
    actionKey: "product_suitability",
    intent: "product_detail",
    requiredFields: ["product_name"],
    pattern:
      /\b(?:cocok|layak)\b.*\b(?:pajangan|display|hadiah|kado|koleksi|kolektor|pemula)\b/i,
  },
  {
    actionKey: "product_tradeoffs",
    intent: "product_detail",
    requiredFields: ["product_name"],
    pattern:
      /\b(?:kelebihan|kekurangan|pertimbangan|perlu diperhatikan|sebelum membeli)\b/i,
  },
  {
    actionKey: "product_alternative",
    intent: "recommendation",
    requiredFields: [],
    pattern:
      /\b(?:carikan|rekomendasikan|cari)\b.*\b(?:alternatif|produk serupa|pilihan lain)\b|\b(?:alternatif|produk serupa|pilihan lain)\b.*\b(?:lebih murah|lebih bagus|worth it)\b/i,
  },
  {
    actionKey: "product_detail",
    intent: "product_detail",
    requiredFields: ["product_name"],
    pattern: /\b(?:detail|spesifikasi|kondisi|kelengkapan)\b/i,
  },
  {
    actionKey: "stock_availability",
    intent: "stock_availability",
    requiredFields: [],
    pattern: /\b(?:stok|stock|ready|tersedia|po)\b/i,
  },
  {
    actionKey: "price_promo",
    intent: "price_promo",
    requiredFields: [],
    pattern: /\b(?:harga|promo|diskon|termurah|termahal)\b/i,
  },
  {
    actionKey: "return_product",
    intent: "return_product",
    requiredFields: [],
    pattern: /\b(?:retur|refund|pengembalian)\b/i,
  },
  {
    actionKey: "how_to_buy",
    intent: "shipping_transaction",
    requiredFields: [],
    pattern: /\b(?:cara (?:membeli|beli|memesan|pesan)|checkout)\b/i,
  },
  {
    actionKey: "payment",
    intent: "shipping_transaction",
    requiredFields: [],
    pattern: /\b(?:metode pembayaran|bayar|cod|qris|transfer)\b/i,
  },
  {
    actionKey: "shipping_estimate",
    intent: "shipping_transaction",
    requiredFields: [],
    pattern: /\b(?:estimasi|berapa lama|kapan sampai)\b.*\b(?:kirim|pengiriman|paket)\b|\b(?:kirim|pengiriman|paket)\b.*\b(?:estimasi|berapa lama|kapan sampai)\b/i,
  },
  {
    actionKey: "shipping_protection",
    intent: "shipping_transaction",
    requiredFields: [],
    pattern: /\b(?:asuransi|packing kayu|proteksi pengiriman)\b/i,
  },
  {
    actionKey: "store_hours",
    intent: "general",
    requiredFields: [],
    pattern: /\b(?:jam|pukul).*(?:buka|operasional)|(?:buka|operasional).*(?:jam|pukul)\b/i,
  },
  {
    actionKey: "store_location",
    intent: "general",
    requiredFields: [],
    pattern: /\b(?:alamat|lokasi|di mana|dimana)\b.*\b(?:toko|robot jadul)\b/i,
  },
  {
    actionKey: "catalog_overview",
    intent: "product_discovery",
    requiredFields: [],
    pattern: /\b(?:jual apa|apa saja yang dijual|jenis produk|koleksi apa)\b/i,
  },
  {
    actionKey: "assistant_capabilities",
    intent: "general",
    requiredFields: [],
    pattern: /\b(?:chatbot|kamu).*(?:bisa|membantu).*(?:apa|apa saja)\b/i,
  },
  {
    actionKey: "admin_handoff",
    intent: "general",
    requiredFields: [],
    pattern: /\b(?:hubungi|menghubungi|kontak).*(?:admin|cs)\b/i,
  },
  {
    actionKey: "image_match_reason",
    intent: "product_detail",
    requiredFields: ["product_name"],
    pattern: /\b(?:kenapa|mengapa).*(?:mirip|foto|gambar)\b/i,
  },
  {
    actionKey: "recommendation",
    intent: "recommendation",
    requiredFields: [],
    pattern: /\b(?:rekomendasi(?:kan)?|rekomen|cocok|pilihkan|sarankan)\b/i,
  },
  {
    actionKey: "product_discovery",
    intent: "product_discovery",
    requiredFields: [],
    pattern: /\b(?:cari|tampilkan|lihat)\b.*\b(?:robot|produk|barang)\b/i,
  },
];

const OPTIONAL_INVITATION_PATTERN =
  /\b(?:kalau (?:kamu )?(?:mau|perlu)|kalau perlu)\b/i;

function cleanProductName(value = "") {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueActions(actions = []) {
  return [
    ...new Set(
      actions.map((action) => String(action || "").trim()).filter(Boolean),
    ),
  ];
}

export function buildSuggestedActionMetadata(action = "") {
  const value = String(
    action && typeof action === "object"
      ? action.value || action.label || ""
      : action,
  )
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return null;

  const rule = SUGGESTED_ACTION_RULES.find(({ pattern }) =>
    pattern.test(value),
  );
  return {
    label:
      action && typeof action === "object"
        ? String(action.label || value).trim()
        : value,
    value,
    action_key: rule?.actionKey || "follow_up",
    required_fields: [...(rule?.requiredFields || [])],
  };
}

export function dedupeSuggestedActions(actions = []) {
  const seen = new Set();

  return (Array.isArray(actions) ? actions : []).filter((action) => {
    const value = String(
      action && typeof action === "object"
        ? action.value || action.label || ""
        : action || "",
    )
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();

    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function buildSuggestedActionMetadataList(actions = []) {
  return dedupeSuggestedActions(actions)
    .map(buildSuggestedActionMetadata)
    .filter(Boolean);
}

export function serializeSuggestedActions(payload = {}) {
  const out = { ...payload };
  for (const field of ["actions", "suggestions"]) {
    if (!Array.isArray(out[field])) continue;
    const metadata = buildSuggestedActionMetadataList(out[field]);
    out[field] = metadata.map((action) => action.value);
    out[`${field}_metadata`] = metadata;
  }
  return out;
}

export function validateSuggestedActionSelection(selection, question = "") {
  const expected = buildSuggestedActionMetadata(question);
  if (!expected) return null;
  if (!selection || typeof selection !== "object") return expected;

  const selectedValue = String(selection.value || "").trim();
  const selectedFields = Array.isArray(selection.required_fields)
    ? selection.required_fields.map(String)
    : [];
  if (
    selectedValue !== expected.value ||
    String(selection.action_key || "") !== expected.action_key ||
    selectedFields.join("|") !== expected.required_fields.join("|")
  ) {
    return null;
  }
  return expected;
}

export function suggestedActionIntent(action = "") {
  const metadata = buildSuggestedActionMetadata(action);
  const rule = SUGGESTED_ACTION_RULES.find(
    ({ actionKey }) => actionKey === metadata?.action_key,
  );
  return rule?.intent || null;
}

function repeatsCompletedGoal(question = "", action = "") {
  const q = String(question || "").toLowerCase();
  const a = String(action || "").toLowerCase();
  const goals = [
    [/\b(?:termurah|paling murah|harga terendah)\b/, /\b(?:termurah|paling murah|harga terendah)\b/],
    [/\b(?:termahal|paling mahal|harga tertinggi)\b/, /\b(?:termahal|paling mahal|harga tertinggi)\b/],
    [/\b(?:ready stock|stok ready|yang ready|tersedia)\b/, /\b(?:ready stock|stok ready|yang ready)\b/],
    [/\b(?:promo|diskon)\b/, /\b(?:promo|diskon)\b/],
  ];
  return goals.some(([questionPattern, actionPattern]) =>
    questionPattern.test(q) && actionPattern.test(a),
  );
}

function nextActionScore(question = "", action = "") {
  const q = String(question || "").toLowerCase();
  const a = String(action || "").toLowerCase();
  let score = 0;

  if (/\b(?:termurah|termahal|harga|promo|diskon)\b/.test(q)) {
    if (/tampilkan detail/.test(a)) score += 40;
    if (/kondisi/.test(a)) score += 35;
    if (/cek stok/.test(a)) score += 30;
    if (/bandingkan/.test(a)) score += 20;
  }
  if (/\b(?:stok|ready|tersedia)\b/.test(q)) {
    if (/cek harga|termurah|promo/.test(a)) score += 35;
    if (/tampilkan detail|kondisi/.test(a)) score += 30;
    if (/bandingkan/.test(a)) score += 20;
  }
  if (/\b(?:detail|kondisi|spesifikasi|kelengkapan)\b/.test(q)) {
    if (/cek stok/.test(a)) score += 35;
    if (/cek harga/.test(a)) score += 30;
    if (/bandingkan/.test(a)) score += 20;
  }
  if (/\b(?:ongkir|pengiriman|kirim)\b/.test(q)) {
    if (/estimasi pengiriman/.test(a)) score += 35;
    if (/asuransi|packing kayu/.test(a)) score += 30;
    if (/pembayaran|cara membeli/.test(a)) score += 15;
  }
  if (/\b(?:rekomendasi|cocok|hadiah|pajangan|koleksi)\b/.test(q)) {
    if (/tampilkan detail|bandingkan/.test(a)) score += 35;
    if (/cek harga|cek stok/.test(a)) score += 25;
    if (/kelebihan|kekurangan|pertimbangan/.test(a)) score += 32;
    if (/alternatif|produk serupa/.test(a)) score += 28;
  }

  return score;
}

function hasVisiblePrice(product = {}) {
  return Number(
    product.numericPrice || product.effectivePrice || product.price || 0,
  ) > 0;
}

function hasVisibleStock(product = {}) {
  return Boolean(String(product.stock || "").trim());
}

export function answeredProductFacts(payload = {}) {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const text = [
    payload.intro,
    payload.message,
    payload.reasoning_text,
    payload.closing,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    price: products.some(hasVisiblePrice) || /\bharga\b/.test(text),
    stock: products.some(hasVisibleStock) || /\b(?:stok|stock|ready|habis)\b/.test(text),
    condition: /\bkondisi\b/.test(text),
    completeness:
      /\b(?:kelengkapan|lengkap|part|aksesori|aksesoris|isi\s+box)\b/.test(text),
    details:
      /\b(?:detail\s+produk|spesifikasi|deskripsi\s+singkat|dimensi|berat|kategori)\b/.test(
        text,
      ),
  };
}

function asksAlreadyAnsweredProductFact(action = "", payload = {}) {
  const text = String(action || "").toLowerCase();
  const products = Array.isArray(payload.products) ? payload.products : [];
  const answered = answeredProductFacts(payload);

  return products.some((product) => {
    const name = cleanProductName(product?.name).toLowerCase();
    if (!name || !text.includes(name)) return false;

    const asksPrice =
      /\b(?:cek|lihat|tampilkan|berapa)\s+harga\b|\bharga\b.*\bberapa\b/.test(
        text,
      );
    const asksStock =
      /\b(?:cek|lihat|tampilkan)\s+stok\b|\b(?:masih|apakah)\b.*\b(?:ready|tersedia)\b/.test(
        text,
      );
    const asksCondition = /\bkondisi\b/.test(text);
    const asksCompleteness =
      /\b(?:kelengkapan|lengkap|part|aksesori|aksesoris|isi\s+box)\b/.test(text);
    const asksDetails = /\bdetail\b/.test(text);
    const asksSpecs = /\bspesifikasi\b/.test(text);

    return (
      (asksPrice && answered.price) ||
      (asksStock && answered.stock) ||
      (asksCondition && answered.condition) ||
      (asksCompleteness && answered.completeness) ||
      ((asksDetails || asksSpecs) && answered.details)
    );
  });
}

function selectFreshActions(
  actions = [],
  recentActions = [],
  limit = 3,
  userQuestion = "",
) {
  const pool = uniqueActions(actions);
  const nonRepeatedGoal = pool.filter(
    (action) => !repeatsCompletedGoal(userQuestion, action),
  );
  const eligible =
    nonRepeatedGoal.length >= Math.min(3, pool.length)
      ? nonRepeatedGoal
      : pool;
  const lastSeen = new Map();
  recentActions.forEach((action, index) => {
    lastSeen.set(String(action || "").trim().toLowerCase(), index);
  });
  const scored = eligible
    .map((action, index) => ({
      action,
      index,
      score: nextActionScore(userQuestion, action),
      lastSeen: lastSeen.get(action.toLowerCase()),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const ordered = [
    ...scored.filter((item) => item.lastSeen === undefined),
    ...scored
      .filter((item) => item.lastSeen !== undefined)
      .sort(
        (left, right) =>
          left.lastSeen - right.lastSeen ||
          right.score - left.score ||
          left.index - right.index,
      ),
  ].map(({ action }) => action);

  return ordered.slice(0, limit);
}

function stripTrailingOptionalInvitation(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";

  const matches = [...text.matchAll(/\bkalau (?:kamu )?(?:mau|perlu)\b/gi)];
  const lastMatch = matches.at(-1);
  if (!lastMatch || lastMatch.index === 0) return text;

  const trailingText = text.slice(lastMatch.index);
  if (trailingText.length > 400) return text;

  return text.slice(0, lastMatch.index).trim();
}

export function isRequiredClarificationPayload(payload = {}) {
  if (["options", "suggestions"].includes(String(payload?.type || ""))) {
    return true;
  }

  const text = [payload?.message, payload?.intro, payload?.closing]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\buntuk (?:melanjutkan|mengecek|melacak|memproses)\b/.test(text) ||
    /\bsilakan pilih\b/.test(text) ||
    /\b(?:sebutkan|tulis|masukkan|kirim)\s+(?:nama\s+)?(?:kota|kabupaten|kecamatan|produk|nomor\s+(?:pesanan|order|resi)|order id|email|nomor telepon|budget|anggaran)\b/.test(
      text,
    ) ||
    /\baku (?:masih )?(?:butuh|perlu)\b/.test(text)
  );
}

export function isOptionalFollowUpType(type = "") {
  return String(type || "").startsWith("offer_");
}

export function buildBudgetOptions() {
  return [
    "Di bawah 500 ribu",
    "500 ribu - 1 juta",
    "1 juta - 2 juta",
    "Di atas 2 juta",
  ].map((value) => ({ label: value, value }));
}

export function buildControlledActions(
  intent,
  payload = {},
  { recentActions = [], limit = 3, userQuestion = "" } = {},
) {
  const contextualActions = CONTEXTUAL_ACTIONS[payload._actionContext];
  if (contextualActions) {
    return selectFreshActions(
      contextualActions,
      recentActions,
      limit,
      userQuestion,
    );
  }

  const normalizedIntent = String(intent || "");
  if (!CONTROLLED_ACTION_INTENTS.has(normalizedIntent)) return [];

  if (!PRODUCT_ACTION_INTENTS.has(normalizedIntent)) {
    return selectFreshActions(
      INTENT_ACTIONS[normalizedIntent],
      recentActions,
      limit,
      userQuestion,
    );
  }

  const names = (Array.isArray(payload.products) ? payload.products : [])
    .map((product) => cleanProductName(product?.name))
    .filter(Boolean);
  const firstName = names[0] || "";
  const secondName = names[1] || "";
  const withoutVisibleFacts = (actions) =>
    actions.filter(
      (action) => !asksAlreadyAnsweredProductFact(action, payload),
    );

  if (normalizedIntent === "compare" && names.length >= 2) {
    return selectFreshActions(
      withoutVisibleFacts([
        `Dari ${names[0]} dan ${names[1]}, mana yang paling worth it?`,
        `Bandingkan ${names[0]} dengan ${names[1]} dari sisi harga`,
        `Bandingkan ${names[0]} dengan ${names[1]} dari sisi stok`,
        `Bandingkan kondisi ${names[0]} dengan ${names[1]}`,
        `Bandingkan kelengkapan ${names[0]} dengan ${names[1]}`,
        `Bandingkan ${names[0]} dengan ${names[1]} untuk pajangan`,
        `Bandingkan ${names[0]} dengan ${names[1]} untuk koleksi`,
        `Bandingkan ${names[0]} dengan ${names[1]} untuk hadiah`,
        `Bandingkan ${names[0]} dengan ${names[1]} untuk kolektor pemula`,
        `Apa kelebihan dan kekurangan ${names[0]} dibanding ${names[1]}?`,
        `Carikan alternatif yang lebih murah dari ${names[0]} dan ${names[1]}`,
        `Tampilkan detail ${names[0]}`,
        `Tampilkan detail ${names[1]}`,
        `Cek harga ${names[0]}`,
        `Cek stok ${names[1]}`,
      ]),
      recentActions,
      limit,
      userQuestion,
    );
  }

  if (!names.length) {
    return selectFreshActions(
      INTENT_ACTIONS[normalizedIntent],
      recentActions,
      limit,
      userQuestion,
    );
  }

  if (normalizedIntent === "image_product_search") {
    const imageActions = [
      `Tampilkan detail ${firstName}`,
      `Cek stok ${firstName}`,
      `Cek harga ${firstName}`,
      `Kenapa ${firstName} paling mirip dengan foto?`,
      `Apa kelebihan dan kekurangan ${firstName}?`,
      `Apakah ${firstName} cocok untuk pajangan?`,
      `Apakah ${firstName} layak untuk koleksi?`,
      `Apakah ${firstName} cocok dijadikan hadiah?`,
      `Carikan produk serupa yang lebih murah dari ${firstName}`,
      `Carikan alternatif ready stock dari ${firstName}`,
      `Bagaimana cara membeli ${firstName}?`,
    ];
    if (secondName) {
      imageActions.push(`Bandingkan ${firstName} dengan ${secondName}`);
    }
    return selectFreshActions(
      withoutVisibleFacts(imageActions),
      recentActions,
      limit,
      userQuestion,
    );
  }

  if (normalizedIntent === "product_detail") {
    return selectFreshActions(
      withoutVisibleFacts([
        `Cek stok ${firstName}`,
        `Cek harga ${firstName}`,
        `Bandingkan ${firstName} dengan produk lain`,
        `Apakah ${firstName} cocok untuk pajangan?`,
        `Carikan alternatif yang lebih worth it dari ${firstName}`,
        `Apa kelebihan dan kekurangan ${firstName} sebelum dibeli?`,
        `Apakah ${firstName} layak untuk koleksi?`,
        `Apakah ${firstName} cocok untuk kolektor pemula?`,
        `Apakah ${firstName} cocok dijadikan hadiah?`,
        `Apa yang perlu diperhatikan sebelum membeli ${firstName}?`,
        `Carikan produk serupa yang lebih murah dari ${firstName}`,
        `Cek ongkir ${firstName} ke kota tujuan`,
        `Bagaimana cara membeli ${firstName}?`,
        `Tampilkan kondisi ${firstName}`,
        `Jelaskan kelengkapan ${firstName}`,
        `Tampilkan spesifikasi ${firstName}`,
      ]),
      recentActions,
      limit,
      userQuestion,
    );
  }

  if (names.length === 1) {
    const actions = [
      `Tampilkan kondisi ${firstName}`,
      `Tampilkan detail ${firstName}`,
      `Jelaskan kelengkapan ${firstName}`,
      `Tampilkan spesifikasi ${firstName}`,
      `Apakah ${firstName} cocok untuk pajangan?`,
      `Bandingkan ${firstName} dengan produk lain`,
      `Carikan alternatif yang lebih worth it dari ${firstName}`,
      `Apa kelebihan dan kekurangan ${firstName} sebelum dibeli?`,
      `Apakah ${firstName} layak untuk koleksi?`,
      `Apakah ${firstName} cocok untuk kolektor pemula?`,
      `Apakah ${firstName} cocok dijadikan hadiah?`,
      `Apa yang perlu diperhatikan sebelum membeli ${firstName}?`,
      `Carikan produk serupa yang lebih murah dari ${firstName}`,
      `Cek ongkir ${firstName} ke kota tujuan`,
      `Bagaimana cara membeli ${firstName}?`,
      `Apakah pengiriman ${firstName} memakai asuransi?`,
      `Cek stok ${firstName}`,
      `Cek harga ${firstName}`,
    ];
    return selectFreshActions(
      withoutVisibleFacts(actions),
      recentActions,
      limit,
      userQuestion,
    );
  }

    return selectFreshActions(
      withoutVisibleFacts([
      "Urutkan hasil sebelumnya dari harga termurah",
      "Tampilkan produk yang ready stock dari hasil sebelumnya",
      `Tampilkan detail ${firstName}`,
      `Tampilkan kondisi ${firstName}`,
      `Jelaskan kelengkapan ${firstName}`,
      `Tampilkan spesifikasi ${secondName}`,
      `Dari ${names.length} produk sebelumnya, mana yang paling worth it?`,
      `Bandingkan ${firstName} dengan ${secondName}`,
      `Bandingkan kondisi ${firstName} dengan ${secondName}`,
      `Dari ${names.length} produk sebelumnya, mana yang paling cocok untuk pajangan?`,
      `Dari ${names.length} produk sebelumnya, mana yang paling cocok untuk hadiah?`,
      `Dari ${names.length} produk sebelumnya, mana yang cocok untuk kolektor pemula?`,
      `Dari ${names.length} produk sebelumnya, mana yang kondisinya paling menarik?`,
      `Carikan alternatif lebih murah dari ${firstName}`,
      `Carikan produk serupa yang ready stock dari ${secondName}`,
      "Cek ongkir produk pilihan ke kota tujuan",
      "Bagaimana cara membeli salah satu produk sebelumnya?",
      "Urutkan hasil sebelumnya dari harga termahal",
      "Tampilkan produk promo dari hasil sebelumnya",
      `Tampilkan detail ${secondName}`,
      `Cek harga ${firstName}`,
      `Cek stok ${secondName}`,
    ]),
    recentActions,
    limit,
    userQuestion,
  );
}

export function applyControlledFollowUpPolicy(
  payload,
  {
    intent = "general",
    recentActions = [],
    limit = 3,
    userQuestion = "",
  } = {},
) {
  if (!payload || typeof payload !== "object") return payload;

  const out = { ...payload };
  const optionalOffer = isOptionalFollowUpType(out._followUpType);
  const optionalInvitation =
    typeof out.closing === "string" &&
    OPTIONAL_INVITATION_PATTERN.test(out.closing);

  if (optionalOffer || optionalInvitation) {
    delete out.closing;
  }

  if (typeof out.message === "string") {
    out.message = stripTrailingOptionalInvitation(out.message);
  }

  if (optionalOffer) {
    delete out._followUpType;
    delete out._followUpMeta;
  }

  const suppressActions =
    Boolean(out.admin_handoff) ||
    (!out._actionContext && isRequiredClarificationPayload(out));
  if (suppressActions) {
    delete out.actions;
    delete out.suggestions;
  }
  const actions = suppressActions
    ? []
    : buildControlledActions(intent, out, {
        recentActions,
        limit,
        userQuestion,
      });
  if (actions.length) out.actions = actions;
  delete out._actionContext;

  return out;
}

function requiredInputMessage(pending = null, lastBotQuestionType = "") {
  if (pending?.type === "transaction_status") {
    return "Untuk melanjutkan, tulis Order ID atau nomor pesananmu.";
  }
  if (pending?.type === "shipment_tracking") {
    return "Untuk melanjutkan pelacakan, tulis nomor resinya.";
  }
  if (pending?.type === "shipping_quote") {
    const needsDistrict = String(pending?.stage || "").includes("district");
    return needsDistrict
      ? "Untuk melanjutkan cek ongkir, tulis nama kecamatannya."
      : "Untuk melanjutkan cek ongkir, tulis nama kota atau kabupaten tujuan.";
  }
  if (pending?.type === "compare") {
    return "Untuk melanjutkan perbandingan, tulis nama produk yang ingin dibandingkan.";
  }

  const questionType = String(lastBotQuestionType || "");
  if (questionType.includes("budget")) {
    return "Tulis batas budgetnya, misalnya di bawah 1 juta.";
  }
  if (questionType.includes("district")) {
    return "Tulis nama kecamatan tujuan agar cek ongkir bisa dilanjutkan.";
  }
  if (questionType.includes("city")) {
    return "Tulis nama kota atau kabupaten tujuan agar cek ongkir bisa dilanjutkan.";
  }
  if (questionType.includes("product")) {
    return "Tulis nama produknya agar aku bisa melanjutkan.";
  }

  return "";
}

export function buildStandaloneAffirmationResponse({
  pending = null,
  lastBotQuestionType = "",
  lastIntent = "general",
  lastProducts = [],
  recentActions = [],
} = {}) {
  const requiredMessage = requiredInputMessage(
    pending,
    lastBotQuestionType,
  );
  if (
    requiredMessage &&
    (pending || !isOptionalFollowUpType(lastBotQuestionType))
  ) {
    return {
      type: "text",
      message: requiredMessage,
      intent: lastIntent || "general",
    };
  }

  const suggestions = buildControlledActions(
    lastIntent,
    {
      products: lastProducts,
    },
    { recentActions },
  );

  return {
    type: "suggestions",
    message:
      "Aku belum tahu kata itu merujuk ke tindakan yang mana. Pilih salah satu supaya jawabannya tetap tepat.",
    suggestions: suggestions.length
      ? suggestions
      : [
          "Cari produk robot yang ready stock",
          "Tampilkan produk dari harga termurah",
          "Cek ongkir ke kota tujuan",
        ],
    intent: lastIntent || "general",
  };
}
