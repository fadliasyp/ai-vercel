// ponytail: catalog-known aliases; replace with WooCommerce fields when era/franchise metadata exists.
const FRANCHISES = [
  { id: "mazinger", label: "Mazinger", decade: 1970, pattern: /\b(?:mazinger|energer|aphrodai)\b/i },
  { id: "getter-robo", label: "Getter Robo", decade: 1970, pattern: /\bgetter(?:\s+robo|\s+dragon)?\b/i },
  { id: "grendizer", label: "Grendizer", decade: 1970, pattern: /\bgrendizer\b/i },
  { id: "gaiking", label: "Gaiking", decade: 1970, pattern: /\bgaiking\b/i },
  { id: "combattler-v", label: "Combattler V", decade: 1970, pattern: /\bcombatt?ler\s*v\b/i },
  { id: "voltes-v", label: "Voltes V", decade: 1970, pattern: /\bvoltes\s*v\b/i },
  { id: "daimos", label: "Daimos", decade: 1970, pattern: /\bdaimos\b/i },
  { id: "ideon", label: "Ideon", decade: 1980, pattern: /\bideon\b/i },
  { id: "godmars", label: "Godmars", decade: 1980, pattern: /\bgod\s*mar[sz]\b|\bgodmars\b/i },
  { id: "voltron", label: "Golion/Voltron", decade: 1980, pattern: /\b(?:golion|voltron)\b/i },
  { id: "goggle-v", label: "Goggle V", decade: 1980, pattern: /\bgoggle\s*(?:v|five|5)\b/i },
  { id: "gavan", label: "Gavan", decade: 1980, pattern: /\bgavan\b/i },
  { id: "sasuraiger", label: "Sasuraiger", decade: 1980, pattern: /\bsasuraiger\b/i },
  { id: "dynaman", label: "Dynaman", decade: 1980, pattern: /\bdynaman\b/i },
  { id: "transformers", label: "Transformers", decade: 1980, pattern: /\btransformers?\b/i },
  { id: "silverhawks", label: "SilverHawks", decade: 1980, pattern: /\bsilverhawks?\b/i },
  { id: "kamen-rider-black", label: "Kamen Rider Black", decade: 1980, pattern: /\bkamen\s+rider\s+black(?:\s+rx)?\b/i },
  { id: "turboranger", label: "Turboranger", decade: 1980, pattern: /\bturbo\s*ranger\b|\bturboranger\b/i },
  { id: "dancouga", label: "Dancouga", decade: 1980, pattern: /\bdancouga\b/i },
  { id: "macross", label: "Macross", decade: 1980, pattern: /\b(?:macross|valkyrie|vf-?1[ajs])\b/i },
  { id: "goshogun", label: "Goshogun", decade: 1980, pattern: /\bgoshogun\b/i },
  { id: "juspion", label: "Juspion", decade: 1980, pattern: /\bjuspion\b/i },
  { id: "sharivan", label: "Sharivan", decade: 1980, pattern: /\bsharivan\b/i },
  { id: "zyuranger", label: "Zyuranger", decade: 1990, pattern: /\b(?:zyuranger|daizyujin)\b/i },
  { id: "jetman", label: "Jetman", decade: 1990, pattern: /\bjet\s*man\b|\bjetman\b/i },
  { id: "gaogaigar", label: "Gaogaigar", decade: 1990, pattern: /\bgaofi?g?h?gar|\bgaogaigar\b/i },
];

function productText(product = {}) {
  return [
    product.name,
    product.category,
    product.description,
    product.condition,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/<[^>]*>/g, " ");
}

function normalizeDecade(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 100) return number >= 50 ? 1900 + number : 2000 + number;
  return Math.floor(number / 10) * 10;
}

function extractDecades(text = "") {
  const decades = [];
  const source = String(text || "").toLowerCase();

  for (const match of source.matchAll(/\b((?:19|20)?\d{2})(?:\s*-\s*)?an\b/g)) {
    const decade = normalizeDecade(match[1]);
    if (decade != null && !decades.includes(decade)) decades.push(decade);
  }

  for (const match of source.matchAll(/\b(?:tahun|rilis|debut)\s+((?:19|20)\d{2})\b/g)) {
    const decade = normalizeDecade(match[1]);
    if (decade != null && !decades.includes(decade)) decades.push(decade);
  }

  return decades;
}

function largestDimension(product = {}) {
  const dimensions = Object.values(product.dimensions || {})
    .map((value) => Number(String(value || "").replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
  return dimensions.length ? Math.max(...dimensions) : null;
}

function sizeClass(product = {}, text = "") {
  const dimension = largestDimension(product);
  if (dimension != null) {
    if (dimension <= 20) return "compact";
    if (dimension <= 45) return "medium";
    return "large";
  }
  if (/\b(?:mini|gashapon|shf|s\.h\.figuarts)\b/i.test(text)) return "compact";
  if (/\b(?:jumbo|big\s+scale|1\s*meter|60\s*cm)\b/i.test(text)) return "large";
  return null;
}

export function extractRecommendationMetadata(question = "") {
  const text = String(question || "").toLowerCase();
  const decades = extractDecades(text);
  const requestedFranchiseIds = FRANCHISES.filter((item) =>
    item.pattern.test(text),
  ).map((item) => item.id);
  let requestedSizeClass = null;

  if (/\b(?:ukuran\s+)?(?:kecil|mini|compact)\b/.test(text)) {
    requestedSizeClass = "compact";
  } else if (/\bukuran\s+(?:sedang|medium)\b/.test(text)) {
    requestedSizeClass = "medium";
  } else if (/\b(?:ukuran\s+)?(?:besar|jumbo)\b/.test(text)) {
    requestedSizeClass = "large";
  }

  return {
    requestedDecade: decades[0] ?? null,
    requestedFranchiseIds,
    requestedSizeClass,
  };
}

export function deriveRecommendationMetadata(product = {}) {
  const text = productText(product);
  const franchises = FRANCHISES.filter((item) => item.pattern.test(text));
  const decades = [
    ...new Set(
      franchises.length
        ? franchises.map((item) => item.decade)
        : extractDecades(text),
    ),
  ];
  const stockReady = String(product.stock || "").toLowerCase() === "instock";
  const junk = /\b(?:junk|rongsok|part\s+only)\b/i.test(text);

  return {
    franchiseIds: franchises.map((item) => item.id),
    franchiseLabels: franchises.map((item) => item.label),
    decades,
    sizeClass: sizeClass(product, text),
    displaySuitable:
      /\b(?:display|pajangan|figure|diecast|chogokin|gokin|sofubi|vinyl|misb)\b/i.test(
        text,
      ),
    giftSuitable: stockReady && !junk && Number(product.numericPrice || 0) > 0,
  };
}

export function filterByRecommendationMetadata(products = [], needs = {}) {
  return (Array.isArray(products) ? products : []).filter((product) => {
    const metadata = deriveRecommendationMetadata(product);
    if (needs.wantsGift && !metadata.giftSuitable) return false;
    if (needs.wantsDisplay && !metadata.displaySuitable) return false;
    if (
      needs.requestedDecade != null &&
      !metadata.decades.includes(needs.requestedDecade)
    ) {
      return false;
    }
    if (
      Array.isArray(needs.requestedFranchiseIds) &&
      needs.requestedFranchiseIds.length &&
      !needs.requestedFranchiseIds.some((id) => metadata.franchiseIds.includes(id))
    ) {
      return false;
    }
    if (
      needs.requestedSizeClass &&
      metadata.sizeClass !== needs.requestedSizeClass
    ) {
      return false;
    }
    return true;
  });
}

export function selectDiverseBudgetRecommendations(
  rankedProducts = [],
  needs = {},
  limit = 3,
) {
  const ranked = Array.isArray(rankedProducts)
    ? rankedProducts.filter(Boolean)
    : [];
  const maxItems = Math.max(0, Number(limit || 0));
  const min = Number(needs.budgetMin);
  const max = Number(needs.budgetMax);

  if (
    ranked.length <= 1 ||
    maxItems <= 1 ||
    needs.budgetMin == null ||
    needs.budgetMax == null ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min
  ) {
    return ranked.slice(0, maxItems);
  }

  const bucketCount = Math.min(3, maxItems);
  const span = max - min;
  const bucketFor = (product) => {
    const price = Number(
      product?.numericPrice || product?.effectivePrice || 0,
    );
    if (!Number.isFinite(price) || price <= min) return 0;
    if (price >= max) return bucketCount - 1;
    return Math.min(
      bucketCount - 1,
      Math.floor(((price - min) / span) * bucketCount),
    );
  };

  const topScore = Number(ranked[0]?.recommendationScore || 0);
  const qualityCandidates = ranked.filter(
    (product) =>
      Number(product?.recommendationScore || 0) >= topScore - 30,
  );
  const selected = [ranked[0]];
  const selectedSet = new Set(selected);
  const usedBuckets = new Set([bucketFor(ranked[0])]);

  for (const product of qualityCandidates.slice(1)) {
    const bucket = bucketFor(product);
    if (usedBuckets.has(bucket)) continue;
    selected.push(product);
    selectedSet.add(product);
    usedBuckets.add(bucket);
    if (selected.length >= maxItems) return selected;
  }

  for (const product of ranked) {
    if (selectedSet.has(product)) continue;
    selected.push(product);
    if (selected.length >= maxItems) break;
  }

  return selected;
}
