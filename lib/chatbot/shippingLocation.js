export function normalizeLocationText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\b(kota|kabupaten|kab|kec|kecamatan)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLocationTypoFallback(value = "") {
  const normalized = normalizeLocationText(value);
  const aliases = {
    gunungkidul: "gunung kidul",
    kulonprogo: "kulon progo",
  };
  if (aliases[normalized]) return aliases[normalized];

  const collapsed = normalized.replace(/([a-z])\1+/gi, "$1");
  return collapsed !== normalized ? collapsed : "";
}

export async function searchDistrictsWithTypoFallback(
  cityId,
  queryText,
  searchDistricts,
) {
  const result = await searchDistricts(cityId, queryText);
  if (Array.isArray(result?.districts) && result.districts.length) {
    return result;
  }

  const fallback = buildLocationTypoFallback(queryText);
  return fallback ? searchDistricts(cityId, fallback) : result;
}

export function splitCityDistrict(value = "") {
  const parts = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      cityText: parts[0],
      districtText: parts.slice(1).join(" "),
    };
  }

  return {
    cityText: String(value || "").trim(),
    districtText: "",
  };
}

export function extractDistrictFollowUp(value = "") {
  const { districtText } = splitCityDistrict(value);
  return districtText || String(value || "").trim();
}

export function extractShippingDestination(question = "") {
  const text = String(question || "").trim();
  const match = text.match(
    /(?:cek\s+)?(?:ongkir|ongkos\s+kirim|biaya\s+kirim|pengiriman|kirim)(?:\s+(?:ke|tujuan))?\s+(.+?)(?=\s+(?:untuk|produk|robot|barang|pakai|dengan|aman|asuransi|packing|kena|habis|sekitar|berapa|dong|ya|kah|nih|min|kak)\b|[?.!]|$)/i,
  );
  const destination = String(match?.[1] || "").trim();

  return /^(?:berapa|bisa|aman)$/i.test(destination) ? "" : destination;
}

export function isShippingQuotePending(pending = null) {
  return pending?.type === "shipping_quote";
}

export async function findCityWithDistrict(
  cities = [],
  districtText = "",
  searchDistricts,
) {
  if (!districtText || typeof searchDistricts !== "function") return null;

  for (const city of Array.isArray(cities) ? cities : []) {
    const result = await searchDistricts(city.city_id, districtText).catch(
      () => null,
    );
    if (Array.isArray(result?.districts) && result.districts.length) {
      return { city, districts: result.districts };
    }
  }

  return null;
}

export async function resolveShippingLocation(
  queryText = "",
  { searchCities, searchDistrictsGlobal } = {},
) {
  const cleaned = normalizeLocationText(queryText);
  if (!cleaned) return { kind: "empty" };

  let cityLookupFailed = false;
  let cityData = null;
  try {
    cityData = await searchCities(cleaned);
    if (!cityData?.cities?.length) {
      const fallback = buildLocationTypoFallback(cleaned);
      if (fallback) cityData = await searchCities(fallback);
    }
  } catch {
    cityLookupFailed = true;
  }

  const cities = Array.isArray(cityData?.cities) ? cityData.cities : [];
  if (cities.length === 1) {
    return { kind: "single_city", city: cities[0] };
  }
  if (cities.length > 1) {
    return { kind: "multi_city", cities };
  }

  let districtLookupFailed = false;
  let districtData = null;
  try {
    districtData = await searchDistrictsGlobal(cleaned);
  } catch {
    districtLookupFailed = true;
  }

  const districts = Array.isArray(districtData?.districts)
    ? districtData.districts
    : [];
  if (districts.length === 1) {
    return { kind: "single_district", district: districts[0] };
  }
  if (districts.length > 1) {
    return { kind: "multi_district", districts };
  }

  if (cityLookupFailed || districtLookupFailed) {
    return { kind: "unavailable" };
  }

  return { kind: "not_found" };
}
