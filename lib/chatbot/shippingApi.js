import { setPending } from "./session.js";
import { buildWordPressUrl } from "./siteConfig.js";
import {
  resolveShippingLocation as resolveShippingLocationWithLookup,
  searchDistrictsWithTypoFallback,
} from "./shippingLocation.js";

export async function getShippingQuote({
  city_id,
  district_id,
  weight_grams = 1000,
}) {
  const response = await fetch(
    buildWordPressUrl("wp-json/rj/v1/shipping-quote"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rj-token": process.env.RJ_SHIP_TOKEN,
      },
      body: JSON.stringify({
        destination: { city_id, district_id },
        items: [{ qty: 1, weight_grams }],
      }),
    },
  );

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    console.error("SHIP_QUOTE_FAIL_BODY:", text);
    throw new Error(`SHIP_QUOTE_FAILED:${response.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function searchCities(query) {
  const response = await fetch(
    buildWordPressUrl(
      `wp-json/rj/v1/cities?q=${encodeURIComponent(query)}`,
    ),
    { headers: { "x-rj-token": process.env.RJ_SHIP_TOKEN } },
  );
  if (!response.ok) throw new Error(`CITIES_FAILED:${response.status}`);
  return response.json();
}

async function searchDistrictsExact(cityId, query) {
  const response = await fetch(
    buildWordPressUrl(
      `wp-json/rj/v1/districts?city_id=${cityId}&q=${encodeURIComponent(query)}`,
    ),
    { headers: { "x-rj-token": process.env.RJ_SHIP_TOKEN } },
  );
  if (!response.ok) throw new Error(`DISTRICTS_FAILED:${response.status}`);
  return response.json();
}

export async function searchDistricts(cityId, query) {
  return searchDistrictsWithTypoFallback(
    cityId,
    query,
    searchDistrictsExact,
  );
}

export async function beginDistrictSelection(session, cityId, cityName) {
  const data = await searchDistricts(cityId, "").catch(() => null);
  const districts = Array.isArray(data?.districts) ? data.districts : [];

  if (districts.length) {
    setPending(session, {
      type: "shipping_quote",
      stage: "choose_district_in_city",
      data: {
        city_id: cityId,
        city_name: cityName,
        candidates: districts,
      },
    });

    return {
      type: "options",
      intro: `Pilih kecamatan tujuan di **${cityName}**:`,
      options: districts.map((district) => ({
        label: district.title,
        value: district.title,
      })),
      intent: "shipping_transaction",
    };
  }

  setPending(session, {
    type: "shipping_quote",
    stage: "need_district",
    data: { city_id: cityId, city_name: cityName },
  });

  return {
    type: "text",
    message: `Oke, tujuan **${cityName}**. Sekarang kecamatannya apa?`,
    intent: "shipping_transaction",
  };
}

export function buildOptionsPayload(intro, items = []) {
  return {
    type: "options",
    intro,
    options: items.map((item) => ({
      label: item.label,
      value: item.value,
    })),
  };
}

export function normalizeCityName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\bkabupaten\b/g, "kab")
    .replace(/\bkota\b/g, "kota")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchDistrictsGlobal(query) {
  const response = await fetch(
    buildWordPressUrl(
      `wp-json/rj/v1/districts-global?q=${encodeURIComponent(query)}`,
    ),
    { headers: { "x-rj-token": process.env.RJ_SHIP_TOKEN } },
  );
  if (!response.ok) {
    throw new Error(`DISTRICTS_GLOBAL_FAILED:${response.status}`);
  }
  return response.json();
}

export async function resolveShippingLocation(queryText = "") {
  return resolveShippingLocationWithLookup(queryText, {
    searchCities,
    searchDistrictsGlobal,
  });
}
