import "dotenv/config";

const DEFAULT_BASE_URL = "https://fadli.site";
const TIMEOUT_MS = 20_000;

function getBaseUrl() {
  return String(process.env.WP_BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${getBaseUrl()}/${String(path).replace(/^\/+/, "")}`, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    return { response, text, data };
  } finally {
    clearTimeout(timer);
  }
}

function assertCredential(name) {
  if (!String(process.env[name] || "").trim()) {
    throw new Error(`${name} belum tersedia di .env`);
  }
}

function requireOk(label, result) {
  if (result.response.ok) return;

  const apiCode = result.data?.code || result.data?.error || "unknown_error";
  throw new Error(`${label} gagal: HTTP ${result.response.status} (${apiCode})`);
}

function locationName(item = {}) {
  return String(item.name || item.title || item.city_name || "-");
}

function collectRates(value, output = []) {
  if (!value || output.length >= 10) return output;

  if (Array.isArray(value)) {
    for (const item of value) collectRates(item, output);
    return output;
  }

  if (typeof value !== "object") return output;

  const courier =
    value.courier || value.courier_name || value.shipping_name || value.id;
  const service =
    value.service || value.service_name || value.name || value.label;
  const cost = value.cost ?? value.price ?? value.amount ?? value.value;

  if ((courier || service) && Number.isFinite(Number(cost))) {
    output.push({
      courier: String(courier || "-"),
      service: String(service || "-"),
      cost: Number(cost),
    });
  }

  for (const child of Object.values(value)) collectRates(child, output);
  return output;
}

function describeShape(value, depth = 0) {
  if (depth >= 4) return Array.isArray(value) ? "array" : typeof value;
  if (Array.isArray(value)) {
    return value.length ? [describeShape(value[0], depth + 1)] : [];
  }
  if (!value || typeof value !== "object") return typeof value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/(?:token|secret|key|auth|credential)/i.test(key))
      .map(([key, child]) => [key, describeShape(child, depth + 1)]),
  );
}

async function main() {
  assertCredential("WC_KEY");
  assertCredential("WC_SECRET");
  assertCredential("RJ_SHIP_TOKEN");

  console.log(`Target: ${getBaseUrl()}`);
  console.log("Credentials: tersedia (nilai tidak ditampilkan)");

  const auth = Buffer.from(
    `${process.env.WC_KEY}:${process.env.WC_SECRET}`,
  ).toString("base64");
  const catalog = await request(
    "wp-json/wc/v3/products?per_page=1&page=1&status=publish",
    { headers: { Authorization: `Basic ${auth}` } },
  );
  requireOk("WooCommerce catalog", catalog);
  console.log(
    `WooCommerce catalog: OK (HTTP ${catalog.response.status}, ${Array.isArray(catalog.data) ? catalog.data.length : 0} sampel)`,
  );

  const shippingHeaders = { "x-rj-token": process.env.RJ_SHIP_TOKEN };
  const cityResult = await request("wp-json/rj/v1/cities?q=Tangerang", {
    headers: shippingHeaders,
  });
  requireOk("Pencarian kota", cityResult);

  const cities = Array.isArray(cityResult.data?.cities)
    ? cityResult.data.cities
    : [];
  console.log(
    `Pencarian Tangerang: OK (${cities.length} hasil: ${cities.map(locationName).join(", ") || "tidak ada"})`,
  );

  const city =
    cities.find((item) => /kabupaten\s+tangerang/i.test(locationName(item))) ||
    cities.find((item) => /tangerang/i.test(locationName(item)));
  if (!city?.city_id) throw new Error("Kabupaten Tangerang tidak ditemukan");

  const districtResult = await request(
    `wp-json/rj/v1/districts?city_id=${encodeURIComponent(city.city_id)}&q=Rajeg`,
    { headers: shippingHeaders },
  );
  requireOk("Pencarian kecamatan", districtResult);

  const districts = Array.isArray(districtResult.data?.districts)
    ? districtResult.data.districts
    : [];
  const district = districts.find((item) => /rajeg/i.test(locationName(item)));
  console.log(
    `Pencarian Rajeg: OK (${districts.length} hasil: ${districts.map(locationName).join(", ") || "tidak ada"})`,
  );
  if (!district?.district_id) throw new Error("Kecamatan Rajeg tidak ditemukan");

  const quote = await request("wp-json/rj/v1/shipping-quote", {
    method: "POST",
    headers: {
      ...shippingHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      destination: {
        city_id: city.city_id,
        district_id: district.district_id,
      },
      items: [{ qty: 1, weight_grams: 1000 }],
    }),
  });
  requireOk("Kalkulasi ongkir", quote);

  const rates = collectRates(quote.data);
  console.log(
    `Kalkulasi ongkir 1 kg: OK (HTTP ${quote.response.status}, ${rates.length} tarif terbaca)`,
  );
  if (!rates.length) {
    console.log(
      `Struktur respons ongkir: ${JSON.stringify(describeShape(quote.data))}`,
    );
    throw new Error("endpoint ongkir merespons tanpa daftar tarif yang dapat digunakan");
  }
  for (const rate of rates.slice(0, 5)) {
    console.log(
      `- ${rate.courier} ${rate.service}: Rp ${rate.cost.toLocaleString("id-ID")}`,
    );
  }

  console.log("Smoke test domain baru: LULUS");
}

main().catch((error) => {
  const message =
    error?.name === "AbortError"
      ? `request timeout setelah ${TIMEOUT_MS / 1000} detik`
      : error?.message || String(error);
  console.error(`Smoke test domain baru: GAGAL - ${message}`);
  process.exitCode = 1;
});
