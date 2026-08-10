import { normalizeIndonesianCommerceText } from "./textNormalization.js";

const STORE_HOURS_PATTERN =
  /\b(?:jam\s+(?:buka|operasional)|jadwal\s+toko|waktu\s+operasional|buka\s+(?:(?:dari|mulai|sampai)\s+)?(?:jam|pukul)\s+berapa|tutup\s+(?:jam|pukul)\s+berapa|buka\s+kapan|kapan\s+buka)\b/i;
const STORE_LOCATION_PATTERN =
  /\b(?:toko\s+(?:offline|fisik)|offline\s+store|alamat\s+toko|lokasi\s+(?:toko|robot\s+jadul)|(?:toko|tokonya|robot\s+jadul)\s+di\s*mana|lokasi(?:nya)?\s+di\s*mana|datang\s+ke\s+toko|ambil\s+di\s+toko|pickup\s+di\s+toko|bisa\s+datang\s+langsung|blok\s+m\s+square|lantai\s+berapa|blok\s+apa)\b/i;

const DEFAULT_STORE_ADDRESS =
  "Robot Jadul, Blok M Square lantai 3A, Blok A nomor 36-37, Jl. Melawai 5, Jakarta Selatan 12160, Indonesia.";

export function looksLikeStoreHoursQuestion(question = "") {
  return STORE_HOURS_PATTERN.test(normalizeIndonesianCommerceText(question));
}

export function looksLikeStoreLocationQuestion(question = "") {
  return STORE_LOCATION_PATTERN.test(
    normalizeIndonesianCommerceText(question),
  );
}

function extractHoursFromAddress(addressText = "") {
  const match = String(addressText || "").match(
    /\b(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})\b/,
  );
  if (!match) return "";
  return `${match[1].padStart(2, "0")}.${match[2]}-${match[3].padStart(2, "0")}.${match[4]}`;
}

export function buildStoreHoursMessage({
  hoursText = "",
  addressText = "",
} = {}) {
  const configuredHours = String(hoursText || "").trim();
  if (configuredHours) {
    return `Jam operasional Robot Jadul: **${configuredHours}**.`;
  }

  const addressHours = extractHoursFromAddress(addressText);
  const schedule = addressHours || "11.00-20.00";
  return `Robot Jadul buka **setiap hari pukul ${schedule} WIB**.`;
}

export function buildStoreVisitMessage({
  hoursText = "",
  addressText = "",
} = {}) {
  const address = String(addressText || "").trim() || DEFAULT_STORE_ADDRESS;
  const hours = buildStoreHoursMessage({ hoursText, addressText: address });

  return `Lokasi toko fisik Robot Jadul:\n\n${address}\n\n${hours}`;
}
