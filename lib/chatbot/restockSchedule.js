const RESTOCK_PATTERN =
  /\b(?:re[\s-]?stock(?:nya)?|restok(?:nya)?|stok\s+(?:masuk|ada|tersedia)\s+lagi|ready\s+lagi)\b/i;
const GENERAL_RESTOCK_PATTERN =
  /\b(?:semua(?:nya)?|daftar|apa\s*(?:saja|aja)|mana\s*(?:saja|aja))\b|\b(?:robot\s*-\s*robot|produk\s*-\s*produk|barang\s*-\s*barang|(?:robot|produk|barang)\s*2)\b/i;
const GENERAL_RESTOCK_FILLERS = new Set([
  "ada",
  "admin",
  "aja",
  "akan",
  "bakal",
  "barang",
  "dong",
  "emang",
  "item",
  "kak",
  "kapan",
  "kira",
  "lagi",
  "lama",
  "memang",
  "menunggu",
  "min",
  "nih",
  "nunggu",
  "produk",
  "robot",
  "sih",
  "sudah",
  "udah",
  "ya",
  "yah",
  "yang",
]);
const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export const RESTOCK_TIME_ZONE = "Asia/Jakarta";
export const RESTOCK_TIME_ZONE_LABEL = "WIB";
export const RESTOCK_UTC_OFFSET_MINUTES = 7 * 60;

function getMetaValue(metaData, key) {
  if (!Array.isArray(metaData)) return null;
  return metaData.find((item) => item?.key === key)?.value ?? null;
}

function objectValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function appliesToStorefront(roles) {
  const values = Array.isArray(roles)
    ? roles
    : typeof roles === "string"
      ? roles.split(",")
      : [];
  const normalized = values.map((role) => String(role || "").trim());
  return (
    normalized.length === 0 ||
    normalized.includes("woopt_all") ||
    normalized.includes("all") ||
    normalized.includes("woopt_guest") ||
    normalized.includes("guest")
  );
}

function parseWpcDateTime(
  value,
  utcOffsetMinutes = RESTOCK_UTC_OFFSET_MINUTES,
) {
  const match = String(value || "")
    .trim()
    .match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
    );
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const period = match[6].toLowerCase();

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  if (hour === 12) hour = 0;
  if (period === "pm") hour += 12;

  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(localUtcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }

  const epochMs = localUtcMs - Number(utcOffsetMinutes || 0) * 60_000;
  return {
    epochMs,
    scheduledAt: new Date(epochMs).toISOString(),
    local: { year, month, day, hour, minute },
    timeZone: RESTOCK_TIME_ZONE,
    timeZoneLabel: RESTOCK_TIME_ZONE_LABEL,
  };
}

export function looksLikeRestockQuestion(question = "") {
  return RESTOCK_PATTERN.test(String(question || ""));
}

export function looksLikeGeneralRestockQuestion(
  question = "",
  { hasProductContext = false } = {},
) {
  const text = String(question || "").toLowerCase();
  if (!looksLikeRestockQuestion(text)) return false;
  if (GENERAL_RESTOCK_PATTERN.test(text)) return true;
  if (hasProductContext) return false;

  const subjectWords = text
    .replace(
      /\b(?:re[\s-]?stock(?:nya)?|restok(?:nya)?|stok\s+(?:masuk|ada|tersedia)\s+lagi|ready\s+lagi)\b/gi,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !GENERAL_RESTOCK_FILLERS.has(word));

  return subjectWords.length === 0;
}

export function extractWpcRestockSchedules(
  metaData = [],
  { utcOffsetMinutes = RESTOCK_UTC_OFFSET_MINUTES } = {},
) {
  const actions = objectValues(getMetaValue(metaData, "woopt_actions"));
  const schedules = [];

  for (const action of actions) {
    if (
      !action ||
      typeof action !== "object" ||
      action.action !== "set_instock" ||
      !appliesToStorefront(action.roles)
    ) {
      continue;
    }

    const timers = objectValues(action.timer);
    const supported = timers.every((timer) =>
      ["date_time_after", "every_day"].includes(String(timer?.type || "")),
    );
    const exactTimes = timers
      .filter((timer) => timer?.type === "date_time_after")
      .map((timer) => parseWpcDateTime(timer?.val, utcOffsetMinutes));

    if (!supported || !exactTimes.length || exactTimes.some((item) => !item)) {
      continue;
    }

    const schedule = exactTimes.sort((a, b) => b.epochMs - a.epochMs)[0];
    schedules.push({
      ...schedule,
      source: "wpc_product_timer",
      action: "set_instock",
    });
  }

  return schedules
    .filter(
      (schedule, index, all) =>
        all.findIndex((item) => item.epochMs === schedule.epochMs) === index,
    )
    .sort((a, b) => a.epochMs - b.epochMs);
}

export function getNextRestockSchedule(product = {}, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  return (
    (Array.isArray(product.restockSchedules) ? product.restockSchedules : [])
      .filter(
        (schedule) =>
          Number.isFinite(Number(schedule?.epochMs)) &&
          Number(schedule.epochMs) > nowMs,
      )
      .sort((a, b) => Number(a.epochMs) - Number(b.epochMs))[0] || null
  );
}

export function listUpcomingRestocks(products = [], now = new Date()) {
  return (Array.isArray(products) ? products : [])
    .map((product) => ({
      product,
      schedule: getNextRestockSchedule(product, now),
    }))
    .filter((entry) => entry.schedule)
    .sort(
      (a, b) => Number(a.schedule.epochMs) - Number(b.schedule.epochMs),
    );
}

export function formatRestockDateTime(schedule = {}) {
  const local = schedule?.local;
  if (!local || !MONTH_NAMES[local.month - 1]) return "";
  const hour = String(local.hour).padStart(2, "0");
  const minute = String(local.minute).padStart(2, "0");
  return `${local.day} ${MONTH_NAMES[local.month - 1]} ${local.year} pukul ${hour}.${minute} ${schedule.timeZoneLabel || RESTOCK_TIME_ZONE_LABEL}`;
}

export function buildRestockListMessage(entries = []) {
  const lines = entries.map(
    ({ product, schedule }) =>
      `- **${product.name}**: ${formatRestockDateTime(schedule)}`,
  );
  return ["Berikut jadwal restock mendatang yang tercatat:", "", ...lines]
    .join("\n")
    .trim();
}
