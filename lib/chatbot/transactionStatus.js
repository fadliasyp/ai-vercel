import { fetchWithTimeoutJson } from "./wpApi.js";
import { buildWordPressUrl } from "./siteConfig.js";

export function extractOrderId(text = "") {
  const value = String(text || "").trim();
  const patterns = [
    /order\s*#\s*(\d+)/i,
    /order\s+id\s*[:#-]?\s*(\d+)/i,
    /id\s+pesanan\s*[:#-]?\s*(\d+)/i,
    /nomor\s+pesanan\s*[:#-]?\s*(\d+)/i,
    /no\s+pesanan\s*[:#-]?\s*(\d+)/i,
    /\b(\d{3,9})\b/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function normalizePhone(value = "") {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("62") ? `0${digits.slice(2)}` : digits;
}

export function extractOrderVerification(text = "") {
  const value = String(text || "");
  const email = value.match(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  )?.[0];
  if (email) return { type: "email", value: email.toLowerCase() };

  const phone = value.match(
    /(?:^|[^\d])((?:\+?62|0)8(?:[\s.-]?\d){7,11})(?!\d)/,
  )?.[1];
  if (phone) return { type: "phone", value: normalizePhone(phone) };

  return null;
}

export function redactOrderVerification(text = "") {
  return String(text || "")
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[email disembunyikan]",
    )
    .replace(
      /(?:\+?62|0)8(?:[\s.-]?\d){7,11}(?!\d)/g,
      "[nomor telepon disembunyikan]",
    );
}

export function matchesOrderVerification(order, verification) {
  if (!order || !verification?.value) return false;

  if (verification.type === "email") {
    return (
      String(order.billing?.email || "").trim().toLowerCase() ===
      String(verification.value).trim().toLowerCase()
    );
  }

  if (verification.type === "phone") {
    return (
      normalizePhone(order.billing?.phone) ===
      normalizePhone(verification.value)
    );
  }

  return false;
}

export function buildOrderVerificationPrompt(orderId = "") {
  const id = String(orderId || "").trim();
  return (
    `Untuk melindungi data pesanan **#${id}**, kirim **email atau nomor telepon tagihan** yang dipakai saat checkout.\n\n` +
    "Data ini hanya digunakan untuk mencocokkan pesanan dan tidak disimpan di sesi chatbot."
  );
}

export function buildOrderVerificationFailedMessage({ locked = false } = {}) {
  if (locked) {
    return (
      "Data verifikasi belum cocok atau pesanan tidak ditemukan. Pemeriksaan dihentikan setelah tiga percobaan.\n\n" +
      "Silakan mulai lagi dengan Order ID yang benar atau hubungi admin Robot Jadul."
    );
  }

  return (
    "Data verifikasi belum cocok atau pesanan tidak ditemukan. Periksa kembali **email atau nomor telepon tagihan** yang digunakan saat checkout."
  );
}

export async function fetchWooOrderById(orderId = "") {
  const id = String(orderId || "").trim();
  if (!id) return null;

  const url = buildWordPressUrl(
    `wp-json/wc/v3/orders/${encodeURIComponent(id)}`,
  );
  const order = await fetchWithTimeoutJson(
    url,
    {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.WC_KEY + ":" + process.env.WC_SECRET,
          ).toString("base64"),
      },
    },
    35000,
  );

  return order && order.id ? order : null;
}

export function mapOrderStatusLabel(status = "") {
  const value = String(status || "").toLowerCase();
  const labels = {
    pending: "Menunggu pembayaran",
    "on-hold": "Menunggu verifikasi",
    processing: "Sedang diproses",
    completed: "Selesai",
    cancelled: "Dibatalkan",
    refunded: "Refund",
    failed: "Gagal",
  };

  return labels[value] || status || "Tidak diketahui";
}

export function formatOrderTotal(order) {
  const total = Number(order?.total || 0);
  if (!Number.isFinite(total)) return "-";

  return total.toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
}

export function buildTransactionStatusMessage(order) {
  if (!order) {
    return (
      "Maaf, aku belum menemukan pesanan dengan Order ID tersebut.\n\n" +
      "Coba kirim lagi Order ID yang benar ya."
    );
  }

  const orderNo = order.number || order.id || "-";
  const statusLabel = mapOrderStatusLabel(order.status);
  const total = formatOrderTotal(order);
  const createdAt = order.date_created
    ? new Date(order.date_created).toLocaleString("id-ID")
    : "-";

  return (
    "**Status Transaksi Pesanan**\n\n" +
    `- Order ID: **${orderNo}**\n` +
    `- Status: **${statusLabel}**\n` +
    `- Total: **${total}**\n` +
    `- Tanggal Order: **${createdAt}**`
  );
}

export function looksLikeTransactionStatusQuestion(question = "") {
  const value = String(question || "").toLowerCase();
  const hasStatusWord =
    value.includes("status") ||
    value.includes("cek") ||
    value.includes("diproses") ||
    value.includes("proses") ||
    value.includes("sudah dibayar") ||
    value.includes("pembayaran");
  const hasOrderWord =
    value.includes("pesanan") ||
    value.includes("order") ||
    value.includes("orderan") ||
    value.includes("transaksi") ||
    value.includes("pembelian");

  if (
    value.includes("status transaksi") ||
    value.includes("status pesanan") ||
    value.includes("status order") ||
    value.includes("status orderan") ||
    value.includes("status pembelian") ||
    value.includes("cek order") ||
    value.includes("cek pesanan") ||
    value.includes("cek transaksi") ||
    value.includes("cek pembelian") ||
    value.includes("order id") ||
    value.includes("nomor pesanan") ||
    value.includes("no pesanan") ||
    value.includes("id pesanan") ||
    (hasStatusWord && hasOrderWord)
  ) {
    return true;
  }

  return /order\s*#?\s*\d{3,}/i.test(question);
}
