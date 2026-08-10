// lib/chatbot/tracking.js

export async function fetchBiteshipPublicTracking({
  trackingNumber,
  courierCode,
}) {
  const baseUrl = process.env.BITESHIP_BASE_URL || "https://api.biteship.com";
  const apiKey = process.env.BITESHIP_API_KEY;

  if (!apiKey) {
    throw new Error("BITESHIP_API_KEY belum di-set");
  }

  const url = `${baseUrl}/v1/trackings/${encodeURIComponent(
    trackingNumber,
  )}/couriers/${encodeURIComponent(courierCode)}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
  });

  const text = await resp.text();

  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!resp.ok) {
    throw new Error(
      json?.error || json?.message || `Biteship error ${resp.status}`,
    );
  }

  return json;
}

export function mapBiteshipTracking(raw = {}) {
  const data = raw?.tracking || raw?.data || raw;

  const history =
    data?.history || data?.trackings || data?.events || data?.manifest || [];

  const latest = Array.isArray(history) && history.length ? history[0] : null;

  return {
    trackingNumber:
      data?.waybill_id ||
      data?.waybill ||
      data?.awb ||
      data?.tracking_number ||
      "-",
    courier: data?.courier?.name || data?.courier_name || data?.courier || "-",
    courierCode: data?.courier?.code || data?.courier_code || "-",
    status:
      data?.status || data?.shipment_status || latest?.status || "unknown",
    location: latest?.location || latest?.note || latest?.message || "-",
    updatedAt:
      latest?.updated_at || latest?.timestamp || data?.updated_at || "-",
    history: Array.isArray(history) ? history.slice(0, 5) : [],
  };
}

export function buildTrackingMessage(tracking) {
  const rows = [
    "📦 **Status Pelacakan Paket**",
    `• Resi: **${tracking.trackingNumber}**`,
    `• Kurir: **${tracking.courier}** (${tracking.courierCode})`,
    `• Status: **${tracking.status}**`,
    `• Lokasi terakhir: **${tracking.location}**`,
    `• Update terakhir: **${tracking.updatedAt}**`,
  ];

  if (tracking.history.length) {
    rows.push("", "**Riwayat singkat:**");

    for (const item of tracking.history) {
      const when = item.updated_at || item.timestamp || "-";
      const status = item.status || "-";
      const loc = item.location || item.note || item.message || "-";

      rows.push(`• ${when} — ${status} — ${loc}`);
    }
  }

  return rows.join("\n");
}

export function extractCourierCode(text = "") {
  const s = String(text).toLowerCase();

  if (s.includes("jne")) return "jne";
  if (s.includes("j&t") || s.includes("jnt")) return "jnt";
  if (s.includes("sicepat")) return "sicepat";
  if (s.includes("pos")) return "pos";
  if (s.includes("anteraja")) return "anteraja";
  if (s.includes("ninja")) return "ninja";

  return null;
}

export function normalizeResi(raw = "") {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\-]/g, "")
    .trim();
}

export function extractTrackingNumber(text = "") {
  const s = String(text || "").toUpperCase();

  const candidates = s.match(/[A-Z0-9\-]{8,30}/g) || [];
  if (!candidates.length) return null;

  const blacklist = new Set([
    "TERMURAH",
    "TERMAHAL",
    "PRODUK",
    "TOKO",
    "BARANG",
    "MURAH",
    "MAHAL",
    "PROMO",
    "DISKON",
    "READY",
    "STOK",
    "RESI",
    "CEK",
    "PAKET",
    "TRACKING",
    "PENGIRIMAN",
  ]);

  const filtered = candidates.filter((x) => {
    if (blacklist.has(x)) return false;
    if (!/\d/.test(x)) return false;
    if (x.length < 8) return false;
    return true;
  });

  if (!filtered.length) return null;

  filtered.sort((a, b) => b.length - a.length);

  return normalizeResi(filtered[0]);
}

export function looksLikeTrackingQuestion(q = "") {
  const s = String(q || "").toLowerCase();

  return (
    s.includes("cek resi") ||
    s.includes("nomor resi") ||
    s.includes("lacak paket") ||
    s.includes("tracking paket") ||
    s.includes("paket saya sudah sampai mana") ||
    s.includes("barang saya sudah sampai mana") ||
    s.includes("status pengiriman")
  );
}
