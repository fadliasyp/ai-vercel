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

const CONTROLLED_ACTION_INTENTS = new Set([
  "product_discovery",
  "recommendation",
  "product_detail",
  "price_promo",
  "stock_availability",
  "compare",
]);

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

function selectFreshActions(actions = [], recentActions = [], limit = 3) {
  const pool = uniqueActions(actions);
  const recent = new Set(
    uniqueActions(recentActions).map((action) => action.toLowerCase()),
  );
  const fresh = pool.filter((action) => !recent.has(action.toLowerCase()));
  const repeated = pool.filter((action) => recent.has(action.toLowerCase()));

  return [...fresh, ...repeated].slice(0, limit);
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
  { recentActions = [] } = {},
) {
  if (!CONTROLLED_ACTION_INTENTS.has(String(intent || ""))) return [];

  const names = (Array.isArray(payload.products) ? payload.products : [])
    .map((product) => cleanProductName(product?.name))
    .filter(Boolean);
  const firstName = names[0] || "";
  const secondName = names[1] || "";

  if (intent === "compare" && names.length >= 2) {
    return selectFreshActions(
      [
        `Dari ${names[0]} dan ${names[1]}, mana yang paling worth it?`,
        `Bandingkan ${names[0]} dengan ${names[1]} dari sisi harga`,
        `Bandingkan ${names[0]} dengan ${names[1]} dari sisi stok`,
        `Tampilkan detail ${names[0]}`,
        `Tampilkan detail ${names[1]}`,
        `Cek harga ${names[0]}`,
        `Cek stok ${names[1]}`,
      ],
      recentActions,
    );
  }

  if (!names.length) return [];

  if (intent === "product_detail") {
    return selectFreshActions(
      [
        `Cek stok ${firstName}`,
        `Cek harga ${firstName}`,
        `Bandingkan ${firstName} dengan produk lain`,
        `Apakah ${firstName} cocok untuk pajangan?`,
        `Tampilkan kondisi ${firstName}`,
        `Tampilkan spesifikasi ${firstName}`,
      ],
      recentActions,
    );
  }

  if (names.length === 1) {
    const actions = [
      `Tampilkan detail ${firstName}`,
      `Cek stok ${firstName}`,
      `Cek harga ${firstName}`,
      `Tampilkan kondisi ${firstName}`,
      `Tampilkan spesifikasi ${firstName}`,
      `Apakah ${firstName} cocok untuk pajangan?`,
      `Bandingkan ${firstName} dengan produk lain`,
    ];
    return selectFreshActions(actions, recentActions);
  }

  return selectFreshActions(
    [
      "Urutkan hasil sebelumnya dari harga termurah",
      "Tampilkan produk yang ready stock dari hasil sebelumnya",
      `Tampilkan detail ${firstName}`,
      "Urutkan hasil sebelumnya dari harga termahal",
      "Tampilkan produk promo dari hasil sebelumnya",
      `Tampilkan detail ${secondName}`,
      `Cek harga ${firstName}`,
      `Cek stok ${secondName}`,
      `Bandingkan ${firstName} dengan ${secondName}`,
    ],
    recentActions,
  );
}

export function applyControlledFollowUpPolicy(
  payload,
  { intent = "general", recentActions = [] } = {},
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

  const actions = buildControlledActions(intent, out, { recentActions });
  if (actions.length) out.actions = actions;

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
