import { stripRobotJadulStoreName } from "./utils.js";
import {
  isLikelyTypoMatch,
  normalizeIndonesianCommerceText,
} from "./textNormalization.js";
import { buildSuggestedActionMetadata } from "./followUpClosings.js";
import { detectRequestedAnswerFacets } from "./answerCoverage.js";

const CLARIFICATION_FACET_LABELS = Object.freeze({
  material: "bahan atau material",
  product_condition: "kondisi produk",
  completeness: "kelengkapan atau part",
  stock: "ketersediaan dan sisa stok",
  promo: "promo atau diskon",
  insurance: "asuransi pengiriman",
  packing: "packing pengiriman",
  shipping_estimate: "estimasi waktu pengiriman",
  same_day: "kemungkinan dikirim hari ini",
  shipping_origin: "asal pengiriman",
  shipping_coverage: "jangkauan pengiriman",
  store_location: "lokasi toko",
  store_hours: "jam operasional toko",
  cod: "pembayaran COD",
  payment_methods: "metode pembayaran",
  return_policy: "syarat retur",
  refund: "proses refund",
  return_evidence: "bukti untuk retur",
  return_status: "status retur",
  how_to_buy: "cara pembelian",
  transaction_status: "status transaksi",
  shipment_tracking: "pelacakan paket",
  order_processing: "waktu pemrosesan pesanan",
  recommendation: "rekomendasi produk",
  budget: "batas budget",
});

const PRODUCT_SEARCH_STOP_WORDS = new Set([
  "ada",
  "apa",
  "aja",
  "saja",
  "ga",
  "gak",
  "hai",
  "halo",
  "hallo",
  "hello",
  "hi",
  "nggak",
  "engga",
  "ngga",
  "apakah",
  "saya",
  "aku",
  "gue",
  "kami",
  "kita",
  "kamu",
  "anda",
  "di",
  "ini",
  "itu",
  "toko",
  "tokonya",
  "ditoko",
  "ditokonya",
  "jadul",
  "lu",
  "lo",
  "luy",
  "bro",
  "bisa",
  "selalu",
  "semua",
  "semuanya",
  "setiap",
  "yg",
  "disini",
  "sini",
  "lagi",
  "bingung",
  "gimana",
  "bagaimana",
  "mana",
  "manakah",
  "pilih",
  "pilihkan",
  "pilihin",
  "menurut",
  "menurutmu",
  "kiranya",
  "kira2",
  "punya",
  "jual",
  "jualan",
  "dijual",
  "menjual",
  "menyediakan",
  "sedia",
  "tawar",
  "ditawar",
  "menawar",
  "nego",
  "negosiasi",
  "fix",
  "pas",
  "sih",
  "deh",
  "lah",
  "kan",
  "kok",
  "enaknya",
  "nyari",
  "cari",
  "carikan",
  "jelaskan",
  "tampilkan",
  "lihat",
  "cara",
  "membeli",
  "sebelum",
  "perlu",
  "diperhatikan",
  "kelebihan",
  "kekurangan",
  "pertimbangan",
  "dijadikan",
  "mau",
  "tanya",
  "tolong",
  "kira",
  "berapa",
  "dimana",
  "kalau",
  "karena",
  "padahal",
  "sekarang",
  "sedang",
  "masih",
  "sudah",
  "belum",
  "dapat",
  "tersedia",
  "buat",
  "untuk",
  "yang",
  "atau",
  "dan",
  "juga",
  "terus",
  "trus",
  "lalu",
  "kemudian",
  "beli",
  "dibeli",
  "website",
  "kategori",
  "produk",
  "produknya",
  "barang",
  "barangnya",
  "robot",
  "robotnya",
  "item",
  "itemnya",
  "mainan",
  "mainannya",
  "figur",
  "figure",
  "kah",
  "ya",
  "dong",
  "nih",
  "kak",
  "min",
  "harga",
  "harganya",
  "stok",
  "stoknya",
  "stock",
  "stocknya",
  "ready",
  "readynya",
  "sisa",
  "pcs",
  "unit",
  "detail",
  "detailnya",
  "kondisi",
  "kondisinya",
  "kelengkapan",
  "kelengkapannya",
  "lengkap",
  "bagian",
  "hilang",
  "rusak",
  "rusaknya",
  "patah",
  "retak",
  "lecet",
  "baret",
  "cacat",
  "engsel",
  "spesifikasi",
  "cek",
  "promo",
  "promonya",
  "diskon",
  "diskonnya",
  "ongkir",
  "kirim",
  "dikirim",
  "pengiriman",
  "bayar",
  "dibayar",
  "pembayaran",
  "asuransi",
  "packing",
  "kayu",
  "aman",
  "langsung",
  "hari",
  "same",
  "day",
  "po",
  "preorder",
  "rekomendasi",
  "rekomen",
  "terbaik",
  "bagus",
  "populer",
  "paling",
  "koleksi",
  "kolektor",
  "display",
  "mirip",
  "serupa",
  "alternatif",
  "opsi",
  "pilihan",
  "lebih",
  "worth",
  "value",
  "money",
  "layak",
  "dari",
  "sebelumnya",
  "tadi",
  "tersebut",
  "dengan",
  "cocok",
  "pajangan",
  "anak",
  "hadiah",
  "kado",
  "main",
  "dimainkan",
  "pemula",
  "premium",
  "budget",
  "murah",
  "mahal",
  "dibawah",
  "bawah",
  "diatas",
  "atas",
  "juta",
  "jutaan",
  "ribu",
]);

function normalizeSearchText(value = "") {
  return normalizeIndonesianCommerceText(stripRobotJadulStoreName(value))
    .toLowerCase()
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CATALOG_AVAILABILITY_PREDICATE_PATTERN =
  /^(?:jua+l(?:an)?|dijua+l|menjua+l|menyediakan|sedia|tersedia|punya|ada)$/;
const COMMERCE_PREDICATE_PATTERN =
  /^(?:jua+l(?:an)?|dijua+l|menjua+l|menyediakan|sedia|tersedia|punya|ada|cari(?:kan)?|nyari)$/;

function isConversationalSearchToken(token = "") {
  return (
    /^apa+$/.test(token) ||
    /^jua+l$/.test(token) ||
    /^juga+$/.test(token) ||
    /^eng+a+$/.test(token) ||
    /^ng+a+k?$/.test(token) ||
    /^ga+k+$/.test(token)
  );
}

function meaningfulSearchTokens(
  value = "",
  {
    allowSingleLetterCodes = false,
    allowNumericModelCodes = false,
  } = {},
) {
  const tokens = String(value || "")
    .split(/\s+/)
    .map((token) => token.trim());

  return tokens
    .filter(
      (token, index) => {
        const previous = tokens[index - 1] || "";
        const isNumeric = /^\d+$/.test(token);
        const isModelNumber =
          allowNumericModelCodes &&
          isNumeric &&
          /[a-z]/i.test(previous) &&
          !PRODUCT_SEARCH_STOP_WORDS.has(previous) &&
          !isConversationalSearchToken(previous);

        return (
          (token.length >= 2 ||
            (allowSingleLetterCodes && /^[a-z]$/.test(token))) &&
          (!isNumeric || isModelNumber) &&
          !COMMERCE_PREDICATE_PATTERN.test(token) &&
          !isConversationalSearchToken(token) &&
          !PRODUCT_SEARCH_STOP_WORDS.has(token)
        );
      },
    );
}

function extractCommerceObjectTokens(query = "") {
  const normalized = normalizeSearchText(query);
  const words = normalized.split(/\s+/).filter(Boolean);
  const predicateIndex = words.findIndex((word) =>
    COMMERCE_PREDICATE_PATTERN.test(word),
  );

  if (predicateIndex >= 0) {
    const objectAfterPredicate = meaningfulSearchTokens(
      words.slice(predicateIndex + 1).join(" "),
      {
        allowSingleLetterCodes: true,
        allowNumericModelCodes: true,
      },
    );
    if (objectAfterPredicate.length) return objectAfterPredicate;
  }

  // Some Indonesian questions put the object first: "Voltes V ada tidak?".
  return meaningfulSearchTokens(normalized, {
    allowSingleLetterCodes: true,
    allowNumericModelCodes: true,
  });
}

export function extractProductSearchTokens(query = "") {
  return meaningfulSearchTokens(normalizeSearchText(query), {
    allowSingleLetterCodes: true,
    allowNumericModelCodes: true,
  });
}

export function hasSpecificProductSearchTerms(query = "") {
  return extractProductSearchTokens(query).length > 0;
}

export function looksLikeCatalogAvailabilityQuestion(query = "") {
  return normalizeSearchText(query)
    .split(/\s+/)
    .some((token) => CATALOG_AVAILABILITY_PREDICATE_PATTERN.test(token));
}

export function looksLikeSpecificCatalogAvailabilityQuestion(query = "") {
  const normalized = normalizeSearchText(query);
  const asksProductDetail =
    /\b(?:kondisi(?:nya)?|kelengkapan(?:nya)?|detail(?:nya)?|spesifikasi(?:nya)?|cacat|rusak|patah|retak|lecet|baret|engsel|bagian\s+yang\s+(?:hilang|rusak|patah))\b/i.test(
      normalized,
    );
  const asksRecommendation =
    /\b(?:rekomendasi|rekomen|alternatif|opsi|pilihan|worth\s+it|value\s+for\s+money|paling\s+(?:bagus|baik|cocok))\b/i.test(
      normalized,
    );

  return (
    looksLikeCatalogAvailabilityQuestion(query) &&
    hasSpecificProductSearchTerms(query) &&
    !asksProductDetail &&
    !asksRecommendation &&
    !/\b(?:stok|stock|ready|sisa|habis|po|pre\s*order)\b/i.test(normalized)
  );
}

export function extractRequestedCatalogTerm(query = "", limit = 5) {
  return extractCommerceObjectTokens(query).slice(0, limit).join(" ");
}

function longestCatalogNameRun(queryTokens = [], productName = "") {
  const nameTokens = normalizeSearchText(productName).split(/\s+/).filter(Boolean);
  let longest = 0;

  const matches = (queryToken, nameToken) =>
    queryToken === nameToken ||
    isLikelyTypoMatch(queryToken, nameToken) ||
    (Math.min(queryToken.length, nameToken.length) >= 4 &&
      (queryToken.startsWith(nameToken) || nameToken.startsWith(queryToken)));

  for (let queryIndex = 0; queryIndex < queryTokens.length; queryIndex += 1) {
    for (let nameIndex = 0; nameIndex < nameTokens.length; nameIndex += 1) {
      let run = 0;
      while (
        queryIndex + run < queryTokens.length &&
        nameIndex + run < nameTokens.length &&
        matches(queryTokens[queryIndex + run], nameTokens[nameIndex + run])
      ) {
        run += 1;
      }
      longest = Math.max(longest, run);
    }
  }

  return longest;
}

function scoreProduct(queryTokens, product = {}) {
  const name = normalizeSearchText(product.name);
  const category = normalizeSearchText(product.category);
  const description = normalizeSearchText(product.description);
  const phrase = queryTokens.join(" ");

  let score = 0;
  let matchedTokens = 0;
  const longestNameTokenRun = longestCatalogNameRun(queryTokens, product.name);

  const fuzzyMatch = (token, text) =>
    text
      .split(/\s+/)
      .filter(Boolean)
      .some((candidate) => isLikelyTypoMatch(token, candidate));

  if (phrase.length >= 3 && name.includes(phrase)) {
    score += 12;
  }

  for (const token of queryTokens) {
    if (name.includes(token)) {
      score += 5;
      matchedTokens += 1;
    } else if (fuzzyMatch(token, name)) {
      score += 4;
      matchedTokens += 1;
    } else if (category.includes(token)) {
      score += 3;
      matchedTokens += 1;
    } else if (fuzzyMatch(token, category)) {
      score += 2;
      matchedTokens += 1;
    } else if (description.includes(token)) {
      score += 1;
      matchedTokens += 1;
    }
  }

  const minimumMatches =
    queryTokens.length <= 2
      ? 1
      : Math.max(2, Math.ceil(queryTokens.length * 0.5));

  if (matchedTokens < minimumMatches && longestNameTokenRun < 2) {
    return { score: 0, matchedTokens, longestNameTokenRun };
  }

  // Stock is only a tie-breaker after a real catalog text match.
  if (product.stock === "instock") score += 0.5;

  return {
    score,
    matchedTokens,
    longestNameTokenRun,
  };
}

export function searchProductsForDiscovery(
  query = "",
  products = [],
  limit = 6,
) {
  if (!Array.isArray(products) || !products.length) return [];

  const queryTokens = extractProductSearchTokens(query);
  if (!queryTokens.length) return [];

  return products
    .map((product) => {
      const match = scoreProduct(queryTokens, product);
      return {
        ...product,
        _discoveryScore: match.score,
        _matchedSearchTokens: match.matchedTokens,
        _longestNameTokenRun: match.longestNameTokenRun,
        _querySearchTokenCount: queryTokens.length,
        _searchCoverage: match.matchedTokens / queryTokens.length,
      };
    })
    .filter((product) => product._discoveryScore > 0)
    .sort((left, right) => {
      if (right._discoveryScore !== left._discoveryScore) {
        return right._discoveryScore - left._discoveryScore;
      }
      return (
        Number(right.stock === "instock") -
        Number(left.stock === "instock")
      );
    })
    .slice(0, Math.max(1, Number(limit) || 6));
}

export function findBestSingleProductMatch(query = "", products = []) {
  return searchProductsForDiscovery(query, products, 1)[0] || null;
}

export function assessProductSearchConfidence(
  query = "",
  products = [],
  { preferPromo = false } = {},
) {
  const normalizedQuery = normalizeSearchText(query);
  const exactNameCandidates = (Array.isArray(products) ? products : [])
    .filter((product) => {
      const name = normalizeSearchText(product?.name || "");
      return (
        name.length >= 3 &&
        ` ${normalizedQuery} `.includes(` ${name} `)
      );
    })
    .sort(
      (left, right) =>
        normalizeSearchText(right?.name || "").length -
        normalizeSearchText(left?.name || "").length,
    );

  if (exactNameCandidates.length) {
    return {
      status: "matched",
      confidence: 0.99,
      reason: "exact_catalog_name_mention",
      product: exactNameCandidates[0],
      candidates: exactNameCandidates.slice(0, 3),
      queryTokens: extractProductSearchTokens(query),
    };
  }

  const queryTokens = extractProductSearchTokens(query);
  if (!queryTokens.length) {
    return {
      status: "not_found",
      confidence: 0,
      reason: "no_specific_terms",
      product: null,
      candidates: [],
      queryTokens,
    };
  }

  let candidates = searchProductsForDiscovery(query, products, 6);
  if (preferPromo) {
    const promoCandidates = candidates.filter((product) => product.isPromo);
    if (promoCandidates.length) candidates = promoCandidates;
  }

  const top = candidates[0] || null;
  if (!top) {
    return {
      status: "not_found",
      confidence: 0,
      reason: "no_catalog_match",
      product: null,
      candidates: [],
      queryTokens,
    };
  }

  const hasCatalogPhraseEvidence = top._longestNameTokenRun >= 2;
  if (
    (top._searchCoverage < 1 && !hasCatalogPhraseEvidence) ||
    top._discoveryScore < 4
  ) {
    return {
      status: "not_found",
      confidence: Math.min(0.49, top._searchCoverage || 0),
      reason:
        top._searchCoverage < 1
          ? "partial_query_match"
          : "weak_catalog_evidence",
      product: null,
      candidates: candidates.slice(0, 3),
      queryTokens,
    };
  }

  const second = candidates[1] || null;
  const closeCompetitor =
    second &&
    (second._searchCoverage === 1 || second._longestNameTokenRun >= 2) &&
    top._discoveryScore - second._discoveryScore < 2;

  if (closeCompetitor) {
    return {
      status: "ambiguous",
      confidence: 0.6,
      reason: "multiple_close_matches",
      product: null,
      candidates: candidates.slice(0, 3),
      queryTokens,
    };
  }

  return {
    status: "matched",
    confidence: top._discoveryScore >= 10 ? 0.95 : 0.8,
    reason:
      top._searchCoverage < 1
        ? "catalog_name_phrase_match"
        : "strong_catalog_match",
    product: top,
    candidates: candidates.slice(0, 3),
    queryTokens,
  };
}

function joinIndonesianList(items = []) {
  if (items.length < 2) return items[0] || "";
  if (items.length === 2) return `${items[0]} dan ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, dan ${items.at(-1)}`;
}

function clarificationFacetLabel(facet, question = "", destination = "") {
  const text = String(question || "").toLowerCase();

  if (facet === "dimensions") {
    const dimensions = ["tinggi", "panjang", "lebar"].filter((name) =>
      new RegExp(`\\b${name}(?:nya)?\\b`, "i").test(text),
    );
    return dimensions.length
      ? `${joinIndonesianList(dimensions)} produk`
      : "ukuran atau dimensi produk";
  }
  if (facet === "price") {
    const currency = text.match(/\b(?:usd|idr|sgd|myr|jpy|eur|aud)\b/i)?.[0];
    if (currency && /\btotal\b/i.test(text)) {
      return `harga dan total dalam ${currency.toUpperCase()}`;
    }
    return currency ? `harga dalam ${currency.toUpperCase()}` : "harga produk";
  }
  if (facet === "shipping_quote") {
    return destination ? `ongkir ke ${destination}` : "ongkir pengiriman";
  }

  return CLARIFICATION_FACET_LABELS[facet] || "";
}

export function buildProductSearchClarification(
  decision = {},
  { question = "", facets = [], destination = "" } = {},
) {
  const names = (decision.candidates || [])
    .map((product) => String(product?.name || "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (decision.status !== "ambiguous" || !names.length) return "";

  const requestedDetails = [
    ...new Set(
      (facets.length ? facets : detectRequestedAnswerFacets(question))
        .map((facet) => clarificationFacetLabel(facet, question, destination))
        .filter(Boolean),
    ),
  ];
  const continuation = requestedDetails.length
    ? ` Setelah itu, aku akan lanjut menjawab ${joinIndonesianList(requestedDetails)} sesuai produk pilihanmu.`
    : " Setelah itu, aku akan melanjutkan pertanyaanmu sesuai produk pilihanmu.";

  return (
    "Aku menemukan beberapa produk yang cocok. Pilih salah satu produk di bawah atau ketik nama produk yang lebih lengkap ya." +
    continuation
  );
}

export function buildProductSearchOptions(decision = {}, intent = "") {
  if (decision.status !== "ambiguous") return [];

  const command =
    {
      stock_availability: "Cek stok",
      price_promo: "Cek harga",
      product_detail: "Tampilkan detail",
    }[intent] || "Cari produk";

  return (decision.candidates || [])
    .map((product) => ({
      product,
      name: String(product?.name || "").trim(),
    }))
    .filter(({ name }) => Boolean(name))
    .filter(
      ({ name }, index, items) =>
        items.findIndex((item) => item.name === name) === index,
    )
    .slice(0, 3)
    .map(({ product, name }) => ({
      ...buildSuggestedActionMetadata({
        label: name,
        value: `${command} ${name}`,
      }),
      product_id: product?.id ?? null,
      product_name: name,
    }));
}

export function looksLikeCurrentProductReference(query = "") {
  const normalized = normalizeSearchText(query);

  return (
    /\b(?:produk|barang|robot|item|mainan|figur|figure)(?:nya|\s+(?:yang\s+)?(?:ini|tersebut))\b/.test(
      normalized,
    ) ||
    /\b(?:di\s+)?halaman\s+ini\b/.test(normalized) ||
    /\b(?:yang\s+)?(?:saya|aku)\s+(?:lihat|buka)\b/.test(normalized) ||
    /\b(?:stok|stock|harga|promo|diskon|kondisi|detail|ukuran|berat|kelengkapan)nya\b/.test(
      normalized,
    )
  );
}

export function looksLikeCurrentProductDetailQuestion(query = "") {
  const normalized = normalizeSearchText(query);
  const asksCondition =
    /\b(?:kondisi|condition|junk|minus|cacat|rusak|patah|retak|lecet|baret|engsel|kelengkapan|aksesori|spesifikasi|detail|ukuran|berat)\b/.test(
      normalized,
    );
  const isPostPurchaseComplaint =
    /\b(?:retur|refund|komplain|pesanan|paket|diterima|datang|nyampe|salah\s+kirim|uang\s+kembali)\b/.test(
      normalized,
    );

  return (
    looksLikeCurrentProductReference(query) &&
    asksCondition &&
    !isPostPurchaseComplaint
  );
}

function normalizeProductPath(value = "") {
  try {
    const parsed = new URL(String(value || ""), "https://invalid.local");
    return decodeURIComponent(parsed.pathname)
      .toLowerCase()
      .replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function findVerifiedPageProduct(pageContext, products = []) {
  if (!pageContext || !Array.isArray(products) || !products.length) return null;

  const productId = Number(pageContext.productId);
  if (Number.isSafeInteger(productId) && productId > 0) {
    const idMatch = products.find((product) => Number(product?.id) === productId);
    if (idMatch) return idMatch;
  }

  const requestedPath = normalizeProductPath(
    String(pageContext.url || "").slice(0, 1000),
  );
  if (requestedPath) {
    const urlMatch = products.find(
      (product) => normalizeProductPath(product?.link) === requestedPath,
    );
    if (urlMatch) return urlMatch;
  }

  const requestedName = normalizeSearchText(
    String(pageContext.productName || "").slice(0, 240),
  );
  if (!requestedName) return null;

  return (
    products.find(
      (product) => normalizeSearchText(product?.name) === requestedName,
    ) || null
  );
}

export function findBestProductForCompoundRequest(query = "", products = []) {
  const matches = searchProductsForDiscovery(query, products, 6);
  const asksPromo = /\b(?:promo(?:nya)?|diskon(?:nya)?)\b/i.test(query);

  return (asksPromo ? matches.find((product) => product.isPromo) : null) ||
    matches[0] ||
    null;
}
