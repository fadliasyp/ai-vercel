import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { classifyIntentML } from "../lib/classifyIntentML.js";

console.log("ASK.JS LOADED");

export const config = {
  runtime: "nodejs",
  maxDuration: 60, // coba 60 detik
};

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      )
    : null;

const sessionMemory = new Map();

function getSession(sessionId) {
  if (!sessionMemory.has(sessionId)) {
    sessionMemory.set(sessionId, {
      lastIntent: null,
      lastIntentMethod: null,
      lastIntentScore: null,
      lastTopic: null,
      lastStep: null,
      lastProducts: null,
      lastBotQuestionType: null,
      lastBotQuestionMeta: null,
      lastFilters: {
        priceMode: null, // cheapest | expensive | promo | range | null
        stockOnly: false,
        promoOnly: false,
        keyword: null,
        source: null,
      },
      slots: {
        city: null,
        district: null,
        productName: null,
        category: null,
        brand: null,
        budgetMin: null,
        budgetMax: null,
        condition: null,
      },
      history: [],
      pending: null,
    });
  }
  return sessionMemory.get(sessionId);
}

function setPending(session, pending, ttlMs = 5 * 60 * 1000) {
  session.pending = {
    ...pending,
    expiresAt: Date.now() + ttlMs,
  };
}

function clearPending(session) {
  session.pending = null;
}

function getPending(session) {
  const p = session.pending;
  if (!p) return null;
  if (p.expiresAt && Date.now() > p.expiresAt) {
    session.pending = null;
    return null;
  }
  return p;
}

const genai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const GEMINI_MODELS = {
  FAST: "gemini-3.1-flash-lite-preview",
  SMART: "gemini-2.5-flash",
};

const GEMINI_MODE = {
  enableSemanticParse: true, // sementara matikan dulu
  enableRecommendationExplain: true,
  enableCompareExplain: true,
  enableStepExplain: true,
};

async function geminiText({ model, prompt, temperature }) {
  if (!genai) return null;

  const resp = await genai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(typeof temperature === "number" ? { config: { temperature } } : {}),
  });

  return resp?.text || null;
}

async function explainCompareWithGemini({ facts, winner, reasons }) {
  if (!genai) return null;

  const prompt = `
Kamu asisten toko online.
Tugas: jelaskan PERBEDAAN produk A dan B berdasarkan data di JSON.

ATURAN:
- Hanya gunakan fakta yang ada di JSON.
- Jangan menambah detail yang tidak ada.
- Jika info kondisi tidak ditemukan, tulis: "Info kondisi (MISB/dll) tidak tercantum di data."
- Buat jawaban ringkas dan rapi.
- Boleh gunakan simbol sederhana seperti: • ✅ ⚠️ 💰 📦
- Jangan berlebihan memakai emoji.
- Format:
  1) Ringkasan beda utama
  2) Detail A
  3) Detail B
  4) Rekomendasi pilih A jika..., pilih B jika...

JSON:
${JSON.stringify({ facts, winner, reasons }, null, 2)}
`;

  return await geminiText({
    model: GEMINI_MODELS.SMART,
    prompt,
    temperature: 0.4,
  });
}

// ======Mode Hemat kalau prompt nya kecil========
function truncateText(str = "", max = 300) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function shouldUseGemini(rawQuestion, payload) {
  if (!genai) return false;

  const q = String(rawQuestion || "")
    .trim()
    .toLowerCase();

  if (!q) return false;

  // skip pertanyaan super pendek
  if (q.length < 10) return false;

  // skip greeting / suggestion
  if (payload.type === "suggestions") return false;

  // compare reasoning biasanya sudah bagus, tidak usah dibungkus lagi
  if (payload.type === "compare_reasoned") return false;

  // jangan humanize how_to_buy full step list, biar aman dan ringan
  if (payload.type === "how_to_buy") return false;

  // untuk list produk biasa tanpa reasoning, tidak perlu Gemini
  if (
    payload.type === "products" &&
    Array.isArray(payload.products) &&
    payload.products.length > 1 &&
    !payload.reasoning_text
  ) {
    return false;
  }

  // text biasa boleh
  if (payload.type === "text" && payload.message) return true;

  // produk tunggal boleh
  if (
    payload.type === "products" &&
    Array.isArray(payload.products) &&
    payload.products.length === 1
  ) {
    return true;
  }

  // products + reasoning_text boleh
  if (payload.type === "products" && payload.reasoning_text) {
    return true;
  }

  return false;
}

function compressPayloadForLLM(payload) {
  return {
    type: payload.type,
    message: truncateText(payload.message),
    intro: truncateText(payload.intro),
    closing: truncateText(payload.closing),
    reasoning_text: payload._noTruncateReasoning
      ? payload.reasoning_text || ""
      : truncateText(payload.reasoning_text),
  };
}

// ======== gemini membungkus katanya agar natural seperti AI ========
// async function naturalizeWithGemini(payload, userQuestion) {
//   try {
//     // 🧠 SMART SKIP (hemat quota)
//     if (!shouldUseGemini(userQuestion, payload)) {
//       return payload;
//     }

//     // ✂️ COMPRESS PAYLOAD
//     const smallPayload = compressPayloadForLLM(payload);

//     const prompt = `
// Ubah teks berikut agar lebih natural, ramah, dan seperti AI assistant toko online.

// ATURAN:
// - JANGAN menambah fakta baru.
// - JANGAN mengubah makna.
// - JANGAN mengubah field selain teks.
// - Bahasa Indonesia santai tapi sopan.
// - Boleh tambahkan emoji atau simbol sederhana agar lebih menarik, TAPI jangan berlebihan.
// - Gunakan maksimal 1–3 emoji/simbol per jawaban pendek.
// - Lebih utamakan simbol rapi seperti: • ✅ 📦 💰 🚚 ⚠️ dibanding emoji ramai.
// - Jangan membuat gaya terlalu heboh, berlebihan, atau alay.
// - Tetap ringkas, jelas, dan enak dibaca.
// - Kembalikan JSON dengan struktur yang sama.

// JSON:
// ${JSON.stringify(smallPayload)}
// `;

//     const resp = await genai.models.generateContent({
//       model: "gemini-3.1-flash-lite-preview",
//       contents: [{ role: "user", parts: [{ text: prompt }] }],
//     });

//     let txt = resp.text || "";

//     txt = txt
//       .replace(/```json/gi, "")
//       .replace(/```/g, "")
//       .trim();

//     let parsed;
//     try {
//       parsed = JSON.parse(txt);
//     } catch {
//       return payload; // fallback aman
//     }

//     // 🔒 merge aman (products tidak disentuh)
//     return {
//       ...payload,
//       message: parsed.message ?? payload.message,
//       intro: parsed.intro ?? payload.intro,
//       closing: parsed.closing ?? payload.closing,
//       reasoning_text: parsed.reasoning_text ?? payload.reasoning_text,
//     };
//   } catch (err) {
//     // quota habis / error → fallback
//     return payload;
//   }
// }

// ===============================
// VERSI REVISI: GEMINI HANYA DIPAKAI UNTUK JAWABAN YANG BENAR-BENAR BUTUH SENTUHAN GAYA, DAN TIDAK BOLEH MENGUBAH FAKTA PENTING (SEPERTI DETAIL PRODUK, REASONING, DLL)
// ===============================

function looksSafeHumanizedResult(original, parsed) {
  if (!parsed || typeof parsed !== "object") return false;

  const fields = ["intro", "message", "closing", "reasoning_text"];

  for (const key of fields) {
    if (parsed[key] != null && typeof parsed[key] !== "string") {
      return false;
    }
  }

  // kalau original ada isi tapi hasil Gemini kosong semua → tidak aman
  const originalHasText = fields.some((k) => String(original[k] || "").trim());

  const parsedHasText = fields.some((k) => String(parsed[k] || "").trim());

  if (originalHasText && !parsedHasText) return false;

  return true;
}

function clampText(str = "", max = 1200) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function trimEndingText(str = "", max = 240) {
  if (!str) return str;
  return str.length > max ? str.slice(0, max).trim() + "…" : str;
}

async function naturalizeWithGemini(payload, userQuestion) {
  try {
    if (!genai) return payload;

    if (!shouldUseGemini(userQuestion, payload)) {
      return payload;
    }

    const safePayload = {
      type: payload.type,
      intro: clampText(payload.intro || "", 300),
      message: clampText(payload.message || "", 500),
      closing: clampText(payload.closing || "", 250),
      reasoning_text: payload._noTruncateReasoning
        ? clampText(payload.reasoning_text || "", 1200)
        : truncateText(payload.reasoning_text || "", 800),
    };

    if (
      !safePayload.intro &&
      !safePayload.message &&
      !safePayload.closing &&
      !safePayload.reasoning_text
    ) {
      return payload;
    }

    const prompt = `
Kamu bertugas memoles gaya bahasa chatbot ecommerce agar terasa lebih natural seperti CS manusia.

TUGAS:
- Ubah teks agar lebih ramah, natural, sopan, dan enak dibaca.
- Pertahankan arti ASLI 100%.
- Jangan menambah fakta baru.
- Jangan menghapus fakta penting.
- Jangan mengubah nama produk, angka, harga, stok, diskon, atau detail produk.
- Jangan menambah rekomendasi baru yang tidak ada.
- Jangan menambah pertanyaan follow-up baru.

ATURAN SANGAT PENTING:
- Jika ada closing yang menawarkan tindakan lanjutan, MAKSUDNYA HARUS TETAP SAMA.
- Jangan mengganti arah percakapan.
- Jangan menawarkan opsi tambahan di luar teks asli.
- Jangan mengubah struktur field.
- Jangan memindahkan isi reasoning_text ke message atau sebaliknya.

GAYA:
- Bahasa Indonesia santai tapi sopan
- Natural seperti admin toko yang membantu
- Boleh tambah simbol sederhana seperti: • ✅ 📦 💰
- Jangan berlebihan memakai emoji
- Jangan alay
- Tetap ringkas dan jelas

Kembalikan JSON VALID SAJA tanpa markdown:
{
  "intro": "...",
  "message": "...",
  "closing": "...",
  "reasoning_text": "..."
}

DATA INPUT:
${JSON.stringify(safePayload, null, 2)}
`;

    const resp = await genai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let txt = (resp.text || "").trim();
    txt = txt
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      return payload;
    }

    if (!looksSafeHumanizedResult(payload, parsed)) {
      return payload;
    }

    const finalClosing =
      typeof parsed.closing === "string"
        ? trimEndingText(parsed.closing, 240)
        : payload.closing;

    return {
      ...payload,
      intro: typeof parsed.intro === "string" ? parsed.intro : payload.intro,
      message:
        typeof parsed.message === "string" ? parsed.message : payload.message,
      closing: finalClosing,
      reasoning_text:
        typeof parsed.reasoning_text === "string"
          ? parsed.reasoning_text
          : payload.reasoning_text,

      _followUpType: payload._followUpType,
      _followUpMeta: payload._followUpMeta,
      _noTruncateReasoning: payload._noTruncateReasoning,
      products: payload.products,
      intent: payload.intent,
      step: payload.step,
      steps: payload.steps,
      winner: payload.winner,
      scores: payload.scores,
      suggestions: payload.suggestions,
      options: payload.options,
    };
  } catch (err) {
    console.error("NATURALIZE GEMINI ERROR:", err?.message || err);
    return payload;
  }
}

async function explainStepWithGemini({ rawQuestion, step }) {
  if (!genai) return null;

  const prompt = `
Kamu adalah AI customer support Robot Jadul yang sangat membantu.

KONTEKS:
User sedang kesulitan pada proses pembelian.

TUJUAN:
- Jelaskan step dengan bahasa yang SANGAT mudah dipahami.
- Jika user bilang bingung/stuck → beri solusi praktis langkah demi langkah.
- Gunakan nada ramah seperti CS manusia.
- Jangan mengarang di luar data step.
- Jika perlu, beri tips kecil agar user berhasil.

GAYA JAWABAN:
- Bahasa Indonesia santai tapi sopan
- Ringkas tapi jelas
- Fokus ke tindakan yang harus user lakukan
- Tutup dengan pertanyaan follow-up jika masuk akal
- Boleh tambahkan emoji/simbol sederhana agar lebih menarik, tapi jangan berlebihan
- Gunakan maksimal 1–2 emoji dalam satu jawaban pendek
- Lebih utamakan bullet/simbol seperti: • ✅ ⚠️ 📦 🚚

DATA STEP:
${JSON.stringify(step, null, 2)}

PERTANYAAN USER:
${rawQuestion}
`;

  return await geminiText({
    model: GEMINI_MODELS.SMART,
    prompt,
    temperature: 0.5,
  });
}

// ==============logic how to buy (kalau user nanya cara beli, proses checkout, dll)================
let howToBuyCache = { at: 0, data: null };
// kalau staging kadang lambat, bisa fallback ke production juga.

async function fetchWithTimeout(url, ms = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (VercelBot; +https://vercel.com)",
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      },
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

// ======================
// HOW TO BUY
// =======================

function pickImgSrc(imgTag = "") {
  const m1 = imgTag.match(/\ssrc=["']([^"']+)["']/i);
  const m2 = imgTag.match(/\sdata-src=["']([^"']+)["']/i);
  const m3 = imgTag.match(/\sdata-lazy-src=["']([^"']+)["']/i);
  return (m1 && m1[1]) || (m2 && m2[1]) || (m3 && m3[1]) || "";
}

function stripHtmlText(html = "") {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ✅ Parser khusus struktur Elementor (teks & gambar terpisah)
function parseHowToBuyHTML_Elementor(html = "") {
  if (!html) return null;

  // ambil semua token penting (ol dan img) sesuai urutan muncul
  const tokenRe = /<ol[^>]*>[\s\S]*?<\/ol>|<img[\s\S]*?>/gi;

  const tokens = html.match(tokenRe);
  if (!tokens || !tokens.length) return null;

  const steps = [];
  let stepNo = 1;

  // index step terakhir dari grup OL yang belum dapat image
  let lastGroupFirstStepIndex = -1;

  for (const tok of tokens) {
    // token img
    if (/^<img/i.test(tok)) {
      const src = pickImgSrc(tok);
      // pasang ke step pertama dari grup OL sebelumnya (biar gak duplikat di semua step)
      if (
        src &&
        lastGroupFirstStepIndex >= 0 &&
        steps[lastGroupFirstStepIndex] &&
        !steps[lastGroupFirstStepIndex].image
      ) {
        steps[lastGroupFirstStepIndex].image = src;
        lastGroupFirstStepIndex = -1;
      }
      continue;
    }

    // token ol
    if (/^<ol/i.test(tok)) {
      // ambil semua li di dalam ol
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      const texts = [];
      let m;

      while ((m = liRe.exec(tok))) {
        const t = stripHtmlText(m[1]);
        // buang li wrapper yang kosong / terlalu pendek
        if (!t || t.length < 6) continue;
        // buang li "list-style-type:none" yang cuma jadi pembungkus tanpa isi
        texts.push(t);
      }

      if (!texts.length) continue;

      // buat step untuk tiap text
      const firstIndex = steps.length;

      for (const t of texts) {
        steps.push({
          step: stepNo++,
          text: t,
          image: "",
        });
      }

      // tandai step pertama grup ini untuk dipasangi img berikutnya
      lastGroupFirstStepIndex = firstIndex;
    }
  }

  return steps.length ? steps : null;
}

async function getHowToBuy() {
  const now = Date.now();
  if (howToBuyCache.data && now - howToBuyCache.at < 1000 * 60 * 30) {
    return howToBuyCache.data;
  }

  // ✅ Prioritas REST API (lebih stabil dari HTML full Elementor)
  const apiUrls = [
    "https://pstaging.my.id/robotjadul/wp-json/wp/v2/pages?slug=how-to-buy&_fields=content",
    "https://robotjadul.com/wp-json/wp/v2/pages?slug=how-to-buy&_fields=content",
  ];

  for (const apiUrl of apiUrls) {
    const r = await fetchWithTimeout(apiUrl, 12000).catch(() => null);
    if (!r || !r.ok) continue;

    let arr;
    try {
      arr = await r.json();
    } catch {
      continue;
    }

    const html = arr?.[0]?.content?.rendered || "";
    const parsed = parseHowToBuyHTML_Elementor(html);

    if (parsed?.length) {
      howToBuyCache = { at: now, data: parsed };
      return parsed;
    }
  }

  // fallback terakhir: ambil halaman HTML biasa
  const pageUrls = [
    "https://pstaging.my.id/robotjadul/how-to-buy/",
    "https://robotjadul.com/how-to-buy/",
  ];

  for (const url of pageUrls) {
    const r = await fetchWithTimeout(url, 12000).catch(() => null);
    if (!r || !r.ok) continue;

    const html = await r.text();
    const parsed = parseHowToBuyHTML_Elementor(html);

    if (parsed?.length) {
      howToBuyCache = { at: now, data: parsed };
      return parsed;
    }
  }

  return null;
}

// ===============================
// DATASET INTENT (seed examples)
// ===============================
const INTENT_DATASET = [
  // =========================
  // general
  // =========================
  ["halo", "general"],
  ["hai", "general"],
  ["selamat pagi", "general"],
  ["permisi", "general"],
  ["halo min", "general"],
  ["bisa bantu saya", "general"],
  ["mau tanya dong", "general"],
  ["robot jadul jual apa aja", "general"],
  ["ini toko apa", "general"],
  ["apa itu robot jadul", "general"],
  ["bisa bantu cariin barang", "general"],
  ["saya mau tanya soal produk", "general"],

  // =========================
  // product_discovery
  // fokus: cari produk / ada tidak / kategori / brand
  // =========================
  ["ada voltes v", "product_discovery"],
  ["cari voltes v", "product_discovery"],
  ["ada produk bandai", "product_discovery"],
  ["produk bandai apa saja", "product_discovery"],
  ["ada action figure murah", "product_discovery"],
  ["ada robot vintage", "product_discovery"],
  ["cari mainan robot", "product_discovery"],
  ["produk voltron ada", "product_discovery"],
  ["ada gundam di sini", "product_discovery"],
  ["figure space ironmen kyoda ada", "product_discovery"],
  ["ada model kit terbaru", "product_discovery"],
  ["cari produk buat koleksi", "product_discovery"],
  ["ada barang di bawah 1 juta", "product_discovery"],
  ["produk harga 500 ribuan ada", "product_discovery"],
  ["ada chogokin", "product_discovery"],
  ["cari barang yang 1 jutaan", "product_discovery"],
  ["ada robot jadul yang murah", "product_discovery"],
  ["produk voltes yang tersedia apa saja", "product_discovery"],
  ["ada barang untuk display", "product_discovery"],
  ["mainan robot apa saja yang ada", "product_discovery"],

  // =========================
  // recommendation
  // fokus: minta saran / terbaik / cocok / worth it
  // =========================
  ["rekomendasi voltron untuk pajangan", "recommendation"],
  ["robot yang cocok untuk display", "recommendation"],
  ["yang bagus buat koleksi apa", "recommendation"],
  ["rekomendasi robot buat hadiah", "recommendation"],
  ["voltron yang worth it buat koleksi", "recommendation"],
  ["yang paling cocok untuk pajangan", "recommendation"],
  ["rekomendasi buat koleksi budget 1 juta", "recommendation"],
  ["yang cocok buat display budget 500 ribu apa", "recommendation"],
  ["rekomendasi robot 1 jutaan dong", "recommendation"],
  ["rekomendasi robot 1 juta - 5 jutaan dong", "recommendation"],
  ["bagusan yang mana buat pajangan", "recommendation"],
  ["pilihin produk yang cocok buat hadiah", "recommendation"],
  ["yang recommended buat kolektor pemula apa", "recommendation"],
  ["saran robot yang bagus untuk display", "recommendation"],
  ["kalau budget terbatas enaknya ambil yang mana", "recommendation"],
  ["mending pilih yang mana untuk koleksi", "recommendation"],
  ["tolong rekomendasikan produk yang worth it", "recommendation"],
  ["yang terbaik buat pajangan apa", "recommendation"],
  ["ada saran produk buat hadiah ulang tahun", "recommendation"],
  ["produk yang cocok buat pemula apa", "recommendation"],
  ["rekomendasi chogokin yang bagus", "recommendation"],

  // =========================
  // product_detail
  // fokus: spesifikasi / atribut / isi / bahan / ukuran / originalitas
  // =========================
  ["ini original bandai", "product_detail"],
  ["ukuran produk ini berapa", "product_detail"],
  ["bahannya apa", "product_detail"],
  ["ini bisa digerakkan", "product_detail"],
  ["isi box dapat apa saja", "product_detail"],
  ["ini versi tahun berapa", "product_detail"],
  ["apakah ini diecast", "product_detail"],
  ["produk ini baru atau bekas", "product_detail"],
  ["detail spesifikasi produk ini", "product_detail"],
  ["ini limited edition", "product_detail"],
  ["tingginya berapa cm", "product_detail"],
  ["materialnya dari apa", "product_detail"],
  ["apakah ini ori", "product_detail"],
  ["kelengkapannya apa saja", "product_detail"],
  ["dapat aksesorinya juga", "product_detail"],
  ["skalanya berapa", "product_detail"],
  ["produk ini keluaran tahun berapa", "product_detail"],
  ["apakah tangan dan kaki bisa digerakkan", "product_detail"],
  ["barang ini misb atau loose", "product_detail"],
  ["box dan item di dalamnya apa saja", "product_detail"],

  // =========================
  // price_promo
  // fokus: harga / promo / diskon / murah / mahal / rentang harga
  // =========================
  ["harga produk ini berapa", "price_promo"],
  ["berapa harganya", "price_promo"],
  ["ada diskon voltes", "price_promo"],
  ["yang lagi promo apa", "price_promo"],
  ["lagi sale apa", "price_promo"],
  ["produk di bawah 500 ribu", "price_promo"],
  ["barang 1 jutaan apa saja", "price_promo"],
  ["yang paling murah mana", "price_promo"],
  ["harga paling murah berapa", "price_promo"],
  ["beda yang mahal sama murah apa", "price_promo"],
  ["ada bundle promo ga", "price_promo"],
  ["harga nett atau masih bisa kurang", "price_promo"],
  ["yang murah tapi bagus ada", "price_promo"],
  ["budget saya 1 juta ada apa aja", "price_promo"],
  ["maksimal 500 ribu dapat apa", "price_promo"],
  ["harga di bawah sejuta apa aja", "price_promo"],
  ["barang promo yang available apa", "price_promo"],
  ["ada diskon untuk produk ini", "price_promo"],
  ["yang paling worth it murah mana", "price_promo"],
  ["kalau budget 2 juta pilihannya apa", "price_promo"],

  // =========================
  // stock_availability
  // fokus: ready / stok / habis / restock / preorder
  // =========================
  ["ini ready stock", "stock_availability"],
  ["masih ada ga", "stock_availability"],
  ["stoknya masih ada", "stock_availability"],
  ["barang ini ready", "stock_availability"],
  ["produk ini habis ya", "stock_availability"],
  ["kapan restock", "stock_availability"],
  ["stok voltron masih ada", "stock_availability"],
  ["barang tersedia", "stock_availability"],
  ["preorder atau ready", "stock_availability"],
  ["sisa berapa", "stock_availability"],
  ["bisa inden", "stock_availability"],
  ["ready di gudang", "stock_availability"],
  ["robot vintage yang ready", "stock_availability"],
  ["masih tersedia kah", "stock_availability"],
  ["stok aman", "stock_availability"],
  ["barangnya kosong ya", "stock_availability"],
  ["sudah sold out belum", "stock_availability"],
  ["masih ready tidak", "stock_availability"],
  ["restock lagi kapan", "stock_availability"],
  ["stok produk ini tinggal berapa", "stock_availability"],

  // =========================
  // shipping_transaction
  // fokus: ongkir / kurir / pembayaran / checkout / estimasi
  // =========================
  ["bisa kirim ke bandung", "shipping_transaction"],
  ["ongkir ke jakarta berapa", "shipping_transaction"],
  ["ongkir ke tangerang berapa", "shipping_transaction"],
  ["cek ongkir dong", "shipping_transaction"],
  ["berapa ongkirnya", "shipping_transaction"],
  ["pakai ekspedisi apa", "shipping_transaction"],
  ["kurirnya apa saja", "shipping_transaction"],
  ["bisa kirim pakai jne", "shipping_transaction"],
  ["opsi kurir apa saja", "shipping_transaction"],
  ["estimasi pengiriman berapa hari", "shipping_transaction"],
  ["estimasi sampai berapa lama", "shipping_transaction"],
  ["berapa hari sampai", "shipping_transaction"],
  ["lama pengiriman ke bandung berapa hari", "shipping_transaction"],
  ["ada asuransi pengiriman", "shipping_transaction"],
  ["bisa pakai asuransi", "shipping_transaction"],
  ["barang bisa diasuransikan", "shipping_transaction"],
  ["metode pembayaran apa", "shipping_transaction"],
  ["cara bayarnya bagaimana", "shipping_transaction"],
  ["bisa transfer bank", "shipping_transaction"],
  ["bisa bayar qris", "shipping_transaction"],
  ["ada gopay tidak", "shipping_transaction"],
  ["menerima kartu kredit", "shipping_transaction"],
  ["cara checkout gimana", "shipping_transaction"],
  ["cara pesan barangnya bagaimana", "shipping_transaction"],
  ["bisa cod", "shipping_transaction"],
  ["bisa ambil di toko", "shipping_transaction"],
  ["checkoutnya lewat mana", "shipping_transaction"],
  ["gimana proses pembayarannya", "shipping_transaction"],
  ["pengiriman pakai apa", "shipping_transaction"],
  ["jasa kirim yang tersedia apa", "shipping_transaction"],

  // =========================
  // shipping_origin
  // fokus: asal kirim / gudang / lokasi toko
  // =========================
  ["pengiriman dari mana", "shipping_origin"],
  ["dikirim dari mana", "shipping_origin"],
  ["asal pengiriman dari mana", "shipping_origin"],
  ["barang dikirim dari mana", "shipping_origin"],
  ["gudangnya di mana", "shipping_origin"],
  ["lokasi pengiriman dari mana", "shipping_origin"],
  ["kirim dari mana", "shipping_origin"],
  ["toko offline ada di mana", "shipping_origin"],
  ["lokasi toko di mana", "shipping_origin"],
  ["alamat toko di mana", "shipping_origin"],
  ["barang berangkat dari mana", "shipping_origin"],
  ["gudang robot jadul di mana", "shipping_origin"],

  // =========================
  // return_product
  // fokus: retur / refund / komplain / barang rusak / kebijakan
  // =========================
  ["barang rusak bisa retur", "return_product"],
  ["kalau mau refund gimana", "return_product"],
  ["box penyok bisa komplain", "return_product"],
  ["part kurang bisa retur", "return_product"],
  ["barang tidak sesuai deskripsi", "return_product"],
  ["cara retur produk", "return_product"],
  ["kebijakan refund bagaimana", "return_product"],
  ["barang cacat bisa komplain", "return_product"],
  ["retur di toko ini gimana", "return_product"],
  ["dana refund masuk berapa lama", "return_product"],
  ["bisa refund", "return_product"],
  ["pengembalian uang bagaimana", "return_product"],
  ["uang kembali kalau barang rusak", "return_product"],
  ["retur bisa refund", "return_product"],
  ["bagaimana proses refund", "return_product"],
  ["kalau barang tidak sesuai bisa uang kembali", "return_product"],
  ["dana kembali untuk retur bagaimana", "return_product"],
  ["barang pecah saat diterima bisa komplain", "return_product"],
  ["kalau salah kirim bisa retur", "return_product"],
  ["syarat pengembalian barang apa", "return_product"],
  [
    "produk yg dateng rusak, apakah bisa di kembalikan uangnya?",
    "return_product",
  ],
  ["produk datang rusak apakah bisa dikembalikan uangnya", "return_product"],
  ["barang nyampe rusak bisa refund", "return_product"],
  ["kalau barang rusak uang bisa balik", "return_product"],
  ["barang cacat apakah bisa pengembalian uang", "return_product"],
  ["kalau tidak sesuai bisa refund tidak", "return_product"],
  ["produk rusak bisa uang kembali", "return_product"],

  // =========================
  // transaction_status
  // fokus: status order/pesanan/transaksi
  // =========================
  ["cek status pesanan", "transaction_status"],
  ["status transaksi saya", "transaction_status"],
  ["cek order saya", "transaction_status"],
  ["status order saya", "transaction_status"],
  ["cek order id", "transaction_status"],
  ["order 6864 statusnya apa", "transaction_status"],
  ["order #6864 statusnya apa", "transaction_status"],
  ["cek status order 6864", "transaction_status"],
  ["status pesanan saya", "transaction_status"],
  ["cek transaksi saya", "transaction_status"],
  ["pesanan saya sudah diproses belum", "transaction_status"],
  ["order saya sudah dikirim belum", "transaction_status"],
  ["status invoice saya bagaimana", "transaction_status"],
  ["nomor order ini statusnya apa", "transaction_status"],
  ["pesanan saya sampai tahap mana", "transaction_status"],
  ["cek status order nomor 6864", "transaction_status"],
  ["transaksi saya sudah dibayar belum", "transaction_status"],
  ["status pesanan dengan id 6864", "transaction_status"],
  ["orderan saya lagi di mana statusnya", "transaction_status"],
  ["mau cek status pesanan saya", "transaction_status"],

  // =========================
  // shipment_tracking
  // fokus: tracking barang
  // =========================
  ["cek resi saya", "shipment_tracking"],
  ["lacak paket", "shipment_tracking"],
  ["paket saya sudah sampai mana", "shipment_tracking"],
  ["cek nomor resi", "shipment_tracking"],
];

// stopwords ringan biar token fokus
const INTENT_STOPWORDS = new Set([
  "yang",
  "yg",
  "nya",
  "apa",
  "mana",
  "ini",
  "itu",
  "ga",
  "gak",
  "nggak",
  "kah",
  "dong",
  "deh",
  "ya",
  "pak",
  "bu",
  "kak",
  "min",
  "admin",
  "tolong",
  "minta",
  "produk",
  "barang",
  "robot",
  "mainan",
]);

function tokenize(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !INTENT_STOPWORDS.has(t));
}

// Jaccard similarity untuk nentuin contoh dataset paling dekat
function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

// (opsional) boost keyword kuat per intent (lebih stabil dari murni similarity)
const INTENT_KEYWORDS = {
  product_discovery: [
    "cari",
    "list",
    "pilihan",
    "koleksi",
    "dicari",
    "series",
    "seri",
  ],
  product_detail: [
    "original",
    "ori",
    "ukuran",
    "size",
    "dimensi",
    "berat",
    "weight",
    "bahan",
    "material",
    "diecast",
    "limited",
    "edisi",
    "versi",
    "spesifikasi",
    "isi",
    "box",
    "misb",
    "kondisi",
  ],
  price_promo: [
    "harga",
    "murah",
    "mahal",
    "termurah",
    "termahal",
    "diskon",
    "promo",
    "sale",
    "cashback",
    "bundle",
    "hemat",
    "dibawah",
    "di bawah",
    "diatas",
    "di atas",
    "lebih dari",
    "kurang dari",
    "antara",
    "sampai",
    "jt",
    "juta",
    "rb",
    "ribu",
    "diskonnya",
    "promo nya",
    "lagi diskon",
    "lagi promo",
    "potongan",
    "sale hari ini",
    "promo sekarang",
  ],
  stock_availability: [
    "stok",
    "stock",
    "ready",
    "ready stock",
    "tersedia",
    "habis",
    "restock",
    "preorder",
    "po",
    "inden",
    "sisa",
  ],
  shipping_transaction: [
    "ongkir",
    "kirim",
    "pengiriman",
    "ekspedisi",
    "resi",
    "cod",
    "qris",
    "transfer",
    "bayar",
    "checkout",
    "pesan",
    "ambil",
    "pickup",
    "alamat",
    "pembayaran",
    "bayar",
    "metode pembayaran",
    "qris",
    "gopay",
    "transfer",
    "bank",
    "visa",
    "kartu kredit",
    "asuransi",
    "proteksi",
    "pengiriman aman",
    "asuransi pengiriman",
    "estimasi sampai",
    "estimasi pengiriman",
    "lama kirim",
    "lama pengiriman",
    "estimasi",
    "estimasi barang",
    "estimasi produk",
    "asuransi barang",
    "barang diasuransikan",
    "bisa diasuransikan",
  ],
  shipping_origin: [
    "dari mana",
    "dikirim dari",
    "asal pengiriman",
    "lokasi pengiriman",
    "gudang",
    "warehouse",
    "origin",
    "kirim dari",
    "lokasi toko",
    "lokasi offline",
    "toko offline",
    "lokasi di mana",
    "lokasi dari mana",
  ],
  return_product: [
    "retur",
    "pengembalian barang",
    "return",
    "refund",
    "komplain",
    "complain",
    "rusak",
    "cacat",
    "part kurang",
    "kurang part",
    "tidak lengkap",
    "ga lengkap",
    "box penyok",
    "penyok",
    "salah kirim",
    "tidak sesuai deskripsi",
    "ga sesuai deskripsi",
    "kebijakan retur",
    "aturan retur",
    "batas waktu retur",
    "refund",
    "pengembalian uang",
    "uang kembali",
    "dana kembali",
    "retur",
    "barang rusak",
    "barang tidak sesuai",
    "pengembalian uang",
  ],
  recommendation: [
    "rekomendasi",
    "recommended",
    "rekomen",
    "terbaik",
    "bagus",
    "cocok",
    "worth it",
    "untuk pajangan",
    "buat pajangan",
    "display",
    "koleksi",
    "untuk koleksi",
    "hadiah",
    "alasan",
    "alasannya",
    "kenapa",
    "pajangan",
    "budget",
  ],
  transaction_status: [
    "status transaksi",
    "status pesanan",
    "status order",
    "order id",
    "cek order",
    "cek pesanan",
  ],
};

function isOpinionQuestion(q = "") {
  const s = String(q || "").toLowerCase();

  return (
    s.includes("bagus") ||
    s.includes("worth it") ||
    s.includes("layak") ||
    s.includes("cocok") ||
    s.includes("recommended") ||
    s.includes("rekomen") ||
    s.includes("rekomendasi") ||
    s.includes("menarik") ||
    s.includes("oke gak") ||
    s.includes("oke ga") ||
    s.includes("bagus engga") ||
    s.includes("bagus nggak") ||
    s.includes("bagus ga")
  );
}

// ===============================
// 🔤 LEVENSHTEIN
// ===============================
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function classifyIntentFromDataset(rawQuestion = "") {
  const qTokens = tokenize(rawQuestion);

  // 1) keyword boost
  const qLower = rawQuestion.toLowerCase();
  const kwScore = {
    product_discovery: 0,
    product_detail: 0,
    price_promo: 0,
    stock_availability: 0,
    shipping_transaction: 0,
    shipping_origin: 0,
    greeting: 0,
    return_product: 0,
    recommendation: 0,
  };

  for (const [intent, kws] of Object.entries(INTENT_KEYWORDS)) {
    for (const k of kws) {
      if (qLower.includes(k)) kwScore[intent] += 1;
    }
  }

  // 2) similarity ke dataset
  let best = { intent: "product_discovery", score: 0 };
  for (const [ex, intent] of INTENT_DATASET) {
    const s = jaccard(qTokens, tokenize(ex));
    if (s > best.score) best = { intent, score: s };
  }

  if (
    qLower.includes("paling dicari") ||
    qLower.includes("terpopuler") ||
    qLower.includes("best seller") ||
    qLower.includes("bestseller") ||
    qLower.includes("paling laku") ||
    qLower.includes("yang paling banyak dicari")
  ) {
    return {
      intent: "recommendation",
      method: "popularity_rule",
      score: 0.95,
    };
  }
  if (
    qLower.includes("lagi nyari") ||
    qLower.includes("lagi cari") ||
    qLower.includes("mau cari") ||
    qLower.includes("ada pilihan") ||
    qLower.includes("kategori") ||
    (qLower.includes("produk") && qLower.includes("ada"))
  ) {
    return {
      intent: "product_discovery",
      method: "discovery_phrase_rule",
      score: 0.9,
    };
  }

  if (
    qLower.includes("rekomendasi") ||
    qLower.includes("rekomen") ||
    qLower.includes("cocok untuk") ||
    qLower.includes("buat pajangan") ||
    qLower.includes("untuk pajangan") ||
    qLower.includes("display") ||
    qLower.includes("untuk koleksi") ||
    qLower.includes("buat koleksi") ||
    qLower.includes("worth it")
  ) {
    return {
      intent: "recommendation",
      method: "recommendation_rule",
      score: 0.92,
    };
  }

  // gabung: keyword + similarity
  // (keyword menang kalau user jelas ngomong ongkir/checkout/harga/stok)
  const bestByKw = Object.entries(kwScore).sort((a, b) => b[1] - a[1])[0];
  const [kwIntent, kwVal] = bestByKw;

  // threshold: kalau similarity kecil banget, pakai keyword; kalau keyword kosong, default discovery
  if (kwVal >= 2) return { intent: kwIntent, method: "keyword", score: kwVal };
  if (best.score >= 0.2)
    return { intent: best.intent, method: "dataset", score: best.score };

  return { intent: "product_discovery", method: "fallback", score: 0 };
}

// ===============================
// TYPO NORMALIZATION
// ===============================

const TYPO_MAP = {
  vitage: "vintage",
  vintge: "vintage",
  msib: "misb",
  orginal: "original",
  oriignal: "original",
  stokk: "stok",
  ongkiir: "ongkir",
  dikirm: "dikirim",
  brapa: "berapa",
  gundm: "gundam",
  voltrn: "voltron",
  brapa: "berapa",
  cogokin: "chogokin",
  chocogin: "chogokin",
  termura: "termurah",
  murh: "murah",
};

function fuzzyCorrectWord(word, dictionary) {
  if (!word || word.length < 4) return word;

  let best = word;
  let bestScore = 0;

  for (const target of dictionary) {
    const dist = levenshtein(word, target);

    const score = 1 - dist / Math.max(word.length, target.length);

    if (score > bestScore) {
      bestScore = score;
      best = target;
    }
  }

  if (bestScore >= 0.7) {
    return best;
  }

  return word;
}

const IMPORTANT_WORDS = [
  "misb",
  "original",
  "stok",
  "ready",
  "ongkir",
  "checkout",
  "vintage",
  "gashapon",
  "gundam",
  "voltron",
  "grendizer",
];

const PRODUCT_WORDS = [
  "voltron",
  "voltes",
  "gundam",
  "grendizer",
  "mazinger",
  "getter",
  "gashapon",
  "chogokin",
  "bandai",
  "takara",
  "vintage",
  "figure",
  "diecast",
  "model",
  "kit",
];

const CORRECTION_WORDS = [...IMPORTANT_WORDS, ...PRODUCT_WORDS];

function normalize(s = "") {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeQuestion(rawQuestion = "") {
  let q = rawQuestion.toLowerCase().trim();

  const words = q.split(/\s+/);

  const fixed = words.map((w) => {
    // typo map prioritas pertama
    if (TYPO_MAP[w]) return TYPO_MAP[w];

    // fuzzy correction
    return fuzzyCorrectWord(w, CORRECTION_WORDS);
  });

  return fixed.join(" ");
}

async function classifyIntentHybrid(rawQuestion) {
  try {
    // const ml = await withTimeout(classifyIntentML(rawQuestion), 1500);
    const ml = await classifyIntentML(rawQuestion);

    if (ml.confidence >= 0.4) {
      return {
        intent: ml.intent,
        method: "ml",
        score: ml.confidence,
        ml_confidence: ml.confidence,
      };
    }

    const rule = classifyIntentFromDataset(rawQuestion);
    return {
      intent: rule.intent,
      method: "fallback_rule_low_confidence",
      score: ml.confidence ?? rule.score ?? 0,
      ml_confidence: ml.confidence,
      ml_intent: ml.intent,
    };
  } catch (err) {
    console.error("ML INTENT ERROR:", err?.message || err);

    const rule = classifyIntentFromDataset(rawQuestion);
    return {
      intent: rule.intent,
      method: "fallback_rule_low_confidence",
      score: rule.score ?? 0,
    };
  }
}

async function explainRecommendationWithGemini({
  rawQuestion,
  chosenProducts,
  recNeeds,
}) {
  if (!genai) return null;

  const safeProducts = chosenProducts.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.numericPrice,
    stock: p.stock,
    discountPercent: p.discountPercent || 0,
    category: p.category || "",
    condition: p.condition || "",
    totalSales: p.totalSales || 0,
    averageRating: p.averageRating || 0,
    recommendationReasons: p.recommendationReasons || [],
  }));

  const prompt = `
Kamu adalah AI assistant ecommerce Robot Jadul.

TUGAS:
Jelaskan alasan kenapa produk-produk berikut direkomendasikan untuk user.

ATURAN PENTING:
- Gunakan HANYA data yang ada di JSON.
- Jangan menambah fakta yang tidak tersedia.
- Jangan menyebut produk sebagai langka, collectible, premium, terbaik, atau cocok untuk pajangan jika data tidak mendukung.
- Boleh merangkum alasan menjadi bahasa yang natural dan enak dibaca.
- Fokus pada alasan seperti: masuk budget, ready stock, diskon, kategori, kondisi, rating, sales, dan kecocokan kebutuhan user.
- Buat ringkas, jelas, dan meyakinkan.
- Lebih utamakan bullet/simbol seperti: • ✅ ⚠️ 📦 🚚
- Bahasa Indonesia santai tapi sopan.

KEMBALIKAN JSON VALID SAJA:
{
  "reasoning_text": "..."
}

DATA USER:
${JSON.stringify(
  {
    rawQuestion,
    recNeeds,
    chosenProducts: safeProducts,
  },
  null,
  2,
)}
`;

  const resp = await genai.models.generateContent({
    model: GEMINI_MODELS.SMART,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  let txt = (resp.text || "").trim();
  txt = txt
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

// ===============================
// Rekomendasi dengan Gemini
// =============================
async function recommendWithGemini({
  rawQuestion,
  candidates,
  mode = "recommendation",
}) {
  if (!genai) return null;

  const facts = candidates.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.numericPrice || 0,
    stock: p.stock,
    stockQuantity: p.stockQuantity ?? null,
    totalSales: p.totalSales ?? 0,
    averageRating: p.averageRating ?? 0,
    ratingCount: p.ratingCount ?? 0,
    condition: p.condition || "(tidak tercantum)",
    category: p.category || "",
    weight: p.weight || "",
    dimensions: p.dimensions || {},
    description: stripHtml(p.description || "").slice(0, 1200),
    link: p.link || "",
  }));

  const prompt = `
Kamu adalah AI recommendation engine untuk toko koleksi robot.

TUGAS:
1. Pilih maksimal 3 produk terbaik dari data kandidat.
2. WAJIB jelaskan alasan setiap produk dipilih.
3. Jika user menyebut budget, alasan HARUS menjelaskan kenapa harga produk masih masuk budget.
4. Jika user menyebut "untuk pajangan" / "display", alasan HARUS fokus pada kecocokan untuk pajangan.
5. Boleh gunakan bullet sederhana seperti: • ✅ 💰 📦
6. Jangan hanya mengulang range harga user.
7. reasoning_text harus berisi:
   - ringkasan singkat,
   - alasan produk 1,
   - alasan produk 2,
   - alasan produk 3,
   - penutup singkat.

ATURAN KERAS:
- Jangan mengarang spesifikasi.
- Jangan mengarang angka.
- Hanya gunakan data kandidat.
- Alasan harus spesifik terhadap masing-masing produk.
- Jangan jawab template umum.

PERTANYAAN USER:
${rawQuestion}

MODE:
${mode}

DATA KANDIDAT:
${JSON.stringify(facts, null, 2)}

Kembalikan JSON valid saja:
{
  "chosen_product_ids": [1,2,3],
  "reasoning_text": "alasan lengkap dan natural",
  "summary_label": "best_seller | terpopuler | rekomendasi | worth_it"
}
`;

  try {
    let txt = await geminiText({
      model: GEMINI_MODELS.SMART,
      prompt,
      temperature: 0.3,
    });

    txt = (txt || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(txt);

    return {
      chosen_product_ids: Array.isArray(parsed.chosen_product_ids)
        ? parsed.chosen_product_ids
        : [],
      reasoning_text: parsed.reasoning_text || null,
      summary_label: parsed.summary_label || null,
    };
  } catch (err) {
    console.error("GEMINI RECOMMEND CORE ERROR:", err?.message || err);
    return null;
  }
}

// ===============================
// Gemini semantic
// ==============================
async function parseUserIntentWithGemini(rawQuestion, session = null) {
  if (!genai) return null;

  const recentContext = {
    lastIntent: session?.lastIntent || null,
    lastTopic: session?.lastTopic || null,
    lastProductNames: Array.isArray(session?.lastProducts)
      ? session.lastProducts.map((p) => p.name).slice(0, 3)
      : [],
    slots: session?.slots || {},
  };

  const prompt = `
Kamu bertugas sebagai semantic parser untuk chatbot ecommerce koleksi robot.

TUGAS:
Pahami maksud user dan ubah menjadi JSON terstruktur.
JANGAN jawab seperti chatbot.
JANGAN beri penjelasan.
HANYA keluarkan JSON valid.

INPUT USER:
${rawQuestion}

KONTEKS SESSION:
${JSON.stringify(recentContext, null, 2)}

ATURAN:
- Pahami bahasa informal, typo ringan, dan maksud implisit.
- Jika user bertanya rekomendasi, intent bisa "recommendation".
- Jika user bertanya detail spesifikasi, intent bisa "product_detail".
- Jika user bertanya stok, intent bisa "stock_availability".
- Jika user bertanya harga/promo/budget, intent bisa "price_promo".
- Jika user bertanya ongkir/pengiriman/checkout, intent bisa "shipping_transaction".
- Jika user membandingkan 2 produk, intent bisa "compare".
- Jika user hanya menyapa, intent bisa "greeting".

Field JSON yang wajib:
{
  "intent": "greeting | recommendation | product_discovery | product_detail | stock_availability | price_promo | shipping_transaction | shipping_origin | compare | general",
  "user_goal": "display | collection | gift | play | investment | comparison | info | shipping | checkout | unknown",
  "style_preference": "",
  "keywords": [],
  "category_hint": "",
  "product_name": "",
  "compare_product_a": "",
  "compare_product_b": "",
  "budget_text": "",
  "condition_preference": "",
  "needs_followup": false,
  "followup_question": "",
  "sort_preference": "best_match | cheapest | most_expensive | newest | ready_stock"
}

Output JSON saja.
`;

  try {
    let txt = await geminiText({
      model: GEMINI_MODELS.FAST,
      prompt,
      temperature: 0.1,
    });

    txt = (txt || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(txt);

    return {
      intent: parsed.intent || "general",
      user_goal: parsed.user_goal || "unknown",
      style_preference: parsed.style_preference || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      category_hint: parsed.category_hint || "",
      product_name: parsed.product_name || "",
      compare_product_a: parsed.compare_product_a || "",
      compare_product_b: parsed.compare_product_b || "",
      budget_text: parsed.budget_text || "",
      condition_preference: parsed.condition_preference || "",
      needs_followup: !!parsed.needs_followup,
      followup_question: parsed.followup_question || "",
      sort_preference: parsed.sort_preference || "best_match",
    };
  } catch (err) {
    console.error("SEMANTIC PARSE ERROR:", err?.message || err);
    return null;
  }
}

// ===============================
// fetch products dengan sorting harga murah/mahal (untuk price_promo)
// ===============================
async function fetchProductsByPrice({ cheapest, includeOOS, limit = 3 }) {
  const params = new URLSearchParams({
    per_page: String(Math.min(Math.max(limit, 3), 20)),
    orderby: "price",
    order: cheapest ? "asc" : "desc",
    status: "publish",
  });

  // kalau user tidak minta include OOS, filter ready stock di API
  if (!includeOOS) params.set("stock_status", "instock");

  const url = `https://pstaging.my.id/robotjadul/wp-json/wc/v3/products?${params.toString()}`;

  return await fetchWithTimeoutJson(
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
    20000,
  );
}

function isDiscoveryStyleQuestion(q = "") {
  const s = q.toLowerCase();

  return (
    s.includes("lagi nyari") ||
    s.includes("lagi cari") ||
    s.includes("mau cari") ||
    s.includes("cari") ||
    s.includes("ada ga disini") ||
    s.includes("ada di sini") ||
    s.includes("ada ga") ||
    s.includes("ada pilihan") ||
    s.includes("kategori") ||
    s.includes("produk") ||
    s.includes("koleksi toko") ||
    s.includes("bisa dibeli") ||
    s.includes("masuk koleksi toko")
  );
}

// ===============================
// WC CACHE (biar gak fetch berat tiap request)
// ===============================

async function fetchWithTimeoutJson(url, options = {}, ms = 4000, retries = 2) {
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), ms);

    try {
      const r = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!r.ok) throw new Error("FETCH_FAILED:" + r.status);
      return await r.json();
    } catch (err) {
      lastErr = err;

      const aborted =
        err?.name === "AbortError" ||
        String(err?.message || "")
          .toLowerCase()
          .includes("aborted");

      if (!aborted || i === retries) throw err;

      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr;
}

let wcCache = { at: 0, data: null };

async function getProductsCached() {
  const now = Date.now();
  if (wcCache.data && now - wcCache.at < 1000 * 60 * 10) return wcCache.data;

  const perPage = 100;
  let page = 1;
  let all = [];

  while (true) {
    const url = `https://pstaging.my.id/robotjadul/wp-json/wc/v3/products?per_page=${perPage}&page=${page}&status=publish`;

    const data = await fetchWithTimeoutJson(
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
      20000,
    );

    if (!Array.isArray(data) || data.length === 0) break;

    all = all.concat(data);

    // kalau hasilnya kurang dari perPage, berarti halaman terakhir
    if (data.length < perPage) break;

    page += 1;

    // safety biar gak infinite loop
    if (page > 20) break;
  }

  wcCache = { at: now, data: all };
  return all;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("LLM_TIMEOUT")), ms),
    ),
  ]);
}

function formatRupiah(n) {
  const x = Number(n || 0);
  if (!x) return "—";
  return "Rp " + x.toLocaleString("id-ID");
}

function calcDiscountPercent(regularPrice, salePrice) {
  const regular = Number(regularPrice || 0);
  const sale = Number(salePrice || 0);

  if (!regular || !sale) return 0;
  if (sale >= regular) return 0;

  return Math.round(((regular - sale) / regular) * 100);
}

function isPromoProduct(p) {
  const regular = Number(p.regular_price || 0);
  const sale = Number(p.sale_price || 0);

  return regular > 0 && sale > 0 && sale < regular;
}

function stripHtml(html = "") {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ===============================
// GET ONGKIR FROM WORDPRESS
// ===============================
async function getShippingQuoteFromWP_OKID({
  city_id,
  district_id,
  weight_grams = 1000,
}) {
  const token = process.env.RJ_SHIP_TOKEN;

  const r = await fetch(
    "https://pstaging.my.id/robotjadul/wp-json/rj/v1/shipping-quote",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rj-token": token,
      },
      body: JSON.stringify({
        destination: { city_id, district_id },
        items: [{ qty: 1, weight_grams }],
      }),
    },
  );

  const txt = await r.text().catch(() => "");
  if (!r.ok) {
    console.error("SHIP_QUOTE_FAIL_BODY:", txt);
    throw new Error("SHIP_QUOTE_FAILED:" + r.status);
  }

  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

async function searchCitiesFromWP(q) {
  const r = await fetch(
    `https://pstaging.my.id/robotjadul/wp-json/rj/v1/cities?q=${encodeURIComponent(q)}`,
    { headers: { "x-rj-token": process.env.RJ_SHIP_TOKEN } },
  );
  if (!r.ok) throw new Error("CITIES_FAILED:" + r.status);
  return r.json();
}

async function searchDistrictsFromWP(city_id, q) {
  const r = await fetch(
    `https://pstaging.my.id/robotjadul/wp-json/rj/v1/districts?city_id=${city_id}&q=${encodeURIComponent(q)}`,
    { headers: { "x-rj-token": process.env.RJ_SHIP_TOKEN } },
  );
  if (!r.ok) throw new Error("DISTRICTS_FAILED:" + r.status);
  return r.json();
}

function norm(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensForCompare(s = "") {
  return norm(s)
    .split(" ")
    .filter((t) => t.length >= 2 && !COMPARE_STOP.has(t));
}

function jaccardSet(A, B) {
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function bestMatchByName(queryName, products) {
  const qn = norm(queryName);
  const qTokens = new Set(tokensForCompare(queryName));
  if (!qn || qTokens.size === 0) return { best: null, bestScore: 0, top: [] };

  let best = null;
  let bestScore = 0;
  const scored = [];

  for (const p of products) {
    const pn = norm(p.name || "");
    if (!pn) continue;

    // 1) exact
    if (pn === qn)
      return { best: p, bestScore: 1.0, top: [{ name: p.name, score: 1.0 }] };

    // 2) substring
    let score = 0;
    if (pn.includes(qn) || qn.includes(pn)) score = 0.95;
    else {
      // 3) jaccard token
      const pTokens = new Set(tokensForCompare(p.name || ""));
      score = jaccardSet(qTokens, pTokens);

      // bonus kecil kalau semua token query ada di produk
      let allIn = true;
      for (const t of qTokens) {
        if (!pTokens.has(t)) {
          allIn = false;
          break;
        }
      }
      if (allIn) score = Math.min(1, score + 0.15);
    }

    scored.push({ p, score });
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  scored.sort((a, b) => b.score - a.score);

  return {
    best,
    bestScore,
    top: scored
      .slice(0, 4)
      .map((x) => ({ name: x.p.name, score: Number(x.score.toFixed(2)) })),
  };
}

function explainBestRuleBased(best, candidates = [], rawQuestion = "") {
  const q = String(rawQuestion || "").toLowerCase();

  const isPopularity =
    q.includes("paling dicari") ||
    q.includes("terpopuler") ||
    q.includes("best seller") ||
    q.includes("bestseller") ||
    q.includes("paling laku") ||
    q.includes("yang paling banyak dicari");

  const isWorthIt =
    q.includes("worth it") ||
    q.includes("terbaik") ||
    q.includes("bagus") ||
    q.includes("rekomendasi");

  const reasons = [];
  const compareReasons = [];

  // ===== alasan utama produk =====
  if (isPopularity) {
    if (Number(best.totalSales || 0) > 0) {
      reasons.push(
        `punya penjualan toko yang kuat, yaitu **${Number(best.totalSales).toLocaleString("id-ID")}** transaksi`,
      );
    }

    if (
      Number(best.ratingCount || 0) > 0 &&
      Number(best.averageRating || 0) > 0
    ) {
      reasons.push(
        `punya rating **${Number(best.averageRating).toFixed(1)} / 5** dari **${Number(best.ratingCount).toLocaleString("id-ID")}** ulasan`,
      );
    }

    if (best.stock === "instock") {
      reasons.push(
        "stoknya masih ✅ **ready**, jadi lebih aman kalau ingin langsung checkout",
      );
    }

    if (best.condition) {
      reasons.push(
        `🫙 kondisinya tercatat **${best.condition}**, yang membuat nilainya lebih menarik untuk kolektor`,
      );
    }
  } else {
    if (best.stock === "instock") {
      reasons.push("stoknya ✅ **ready**, jadi bisa langsung diproses");
    } else {
      reasons.push("produknya menarik, walau saat ini stoknya belum ready");
    }

    if (best.condition) {
      reasons.push(`🫙 kondisinya tercatat **${best.condition}**`);
    }

    if (best.numericPrice) {
      reasons.push(`💰 harganya ada di **${formatRupiah(best.numericPrice)}**`);
    }

    if (best.weight) {
      reasons.push(`📦 berat produk sekitar **${best.weight} gram**`);
    }

    const d = best.dimensions || {};
    const dimText =
      d.length || d.width || d.height
        ? `${d.length || "-"} x ${d.width || "-"} x ${d.height || "-"}`
        : null;

    if (dimText) {
      reasons.push(`📦 dimensinya tercatat **${dimText}**`);
    }
  }

  const desc = stripHtml(best.description || "");
  if (desc) {
    const shortDesc =
      desc.length > 220 ? desc.slice(0, 220).trim() + "…" : desc.trim();

    if (isPopularity) {
      reasons.push(`deskripsinya juga cukup kuat 💪, yaitu: *${shortDesc}*`);
    } else if (isWorthIt) {
      reasons.push(
        `dari deskripsi produk, poin yang menonjol adalah: *${shortDesc}*`,
      );
    }
  }

  // ===== bandingkan dengan alternatif =====
  const alts = candidates.filter((p) => p.id !== best.id).slice(0, 2);

  for (const alt of alts) {
    const points = [];

    if (Number(best.totalSales || 0) > Number(alt.totalSales || 0)) {
      points.push("penjualannya lebih kuat");
    }

    if (Number(best.ratingCount || 0) > Number(alt.ratingCount || 0)) {
      points.push("ulasannya lebih banyak");
    }

    if (
      Number(best.averageRating || 0) > 0 &&
      Number(alt.averageRating || 0) > 0 &&
      Number(best.averageRating || 0) > Number(alt.averageRating || 0)
    ) {
      points.push("ratingnya lebih tinggi");
    }

    if (best.stock === "instock" && alt.stock !== "instock") {
      points.push("stoknya lebih aman");
    }

    if (
      Number(best.numericPrice || 0) > 0 &&
      Number(alt.numericPrice || 0) > 0 &&
      Number(best.numericPrice || 0) < Number(alt.numericPrice || 0) &&
      !isPopularity
    ) {
      points.push("harganya lebih menarik");
    }

    if (points.length) {
      compareReasons.push(
        `dibanding **${alt.name}**, produk ini unggul karena ${points.join(", ")}`,
      );
    }
  }

  // ===== pembuka =====
  let intro = "";

  if (isPopularity) {
    intro = `Kalau melihat **data toko yang tersedia**, produk yang paling menonjol adalah **${best.name}** 🎗️.`;
  } else if (isWorthIt) {
    intro = `Dari beberapa kandidat yang ada 🎗️, **${best.name}** terlihat paling menarik untuk direkomendasikan.`;
  } else {
    intro = `Produk yang paling cocok menurutku adalah **${best.name}** 🎗️.`;
  }

  // ===== blok alasan =====
  let reasonBlock = "";
  if (reasons.length) {
    reasonBlock =
      "\n\nAlasan utamanya:\n" + reasons.map((r) => `• ${r}`).join("\n");
  }

  let compareBlock = "";
  if (compareReasons.length) {
    compareBlock =
      "\n\nKalau dibandingkan dengan kandidat lain:\n" +
      compareReasons.map((r) => `• ${r}`).join("\n");
  }

  let altBlock = "";
  if (alts.length) {
    altBlock =
      "\n\nAlternatif lain yang masih layak dilihat:\n" +
      alts
        .map((p, i) => {
          const stockText = p.stock === "instock" ? "ready" : "tidak ready";
          const salesText =
            Number(p.totalSales || 0) > 0
              ? `, terjual ${Number(p.totalSales).toLocaleString("id-ID")}x`
              : "";

          return `• ${i + 1}. **${p.name}** — ${formatRupiah(p.numericPrice)} (${stockText}${salesText})`;
        })
        .join("\n");
  }

  // ===== penutup =====
  let closing = "";
  if (isPopularity) {
    closing =
      "\n\nJadi, kalau kamu cari yang paling kuat secara performa toko saat ini, ini yang paling layak diprioritaskan 🏷️.";
  } else {
    closing =
      "\n\nKalau mau, aku juga bisa bantu pilih mana yang paling cocok berdasarkan budget, stok, atau kondisi koleksinya 😊.";
  }

  return intro + reasonBlock + compareBlock + altBlock + closing;
}

const COMPARE_STOP = new Set([
  "robot",
  "by",
  "with",
  "the",
  "and",
  "dengan",
  "series",
  "seri",
  "ver",
  "version",
  "limited",
  "edition",
  "set",
  "figure",
  "figma",
  "model",
  "kit",
  "project",
  "modeling",
  "modelling",
  "toys",
  "toy",
  "actiontoys",
  "action-toys",
  // ❌ JANGAN masukin: grendizer/voltron/chogokin/gx/dll
]);

// ==============================
// LOAD MEMORY SESSION SETIAP PERTANYAAN
// ==============================

async function loadSessionState(sessionId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("state")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("LOAD SESSION ERROR:", error.message);
    return null;
  }
  return data?.state || null;
}

async function saveSessionState(sessionId, state) {
  if (!supabase) return;

  const { error } = await supabase
    .from("chat_sessions")
    .upsert(
      { session_id: sessionId, state, updated_at: new Date().toISOString() },
      { onConflict: "session_id" },
    );

  if (error) console.error("SAVE SESSION ERROR:", error.message);
}

function isGreetingOnly(text = "") {
  const s = String(text).toLowerCase().trim();

  // buang tanda baca biar "hai!!" tetap kebaca
  const cleaned = s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // greeting yang umum
  const greetings = [
    "halo",
    "hallo",
    "hai",
    "hi",
    "hello",
    "selamat pagi",
    "pagi",
    "selamat siang",
    "siang",
    "selamat sore",
    "sore",
    "selamat malam",
    "malam",
    "assalamualaikum",
    "asalamualaikum",
    "permisi",
    "haii",
    "halo min",
    "halo kak",
    "hi min",
    "hi kak",
  ];

  // kalau user cuma 1-3 kata pendek, dan isinya greeting
  const w = cleaned.split(" ").filter(Boolean);

  // contoh: "hai", "halo min", "selamat pagi", "pagi kak"
  const small = w.length <= 3;

  if (!small) return false;

  // kalau frasa greeting match di awal/utuh
  return greetings.some((g) => cleaned === g || cleaned.startsWith(g + " "));
}

function buildGreetingMessage() {
  const greetings = [
    "Halo! 😊 Aku bisa bantu cari produk robot, cek stok, bandingin barang, atau cek ongkir.",
    "Hai! 👋 Ada yang bisa aku bantu? Kamu bisa tanya produk, stok, atau ongkir.",
    "Hello! 🤖 Selamat datang di Robot Jadul. Mau cari robot apa hari ini?",
    "Halo! Senang bisa bantu. Kamu bisa tanya produk, harga, atau cara checkout 😊",
  ];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

// ==============================
// SUGGESTION POPOVER (random dari beberapa kategori)
// ==============================

const SUGGESTION_GROUPS = {
  product: [
    "Ada Chogokin murah?",
    "Rekomendasi voltes yang bagus",
    "Robot vintage yang bagus apa?",
    "Ada Mazinger Z yang ready?",
    "Ada produk di bawah 1 juta?",
    "Ada figure robot yang cocok buat koleksi?",
    "Produk Bandai yang recommended apa?",
    "Ada robot jadul yang masih ready stock?",
    "Mainan robot yang paling bagus apa?",
    "Ada produk Voltron yang bagus?",
    "Cari Grendizer yang recommended",
    "Ada Getter Robo yang ready?",
  ],

  compare: [
    "Bandingkan Voltron dengan Grendizer",
    "Bandingkan Getter Robo dan Grendizer",
    "Bandingkan Mazinger Z dan Great Mazinger",
    "Apa bedanya Voltron dan Golion?",
    "Lebih bagus Grendizer atau Mazinger Z?",
    "Bandingkan dua produk Chogokin",
    "Mana yang lebih worth it, Voltes atau Grendizer?",
    "Bandingkan robot vintage dan robot chogokin",
    "Bedakan 2 robot transformers yang paling worthit?",
    "Mana yang lebih cocok untuk koleksi, Voltron atau Getter?",
  ],

  stock: [
    "Stok gashapon vintage masih ada?",
    "Voltron ini masih ada?",
    "Chogokin yg ready stock apa aja?",
    "Masih ada produk Grendizer?",
    "Stok soul of chogokin masih tersedia apa aja?",
    "Ada barang yang bisa langsung dikirim dari model kits?",
    "Masih ada stok Mazinger Z?",
    "Produk Bandai yang ready apa saja?",
  ],

  shipping: [
    "Ongkir ke Bandung berapa?",
    "Bisa kirim ke Surabaya?",
    "Ongkir ke Jakarta berapa?",
    "Estimasi pengiriman berapa hari?",
    "Bisa kirim ke luar kota?",
    "Pakai ekspedisi apa?",
    "Bisa kirim ke Medan?",
    "Bisa cek ongkir ke Bekasi?",
    "Berapa ongkir ke Jogja?",
    "Kalau ke luar pulau bisa kirim?",
    "Bisa COD atau tidak?",
    "Bisa bayar QRIS?",
    "Metode pembayaran apa saja?",
    "Pembayarannya bisa pakai apa saja?",
  ],

  checkout: [
    "Cara checkout gimana?",
    "Cara order di sini gimana?",
    "Cara beli produk ini gimana?",
    "Kalau mau pesan langkahnya apa?",
    "Cara menyelesaikan pesanan gimana?",
    "Bagaimana proses pembeliannya?",
  ],

  price: [
    "Produk termurah di sini apa?",
    "Ada robot di bawah 500 ribu?",
    "Chogokin yang murah apa saja?",
    "Harga Voltron berapa?",
    "Ada promo untuk robot vintage?",
    "Produk di bawah 1 juta apa saja?",
    "Ada diskon sekarang?",
    "Yang paling worth it mana?",
    "Ada bundle menarik?",
    "Produk paling mahal di sini apa?",
    "Ada figure robot yang murah?",
    "Harga Grendizer z berapa?",
  ],

  recommendation: [
    "Rekomendasi robot untuk koleksi apa?",
    "Kalau buat pajangan bagusnya apa?",
    "Yang paling worth it untuk dibeli apa?",
    "Kalau suka robot jadul sebaiknya pilih apa?",
    "Rekomendasi produk untuk kolektor pemula",
    "Produk yang paling dicari apa?",
    "Rekomendasi robot yg bagus budget 1 jutaan",
    "Rekomendasi Action figure budget 3 juta - 5 juta",
    "Robot yang paling populer apa?",
    "Kalau budget terbatas enaknya beli apa?",
    "Rekomendasi Chogokin terbaik",
    "Rekomendasi Gundam untuk pemula",
    "Kalau mau mulai koleksi, produk apa yang cocok?",
    "Yang bagus untuk hadiah apa?",
  ],

  location: [
    "Alamat toko di mana?",
    "Ada toko offline?",
    "Bisa datang langsung ke toko?",
    "Lokasi Robot Jadul di mana?",
    "Tokonya ada di Jakarta?",
    "Kalau mau ambil langsung bisa?",
    "Toko fisiknya di mana?",
    "Bisa pickup di toko?",
  ],
};

function pickRandom(arr = []) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getSmartSuggestions(session = null) {
  const usedTexts = new Set(
    Array.isArray(session?.history)
      ? session.history
          .filter((x) => x?.type === "user" && x?.text)
          .map((x) => String(x.text).trim())
      : [],
  );

  function pickUnused(arr = []) {
    const filtered = arr.filter((x) => !usedTexts.has(x));
    return pickRandom(filtered.length ? filtered : arr);
  }

  const chosen = [];

  const buckets = [
    SUGGESTION_GROUPS.product,
    SUGGESTION_GROUPS.compare,
    SUGGESTION_GROUPS.stock,
    SUGGESTION_GROUPS.shipping,
    SUGGESTION_GROUPS.checkout,
    SUGGESTION_GROUPS.price,
    SUGGESTION_GROUPS.recommendation,
    SUGGESTION_GROUPS.location,
  ];

  // ambil 1 dari 6 kategori acak
  const shuffledBuckets = [...buckets].sort(() => 0.5 - Math.random());
  shuffledBuckets.slice(0, 6).forEach((group) => {
    const item = pickUnused(group);
    if (item && !chosen.includes(item)) chosen.push(item);
  });

  return chosen.slice(0, 6);
}

// ==============================
// PENDING STATE (BIAR BISA DIALOG MULTI STEP, MISAL ONGKIR: butuh kota dulu, lalu kecamatan, lalu produk)
// ==============================

function setLastBotQuestion(session, type, meta = {}) {
  session.lastBotQuestionType = type;
  session.lastBotQuestionMeta = meta;
}

function clearLastBotQuestion(session) {
  session.lastBotQuestionType = null;
  session.lastBotQuestionMeta = null;
}

function updateSlot(session, key, value) {
  if (!session.slots) session.slots = {};
  session.slots[key] = value;
}

function isShortFollowUp(text = "") {
  const s = String(text).trim();
  if (!s) return false;

  const words = s.split(/\s+/).filter(Boolean);
  return words.length <= 4 && s.length <= 40;
}

// ==============================
// reset ingatan
// =============================
function resetConversationContext(session) {
  session.lastIntent = null;
  session.lastTopic = null;
  session.lastStep = null;
  session.lastProducts = null;
  session.lastBotQuestionType = null;
  session.lastBotQuestionMeta = null;
  session.pending = null;
  session.lastFilters = {
    priceMode: null,
    stockOnly: false,
    promoOnly: false,
    keyword: null,
    source: null,
  };
  session.slots = {
    city: null,
    district: null,
    productName: null,
    category: null,
    brand: null,
    budgetMin: null,
    budgetMax: null,
    condition: null,
  };
}

function isSpecFollowUpQuestion(q = "") {
  const s = q.toLowerCase();
  return (
    s.includes("berat") ||
    s.includes("weight") ||
    s.includes("ukuran") ||
    s.includes("dimensi") ||
    s.includes("panjang") ||
    s.includes("lebar") ||
    s.includes("tinggi") ||
    s.includes("kondisi") ||
    s.includes("condition") ||
    s.includes("misb") ||
    s.includes("mint in box")
  );
}

function shouldExplainWithGemini(rawQuestion = "") {
  const q = String(rawQuestion).toLowerCase().trim();

  if (!genai) return false;
  if (q.length < 15) return false;

  return (
    q.includes("kenapa") ||
    q.includes("alasan") ||
    q.includes("bagus") ||
    q.includes("lebih baik") ||
    q.includes("worth it") ||
    q.includes("bingung") ||
    q.includes("rekomendasi") ||
    q.includes("bandingkan") ||
    q.includes("dicari") ||
    q.includes("vs") ||
    q.includes("versus")
  );
}

// ==============================
// Humanizer + follow-up state
// ==============================
function randomFrom(arr = []) {
  if (!arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeLite(text = "") {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

function isYesAnswer(text = "") {
  const s = normalizeLite(text);
  return [
    "iya",
    "ya",
    "iyah",
    "iyaa",
    "yap",
    "yup",
    "boleh",
    "ok",
    "oke",
    "okay",
    "siap",
    "mau",
    "yuk",
    "ayo",
    "gas",
    "lanjut",
  ].includes(s);
}

function isNoAnswer(text = "") {
  const s = normalizeLite(text);
  return [
    "tidak",
    "ngga",
    "engga",
    "gak",
    "ga",
    "jangan",
    "nanti",
    "belum",
  ].includes(s);
}

function looksLikeBudgetAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    /\d/.test(s) ||
    /\b\d+(?:[.,]\d+)?\s*(k|rb|ribu|jt|juta)\b/.test(s) ||
    s.includes("dibawah") ||
    s.includes("di bawah") ||
    s.includes("kurang dari") ||
    s.includes("antara") ||
    s.includes("sampai")
  );
}

function looksLikeCheapRefine(text = "") {
  const s = normalizeLite(text);
  return (
    s.includes("murah") ||
    s.includes("hemat") ||
    s.includes("termurah") ||
    s.includes("budget") ||
    looksLikeBudgetAnswer(s)
  );
}

function looksLikePremiumRefine(text = "") {
  const s = normalizeLite(text);
  return (
    s.includes("premium") ||
    s.includes("bagus") ||
    s.includes("terbaik") ||
    s.includes("mahal") ||
    s.includes("koleksi")
  );
}

function looksLikeDisplayRefine(text = "") {
  const s = normalizeLite(text);
  return (
    s.includes("pajangan") ||
    s.includes("display") ||
    s.includes("dipajang") ||
    s.includes("buat pajangan")
  );
}

function looksLikeStockCheckAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    isYesAnswer(s) ||
    s.includes("cek stok") ||
    s.includes("stoknya") ||
    s.includes("stok") ||
    s.includes("ready") ||
    s.includes("masih ada")
  );
}

function looksLikeCompareAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    isYesAnswer(s) ||
    s.includes("bandingkan") ||
    s.includes("compare") ||
    s.includes("vs") ||
    s.includes("versus")
  );
}

function looksLikeShippingAnswer(text = "") {
  const s = normalizeLite(text);
  return (
    isYesAnswer(s) ||
    s.includes("cek ongkir") ||
    s.includes("ongkir") ||
    s.includes("kirim") ||
    s.includes("pengiriman")
  );
}

const HUMAN_CLOSINGS = {
  recommendation: [
    {
      text: "Kalau kamu kasih budget, aku bisa sempitkan lagi pilihannya 😊",
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
      text: "Kalau kamu mau, lanjut kirim nama kota tujuan ya 😊",
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

function setFollowUpOffer(session, followUpType, meta = {}) {
  setLastBotQuestion(session, followUpType, meta);
}

function clearFollowUpOffer(session) {
  clearLastBotQuestion(session);
}

function humanizeResponse(payload, ctx = {}) {
  if (!payload || typeof payload !== "object") return payload;

  const intent = ctx.intent || "general";
  const rawQuestion = String(ctx.rawQuestion || "");
  const q = normalizeLite(rawQuestion);

  const out = { ...payload };

  // =====================
  // Promo list
  // =====================

  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length > 1 &&
    intent === "price_promo" &&
    out.reasoning_text
  ) {
    return out;
  }

  // =========================
  // Produk tunggal + harga
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length === 1 &&
    (intent === "price_promo" || q.includes("harga"))
  ) {
    const p = out.products[0];
    const priceText = p?.numericPrice
      ? `Rp ${Number(p.numericPrice).toLocaleString("id-ID")}`
      : "belum tercantum";

    out.intro = randomFrom([
      "Oke, aku cekkan ya 😊",
      "Siap, aku sudah ketemu produknya.",
      "Aku ketemu produk yang kamu maksud ya.",
    ]);

    if (p?.discountPercent > 0 && p?.sale_price && p?.regular_price) {
      const regularText = `Rp ${Number(p.regular_price).toLocaleString("id-ID")}`;
      const saleText = `Rp ${Number(p.sale_price).toLocaleString("id-ID")}`;

      out.message =
        `Harga **${p.name}** saat ini **${saleText}** ` +
        `(diskon **${p.discountPercent}%** dari harga normal **${regularText}**).`;
    } else {
      out.message = `Harga **${p.name}** saat ini **${priceText}**.`;
    }

    if (!out.closing) {
      const chosen = pickSupportedClosing("price", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = { productName: p.name, productId: p.id };
      }
    }

    return out;
  }

  // =========================
  // Produk tunggal + stok
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length >= 1 &&
    intent === "stock_availability"
  ) {
    const p = out.products[0];
    let stockText = "saat ini **belum ready / out of stock** ⚠️";

    if (p.stock === "instock") {
      if (typeof p.stockQuantity === "number" && p.stockQuantity > 0) {
        stockText = `masih **ready stock** ✅ (sisa **${p.stockQuantity}** pcs)`;
      } else {
        stockText = "masih **ready stock** ✅";
      }
    }

    out.message = `Untuk **${p.name}**, stoknya ${stockText}.`;
    if (!out.closing) {
      const chosen = pickSupportedClosing("stock", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = { productName: p.name, productId: p.id };
      }
    }

    return out;
  }

  // =========================
  // Recommendation
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length >= 2 &&
    intent === "recommendation"
  ) {
    out.intro =
      out.intro ||
      randomFrom([
        "Kalau lihat kebutuhanmu, ini pilihan yang paling masuk menurutku 😊",
        "Aku pilihkan beberapa yang paling relevan buat kamu:",
        "Ini rekomendasi yang menurutku paling cocok buat kebutuhan kamu:",
      ]);

    if (!out.closing) {
      const chosen = pickSupportedClosing("recommendation", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = {
          products: out.products.map((p) => ({ id: p.id, name: p.name })),
        };
      }
    }

    return out;
  }

  // =========================
  // Product detail
  // =========================
  if (
    out.type === "products" &&
    Array.isArray(out.products) &&
    out.products.length >= 1 &&
    intent === "product_detail"
  ) {
    const opinionAsked = isOpinionQuestion(rawQuestion);
    const p = out.products[0];

    out.intro =
      out.intro ||
      (opinionAsked
        ? randomFrom([
            `Oke, aku bantu nilai **${p?.name || "produk ini"}** ya 😊`,
            `Siap, aku coba bantu lihat apakah **${p?.name || "produk ini"}** cukup menarik atau tidak.`,
            `Aku bantu cek ya, apakah **${p?.name || "produk ini"}** cocok buat kamu.`,
          ])
        : randomFrom([
            "Ini detail produk yang aku temukan ya:",
            "Oke, aku bantu cek detailnya 😊",
            "Siap, ini info detail produknya:",
          ]));

    if (!out.closing) {
      if (opinionAsked) {
        out.closing =
          "Kalau mau, aku juga bisa bantu bandingkan dengan produk lain yang mirip biar lebih kelihatan mana yang paling cocok.";
        out._followUpType = "offer_compare";
        out._followUpMeta = {
          productName: p?.name || null,
          productId: p?.id || null,
        };
      } else {
        const chosen = pickSupportedClosing("product_detail", {
          products: out.products,
        });
        if (chosen) {
          out.closing = chosen.text;
          out._followUpType = chosen.followUpType;
          out._followUpMeta = {
            productName: p?.name || null,
            productId: p?.id || null,
          };
        }
      }
    }

    return out;
  }

  // =========================
  // Compare
  // =========================
  if (out.type === "compare_reasoned") {
    out.intro =
      out.intro ||
      randomFrom([
        "Oke, aku bantu bandingkan ya 😊",
        "Ini perbandingan dua produk yang kamu pilih:",
        "Aku sudah bandingkan dua produk ini buat kamu:",
      ]);

    if (!out.closing) {
      const chosen = pickSupportedClosing("compare", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = {
          products: Array.isArray(out.products)
            ? out.products.map((p) => ({ id: p.id, name: p.name }))
            : [],
        };
      }
    }

    return out;
  }

  // =========================
  // How to buy / shipping
  // =========================
  if (out.type === "how_to_buy" || intent === "shipping_transaction") {
    if (!out.closing) {
      const chosen = pickSupportedClosing("shipping", {
        products: out.products,
      });
      if (chosen) {
        out.closing = chosen.text;
        out._followUpType = chosen.followUpType;
        out._followUpMeta = {};
      }
    }

    return out;
  }

  // =========================
  // Text biasa
  // =========================
  if (out.type === "text" && out.message) {
    return out;
  }

  return out;
}

function detectContextFollowUp(text = "") {
  const s = normalizeLite(text);

  if (
    s === "yang murah" ||
    s === "murah" ||
    s === "yang termurah" ||
    s === "termurah" ||
    s.includes("lebih murah")
  ) {
    return { type: "price_refine", mode: "cheapest" };
  }

  if (
    s === "yang mahal" ||
    s === "mahal" ||
    s === "yang termahal" ||
    s === "termahal" ||
    s.includes("lebih mahal")
  ) {
    return { type: "price_refine", mode: "expensive" };
  }

  if (
    s === "yang ready" ||
    s === "ready" ||
    s === "ready aja" ||
    s.includes("ready stock") ||
    s.includes("stok ada")
  ) {
    return { type: "stock_refine", mode: "ready_only" };
  }

  if (
    s === "yang promo" ||
    s === "promo" ||
    s === "diskon" ||
    s.includes("yang diskon") ||
    s.includes("lagi promo")
  ) {
    return { type: "promo_refine", mode: "promo_only" };
  }

  if (
    s.includes("diskon paling besar") ||
    s.includes("promo paling besar") ||
    s.includes("potongan paling besar")
  ) {
    return { type: "promo_refine", mode: "biggest_discount" };
  }

  return null;
}

function applyContextProductRefine(products = [], followUp) {
  if (!Array.isArray(products) || !products.length || !followUp) return [];

  let result = [...products];

  if (followUp.type === "price_refine") {
    result = result.filter((p) => Number(p.numericPrice || 0) > 0);

    if (followUp.mode === "cheapest") {
      result.sort(
        (a, b) => Number(a.numericPrice || 0) - Number(b.numericPrice || 0),
      );
    }

    if (followUp.mode === "expensive") {
      result.sort(
        (a, b) => Number(b.numericPrice || 0) - Number(a.numericPrice || 0),
      );
    }
  }

  if (followUp.type === "stock_refine" && followUp.mode === "ready_only") {
    result = result.filter((p) => p.stock === "instock");
  }

  if (followUp.type === "promo_refine") {
    result = result.filter((p) => Number(p.discountPercent || 0) > 0);

    if (followUp.mode === "biggest_discount") {
      result.sort(
        (a, b) =>
          Number(b.discountPercent || 0) - Number(a.discountPercent || 0),
      );
    }
  }

  return result.slice(0, 5);
}

function pickSupportedClosing(intent, ctx = {}) {
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

// ====================
// single match
// ====================
function findBestSingleProductMatch(rawQuestion, products) {
  if (!Array.isArray(products) || !products.length) return null;

  const q = normalize(rawQuestion);

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const name = normalize(p.name || "");
    const category = normalize(p.category || "");
    const text = `${name} ${category}`;

    let score = 0;

    // exact include
    if (name.includes(q) || q.includes(name)) score += 10;

    // token match
    const qTokens = q.split(" ").filter(Boolean);
    for (const token of qTokens) {
      if (token.length < 2) continue;
      if (name.includes(token)) score += 3;
      else if (category.includes(token)) score += 1;
    }

    // bonus kalau stock ready
    if (p.stock === "instock") score += 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (bestScore <= 0) return null;
  return best;
}

function searchProductsForDiscovery(rawQuestion, products = []) {
  if (!Array.isArray(products) || !products.length) return [];

  const q = normalize(rawQuestion);

  const stopWords = new Set([
    "ada",
    "ga",
    "gak",
    "disini",
    "di",
    "sini",
    "lagi",
    "nyari",
    "cari",
    "mau",
    "tanya",
    "izin",
    "kira",
    "tersedia",
    "buat",
    "orang",
    "yang",
    "juga",
    "beli",
    "dibeli",
    "website",
    "kategori",
    "produk",
    "kah",
    "ya",
    "dong",
    "nih",
    "kak",
    "min",
  ]);

  const qTokens = q
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && !stopWords.has(x));

  if (!qTokens.length) return [];

  const scored = products.map((p) => {
    const text = normalize(
      `${p.name || ""} ${p.category || ""} ${stripHtml(p.description || "")}`,
    );

    let score = 0;

    for (const token of qTokens) {
      if (text.includes(token)) score += 3;
    }

    // bonus kalau nama produk match
    for (const token of qTokens) {
      if (normalize(p.name || "").includes(token)) score += 2;
    }

    // bonus kecil kalau ready
    if (p.stock === "instock") score += 0.5;

    return { ...p, _discoveryScore: score };
  });

  return scored
    .filter((p) => p._discoveryScore > 0)
    .sort((a, b) => b._discoveryScore - a._discoveryScore)
    .slice(0, 6);
}

function extractRecommendationTopic(rawQuestion = "") {
  const s = String(rawQuestion).toLowerCase().trim();

  const removeWords = [
    "rekomendasi",
    "rekomen",
    "recommended",
    "dong",
    "buat",
    "untuk",
    "yang",
    "yg",
    "apa",
    "dong",
    "nih",
    "kak",
    "min",
    "aku",
    "saya",
    "mau",
    "cari",
    "cariin",
    "tolong",
  ];

  const words = s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !removeWords.includes(w));

  return words.join(" ").trim();
}

function isPopularityStyleQuestion(q = "") {
  const s = q.toLowerCase();
  return (
    s.includes("paling dicari") ||
    s.includes("terpopuler") ||
    s.includes("best seller") ||
    s.includes("bestseller") ||
    s.includes("paling laku") ||
    s.includes("yang paling banyak dicari")
  );
}

function basePopularityScore(p) {
  let score = 0;
  if (p.stock === "instock") score += 3;
  score += Number(p.totalSales || 0) * 5;
  score += Number(p.ratingCount || 0) * 2;
  score += Number(p.averageRating || 0);
  return score;
}

function buildReturnResponse(rawQuestion = "") {
  const q = String(rawQuestion || "").toLowerCase();

  const openers = [
    "Tentu, aku bantu jelaskan ya 😊",
    "Siap, untuk retur / refund kurang lebih seperti ini ya:",
    "Boleh, ini penjelasan singkat soal retur di toko kami:",
  ];

  let message =
    "Jika ada kendala pada barang yang diterima, kamu bisa menghubungi WhatsApp admin (📱085975313930) dengan menjelaskan masalah terlebih dahulu dengan menyertakan **nomor pesanan**, **foto/video unboxing**, dan **bukti kondisi barang** supaya bisa dicek lebih lanjut.";

  // refund
  if (q.includes("refund")) {
    message =
      "Untuk **refund**, biasanya proses diawali dengan pengecekan kendala pada pesanan terlebih dahulu. Siapkan **nomor order**, **foto/video kondisi barang**, dan jelaskan masalahnya ke admin. Setelah disetujui, proses pengembalian dana akan diinformasikan lebih lanjut oleh tim toko.";
  }

  // box penyok
  if (q.includes("box penyok") || q.includes("penyok")) {
    message =
      "Kalau **box penyok** saat barang diterima, sebaiknya segera laporkan ke WhatsApp admin (📱085975313930) dengan **foto kondisi box**, **nomor order**, dan kalau ada **video unboxing**. Nanti tim akan bantu cek apakah kasusnya bisa diproses sebagai komplain / retur.";
  }

  // part kurang
  if (
    q.includes("part kurang") ||
    q.includes("kurang part") ||
    q.includes("tidak lengkap") ||
    q.includes("ga lengkap")
  ) {
    message =
      "Kalau barang datang dengan **part kurang / tidak lengkap**, segera hubungi WhatsApp admin (📱085975313930) dan kirimkan **foto isi paket**, **nomor pesanan**, dan kalau ada **video unboxing**. Ini penting supaya tim bisa bantu verifikasi dan menentukan langkah lanjut.";
  }

  // barang rusak / cacat
  if (q.includes("rusak") || q.includes("cacat") || q.includes("bermasalah")) {
    message =
      "Kalau barang datang dalam kondisi **rusak / cacat**, segera laporkan ke WhatsApp admin (📱085975313930) ya. Siapkan **nomor order**, **foto/video kondisi barang**, dan idealnya **video unboxing** supaya proses pengecekan bisa lebih cepat.";
  }

  // salah kirim / tidak sesuai deskripsi
  if (
    q.includes("salah kirim") ||
    q.includes("tidak sesuai deskripsi") ||
    q.includes("ga sesuai deskripsi") ||
    q.includes("beda dengan deskripsi")
  ) {
    message =
      "Kalau barang yang diterima **salah kirim** atau **tidak sesuai deskripsi**, kamu bisa ajukan komplain ke WhatsApp admin (📱085975313930) dengan menyertakan **nomor pesanan**, **foto barang yang diterima**, dan penjelasan singkat masalahnya.";
  }

  // batas waktu
  if (
    q.includes("batas waktu") ||
    q.includes("berapa hari") ||
    q.includes("berapa lama")
  ) {
    message =
      "Untuk pertanyaan soal **batas waktu retur / refund**, sebaiknya segera lapor ke WhatsApp admin (📱085975313930) sesegera mungkin setelah barang diterima. Kirim **nomor pesanan** dan **bukti kondisi barang** supaya bisa langsung dibantu dan tidak terlambat diproses.";
  }

  // kebijakan / aturan
  if (
    q.includes("aturan") ||
    q.includes("kebijakan") ||
    q.includes("policy") ||
    q.includes("retur di toko ini gimana")
  ) {
    message =
      "Secara umum, jika ada masalah pada barang, prosesnya adalah: \n\n" +
      "• hubungi WhatsApp admin (📱085975313930) secepatnya\n" +
      "• kirim **nomor pesanan**\n" +
      "• sertakan **foto/video unboxing** dan kondisi barang\n" +
      "• tim toko akan melakukan pengecekan terlebih dahulu\n\n" +
      "Setelah itu, admin akan mengarahkan apakah kasusnya bisa lanjut ke komplain, retur, atau refund.";
  }

  const closing =
    "\n\nKalau kamu mau, jelaskan kendalanya lebih spesifik ya — misalnya **barang rusak**, **part kurang**, **box penyok**, atau **mau refund** — nanti aku bantu arahkan lebih pas.";

  return `${randomFrom(openers)}\n\n${message}${closing}`;
}

function buildProductOpinionReasoning(product, rawQuestion = "") {
  if (!product) return "";

  const q = String(rawQuestion || "").toLowerCase();
  const parts = [];

  const isDisplay = q.includes("pajangan") || q.includes("display");
  const isWorthIt = q.includes("worth it") || q.includes("layak");
  const isCollection =
    q.includes("koleksi") || q.includes("kolektor") || q.includes("collect");

  parts.push(
    `Kalau dilihat dari data yang ada, **${product.name}** cukup menarik.`,
  );

  if (product.stock === "instock") {
    parts.push(`Stoknya saat ini **ready** ✅, jadi bisa langsung diproses.`);
  } else {
    parts.push(
      `Saat ini stoknya belum ready ⚠️, jadi itu perlu jadi pertimbangan.`,
    );
  }

  if (Number(product.numericPrice || 0) > 0) {
    parts.push(`Harganya ada di **${formatRupiah(product.numericPrice)}**.`);
  }

  if (product.condition) {
    parts.push(`Kondisinya tercatat **${product.condition}**.`);
  }

  const desc = stripHtml(product.description || "");
  if (desc) {
    const shortDesc =
      desc.length > 180 ? desc.slice(0, 180).trim() + "…" : desc;
    parts.push(`Dari deskripsinya, poin yang terlihat adalah: *${shortDesc}*`);
  }

  if (isDisplay) {
    parts.push(
      `Kalau tujuanmu untuk **pajangan**, produk ini bisa cocok kalau kamu memang suka karakter/seri ini dan mencari item display yang simpel.`,
    );
  }

  if (isCollection) {
    parts.push(
      `Kalau untuk **koleksi**, nilai menariknya lebih terasa kalau kamu memang suka lini atau seri produknya.`,
    );
  }

  if (isWorthIt) {
    parts.push(
      `Dari sisi value, produk ini lebih cocok kalau kamu memang mencari item yang spesifik dan sesuai selera koleksimu, bukan sekadar cari yang paling murah.`,
    );
  }

  if (!isDisplay && !isCollection && !isWorthIt) {
    parts.push(
      `Secara umum, produk ini cukup oke kalau kamu memang suka seri tersebut dan mencari item koleksi yang ready.`,
    );
  }

  parts.push(
    `Kalau kamu mau, aku juga bisa bantu nilai apakah produk ini lebih cocok untuk **koleksi, pajangan, atau dibandingkan dengan produk lain**.`,
  );

  return parts.join(" ");
}

// ====================
// FITUR PROMO
// ====================

function buildPromoReasoning(products = []) {
  if (!products.length) return "";

  const lines = products.map((p, i) => {
    const percent = p.discountPercent || 0;
    const hemat = p.discountAmount || 0;

    let tag = "";

    // 🔥 kasih label pintar
    if (percent >= 30) tag = "🔥 BEST DEAL";
    else if (percent >= 20) tag = "⭐ HOT PROMO";
    else if (percent >= 10) tag = "💸 HEMAT";
    else tag = "🎯 PROMO";

    return (
      `${tag} **${p.name}**\n` +
      `• Diskon **${percent}%**\n` +
      `• Hemat **${formatRupiah(hemat)}**\n` +
      `• ${getPromoInsight(p)}`
    );
  });

  return lines.join("\n\n");
}

function getPromoInsight(p) {
  const percent = p.discountPercent || 0;

  if (percent >= 30) return "Diskonnya besar banget, ini jarang terjadi 👀";
  if (percent >= 20) return "Diskon cukup tinggi, worth it untuk dibeli 👍";
  if (percent >= 10) return "Lumayan hemat dibanding harga normal";
  return "Promo ringan, tapi tetap menarik";
}

function getPromoIntro(products) {
  const maxDiscount = Math.max(...products.map((p) => p.discountPercent || 0));

  if (maxDiscount >= 30) return "🔥 Lagi ada diskon besar-besaran nih!";
  if (maxDiscount >= 20) return "⭐ Banyak promo menarik hari ini!";
  return "💸 Ada beberapa promo yang bisa kamu cek nih!";
}

function detectPriceMode(q = "") {
  const s = String(q).toLowerCase();

  if (
    s.includes("termurah") ||
    s.includes("paling murah") ||
    s.includes("murah apa") ||
    s.includes("yang murah")
  ) {
    return "cheapest";
  }

  if (
    s.includes("termahal") ||
    s.includes("paling mahal") ||
    s.includes("mahal apa") ||
    s.includes("yang mahal")
  ) {
    return "expensive";
  }

  if (
    s.includes("promo") ||
    s.includes("diskon") ||
    s.includes("sale") ||
    s.includes("cashback")
  ) {
    return "promo";
  }

  return null;
}

function scoreCheapestProduct(p) {
  let score = 0;

  const price = Number(p.numericPrice || 0);
  if (price <= 0) return -9999;

  // makin murah makin bagus
  score += 100000000 / price;

  // bonus ready stock
  if (p.stock === "instock") score += 50;

  // bonus promo
  if (p.discountPercent > 0) score += p.discountPercent * 2;

  // bonus rating & sales
  score += Number(p.averageRating || 0) * 5;
  score += Math.min(Number(p.ratingCount || 0), 20);
  score += Math.min(Number(p.totalSales || 0), 20);

  return score;
}

function scoreExpensiveProduct(p) {
  let score = 0;

  const price = Number(p.numericPrice || 0);
  if (price <= 0) return -9999;

  // makin mahal makin tinggi
  score += price / 10000;

  // bonus ready stock
  if (p.stock === "instock") score += 40;

  // bonus kondisi
  const cond = String(p.condition || "").toLowerCase();
  if (cond.includes("misb")) score += 20;
  else if (cond.includes("mint")) score += 15;
  else if (cond) score += 8;

  // bonus rating & sales
  score += Number(p.averageRating || 0) * 5;
  score += Math.min(Number(p.ratingCount || 0), 20);
  score += Math.min(Number(p.totalSales || 0), 20);

  // bonus deskripsi kuat
  if (stripHtml(p.description || "").length > 80) score += 10;

  return score;
}

function buildCheapestReasoning(products = []) {
  if (!products.length) return "";

  return products
    .map((p, i) => {
      const parts = [];
      parts.push(`**${i + 1}. ${p.name}**`);
      parts.push(`• Harga: **${formatRupiah(p.numericPrice)}**`);

      if (p.discountPercent > 0) {
        parts.push(
          `• Diskon: **${p.discountPercent}%** (hemat ${formatRupiah(p.discountAmount)})`,
        );
      }

      if (p.stock === "instock") {
        parts.push(`• Stok: **ready** ✅`);
      } else {
        parts.push(`• Stok: belum ready ⚠️`);
      }

      if (Number(p.averageRating || 0) > 0) {
        parts.push(`• Rating: **${Number(p.averageRating).toFixed(1)} / 5**`);
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

function buildExpensiveReasoning(products = []) {
  if (!products.length) return "";

  return products
    .map((p, i) => {
      const parts = [];
      parts.push(`**${i + 1}. ${p.name}**`);
      parts.push(`• Harga: **${formatRupiah(p.numericPrice)}**`);

      if (p.condition) {
        parts.push(`• Kondisi: **${p.condition}**`);
      }

      if (p.stock === "instock") {
        parts.push(`• Stok: **ready** ✅`);
      } else {
        parts.push(`• Stok: belum ready ⚠️`);
      }

      if (Number(p.averageRating || 0) > 0) {
        parts.push(`• Rating: **${Number(p.averageRating).toFixed(1)} / 5**`);
      }

      if (Number(p.totalSales || 0) > 0) {
        parts.push(
          `• Penjualan: **${Number(p.totalSales).toLocaleString("id-ID")}**`,
        );
      }

      return parts.join("\n");
    })
    .join("\n\n");
}

async function handlePriceRecommendationMode({
  rawQuestion,
  cleanProducts,
  send,
}) {
  const q = String(rawQuestion || "").toLowerCase();
  const mode = detectPriceMode(q);

  if (!mode || mode === "promo") return false;

  let candidates = cleanProducts.filter((p) => Number(p.numericPrice || 0) > 0);

  if (!candidates.length) {
    await send({
      type: "text",
      message: "Aku belum menemukan produk yang punya data harga 🙏",
    });
    return true;
  }

  if (mode === "cheapest") {
    const ranked = candidates
      .map((p) => ({ ...p, aiScore: scoreCheapestProduct(p) }))
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 5);

    await send(
      {
        type: "products",
        intro: "💸 Ini pilihan produk paling hemat yang aku rekomendasikan:",
        products: ranked,
        reasoning_text:
          "Aku pilih berdasarkan harga yang paling rendah, lalu diprioritaskan ke stok yang ready, promo aktif, dan sinyal kualitas seperti rating atau penjualan.\n\n" +
          buildCheapestReasoning(ranked),
        _noTruncateReasoning: true,
      },
      "price_promo",
    );
    return true;
  }

  if (mode === "expensive") {
    const ranked = candidates
      .map((p) => ({ ...p, aiScore: scoreExpensiveProduct(p) }))
      .sort((a, b) => b.aiScore - a.aiScore)
      .slice(0, 5);

    await send(
      {
        type: "products",
        intro:
          "👑 Ini pilihan produk premium / harga tertinggi yang paling menonjol:",
        products: ranked,
        reasoning_text:
          "Aku pilih berdasarkan harga tertinggi, lalu aku utamakan stok ready, kondisi produk, dan sinyal kualitas seperti rating, penjualan, serta kelengkapan data produk.\n\n" +
          buildExpensiveReasoning(ranked),
        _noTruncateReasoning: true,
      },
      "price_promo",
    );
    return true;
  }

  return false;
}

function buildOptionsPayload(intro, items = []) {
  return {
    type: "options",
    intro,
    options: items.map((x) => ({
      label: x.label,
      value: x.value,
    })),
  };
}

function normalizeLocationText(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\b(kota|kabupaten|kab|kec|kecamatan)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCityName(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/\bkabupaten\b/g, "kab")
    .replace(/\bkota\b/g, "kota")
    .replace(/\s+/g, " ")
    .trim();
}

function extractShippingDestination(rawQuestion = "") {
  const s = String(rawQuestion || "").trim();

  const patterns = [
    /(?:ongkir|ongkos kirim|cek ongkir|kirim|pengiriman)\s+(?:ke|tujuan)\s+(.+?)(?:\s+(?:berapa|dong|ya|kah|nih|min|kak)\b|[?.!]|$)/i,
    /(?:ke|tujuan)\s+(.+?)(?:\s+(?:berapa|dong|ya|kah|nih|min|kak)\b|[?.!]|$)/i,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1].trim();
  }

  return "";
}

async function searchDistrictsGlobalFromWP(q) {
  const r = await fetch(
    `https://pstaging.my.id/robotjadul/wp-json/rj/v1/districts-global?q=${encodeURIComponent(q)}`,
    { headers: { "x-rj-token": process.env.RJ_SHIP_TOKEN } },
  );
  if (!r.ok) throw new Error("DISTRICTS_GLOBAL_FAILED:" + r.status);
  return r.json();
}

async function resolveShippingLocation(queryText = "") {
  const cleaned = normalizeLocationText(queryText);
  if (!cleaned) {
    return { kind: "empty" };
  }

  // 1) cari city dulu
  let cityData = null;
  try {
    cityData = await searchCitiesFromWP(cleaned);
  } catch {
    cityData = null;
  }

  const cities = cityData?.cities || [];

  // exact-ish city match
  if (cities.length === 1) {
    return {
      kind: "single_city",
      city: cities[0],
    };
  }

  if (cities.length > 1) {
    return {
      kind: "multi_city",
      cities,
    };
  }

  // 2) kalau city tidak ketemu, coba district global
  let districtData = null;
  try {
    districtData = await searchDistrictsGlobalFromWP(cleaned);
  } catch {
    districtData = null;
  }

  const districts = districtData?.districts || [];

  if (districts.length === 1) {
    return {
      kind: "single_district",
      district: districts[0],
    };
  }

  if (districts.length > 1) {
    return {
      kind: "multi_district",
      districts,
    };
  }

  return { kind: "not_found" };
}

// ========== Range harga min-max ====================
function parseMoneyToNumber(raw = "") {
  let s = String(raw || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();

  let multiplier = 1;
  if (s.includes("juta") || /\bjt\b/.test(s)) multiplier = 1000000;
  else if (s.includes("ribu") || /\brb\b/.test(s)) multiplier = 1000;

  s = s
    .replace(/rp/gi, "")
    .replace(/rupiah/gi, "")
    .replace(/juta|jt|ribu|rb/gi, "")
    .replace(/[^\d.]/g, "")
    .trim();

  if (!s) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;

  if (multiplier === 1 && n >= 100 && n < 10000) {
    return n * 1000;
  }

  return Math.round(n * multiplier);
}

//============================
// RECOMMENDATION SMART FITUR
// ============================
function extractRecommendationUseCase(q = "") {
  const s = String(q || "").toLowerCase();

  if (
    s.includes("pajangan") ||
    s.includes("display") ||
    s.includes("dipajang")
  ) {
    return "display";
  }

  if (
    s.includes("koleksi") ||
    s.includes("collector") ||
    s.includes("kolektor")
  ) {
    return "collection";
  }

  if (s.includes("hadiah") || s.includes("kado") || s.includes("gift")) {
    return "gift";
  }

  if (s.includes("pemula") || s.includes("baru mulai")) {
    return "beginner";
  }

  return null;
}

function scoreRecommendationProduct(product, recNeeds = {}) {
  const price = Number(product.numericPrice || 0);
  const stockReady = String(product.stock || "").toLowerCase() === "instock";
  const totalSales = Number(product.totalSales || 0);
  const averageRating = Number(product.averageRating || 0);
  const ratingCount = Number(product.ratingCount || 0);
  const discountPercent = Number(product.discountPercent || 0);
  const text = getProductSearchText(product);

  let score = 0;
  const reasons = [];

  // =========================
  // 1) Stock
  // =========================
  if (stockReady) {
    score += 35;
    reasons.push("ready stock");
  } else {
    score -= 100;
  }

  // =========================
  // 2) Promo
  // =========================
  if (discountPercent > 0) {
    score += Math.min(discountPercent, 20);
    reasons.push(`diskon ${discountPercent}%`);
  }

  // =========================
  // 3) Sales / rating
  // =========================
  score += Math.min(totalSales, 20);

  if (averageRating > 0) {
    score += averageRating * 4; // max sekitar 20
  }

  if (ratingCount > 0) {
    score += Math.min(ratingCount, 10);
  }

  // =========================
  // 4) Budget fit
  // =========================
  if (recNeeds.budgetMin != null || recNeeds.budgetMax != null) {
    if (price <= 0) {
      score -= 100;
    }

    if (recNeeds.budgetMin != null && price < recNeeds.budgetMin) {
      score -= 120;
    }

    if (recNeeds.budgetMax != null && price > recNeeds.budgetMax) {
      score -= 120;
    }

    // kalau masuk range, kasih bonus
    const inMin = recNeeds.budgetMin == null || price >= recNeeds.budgetMin;
    const inMax = recNeeds.budgetMax == null || price <= recNeeds.budgetMax;

    if (inMin && inMax) {
      score += 35;
      reasons.push("masuk budget");
    }

    // bonus kedekatan ke budget atas (bagus untuk recommendation)
    if (recNeeds.budgetMax != null && inMin && inMax) {
      const ratio = price / recNeeds.budgetMax;
      if (ratio >= 0.7 && ratio <= 1) {
        score += 10;
      }
    }

    // untuk "7 juta ke atas", makin jauh di atas min sedikit bisa lebih relevan
    if (
      recNeeds.budgetMin != null &&
      recNeeds.budgetMax == null &&
      price >= recNeeds.budgetMin
    ) {
      const ratio = price / recNeeds.budgetMin;
      if (ratio >= 1 && ratio <= 1.5) {
        score += 8;
      }
    }
  }

  // =========================
  // 5) Use case
  // =========================
  if (recNeeds.wantsDisplay) {
    if (
      text.includes("display") ||
      text.includes("pajangan") ||
      text.includes("figure") ||
      text.includes("diecast") ||
      text.includes("chogokin") ||
      text.includes("misb")
    ) {
      score += 18;
      reasons.push("cocok untuk pajangan");
    }
  }

  if (recNeeds.wantsCollection) {
    if (
      text.includes("koleksi") ||
      text.includes("collector") ||
      text.includes("collectible") ||
      text.includes("limited") ||
      text.includes("misb") ||
      text.includes("chogokin")
    ) {
      score += 18;
      reasons.push("menarik untuk koleksi");
    }
  }

  if (recNeeds.wantsGift) {
    if (price > 0 && price <= 2500000) {
      score += 10;
      reasons.push("range harga cocok untuk hadiah");
    }
    if (stockReady) {
      score += 5;
    }
  }

  if (recNeeds.wantsBeginner) {
    if (price > 0 && price <= 1500000) {
      score += 16;
      reasons.push("ramah untuk pemula");
    }
  }

  // =========================
  // 6) Preference murah / premium
  // =========================
  if (recNeeds.wantsCheap) {
    if (price > 0) {
      score += Math.max(0, 25 - Math.floor(price / 500000));
    }
  }

  if (recNeeds.wantsPremium) {
    if (price >= 3000000) {
      score += 15;
      reasons.push("kelas premium");
    }
    if (
      text.includes("limited") ||
      text.includes("diecast") ||
      text.includes("chogokin")
    ) {
      score += 10;
    }
  }

  // =========================
  // 7) Promo only
  // =========================
  if (recNeeds.promoOnly && discountPercent <= 0) {
    score -= 80;
  }

  return {
    ...product,
    recommendationScore: score,
    recommendationReasons: reasons,
  };
}

function parseBudgetValue(numStr = "", unit = "") {
  const n = Number(String(numStr).replace(",", "."));
  if (!Number.isFinite(n)) return null;

  const u = String(unit || "").toLowerCase();

  if (u.includes("juta") || u === "jt" || u === "j") {
    return Math.round(n * 1000000);
  }

  if (u.includes("ribu") || u === "rb" || u === "k") {
    return Math.round(n * 1000);
  }

  return Math.round(n);
}

function extractBudgetRange(q = "") {
  const s = String(q || "")
    .toLowerCase()
    .replace(/\./g, "");

  let min = null;
  let max = null;
  let detected = false;

  // 7 juta ke atas / lebih dari 7 juta / minimal 7 juta
  let m =
    s.match(
      /(?:di atas|diatas|ke atas|lebih dari|minimal|mulai dari)\s*(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)?/,
    ) || s.match(/(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)?\s*(?:ke atas|keatas)/);

  if (m) {
    min = parseBudgetValue(m[1], m[2]);
    detected = true;
    return { detected, min, max };
  }

  // di bawah 5 juta / maksimal 5 juta
  m =
    s.match(
      /(?:di bawah|dibawah|kurang dari|maksimal|max)\s*(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)?/,
    ) || s.match(/(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)?\s*(?:ke bawah)/);

  if (m) {
    max = parseBudgetValue(m[1], m[2]);
    detected = true;
    return { detected, min, max };
  }

  // antara 2 juta sampai 5 juta
  m = s.match(
    /(?:antara|kisaran|)\s*(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)?\s*sampai\s*(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)?/,
  );
  if (m) {
    min = parseBudgetValue(m[1], m[2]);
    max = parseBudgetValue(m[3], m[4]);
    detected = true;
    return { detected, min, max };
  }

  // budget 3 juta / 500 ribu
  m = s.match(/(?:budget|harga)\s*(\d+(?:[.,]\d+)?)\s*(juta|jt|ribu|rb)/);
  if (m) {
    max = parseBudgetValue(m[1], m[2]);
    detected = true;
    return { detected, min, max };
  }

  return { detected, min, max };
}

function pickRecommendedProducts(products = [], recNeeds = {}, limit = 3) {
  let source = [...products];

  // Hard filter budget
  if (recNeeds.budgetMin != null) {
    source = source.filter(
      (p) => Number(p.numericPrice || 0) >= recNeeds.budgetMin,
    );
  }

  if (recNeeds.budgetMax != null) {
    source = source.filter(
      (p) => Number(p.numericPrice || 0) <= recNeeds.budgetMax,
    );
  }

  // Hard filter promo kalau user eksplisit cari promo
  if (recNeeds.promoOnly) {
    source = source.filter((p) => Number(p.discountPercent || 0) > 0);
  }

  // fallback kalau terlalu sempit
  if (!source.length) {
    source = [...products];
  }

  const ranked = source
    .map((p) => scoreRecommendationProduct(p, recNeeds))
    .sort((a, b) => {
      if ((b.recommendationScore || 0) !== (a.recommendationScore || 0)) {
        return (b.recommendationScore || 0) - (a.recommendationScore || 0);
      }

      // tie breaker
      return (b.totalSales || 0) - (a.totalSales || 0);
    });

  return ranked.slice(0, limit);
}

function buildRecommendationReasoning(products = [], recNeeds = {}) {
  if (!products.length) return "";

  const top = products[0];
  const reasons = top.recommendationReasons || [];

  const lines = [];

  if (recNeeds.budgetMin != null && recNeeds.budgetMax == null) {
    lines.push(
      `Aku memprioritaskan produk dengan harga **di atas ${formatRupiah(recNeeds.budgetMin)}**.`,
    );
  } else if (recNeeds.budgetMax != null && recNeeds.budgetMin == null) {
    lines.push(
      `Aku memprioritaskan produk dengan harga **di bawah ${formatRupiah(recNeeds.budgetMax)}**.`,
    );
  } else if (recNeeds.budgetMin != null && recNeeds.budgetMax != null) {
    lines.push(
      `Aku memprioritaskan produk pada rentang **${formatRupiah(recNeeds.budgetMin)} - ${formatRupiah(recNeeds.budgetMax)}**.`,
    );
  }

  if (recNeeds.wantsDisplay) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang lebih cocok untuk **pajangan/display**.",
    );
  }

  if (recNeeds.wantsCollection) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang lebih menarik untuk **koleksi**.",
    );
  }

  if (recNeeds.wantsGift) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang cocok untuk **hadiah**.",
    );
  }

  if (recNeeds.wantsBeginner) {
    lines.push(
      "Fokus rekomendasi diarahkan ke produk yang lebih ramah untuk **pemula**.",
    );
  }

  if (reasons.length) {
    lines.push(`Pilihan teratas unggul karena: **${reasons.join(", ")}**.`);
  }

  return lines.join("\n");
}

function needsReasoningRecommendation(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    s.includes("alasan") ||
    s.includes("alasannya") ||
    s.includes("kenapa") ||
    s.includes("mengapa") ||
    s.includes("worth it") ||
    s.includes("cocok")
  );
}

function extractRecommendationNeeds(rawQuestion = "", semantic = null) {
  const q = String(rawQuestion || "").toLowerCase();

  const budget = extractBudgetRange(q);

  const wantsDisplay =
    q.includes("display") || q.includes("pajangan") || q.includes("dipajang");

  const wantsCollection =
    q.includes("koleksi") || q.includes("kolektor") || q.includes("collector");

  const wantsGift =
    q.includes("hadiah") || q.includes("kado") || q.includes("gift");

  const wantsBeginner =
    q.includes("pemula") || q.includes("baru mulai") || q.includes("beginner");

  const wantsCheap =
    q.includes("murah") || q.includes("hemat") || q.includes("worth it");

  const wantsPremium =
    q.includes("premium") ||
    q.includes("terbaik") ||
    q.includes("bagus banget") ||
    q.includes("kelas atas");

  const promoOnly =
    q.includes("promo") || q.includes("diskon") || q.includes("sale");

  const needsReasoning =
    q.includes("rekom") ||
    q.includes("rekomendasi") ||
    q.includes("bagus") ||
    q.includes("worth it") ||
    wantsDisplay ||
    wantsCollection ||
    wantsGift ||
    wantsBeginner;

  return {
    budgetMin: budget.detected ? budget.min : null,
    budgetMax: budget.detected ? budget.max : null,
    wantsDisplay,
    wantsCollection,
    wantsGift,
    wantsBeginner,
    wantsCheap,
    wantsPremium,
    promoOnly,
    needsReasoning,
    semantic,
  };
}

function getProductSearchText(p = {}) {
  return [
    p.name || "",
    p.category || "",
    stripHtml(p.description || ""),
    p.condition || "",
  ]
    .join(" ")
    .toLowerCase();
}

// ====================
//  Universal follow-up
// ===================
function detectUniversalFollowUp(text = "") {
  const s = String(text || "")
    .toLowerCase()
    .trim();

  if (!s) return null;

  if (
    s.includes("yang paling murah") ||
    s.includes("termurah") ||
    s.includes("lebih murah")
  ) {
    return { type: "price_refine", mode: "cheapest" };
  }

  if (
    s.includes("yang paling mahal") ||
    s.includes("premium") ||
    s.includes("lebih mahal")
  ) {
    return { type: "price_refine", mode: "expensive" };
  }

  if (
    s.includes("ready stock") ||
    s.includes("stok aja") ||
    s.includes("yang ada stok")
  ) {
    return { type: "stock_refine", mode: "instock" };
  }

  if (
    s.includes("promo aja") ||
    s.includes("yang promo") ||
    s.includes("diskon terbesar")
  ) {
    return { type: "promo_refine", mode: "promo_only" };
  }

  if (
    s.includes("yang terbaik") ||
    s.includes("paling cocok") ||
    s.includes("worth it") ||
    s.includes("pilih yang mana")
  ) {
    return { type: "pick_best", mode: "best" };
  }

  if (
    s.includes("detailnya") ||
    s.includes("detail dong") ||
    s.includes("spesifikasinya")
  ) {
    return { type: "detail_followup", mode: "detail" };
  }

  if (s.includes("bandingkan") || s.includes("compare")) {
    return { type: "compare_followup", mode: "compare" };
  }

  return null;
}

// ==================
// Status transaksi
// ==================
function extractOrderId(text = "") {
  const s = String(text || "").trim();

  const patterns = [
    /order\s*#\s*(\d+)/i,
    /order\s+id\s*[:#-]?\s*(\d+)/i,
    /id\s+pesanan\s*[:#-]?\s*(\d+)/i,
    /nomor\s+pesanan\s*[:#-]?\s*(\d+)/i,
    /no\s+pesanan\s*[:#-]?\s*(\d+)/i,
    /\b(\d{3,})\b/,
  ];

  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return m[1].trim();
  }

  return "";
}

async function fetchWooOrderById(orderId = "") {
  const id = String(orderId || "").trim();
  if (!id) return null;

  const url = `https://pstaging.my.id/robotjadul/wp-json/wc/v3/orders/${encodeURIComponent(id)}`;

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

function mapOrderStatusLabel(status = "") {
  const s = String(status || "").toLowerCase();

  const map = {
    pending: "Menunggu pembayaran",
    "on-hold": "Menunggu verifikasi",
    processing: "Sedang diproses",
    completed: "Selesai",
    cancelled: "Dibatalkan",
    refunded: "Refund",
    failed: "Gagal",
  };

  return map[s] || status || "Tidak diketahui";
}

function formatOrderTotal(order) {
  const total = Number(order?.total || 0);
  if (!Number.isFinite(total)) return "-";

  return total.toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
}

function buildTransactionStatusMessage(order) {
  if (!order) {
    return (
      "Maaf, aku belum menemukan pesanan dengan Order ID tersebut 🙏\n\n" +
      "Coba kirim lagi Order ID yang benar ya."
    );
  }

  const orderNo = order.number || order.id || "-";
  const billingName =
    `${order.billing?.first_name || ""} ${order.billing?.last_name || ""}`.trim() ||
    "-";
  const statusLabel = mapOrderStatusLabel(order.status);
  const total = formatOrderTotal(order);
  const createdAt = order.date_created
    ? new Date(order.date_created).toLocaleString("id-ID")
    : "-";

  return (
    "📄 **Status Transaksi Pesanan**\n\n" +
    `• Order ID: **${orderNo}**\n` +
    `• Nama: **${billingName}**\n` +
    `• Status: **${statusLabel}**\n` +
    `• Total: **${total}**\n` +
    `• Tanggal Order: **${createdAt}**\n\n` +
    "Kalau mau, aku juga bisa bantu jelaskan arti status pesanan ini ya 😊"
  );
}

function isFreshCheapProductQuery(q = "") {
  const s = String(q || "")
    .toLowerCase()
    .trim();
  return (
    s.includes("produk termurah") ||
    s.includes("produk paling murah") ||
    s.includes("yang termurah apa") ||
    s.includes("barang termurah") ||
    s.includes("produk murah apa")
  );
}

// ==========Fitur COD===========
function isCODQuestion(q = "") {
  const s = q.toLowerCase();
  return (
    s.includes("bisa cod") ||
    s.includes("apakah bisa cod") ||
    s.includes("cod bisa") ||
    s.includes("bayar di tempat") ||
    s.includes("bisa bayar di tempat") ||
    s.includes("tersedia cod") ||
    s.includes("cod tersedia") ||
    s.includes("cash on delivery") ||
    s.includes("bayar pas barang sampai")
  );
}

function findBestMatchingProduct(query = "", products = []) {
  const q = query.toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const text = `${p.name} ${p.category} ${p.description}`.toLowerCase();

    let score = 0;

    // keyword match ringan
    if (text.includes(q)) score += 5;

    // token match
    const tokens = q.split(/\s+/);
    for (const t of tokens) {
      if (t.length < 3) continue;
      if (text.includes(t)) score += 2;
    }

    // stok bonus
    if (p.stock === "instock") score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  return bestScore > 0 ? best : null;
}

function isGenericProductWord(s = "") {
  const x = String(s || "")
    .toLowerCase()
    .trim();
  return (
    x === "produk" ||
    x === "barang" ||
    x === "item" ||
    x === "pesanan" ||
    x === "produk ini" ||
    x === "barang ini" ||
    x === "item ini"
  );
}

function stripHtml2(html = "") {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSpecsFromDescription(desc = "") {
  const text = stripHtml2(desc || "")
    .replace(/\r/g, "")
    .trim();
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const specPatterns = [
    /material/i,
    /bahan/i,
    /ukuran/i,
    /size/i,
    /tinggi/i,
    /panjang/i,
    /lebar/i,
    /berat/i,
    /scale/i,
    /skala/i,
    /artikulasi/i,
    /movable/i,
    /dapat digerakkan/i,
    /isi box/i,
    /include/i,
    /kelengkapan/i,
    /limited/i,
    /edition/i,
    /rilis/i,
    /release/i,
    /tahun/i,
    /kondisi/i,
    /condition/i,
    /ori/i,
    /original/i,
    /diecast/i,
    /plastic/i,
    /pvc/i,
    /abs/i,
  ];

  const picked = [];
  for (const line of lines) {
    if (specPatterns.some((re) => re.test(line))) {
      picked.push(line);
    }
  }

  if (!picked.length) {
    return lines.filter((l) => /^[-•\d.)]/.test(l)).slice(0, 8);
  }

  return picked.slice(0, 8);
}

function formatDimensions(dim = {}) {
  const l = dim?.length || "";
  const w = dim?.width || "";
  const h = dim?.height || "";

  if (!l && !w && !h) return "(tidak tercantum)";

  const parts = [];
  if (l) parts.push(`P: ${l} cm`);
  if (w) parts.push(`L: ${w} cm`);
  if (h) parts.push(`T: ${h} cm`);

  return parts.join(" • ");
}

function buildProductDetailMessage(product) {
  if (!product) return "Maaf, detail produk belum ditemukan 🙏";

  const price =
    Number(product.numericPrice || 0) > 0
      ? `Rp ${Number(product.numericPrice).toLocaleString("id-ID")}`
      : "(tidak tercantum)";

  const stockLabel =
    product.stock === "instock"
      ? "✅ Ready"
      : product.stock === "outofstock"
        ? "⚠️ Habis"
        : product.stock || "(tidak tercantum)";

  const condition = product.condition || "(tidak tercantum)";
  const weight = product.weight
    ? `${product.weight} gram`
    : "(tidak tercantum)";
  const dimensionsText = formatDimensions(product.dimensions);
  const category = product.category || "(tidak tercantum)";
  const specs = extractSpecsFromDescription(product.description || "");

  let msg =
    `📦 **Detail Produk**\n\n` +
    `• Nama: **${product.name || "-"}**\n` +
    `• Harga: **${price}**\n` +
    `• Stok: **${stockLabel}**\n` +
    `• Kondisi: **${condition}**\n` +
    `• Berat: **${weight}**\n` +
    `• Dimensi: **${dimensionsText}**\n` +
    `• Kategori: **${category}**\n`;

  if (specs.length) {
    msg += `\n🛠️ **Spesifikasi / Info dari deskripsi:**\n`;
    msg += specs.map((s) => `• ${s.replace(/^[-•\d.)\s]+/, "")}`).join("\n");
  } else {
    const shortDesc = stripHtml2(product.description || "")
      .slice(0, 500)
      .trim();
    if (shortDesc) {
      msg += `\n📝 **Deskripsi singkat:**\n${shortDesc}\n`;
    }
  }

  if (product.link) {
    msg += `\n\n🔗 Lihat produk: ${product.link}`;
  }

  return msg.trim();
}

function buildContactAdminMessage() {
  return (
    "🙏 Maaf ya, aku belum yakin dengan pertanyaan ini.\n\n" +
    "Biar tidak salah info, kamu bisa langsung hubungi admin kami:\n\n" +
    "📲 👉 https://wa.me/6285975313930\n\n" +
    "Atau coba tanya ulang dengan lebih spesifik ya 😊"
  );
}
// ====================
// BITESHIP TRACKING
// ====================
async function fetchBiteshipPublicTracking({ trackingNumber, courierCode }) {
  const baseUrl = process.env.BITESHIP_BASE_URL || "https://api.biteship.com";
  const apiKey = process.env.BITESHIP_API_KEY;

  if (!apiKey) {
    throw new Error("BITESHIP_API_KEY belum di-set");
  }

  const url = `${baseUrl}/v1/trackings/${encodeURIComponent(trackingNumber)}/couriers/${encodeURIComponent(courierCode)}`;

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

function mapBiteshipTracking(raw = {}) {
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

function buildTrackingMessage(tracking) {
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

function extractCourierCode(text = "") {
  const s = String(text).toLowerCase();

  if (s.includes("jne")) return "jne";
  if (s.includes("j&t") || s.includes("jnt")) return "jnt";
  if (s.includes("sicepat")) return "sicepat";
  if (s.includes("pos")) return "pos";
  if (s.includes("anteraja")) return "anteraja";
  if (s.includes("ninja")) return "ninja";
  return null;
}

function normalizeResi(raw = "") {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\-]/g, "")
    .trim();
}

function extractTrackingNumber(text = "") {
  const s = String(text || "").toUpperCase();

  // kandidat token 8-30 karakter
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

    // wajib ada angka
    if (!/\d/.test(x)) return false;

    // minimal jangan cuma angka super pendek
    if (x.length < 8) return false;

    return true;
  });

  if (!filtered.length) return null;

  filtered.sort((a, b) => b.length - a.length);
  return normalizeResi(filtered[0]);
}

function looksLikeTrackingQuestion(q = "") {
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

console.log("HAS BITESHIP KEY:", !!process.env.BITESHIP_API_KEY);
console.log("BITESHIP BASE URL:", process.env.BITESHIP_BASE_URL);

// ==================== Logic utama handler API ====================

export default async function handler(req, res) {
  console.log("ASK HIT:", req.method, req.url);
  // ===============================
  // 🔥 CORS FIX
  // ===============================

  console.log("METHOD:", req.method);

  const ALLOWED_ORIGIN = "https://pstaging.my.id"; // lebih aman daripada "*"
  // res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  // res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-Id",
  );

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const isSuggestionClick = !!body.isSuggestionClick;

  let rawQuestion = String(body.question || "").trim();
  if (!rawQuestion) {
    return res.status(400).json({ type: "text", message: "Pertanyaan kosong" });
  }

  let effectiveQuestion = normalizeQuestion(rawQuestion);
  let q = effectiveQuestion.toLowerCase();

  const sessionId = req.headers["x-session-id"] || "anon";
  const session = getSession(sessionId);

  let intentResult = await classifyIntentHybrid(effectiveQuestion);

  session.lastIntent = intentResult.intent || "general";
  session.lastIntentMethod =
    intentResult.method || "fallback_rule_low_confidence";
  session.lastIntentScore = intentResult.score ?? 0;

  console.log("INITIAL INTENT RESULT:", intentResult);

  function rebuildQuestion(newText) {
    rawQuestion = String(newText || "").trim();
    effectiveQuestion = normalizeQuestion(rawQuestion);
    q = effectiveQuestion.toLowerCase();
  }

  const isPromoQuery =
    q.includes("promo") ||
    q.includes("diskon") ||
    q.includes("sale") ||
    q.includes("cashback");

  const isCheapQuery =
    q.includes("murah") || q.includes("termurah") || q.includes("hemat");
  const pending = getPending(session);

  const isShippingQuoteQuestion =
    q.includes("ongkir") ||
    q.includes("cek ongkir") ||
    q.includes("berapa ongkir") ||
    q.includes("ongkos kirim") ||
    q.includes("biaya kirim") ||
    q.includes("kirim ke") ||
    q.includes("pengiriman ke") ||
    q.includes("estimasi pengiriman") ||
    q.includes("estimasi sampai");

  if (isShippingQuoteQuestion) {
    clearPending(session); // keluar dari pending status transaksi
    intentResult = {
      intent: "shipping_transaction",
      method: "shipping_quote_override_rule",
      score: 0.99,
    };
  }

  // ============return_product=============
  const isReturnProductQuestion =
    q.includes("refund") ||
    q.includes("uang kembali") ||
    q.includes("pengembalian uang") ||
    q.includes("barang rusak") ||
    q.includes("produk rusak") ||
    q.includes("datang rusak") ||
    q.includes("nyampe rusak") ||
    q.includes("cacat") ||
    q.includes("salah kirim") ||
    q.includes("tidak sesuai") ||
    q.includes("balikin uang") ||
    q.includes("kembalikan uang");

  // 🔥 FORCE INTENT
  if (isReturnProductQuestion) {
    intentResult = {
      intent: "return_product",
      method: "return_product_override_rule",
      score: 0.99,
    };
  }

  // ======= Status transaksi / order ===========
  if (
    q.includes("status order") ||
    q.includes("status pesanan") ||
    q.includes("status transaksi") ||
    q.includes("cek order") ||
    q.includes("cek pesanan") ||
    q.includes("order id") ||
    /^order\s*#?\s*\d+/i.test(rawQuestion) ||
    /\bstatus\b.*\border\b/i.test(rawQuestion)
  ) {
    intentResult = {
      intent: "transaction_status",
      method: "transaction_status_override_rule",
      score: 0.99,
    };
  }

  // ======= Asuransi ===========
  // paksa intent asuransi ke shipping_transaction
  if (
    q.includes("asuransi") ||
    q.includes("proteksi pengiriman") ||
    q.includes("barang diasuransikan") ||
    q.includes("bisa diasuransikan") ||
    q.includes("pakai asuransi")
  ) {
    intentResult = {
      intent: "shipping_transaction",
      method: "insurance_override_rule",
      score: 0.99,
    };
  }

  const extractedResi = extractTrackingNumber(rawQuestion);

  const trackingQuestion = looksLikeTrackingQuestion(rawQuestion);

  if (
    trackingQuestion ||
    (extractedResi && /\b(resi|lacak|tracking|paket)\b/i.test(rawQuestion))
  ) {
    intentResult = {
      intent: "shipment_tracking",
      method: extractedResi
        ? "shipment_tracking_override_by_resi"
        : "shipment_tracking_override_rule",
      score: 0.99,
    };
  }

  if (isSuggestionClick) {
    const pending = getPending(session);

    // jangan hapus pending kalau user sedang ada di flow multi-step penting
    const protectedPending =
      pending?.type === "shipping_quote" ||
      pending?.type === "compare" ||
      pending?.type === "checkout_flow" ||
      pending?.type === "shipment_tracking";

    if (!protectedPending) {
      clearPending(session);
      session.lastStep = null;
    }
  }

  const persisted = await loadSessionState(sessionId);
  if (persisted && typeof persisted === "object") {
    // merge ke in-memory session
    session.lastIntent = persisted.lastIntent ?? session.lastIntent;
    session.lastStep = persisted.lastStep ?? session.lastStep;

    // ===== TAMBAHKAN INI =====
    session.lastTopic = persisted.lastTopic ?? session.lastTopic;
    session.lastProducts = persisted.lastProducts ?? session.lastProducts;
    session.lastBotQuestionType =
      persisted.lastBotQuestionType ?? session.lastBotQuestionType;
    session.lastBotQuestionMeta =
      persisted.lastBotQuestionMeta ?? session.lastBotQuestionMeta;
    session.lastFilters = persisted.lastFilters ?? session.lastFilters;
    session.slots = persisted.slots ?? session.slots;
    // =========================

    session.pending = persisted.pending ?? session.pending;

    session.history = Array.isArray(persisted.history)
      ? persisted.history
      : session.history;
  }

  try {
    console.log("RAW QUESTION:", rawQuestion);
    console.log("NORMALIZED QUESTION:", effectiveQuestion);

    let semantic = null;

    if (GEMINI_MODE.enableSemanticParse) {
      semantic = await parseUserIntentWithGemini(rawQuestion, session);
    }

    console.log("SEMANTIC RESULT:", semantic);
    // ✅ GREETING GUARD (BIAR "HALO/HAI" GA MASUK SEARCH)
    if (!isSuggestionClick && isGreetingOnly(rawQuestion)) {
      const pending = getPending(session);

      if (pending?.type === "shipping_quote") {
        if (pending.stage === "need_location") {
          const resolved = await resolveShippingLocation(rawQuestion);

          if (resolved.kind === "single_city") {
            const city = resolved.city;

            setPending(session, {
              type: "shipping_quote",
              stage: "need_district",
              data: {
                city_id: city.city_id,
                city_name: city.name,
              },
            });

            return send(
              {
                type: "text",
                message: `Oke, tujuan **${city.name}**. Sekarang kecamatannya apa?`,
              },
              "shipping_transaction",
            );
          }

          if (resolved.kind === "multi_city") {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_city",
              data: {
                candidates: resolved.cities.slice(0, 8),
              },
            });

            return send(
              buildOptionsPayload(
                `Aku nemu beberapa hasil untuk **${rawQuestion}**. Pilih kota/kabupaten yang benar ya:`,
                resolved.cities.slice(0, 8).map((c) => ({
                  label: c.name,
                  value: c.name,
                })),
              ),
              "shipping_transaction",
            );
          }

          if (resolved.kind === "single_district") {
            const d = resolved.district;

            const quote = await getShippingQuoteFromWP_OKID({
              city_id: d.city_id,
              district_id: d.district_id,
              weight_grams: 1000,
            });

            const rates = quote.rates || [];
            const list = rates
              .map(
                (r) =>
                  `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
              )
              .join("\n");

            clearPending(session);

            return send(
              {
                type: "text",
                message:
                  `Oke, aku anggap tujuan **${d.title}, ${d.city_name}** ya.\n\n` +
                  `Ongkir estimasi (±1kg):\n\n${list}`,
              },
              "shipping_transaction",
            );
          }

          if (resolved.kind === "multi_district") {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district",
              data: {
                candidates: resolved.districts.slice(0, 8),
              },
            });

            return send(
              buildOptionsPayload(
                `Aku nemu beberapa kecamatan yang mirip dengan **${rawQuestion}**. Pilih yang benar ya:`,
                resolved.districts.slice(0, 8).map((d) => ({
                  label: `${d.title} - ${d.city_name}`,
                  value: `${d.title} - ${d.city_name}`,
                })),
              ),
              "shipping_transaction",
            );
          }

          return send(
            {
              type: "text",
              message:
                "Lokasinya belum ketemu 🙏 Coba tulis nama kota/kabupaten atau kecamatan yang lebih lengkap ya.",
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "choose_city") {
          const candidates = pending.data?.candidates || [];

          const picked = candidates.find(
            (c) => normalizeCityName(c.name) === normalizeCityName(rawQuestion),
          );

          if (!picked) {
            return send({
              type: "text",
              message:
                "Aku belum yakin kota yang dipilih. Coba klik salah satu opsi ya 😊",
            });
          }

          setPending(session, {
            type: "shipping_quote",
            stage: "need_district",
            data: {
              city_id: picked.city_id,
              city_name: picked.name,
            },
          });

          return send(
            {
              type: "text",
              message: `Oke, kotanya **${picked.name}**. Sekarang kecamatannya apa?`,
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "need_district") {
          const data = await searchDistrictsFromWP(
            pending.data.city_id,
            rawQuestion,
          ).catch(() => null);

          const districts = data?.districts || [];

          if (!districts.length) {
            return send(
              {
                type: "text",
                message:
                  `Aku belum menemukan kecamatan itu di **${pending.data.city_name}** 🙏\n` +
                  `Coba tulis nama kecamatan yang benar ya.`,
              },
              "shipping_transaction",
            );
          }

          if (districts.length > 1) {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district_in_city",
              data: {
                city_id: pending.data.city_id,
                city_name: pending.data.city_name,
                candidates: districts.slice(0, 8),
              },
            });

            return send(
              buildOptionsPayload(
                `Aku nemu beberapa kecamatan di **${pending.data.city_name}**. Pilih yang benar ya:`,
                districts.slice(0, 8).map((d) => ({
                  label: d.title,
                  value: d.title,
                })),
              ),
              "shipping_transaction",
            );
          }

          const top = districts[0];

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: pending.data.city_id,
            district_id: top.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${top.title}**:\n\n${list}`,
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "choose_district_in_city") {
          const candidates = pending.data?.candidates || [];
          const picked = candidates.find(
            (d) =>
              normalizeLocationText(d.title) ===
              normalizeLocationText(rawQuestion),
          );

          if (!picked) {
            return send(
              buildOptionsPayload(
                `Aku belum yakin kecamatan yang kamu pilih di **${pending.data.city_name}**. Coba pilih salah satu ini ya:`,
                candidates.map((d) => ({
                  label: d.title,
                  value: d.title,
                })),
              ),
              "shipping_transaction",
            );
          }

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: pending.data.city_id,
            district_id: picked.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${picked.title}**:\n\n${list}`,
            },
            "shipping_transaction",
          );
        }

        if (pending.stage === "choose_district") {
          const candidates = pending.data?.candidates || [];
          const picked = candidates.find(
            (d) =>
              normalizeLocationText(`${d.title} - ${d.city_name}`) ===
                normalizeLocationText(rawQuestion) ||
              normalizeLocationText(d.title) ===
                normalizeLocationText(rawQuestion),
          );

          if (!picked) {
            return send(
              buildOptionsPayload(
                "Aku belum yakin kecamatan yang kamu pilih. Coba pilih salah satu ini ya:",
                candidates.map((d) => ({
                  label: `${d.title} - ${d.city_name}`,
                  value: `${d.title} - ${d.city_name}`,
                })),
              ),
              "shipping_transaction",
            );
          }

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: picked.city_id,
            district_id: picked.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send(
            {
              type: "text",
              message: `Ongkir estimasi (±1kg) ke **${picked.title} - ${picked.city_name}**:\n\n${list}`,
            },
            "shipping_transaction",
          );
        }
      }

      session.lastIntent = "general";

      return await send(
        {
          type: "suggestions",
          message:
            buildGreetingMessage() +
            "\n\nSilakan pilih contoh pertanyaan di bawah atau ketik pertanyaanmu sendiri.",
          suggestions: getSmartSuggestions(session),
        },
        "general",
      );
    }
    // ===============================
    // ✅ POSTCODE GUARD (ANTI MASUK SEARCH PRODUK)
    // taruh sebelum SMART SEARCH MODE
    // ===============================
    const postcodeOnly = rawQuestion.trim().match(/^\d{5}$/);

    if (postcodeOnly) {
      const postcode = postcodeOnly[0];

      // set pending supaya step berikutnya minta produk (karena dummy product_id nanti saja)
      setPending(session, {
        type: "shipping_quote",
        stage: "need_product",
        data: { postcode },
      });

      return await send(
        {
          type: "text",
          message: `Sip, kode pos **${postcode}** ✅\n\nSekarang mau cek ongkir untuk **produk apa**? (kirim nama produk / link)`,
        },
        "shipping_transaction",
      );
    }

    async function logIntentToSupabase({
      sessionId,
      rawQuestion,
      intent = null,
      method = null,
      score = null,
    }) {
      if (!supabase) return;

      try {
        const { error } = await supabase.from("intent_logs").insert({
          session_id: sessionId,
          rawquestion: rawQuestion,
          intent,
          method,
          score,
        });

        if (error) {
          console.error("SUPABASE INSERT ERROR:", error.message);
        }
      } catch (e) {
        console.error("SUPABASE INSERT ERROR:", e?.message || e);
      }
    }

    // ✅ bikin send() dulu supaya bisa dipakai state handler
    async function send(payload, forceIntent = null) {
      if (
        payload.type === "products" &&
        Array.isArray(payload.products) &&
        payload.products.length
      ) {
        session.lastProducts = payload.products.map((p) => ({
          id: p.id,
          name: p.name,
          stock: p.stock,
          stockQuantity: p.stockQuantity ?? null,
          numericPrice: p.numericPrice,
          effectivePrice: p.effectivePrice,
          regular_price: p.regular_price,
          sale_price: p.sale_price,
          discountPercent: p.discountPercent || 0,
          discountAmount: p.discountAmount || 0,
          isPromo: !!p.isPromo,
          condition: p.condition,
          weight: p.weight,
          dimensions: p.dimensions,
          link: p.link,
        }));

        session.lastTopic = payload.products[0]?.name || session.lastTopic;
        updateSlot(session, "productName", payload.products[0]?.name || null);

        session.lastFilters = {
          priceMode:
            forceIntent === "price_promo"
              ? payload.reasoning_text?.toLowerCase().includes("diskon")
                ? "promo"
                : null
              : null,
          stockOnly: payload.products.every((p) => p.stock === "instock"),
          promoOnly: payload.products.every(
            (p) => Number(p.discountPercent || 0) > 0,
          ),
          keyword: rawQuestion,
          source:
            forceIntent || payload.intent || session.lastIntent || "general",
        };
      }

      let finalPayload = humanizeResponse(payload, {
        intent:
          forceIntent ?? payload.intent ?? session.lastIntent ?? "general",
        rawQuestion,
      });

      // simpan follow-up state jika humanizer memberi tawaran lanjutan
      if (finalPayload._followUpType) {
        setFollowUpOffer(
          session,
          finalPayload._followUpType,
          finalPayload._followUpMeta || {},
        );
      }

      finalPayload = await naturalizeWithGemini(finalPayload, rawQuestion);

      const finalIntent =
        forceIntent ?? payload.intent ?? session.lastIntent ?? "general";

      await logIntentToSupabase({
        sessionId,
        rawQuestion,
        intent:
          forceIntent ?? payload.intent ?? session.lastIntent ?? "general",
        method: session.lastIntentMethod || "fallback_rule_low_confidence",
        score: session.lastIntentScore ?? 0,
      });

      await saveSessionState(sessionId, {
        lastIntent: session.lastIntent,
        lastTopic: session.lastTopic,
        lastStep: session.lastStep,
        lastProducts: session.lastProducts,
        lastBotQuestionType: session.lastBotQuestionType,
        lastBotQuestionMeta: session.lastBotQuestionMeta,
        lastFilters: session.lastFilters,
        slots: session.slots,
        pending: session.pending,
        history: session.history?.slice(-50) || [],
      });

      delete finalPayload._noTruncateReasoning;
      delete finalPayload._followUpType;
      delete finalPayload._followUpMeta;

      console.log(
        "HUMANIZER INTENT:",
        forceIntent ?? payload.intent ?? session.lastIntent,
      );
      return res.json({
        ...finalPayload,
        intent:
          forceIntent ?? payload.intent ?? session.lastIntent ?? "general",
      });
    }

    if (isFreshCheapProductQuery(rawQuestion)) {
      session.lastIntent = "price_promo";
      clearFollowUpOffer(session);
      clearPending(session);
      session.lastProducts = null;
    }

    // ===============================
    // UNIVERSAL CONVERSATION FOLLOW-UP
    // ===============================
    const universalFollowUp = detectUniversalFollowUp(rawQuestion);

    const PRODUCT_CONTEXT_INTENTS = new Set([
      "product_discovery",
      "recommendation",
      "price_promo",
      "stock_availability",
      "product_detail",
    ]);

    if (
      universalFollowUp &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0 &&
      PRODUCT_CONTEXT_INTENTS.has(session.lastIntent)
    ) {
      let refined = [...session.lastProducts];
      const PRODUCT_CONTEXT_INTENTS = new Set([
        "product_discovery",
        "recommendation",
        "price_promo",
        "stock_availability",
        "product_detail",
      ]);

      const baseIntent = PRODUCT_CONTEXT_INTENTS.has(session.lastIntent)
        ? session.lastIntent
        : "product_discovery";

      if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "cheapest"
      ) {
        refined = refined
          .filter((p) => Number(p.numericPrice || 0) > 0)
          .sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0))
          .slice(0, 3);
      }

      if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "expensive"
      ) {
        refined = refined
          .filter((p) => Number(p.numericPrice || 0) > 0)
          .sort((a, b) => (b.numericPrice || 0) - (a.numericPrice || 0))
          .slice(0, 3);
      }

      if (universalFollowUp.type === "stock_refine") {
        refined = refined
          .filter((p) => String(p.stock || "").toLowerCase() === "instock")
          .slice(0, 3);
      }

      if (
        universalFollowUp.type === "promo_refine" &&
        universalFollowUp.mode === "promo_only"
      ) {
        refined = refined
          .filter((p) => Number(p.discountPercent || 0) > 0)
          .slice(0, 3);
      }

      if (universalFollowUp.type === "pick_best") {
        refined = refined.slice(0, 1);
      }

      if (universalFollowUp.type === "detail_followup") {
        const p = refined[0];
        if (p) {
          session.lastIntent = "product_detail";
          session.lastTopic = p.name;
          session.lastProducts = [p];

          return await send(
            {
              type: "text",
              message:
                `Detail singkat untuk **${p.name}**:\n\n` +
                `• Harga: ${formatRupiah(p.numericPrice)}\n` +
                `• Stok: ${p.stock === "instock" ? "Ready" : "Tidak ready"}\n` +
                `${p.condition ? `• Kondisi: ${p.condition}\n` : ""}` +
                `${p.link ? `• Link: ${p.link}` : ""}`,
            },
            "product_detail",
          );
        }
      }

      if (!refined.length) {
        return await send(
          {
            type: "text",
            message:
              "Dari hasil sebelumnya, aku belum menemukan yang cocok dengan lanjutan pertanyaan itu 🙏",
          },
          baseIntent,
        );
      }

      let intro = "Oke, aku lanjutkan dari hasil sebelumnya ya:";

      if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "cheapest"
      ) {
        intro = "Oke, ini yang paling murah dari hasil sebelumnya:";
      } else if (
        universalFollowUp.type === "price_refine" &&
        universalFollowUp.mode === "expensive"
      ) {
        intro = "Oke, ini yang paling mahal dari hasil sebelumnya:";
      } else if (universalFollowUp.type === "stock_refine") {
        intro = "Oke, ini yang ready stock dari hasil sebelumnya:";
      } else if (universalFollowUp.type === "promo_refine") {
        intro = "Oke, ini yang sedang promo dari hasil sebelumnya:";
      } else if (universalFollowUp.type === "pick_best") {
        intro = "Kalau dari hasil sebelumnya, ini yang paling layak dipilih:";
      }

      session.lastIntent = baseIntent;
      session.lastTopic = "universal_context_refine";
      session.lastProducts = refined;

      return await send(
        {
          type: "products",
          intro,
          products: refined,
          closing:
            "Kalau mau, kamu bisa lanjutkan lagi misalnya: yang paling murah, yang ready stock, yang promo, atau minta detail 😊",
        },
        baseIntent,
      );
    }

    // ===============================
    // CONTEXT FOLLOW-UP FROM LAST PRODUCTS
    // ===============================
    const contextFollowUp = detectContextFollowUp(rawQuestion);

    if (
      contextFollowUp &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0
    ) {
      const refined = applyContextProductRefine(
        session.lastProducts,
        contextFollowUp,
      );

      if (refined.length > 0) {
        let intro = "Oke, aku filter dari hasil sebelumnya ya:";

        if (
          contextFollowUp.type === "price_refine" &&
          contextFollowUp.mode === "cheapest"
        ) {
          intro = "Oke, ini yang paling murah dari hasil sebelumnya:";
        } else if (
          contextFollowUp.type === "price_refine" &&
          contextFollowUp.mode === "expensive"
        ) {
          intro = "Oke, ini yang paling mahal dari hasil sebelumnya:";
        } else if (contextFollowUp.type === "stock_refine") {
          intro = "Oke, ini yang ready stock dari hasil sebelumnya:";
        } else if (
          contextFollowUp.type === "promo_refine" &&
          contextFollowUp.mode === "promo_only"
        ) {
          intro = "Oke, ini yang sedang promo dari hasil sebelumnya:";
        } else if (
          contextFollowUp.type === "promo_refine" &&
          contextFollowUp.mode === "biggest_discount"
        ) {
          intro = "Oke, ini yang diskonnya paling besar dari hasil sebelumnya:";
        }

        const followIntent = session.lastIntent || "product_discovery";

        session.lastIntent = followIntent;
        session.lastTopic = "context_refine";
        session.lastProducts = refined;

        return await send(
          {
            type: "products",
            intro,
            products: refined,
            closing:
              "Kalau mau, aku bisa bantu lanjut filter lagi dari hasil ini 😊",
          },
          followIntent,
        );
      }

      return await send(
        {
          type: "text",
          message:
            "Dari hasil sebelumnya, aku belum menemukan produk yang cocok dengan filter itu 🙏",
        },
        "product_discovery",
      );
    }

    // ===============================
    // HUMAN FOLLOW-UP STATE HANDLER
    // ===============================
    if (session.lastBotQuestionType) {
      const followType = session.lastBotQuestionType;
      const meta = session.lastBotQuestionMeta || {};

      // 1) user menjawab iya untuk refine budget
      if (
        followType === "offer_budget_refine" &&
        (isYesAnswer(rawQuestion) || looksLikeBudgetAnswer(rawQuestion))
      ) {
        const recTopic =
          session.lastBotQuestionMeta?.recTopic ||
          session.slots?.category ||
          session.lastTopic ||
          "";

        clearFollowUpOffer(session);

        if (looksLikeBudgetAnswer(rawQuestion) && !isYesAnswer(rawQuestion)) {
          if (recTopic) {
            rebuildQuestion(`rekomendasi ${recTopic} budget ${rawQuestion}`);
          } else {
            rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
          }
        } else {
          setLastBotQuestion(session, "ask_budget_value", {
            source: "recommendation",
            recTopic: recTopic || null,
          });

          return await send(
            {
              type: "text",
              message:
                "Oke 😊 Budget maksimal yang kamu inginkan berapa? Misalnya: di bawah 500 ribu, 1 juta, atau 1,5 juta.",
            },
            "recommendation",
          );
        }
      }

      // 2) user menjawab budget setelah bot minta nominal
      if (
        followType === "ask_budget_value" &&
        looksLikeBudgetAnswer(rawQuestion)
      ) {
        const recTopic =
          session.lastBotQuestionMeta?.recTopic ||
          session.slots?.category ||
          session.lastTopic ||
          "";

        clearFollowUpOffer(session);

        const budget = extractBudgetRange(rawQuestion);

        if (budget.detected) {
          updateSlot(session, "budgetMin", budget.min);
          updateSlot(session, "budgetMax", budget.max);
        } else {
          updateSlot(session, "budgetMax", rawQuestion);
        }

        if (recTopic) {
          rebuildQuestion(`rekomendasi ${recTopic} budget ${rawQuestion}`);
        } else {
          rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
        }
      }

      // 3) refine murah
      if (
        followType === "offer_cheaper_refine" &&
        (isYesAnswer(rawQuestion) || looksLikeCheapRefine(rawQuestion))
      ) {
        clearFollowUpOffer(session);

        if (!isYesAnswer(rawQuestion) && looksLikeBudgetAnswer(rawQuestion)) {
          rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
        } else {
          setLastBotQuestion(session, "ask_budget_value", {
            source: "recommendation",
          });

          return await send(
            {
              type: "text",
              message:
                "Siap 😊 Kamu mau budget maksimal berapa? Misalnya: 500 ribu, 1 juta, atau di bawah 2 juta.",
            },
            "recommendation",
          );
        }
      }

      // 4) refine display / pajangan
      if (
        followType === "offer_display_refine" &&
        (isYesAnswer(rawQuestion) || looksLikeDisplayRefine(rawQuestion))
      ) {
        clearFollowUpOffer(session);
        rebuildQuestion("rekomendasi robot untuk pajangan");
      }

      // 5) refine koleksi
      if (
        followType === "offer_collection_refine" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("koleksi") ||
          looksLikePremiumRefine(rawQuestion))
      ) {
        clearFollowUpOffer(session);
        rebuildQuestion("rekomendasi robot untuk koleksi");
      }

      // 6) cek stok dari detail / harga
      if (
        followType === "offer_check_stock" &&
        looksLikeStockCheckAnswer(rawQuestion)
      ) {
        clearFollowUpOffer(session);

        const productName =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName;

        if (productName) {
          rebuildQuestion(`${productName} stok`);
        } else {
          setLastBotQuestion(session, "ask_product_name", {
            source: "stock",
          });

          return await send(
            {
              type: "text",
              message:
                "Boleh 😊 Mau cek stok produk apa? Sebutkan nama produknya ya.",
            },
            "stock_availability",
          );
        }
      }

      // 7) cek harga dari stok
      if (
        followType === "offer_check_price" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("harga"))
      ) {
        clearFollowUpOffer(session);

        const productName =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName;

        if (productName) {
          rebuildQuestion(`harga ${productName}`);
        }
      }

      // 8) compare
      if (
        followType === "offer_compare" &&
        looksLikeCompareAnswer(rawQuestion)
      ) {
        clearFollowUpOffer(session);

        const firstProduct =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName ||
          "";

        setLastBotQuestion(session, "ask_product_name", {
          source: "compare_second",
          first_product: firstProduct,
        });

        return await send(
          {
            type: "text",
            message: firstProduct
              ? `Siap 😊 Mau dibandingkan dengan produk apa? Misalnya: bandingkan ${firstProduct} dengan produk lain.`
              : "Siap 😊 Mau dibandingkan dengan produk apa? Tulis nama produknya ya.",
          },
          "compare",
        );
      }

      // 9) cek ongkir
      if (
        followType === "offer_check_shipping" &&
        looksLikeShippingAnswer(rawQuestion)
      ) {
        clearFollowUpOffer(session);

        setPending(session, {
          type: "shipping_quote",
          stage: "need_city",
          data: {},
        });

        return await send(
          {
            type: "text",
            message:
              "Oke 😊 Untuk cek ongkir, sebutkan dulu kota atau kabupaten tujuan ya.",
          },
          "shipping_transaction",
        );
      }

      // 10) lanjut flow shipping
      // if (
      //   followType === "offer_continue_shipping" &&
      //   looksLikeShippingAnswer(rawQuestion)
      // ) {
      //   clearFollowUpOffer(session);

      //   setPending(session, {
      //     type: "shipping_quote",
      //     stage: "need_city",
      //     data: {},
      //   });

      //   return await send(
      //     {
      //       type: "text",
      //       message:
      //         "Siap 😊 Sebutkan kota atau kabupaten tujuan dulu ya, nanti aku bantu lanjut cek ongkirnya.",
      //     },
      //     "shipping_transaction",
      //   );
      // }

      // 11) alternatif ready stock
      if (
        followType === "offer_ready_alternative" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("alternatif") ||
          normalizeLite(rawQuestion).includes("yang ready"))
      ) {
        clearFollowUpOffer(session);

        const productName =
          meta.productName ||
          session.lastProducts?.[0]?.name ||
          session.slots?.productName ||
          "";

        if (productName) {
          rebuildQuestion(
            `rekomendasi produk seperti ${productName} yang ready stock`,
          );
        } else {
          rebuildQuestion("produk ready stock");
        }
      }

      // 12) pilih pemenang dari compare
      if (
        followType === "offer_pick_winner" &&
        (isYesAnswer(rawQuestion) ||
          normalizeLite(rawQuestion).includes("pilih") ||
          normalizeLite(rawQuestion).includes("mana yang lebih worth it"))
      ) {
        clearFollowUpOffer(session);

        const names = Array.isArray(meta.products)
          ? meta.products.map((x) => x.name).filter(Boolean)
          : [];

        if (names.length >= 2) {
          rebuildQuestion(
            `dari ${names[0]} dan ${names[1]}, mana yang lebih worth it?`,
          );
        } else {
          return await send(
            {
              type: "text",
              message:
                "Boleh 😊 Sebutkan lagi dua produk yang mau difokuskan, nanti aku bantu pilihkan.",
            },
            "compare",
          );
        }
      }

      // 13) fokus compare harga/stok
      if (followType === "offer_compare_focus" && !isNoAnswer(rawQuestion)) {
        const s = normalizeLite(rawQuestion);

        if (s.includes("harga")) {
          clearFollowUpOffer(session);
          const names = Array.isArray(meta.products)
            ? meta.products.map((x) => x.name).filter(Boolean)
            : [];

          if (names.length >= 2) {
            rebuildQuestion(
              `bandingkan ${names[0]} dengan ${names[1]} dari sisi harga`,
            );
          }
        } else if (s.includes("stok")) {
          clearFollowUpOffer(session);
          const names = Array.isArray(meta.products)
            ? meta.products.map((x) => x.name).filter(Boolean)
            : [];

          if (names.length >= 2) {
            rebuildQuestion(
              `bandingkan ${names[0]} dengan ${names[1]} dari sisi stok`,
            );
          }
        }
      }
    }

    // =====================
    // Reset Ingatan obrolan
    // =====================
    if (["reset", "mulai lagi", "batal", "clear"].includes(q)) {
      resetConversationContext(session);

      return await send({
        type: "text",
        message:
          "Siap 😊 Konteks percakapan sudah aku reset. Kamu bisa mulai tanya lagi dari awal.",
        intent: "general",
      });
    }

    // =====================
    // Fitur COD
    // =====================
    if (isCODQuestion(rawQuestion)) {
      const codEnabled =
        String(process.env.COD_ENABLED || "false").toLowerCase() === "true";

      if (codEnabled) {
        return await send(
          {
            type: "text",
            message:
              "✅ Saat ini **COD / bayar di tempat tersedia** untuk area atau kondisi tertentu.\n\n" +
              "Ketersediaan COD bisa tergantung lokasi pengiriman dan aturan layanan yang aktif saat checkout ya.\n\n" +
              "Kalau mau, sebutkan kota atau kecamatan tujuan, nanti aku bantu cek juga.",
            intent: "shipping_transaction",
          },
          "shipping_transaction",
        );
      }

      return await send(
        {
          type: "text",
          message:
            "🙏 Saat ini **COD / bayar di tempat belum tersedia**.\n\n" +
            "Untuk pembayaran, kamu bisa gunakan metode lain yang tersedia saat checkout, seperti transfer bank, QRIS, e-wallet, atau metode pembayaran lain yang aktif di website.",
          intent: "shipping_transaction",
        },
        "shipping_transaction",
      );
    }

    // =====================
    // Estimasi barang
    // =====================
    function isShippingEstimateQuestion(q = "") {
      const s = q.toLowerCase();
      return (
        s.includes("estimasi") ||
        s.includes("berapa lama") ||
        s.includes("berapa hari") ||
        s.includes("kapan sampai") ||
        s.includes("lama pengiriman") ||
        s.includes("estimasi sampai")
      );
    }

    if (isShippingEstimateQuestion(rawQuestion)) {
      return await send(
        {
          type: "text",
          message:
            "⏱️ **Estimasi Pengiriman Pesanan**\n\n" +
            "📦 Pesanan biasanya diproses dalam waktu **1–2 hari kerja** setelah pembayaran dikonfirmasi.\n\n" +
            "🚚 Estimasi pengiriman:\n" +
            "• Jabodetabek: **1–2 hari**\n" +
            "• Pulau Jawa: **2–4 hari**\n" +
            "• Luar Jawa: **3–7 hari**\n\n" +
            "Estimasi bisa berbeda tergantung ekspedisi dan lokasi tujuan ya 😊",
          intent: "shipping_transaction",
        },
        "shipping_transaction",
      );
    }

    // ==========================
    // Nanya lokasi toko offline
    // ==========================
    function isStoreLocationQuestion(q = "") {
      const s = q.toLowerCase();
      return (
        s.includes("toko offline") ||
        s.includes("offline store") ||
        s.includes("alamat toko") ||
        s.includes("lokasi toko") ||
        s.includes("lokasi robot jadul") ||
        s.includes("robot jadul di mana") ||
        s.includes("robot jadul dimana") ||
        (s.includes("toko") &&
          (s.includes("di mana") || s.includes("dimana"))) ||
        (s.includes("lokasi") &&
          (s.includes("di mana") || s.includes("dimana"))) ||
        s.includes("datang ke toko") ||
        s.includes("ambil di toko") ||
        s.includes("pickup di toko") ||
        s.includes("toko fisik") ||
        s.includes("bisa datang langsung") ||
        s.includes("jam buka") ||
        s.includes("jadwal toko") ||
        s.includes("pukul") ||
        s.includes("jam operasional")
      );
    }
    function isOriginQuestion(q = "") {
      const s = q.toLowerCase();
      return (
        s.includes("pengiriman dari mana") ||
        s.includes("dikirim dari mana") ||
        s.includes("asal pengiriman") ||
        s.includes("barang dikirim dari mana") ||
        s.includes("kirim dari mana") ||
        s.includes("kirim dari") ||
        s.includes("gudang") ||
        s.includes("warehouse") ||
        s.includes("asal") ||
        s.trim() === "dari mana"
      );
    }

    // 1) lokasi toko offline
    if (isStoreLocationQuestion(rawQuestion)) {
      const storeText =
        process.env.STORE_ADDRESS_TEXT ||
        "📍Robot Jadul. Blok M Square lt 3A blok A no 36-37. Jl Melawai 5. Jakarta Selatan 12160. Indonesia \n🗓️Every day \n🕰️11:00-20:00";
      return await send({
        type: "text",
        message: storeText,
        intent: "general",
      });
    }

    // 2) asal pengiriman
    if (isOriginQuestion(rawQuestion)) {
      const originText =
        process.env.SHIP_ORIGIN_TEXT ||
        "Pengiriman diproses dari TOKO ROBOT JADUL di **JAKARTA SELATAN**.";
      return await send({
        type: "text",
        message: `${originText}\n\nKalau mau cek ongkir, sebutkan kota/kab tujuan ya 😊`,
        intent: "shipping_transaction",
      });
    }

    let cleanProducts = null;

    async function getCleanProducts() {
      if (cleanProducts) return cleanProducts;

      let products;
      try {
        products = await getProductsCached();
      } catch (e) {
        console.error("WC FETCH ERROR:", e?.message || e);
        throw new Error("WC_PRODUCTS_UNAVAILABLE");
      }

      function getMetaValue(metaData, key) {
        if (!Array.isArray(metaData)) return "";
        const found = metaData.find((m) => m?.key === key);
        return found?.value ?? "";
      }

      function cleanNumberString(x) {
        if (x == null) return "";
        const s = String(x).trim();
        return s === "0" ? "" : s;
      }

      function toNum(x) {
        const n = parseFloat(String(x ?? "").replace(",", "."));
        return Number.isFinite(n) ? n : null;
      }

      cleanProducts = products.map((p) => {
        const condition =
          p.condition || getMetaValue(p.meta_data, "condition") || "";

        const length = cleanNumberString(p.dimensions?.length);
        const width = cleanNumberString(p.dimensions?.width);
        const height = cleanNumberString(p.dimensions?.height);

        const price = toNum(p.price);
        const regular = toNum(p.regular_price);
        const sale = toNum(p.sale_price);
        const effectivePrice = sale ?? price ?? regular ?? null;
        const discountPercent = calcDiscountPercent(regular, sale);
        const discountAmount =
          regular && sale && sale < regular ? regular - sale : 0;

        return {
          id: p.id,
          name: p.name,
          price: p.price,
          regular_price: p.regular_price,
          sale_price: p.sale_price,
          numericPrice: effectivePrice ?? 0,
          effectivePrice,
          stock: p.stock_status,
          stockQuantity:
            typeof p.stock_quantity === "number" ? p.stock_quantity : null,
          totalSales: Number(p.total_sales || 0),
          averageRating: Number(p.average_rating || 0),
          ratingCount: Number(p.rating_count || 0),
          description: p.description || "",
          link: p.permalink,
          image: p.images?.[0]?.src || "",
          category: p.categories?.map((c) => c.name.toLowerCase()).join(" "),
          condition,
          weight: cleanNumberString(p.weight),
          dimensions: { length, width, height },
          type: p.type,
          discountPercent,
          discountAmount,
          isPromo: discountPercent > 0,
        };
      });

      return cleanProducts;
    }

    function mapWooProductToClean(p) {
      const condition =
        p.condition || getMetaValue(p.meta_data, "condition") || "";

      const price = toNum(p.price);
      const regular = toNum(p.regular_price);
      const sale = toNum(p.sale_price);
      const effectivePrice = sale ?? price ?? regular ?? null;

      const discountPercent = calcDiscountPercent(regular, sale);
      const discountAmount =
        regular && sale && sale < regular ? regular - sale : 0;

      return {
        id: p.id,
        name: p.name,
        price: p.price,
        regular_price: p.regular_price,
        sale_price: p.sale_price,
        numericPrice: effectivePrice ?? 0,
        effectivePrice,
        stock: p.stock_status,
        stockQuantity:
          typeof p.stock_quantity === "number" ? p.stock_quantity : null,
        totalSales: Number(p.total_sales || 0),
        averageRating: Number(p.average_rating || 0),
        ratingCount: Number(p.rating_count || 0),
        description: p.description || "",
        link: p.permalink,
        image: p.images?.[0]?.src || "",
        category: p.categories?.map((c) => c.name.toLowerCase()).join(" "),
        condition,
        weight: cleanNumberString(p.weight),
        dimensions: {
          length: cleanNumberString(p.dimensions?.length),
          width: cleanNumberString(p.dimensions?.width),
          height: cleanNumberString(p.dimensions?.height),
        },
        type: p.type,
        discountPercent,
        discountAmount,
        isPromo: discountPercent > 0,
      };
    }

    let promoCache = { at: 0, data: null };

    async function fetchPromoProducts(limit = 10) {
      const now = Date.now();

      if (promoCache.data && now - promoCache.at < 1000 * 60 * 5) {
        return promoCache.data.slice(0, limit);
      }

      const params = new URLSearchParams({
        per_page: String(Math.min(Math.max(limit, 1), 20)),
        status: "publish",
        on_sale: "true",
      });

      const url = `https://pstaging.my.id/robotjadul/wp-json/wc/v3/products?${params.toString()}`;

      const raw = await fetchWithTimeoutJson(
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
        20000,
      );

      const mapped = Array.isArray(raw)
        ? raw.map(mapWooProductToClean).filter((p) => p.isPromo)
        : [];

      promoCache = { at: now, data: mapped };
      return mapped.slice(0, limit);
    }

    // ==============================
    // ALAMAT TOKO (SHIPPING ORIGIN) HANDLER
    // ==============================
    function isShippingOriginQuestion(q = "") {
      const s = q.toLowerCase();
      return (
        s.includes("pengiriman dari mana") ||
        s.includes("dikirim dari mana") ||
        s.includes("dikirim dari") ||
        s.includes("asal pengiriman") ||
        s.includes("lokasi pengiriman") ||
        s.includes("kirim dari mana") ||
        s.includes("gudang") ||
        s.trim() === "dari mana"
      );
    }

    // ---- ROUTE ORIGIN (GLOBAL) ----
    if (isShippingOriginQuestion(rawQuestion)) {
      const originText =
        process.env.SHIP_ORIGIN_TEXT ||
        "Pengiriman kami diproses dari TOKO Robot Jadul di **JAKARTA SELATAN**.";

      return await send(
        {
          type: "text",
          message: `${originText}\n\nKalau kamu mau, sebutkan kota tujuan—nanti aku bantu cek ongkir & estimasinya 😊`,
        },
        "shipping_transaction",
      );
    }

    // ===============================
    // ✅ UNIVERSAL STATE HANDLER (RUN FIRST)
    // ===============================

    function cleanupCityQuery(s = "") {
      return s
        .toLowerCase()
        .replace(/\b(kota|kabupaten|kab|city|regency)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (pending) {
      // contoh 1: shipping quote flow
      if (pending?.type === "shipping_quote") {
        if (pending.stage === "need_city") {
          let data = await searchCitiesFromWP(rawQuestion).catch(() => null);
          let cities = data?.cities || [];

          if (!cities.length) {
            data = await searchCitiesFromWP(
              cleanupCityQuery(rawQuestion),
            ).catch(() => null);
            cities = data?.cities || [];
          }

          if (!cities.length) {
            return send(
              {
                type: "text",
                message:
                  "Kota/kabupaten tidak ketemu 🙏 Coba tulis yang lebih lengkap ya, misalnya: Kota Tangerang, Kab. Tangerang, atau Tangerang Selatan.",
              },
              "shipping_transaction",
            );
          }

          if (cities.length > 1) {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_city",
              data: {
                candidates: cities.slice(0, 8),
              },
            });

            return send(
              {
                type: "options",
                intro: `Aku nemu beberapa hasil untuk **${rawQuestion}**. Pilih kota/kabupaten yang benar ya:`,
                options: cities.slice(0, 8).map((c) => ({
                  label: c.name,
                  value: c.name,
                })),
              },
              "shipping_transaction",
            );
          }

          const top = cities[0];

          setPending(session, {
            type: "shipping_quote",
            stage: "need_district",
            data: {
              city_id: top.city_id,
              city_name: top.name,
            },
          });

          return send(
            {
              type: "text",
              message: `Oke, tujuan **${top.name}**. Sekarang kecamatannya apa?`,
            },
            "shipping_transaction",
          );
        }

        // ✅ HANDLE PILIHAN KOTA (INI YANG BELUM ADA)
        if (pending.stage === "choose_city") {
          const candidates = pending.data?.candidates || [];

          const picked = candidates.find(
            (c) => normalizeCityName(c.name) === normalizeCityName(rawQuestion),
          );

          if (!picked) {
            return send({
              type: "text",
              message:
                "Aku belum yakin kota yang dipilih. Coba klik salah satu opsi ya 😊",
            });
          }

          // lanjut ke kecamatan
          setPending(session, {
            type: "shipping_quote",
            stage: "need_district",
            data: {
              city_id: picked.city_id,
              city_name: picked.name,
            },
          });

          return send({
            type: "text",
            message: `Oke, kotanya **${picked.name}**. Sekarang kecamatannya apa?`,
          });
        }

        if (pending.stage === "choose_district") {
          const candidates = pending.data?.candidates || [];

          const picked = candidates.find(
            (d) =>
              normalizeCityName(d.title) === normalizeCityName(rawQuestion),
          );

          if (!picked) {
            return send({
              type: "text",
              message:
                "Aku belum yakin kecamatan yang dipilih. Coba klik salah satu opsi ya 😊",
            });
          }

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: pending.data.city_id,
            district_id: picked.district_id,
            weight_grams: 1000,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");

          return send({
            type: "text",
            message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${picked.title}**:\n\n${list}`,
          });
        }

        if (pending.stage === "need_district") {
          const data = await searchDistrictsFromWP(
            pending.data.city_id,
            rawQuestion,
          );
          const districts = data.districts || [];

          if (!districts.length) {
            return send({
              type: "text",
              message:
                "Kecamatan tidak ketemu. Coba tulis nama kecamatan yang benar ya.",
            });
          }

          // kalau lebih dari 1 → kasih pilihan
          if (districts.length > 1) {
            setPending(session, {
              type: "shipping_quote",
              stage: "choose_district",
              data: {
                city_id: pending.data.city_id,
                city_name: pending.data.city_name,
                candidates: districts.slice(0, 8),
              },
            });

            return send({
              type: "options",
              intro: `Aku nemu beberapa kecamatan untuk **${pending.data.city_name}**. Pilih yang benar ya:`,
              options: districts.slice(0, 8).map((d) => ({
                label: d.title,
                value: d.title,
              })),
            });
          }

          // kalau cuma 1 → lanjut
          const top = districts[0];
          if (!top)
            return send({
              type: "text",
              message:
                "Kecamatan tidak ketemu. Coba tulis nama kecamatan yang benar ya.",
            });

          // default 1kg kalau user nggak nyebut berat
          const weight_grams = 1000;

          const quote = await getShippingQuoteFromWP_OKID({
            city_id: pending.data.city_id,
            district_id: top.district_id,
            weight_grams,
          });

          clearPending(session);

          const rates = quote.rates || [];
          const list = rates
            .map(
              (r) =>
                `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
            )
            .join("\n");
          return send({
            type: "text",
            message: `Ongkir estimasi (±1kg) ke **${pending.data.city_name} - ${top.title}**:\n\n${list}`,
          });
        }
      }

      // kalau pending type lain, tambahkan handler lain di sini...
    }

    // =================================
    // Universal Follow up handler
    // ================================

    if (isShortFollowUp(rawQuestion) && session.lastBotQuestionType) {
      // 1) bot sebelumnya menanyakan kecamatan
      if (session.lastBotQuestionType === "ask_district") {
        const cityId = session.lastBotQuestionMeta?.city_id;
        const cityName = session.lastBotQuestionMeta?.city_name;

        if (cityId) {
          const data = await searchDistrictsFromWP(cityId, rawQuestion).catch(
            () => null,
          );
          const top = data?.districts?.[0];

          if (top) {
            clearLastBotQuestion(session);
            updateSlot(session, "district", top.title);

            const quote = await getShippingQuoteFromWP_OKID({
              city_id: cityId,
              district_id: top.district_id,
              weight_grams: 1000,
            });

            const rates = quote.rates || [];
            const list = rates
              .map(
                (r) =>
                  `• ${r.label}: Rp ${Number(r.cost || 0).toLocaleString("id-ID")}`,
              )
              .join("\n");

            return await send(
              {
                type: "text",
                message: `Ongkir estimasi (±1kg) ke **${cityName} - ${top.title}**:\n\n${list}`,
              },
              "shipping_transaction",
            );
          }
        }
      }

      // 2) bot sebelumnya menanyakan kota
      if (session.lastBotQuestionType === "ask_city") {
        const data = await searchCitiesFromWP(rawQuestion).catch(() => null);
        const top = data?.cities?.[0];

        if (top) {
          clearLastBotQuestion(session);
          updateSlot(session, "city", top.name);

          setLastBotQuestion(session, "ask_district", {
            city_id: top.city_id,
            city_name: top.name,
          });

          return await send(
            {
              type: "text",
              message: `Oke, tujuan **${top.name}**. Sekarang kecamatannya apa?`,
            },
            "shipping_transaction",
          );
        }
      }
    }

    // ===============================
    // UNIVERSAL FOLLOW UP: PRODUCT NAME
    // ===============================

    if (
      isShortFollowUp(rawQuestion) &&
      session.lastBotQuestionType === "ask_product_name"
    ) {
      const meta = session.lastBotQuestionMeta || {};
      const source = meta.source;

      clearLastBotQuestion(session);
      updateSlot(session, "productName", rawQuestion);

      if (source === "stock") {
        rebuildQuestion(`${rawQuestion} stok`);
      } else if (source === "detail") {
        rebuildQuestion(`${rawQuestion} detail`);
      } else if (source === "compare_second" && meta.first_product) {
        rebuildQuestion(
          `bandingkan ${meta.first_product} dengan ${rawQuestion}`,
        );
      }
    }

    // Universal Follow Up : Recommend
    if (
      isShortFollowUp(rawQuestion) &&
      session.lastBotQuestionType === "ask_budget"
    ) {
      const meta = session.lastBotQuestionMeta || {};
      const recTopic =
        meta.recTopic || session.slots?.category || session.lastTopic || "";

      clearLastBotQuestion(session);

      const budget = extractBudgetRange(rawQuestion);

      if (budget.detected) {
        updateSlot(session, "budgetMin", budget.min);
        updateSlot(session, "budgetMax", budget.max);
      } else {
        // fallback lama tetap dipertahankan
        updateSlot(session, "budgetMax", rawQuestion);
      }

      if (recTopic) {
        rebuildQuestion(`rekomendasi ${recTopic} budget ${rawQuestion}`);
      } else {
        rebuildQuestion(`rekomendasi robot budget ${rawQuestion}`);
      }
    }

    if (
      isSpecFollowUpQuestion(q) &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0
    ) {
      // kalau sebelumnya compare, tanya dulu produk mana
      if (
        session.lastTopic === "compare" &&
        session.lastProducts.length === 2
      ) {
        setLastBotQuestion(session, "ask_product_for_spec", {
          products: session.lastProducts.map((p) => p.name),
        });

        return await send(
          {
            type: "text",
            message:
              `Kamu mau cek spesifikasi produk yang mana dulu?\n\n` +
              `• ${session.lastProducts[0].name}\n` +
              `• ${session.lastProducts[1].name}\n\n` +
              `Balas nama produknya ya 😊`,
          },
          "product_detail",
        );
      }

      function formatSpec(p) {
        const dims = p.dimensions || {};
        const dimText =
          dims.length || dims.width || dims.height
            ? `${dims.length || "-"} x ${dims.width || "-"} x ${dims.height || "-"}`
            : "";

        const parts = [];
        if (p.condition) parts.push(`• Kondisi: ${p.condition}`);
        if (p.weight) parts.push(`• Berat: ${p.weight} gram`);
        if (dimText) parts.push(`• Dimensi (P x L x T): ${dimText}`);
        return parts.length ? parts.join("\n") : "";
      }

      const top = session.lastProducts[0];
      const specText = formatSpec(top);

      session.lastIntent = "product_detail";

      if (!specText) {
        return await send(
          {
            type: "text",
            message: `Produk terakhir yang sedang kita bahas adalah **${top.name}**, tapi info berat/dimensi/kondisinya belum tercantum di data 🙏`,
          },
          "product_detail",
        );
      }

      return await send(
        {
          type: "products",
          intro: `Detail **${top.name}**:\n${specText}`,
          products: [top],
          _noTruncateReasoning: true,
        },
        "product_detail",
      );
    }

    if (
      session.lastBotQuestionType === "ask_product_for_spec" &&
      isShortFollowUp(rawQuestion) &&
      Array.isArray(session.lastProducts) &&
      session.lastProducts.length > 0
    ) {
      const picked = bestMatchByName(rawQuestion, session.lastProducts);

      if (picked.best) {
        clearLastBotQuestion(session);
        session.lastProducts = [picked.best];
        session.lastTopic = "product_detail";
        session.lastIntent = "product_detail";

        const specText = formatSpec(picked.best);

        if (!specText) {
          return await send(
            {
              type: "text",
              message: `Produk **${picked.best.name}** ditemukan, tapi info berat/dimensi/kondisinya belum tercantum di data 🙏`,
            },
            "product_detail",
          );
        }

        return await send(
          {
            type: "products",
            intro: `Detail **${picked.best.name}**:\n${specText}`,
            products: [picked.best],
            _noTruncateReasoning: true,
          },
          "product_detail",
        );
      }

      return await send(
        {
          type: "text",
          message:
            "Aku belum yakin produk yang kamu maksud. Coba tulis nama yang lebih lengkap ya 😊",
        },
        "product_detail",
      );
    }
    // ===============================
    // Intent classification (dataset)
    // ===============================

    if ((intentResult?.score || 0) < 0.55 && semantic?.intent) {
      intentResult = {
        intent: semantic.intent,
        method: "semantic_fallback",
        score: 0.6,
        semantic,
      };
    } else {
      intentResult = {
        ...intentResult,
        semantic,
      };
    }

    session.lastIntent = intentResult.intent || session.lastIntent;
    session.lastIntentMethod = intentResult.method || session.lastIntentMethod;
    session.lastIntentScore = intentResult.score ?? session.lastIntentScore;

    console.log("FINAL INTENT RESULT:", intentResult);

    if (intentResult.intent === "shipping_origin") {
      const storeText =
        process.env.STORE_ADDRESS_TEXT ||
        "📍Robot Jadul. Blok M Square lt 3A blok A no 36-37. Jl Melawai 5. Jakarta Selatan 12160. Indonesia\n🗓️Every day\n🕰️11:00-20:00";

      const originText =
        process.env.SHIP_ORIGIN_TEXT ||
        "Pengiriman diproses dari TOKO Robot Jadul di **JAKARTA SELATAN**.";

      if (isStoreLocationQuestion(rawQuestion)) {
        return await send(
          {
            type: "text",
            message: storeText,
          },
          "general",
        );
      }

      return await send(
        {
          type: "text",
          message: `${originText}\n\nKalau mau datang langsung, ini alamat toko kami:\n\n${storeText}`,
        },
        "shipping_transaction",
      );
    }

    // ===============================
    // Shipment Tracking
    // ===============================
    if (intentResult.intent === "shipment_tracking") {
      const trackingNumber = extractTrackingNumber(rawQuestion);

      if (!trackingNumber) {
        setPending(session, {
          type: "shipment_tracking",
          stage: "need_tracking_number",
          data: {},
        });

        return await send(
          {
            type: "text",
            message:
              "Siap 😊 Kirim nomor resinya dulu ya. Kalau bisa sekalian tulis kurirnya juga, misalnya: **JNE 123456789**.",
          },
          "shipment_tracking",
        );
      }

      const courierCode = extractCourierCode(rawQuestion); // buat helper sederhana: jne, jnt, sicepat, pos, dll

      if (!courierCode) {
        setPending(session, {
          type: "shipment_tracking",
          stage: "need_courier_code",
          data: { trackingNumber },
        });

        return await send(
          {
            type: "text",
            message: `Nomor resi **${trackingNumber}** sudah aku terima.\nSekarang kurirnya apa ya? Contoh: **JNE**, **J&T**, **SiCepat**, **Anteraja**, atau **POS**.`,
          },
          "shipment_tracking",
        );
      }

      try {
        const raw = await fetchBiteshipPublicTracking({
          trackingNumber,
          courierCode,
        });

        const tracking = mapBiteshipTracking(raw);

        return await send(
          {
            type: "text",
            message: buildTrackingMessage(tracking),
          },
          "shipment_tracking",
        );
      } catch (err) {
        return await send(
          {
            type: "text",
            message: `Maaf, resi **${trackingNumber}** belum bisa dicek saat ini 🙏\nAlasannya: ${err.message}`,
          },
          "shipment_tracking",
        );
      }
    }

    // ==================
    // Transaction_status
    // =================
    if (intentResult.intent === "transaction_status") {
      const orderId = extractOrderId(rawQuestion);

      if (!orderId) {
        setPending(session, {
          type: "transaction_status",
          stage: "need_order_id",
          data: {},
        });

        return await send(
          {
            type: "text",
            message:
              "Tentu, aku bisa bantu cek status transaksi 😊\n\n" +
              "Silakan kirim **Order ID / nomor pesanan** dulu ya.\n" +
              "Contoh: **6864** atau **Order #6864**",
          },
          "transaction_status",
        );
      }

      let order = null;
      try {
        order = await fetchWooOrderById(orderId);
      } catch (e) {
        console.error("ORDER FETCH ERROR:", e?.message || e);
        return await send(
          {
            type: "text",
            message:
              "Maaf, terjadi kendala saat cek status pesanan. Coba lagi beberapa saat ya 🙏",
          },
          "transaction_status",
        );
      }

      session.lastIntent = "transaction_status";
      session.lastTopic = orderId;

      return await send(
        {
          type: "text",
          message: buildTransactionStatusMessage(order),
        },
        "transaction_status",
      );
    }

    if (
      pending?.type === "transaction_status" &&
      pending?.stage === "need_order_id"
    ) {
      const orderId = extractOrderId(rawQuestion);

      if (!orderId) {
        return await send(
          {
            type: "text",
            message:
              "Aku masih butuh **Order ID / nomor pesanan** dulu ya 😊\n" +
              "Contoh: **6864** atau **Order #6864**",
          },
          "transaction_status",
        );
      }

      clearPending(session);

      let order = null;
      try {
        order = await fetchWooOrderById(orderId);
      } catch (e) {
        console.error("ORDER FETCH ERROR:", e?.message || e);
        return await send(
          {
            type: "text",
            message:
              "Maaf, terjadi kendala saat cek status pesanan. Coba lagi beberapa saat ya 🙏",
          },
          "transaction_status",
        );
      }

      session.lastIntent = "transaction_status";
      session.lastTopic = orderId;

      return await send(
        {
          type: "text",
          message: buildTransactionStatusMessage(order),
        },
        "transaction_status",
      );
    }

    // simpan untuk follow-up / riset
    const previousIntent = session.lastIntent;
    session.lastIntent = intentResult.intent;
    session.lastIntentMethod = intentResult.method || null;
    session.lastIntentScore = intentResult.score ?? null;

    // log (buat penelitian)
    session.history.push({
      type: "user",
      text: rawQuestion,
      intent: intentResult.intent,
      method: intentResult.method,
      score: intentResult.score,
      at: Date.now(),
    });

    // optional: batasi history biar ga bengkak
    if (session.history.length > 50)
      session.history = session.history.slice(-50);

    // debug export (opsional, matikan di production)
    if (q === "__export_intent_log__") {
      return res.json({ type: "intent_log", history: session.history });
    }

    //===========================
    // Intent Follow up Detection
    // ===========================

    const isFollowUp =
      session.lastIntent === "how_to_buy_help" &&
      (q.includes("lanjut") ||
        q.includes("berikut") ||
        q.includes("next") ||
        q.includes("step selanjutnya"));

    if (isFollowUp && session.lastStep) {
      const nextStepNum = session.lastStep + 1;
      const steps = await getHowToBuy();
      const nextStep = steps?.find((s) => s.step === nextStepNum);

      if (nextStep) {
        session.lastStep = nextStepNum;

        return await send({
          type: "how_to_buy_help",
          intro: `Oke kita lanjut ke Step ${nextStepNum}.`,
          message: nextStep.text,
          step: nextStep,
          _noTruncateReasoning: true,
        });
      }
    }

    // ============================
    // Deteksi produk murah/mahal tanpa intent price_promo
    // ============================
    function extractMeaningfulKeywords(q = "") {
      const stopWords = [
        "ada",
        "produk",
        "barang",
        "yang",
        "yg",
        "paling",
        "murah",
        "termurah",
        "mahal",
        "termahal",
        "harga",
        "berapa",
        "dong",
        "nih",
        "kak",
        "min",
        "disini",
        "di",
        "bawah",
        "atas",
        "antara",
        "sampai",
        "ready",
        "stock",
        "stok",
        "tersedia",
        "apa",
        "promo",
        "diskon",
        "sale",
        "cashback",
        "toko",
        "store",
        "sini",
        "ini",
      ];

      return q
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !stopWords.includes(w));
    }

    // ===============================
    // 🔹 DETEKSI INTENT HARGA
    // ===============================
    let isMostExpensive = q.includes("termahal") || q.includes("paling mahal");
    let isCheapest = q.includes("termurah") || q.includes("paling murah");

    const isAbove =
      q.includes("diatas") || q.includes("di atas") || q.includes("lebih dari");
    const isBelow =
      q.includes("dibawah") ||
      q.includes("di bawah") ||
      q.includes("kurang dari");
    const isBetween = q.includes("antara") && q.includes("sampai");
    const includeOOS =
      q.includes("termasuk habis") ||
      q.includes("out of stock") ||
      q.includes("habis juga");

    let hasPriceIntent =
      isMostExpensive || isCheapest || isAbove || isBelow || isBetween;

    const meaningfulKeywords = extractMeaningfulKeywords(q);
    const hasScopedKeyword = meaningfulKeywords.length > 0;

    // default: kalau termurah/termahal, ambil yang ready dulu (kecuali user bilang "termasuk habis")

    function isCheapWordPresent(q = "") {
      return (
        q.includes("murah") ||
        q.includes("termurah") ||
        q.includes("paling murah") ||
        q.includes("hemat")
      );
    }

    // ===============================
    // PRIORITAS INTENT HARGA (FIX)
    // ===============================
    if (intentResult?.intent === "price_promo") {
      // paksa mode harga aktif
      if (!hasPriceIntent) {
        // deteksi tambahan dari intent classifier
        if (q.includes("murah") || q.includes("termurah")) {
          isCheapest = true;
        }
        if (q.includes("mahal") || q.includes("termahal")) {
          isMostExpensive = true;
        }
      }
    }

    if (hasScopedKeyword && isCheapWordPresent(q)) {
      isCheapest = true;
    }

    hasPriceIntent =
      isMostExpensive || isCheapest || isAbove || isBelow || isBetween;
    // =============================
    // Handle "how to buy" intent
    // =============================

    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    // const isHowToBuy = detectHowToBuyIntent(q, history);

    function extractStepNumber(q) {
      const m =
        q.match(/\bstep\s*(\d{1,2})\b/i) || q.match(/\blangkah\s*(\d{1,2})\b/i);
      return m ? parseInt(m[1], 10) : null;
    }

    const n = extractStepNumber(q);

    const isHowToBuy =
      q.includes("how to buy") ||
      q.includes("cara beli") ||
      q.includes("cara order") ||
      q.includes("cara pesan") ||
      q.includes("cara checkout") ||
      q.includes("cara pembayaran") ||
      q.includes("place order") ||
      q.includes("proceed to checkout");

    // follow-up hanya kalau konteks sebelumnya how_to_buy
    const wasHowToBuy = session.lastIntent === "how_to_buy";

    const isHowToBuyFollowup =
      wasHowToBuy &&
      (n !== null ||
        q.includes("stuck") ||
        q.includes("bingung") ||
        q.includes("gagal") ||
        q.includes("error") ||
        q.includes("lanjut") ||
        q.includes("next") ||
        q.includes("selanjutnya"));

    if (isHowToBuy || isHowToBuyFollowup) {
      const steps = await getHowToBuy();

      if (!steps) {
        return await send({
          type: "text",
          message:
            "Saya bisa jelaskan cara belinya, tapi halaman panduannya sedang sulit diakses. Coba lagi sebentar ya, atau bilang kamu stuck di langkah mana (login, cart, checkout, pembayaran).",
        });
      }

      // ✅ Kalau user sebut step: jelasin step itu
      if (n !== null) {
        const step = steps.find((x) => Number(x.step) === Number(n));

        if (!step) {
          return await send({
            type: "text",
            message: `Aku tidak menemukan Step ${n} di panduan. Kamu ingat step-nya tentang apa?`,
          });
        }

        let aiHelp = null;
        if (
          GEMINI_MODE.enableStepExplain &&
          /bingung|stuck|gagal|error/i.test(rawQuestion)
        ) {
          try {
            aiHelp = await explainStepWithGemini({ rawQuestion, step });
          } catch (e) {
            aiHelp = null;
          }
        }

        session.lastIntent = "how_to_buy";
        session.lastStep = n;

        return await send({
          type: "text",
          message:
            aiHelp ||
            `Oke, kamu stuck di Step ${n}. Ini penjelasan versi gampangnya:\n\n${step.text}\n\nKalau mentoknya di bagian mana?`,
        });
      }

      // ✅ Kalau tidak sebut step: tampilkan semua steps
      session.lastIntent = "how_to_buy";
      session.lastStep = null;

      return await send({
        type: "how_to_buy",
        intro: "Berikut panduan cara beli di Robot Jadul (step-by-step):",
        steps,
        _noTruncateReasoning: true,
      });
    }

    // ===============================
    // 🔹 Dynamic Intro & Closing
    // ===============================
    function randomItem(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    const intros = [
      "Berikut beberapa produk yang mungkin cocok untuk Anda:",
      "Saya menemukan beberapa pilihan menarik untuk Anda:",
      "Berdasarkan pencarian Anda, ini rekomendasinya:",
      "Ini beberapa produk yang sesuai dengan kebutuhan Anda:",
      "Saya rekomendasikan produk berikut:",
    ];

    const closings = [
      "Silakan pilih sesuai kebutuhan Anda 😊",
      "Jika ingin detail lebih lanjut, klik salah satu produknya ya.",
      "Butuh rekomendasi lain? Saya siap bantu 👍",
      "Kalau masih ragu, saya bisa bantu bandingkan juga.",
      "Semoga membantu! Ada yang ingin ditanyakan lagi?",
    ];

    // ===============================
    // 🔹 Ambil produk WooCommerce
    // ===============================

    // ✅ Jalur khusus: kalau user tanya termurah/termahal -> ambil langsung dari Woo yg sudah di-sort
    if ((isCheapest || isMostExpensive) && !hasScopedKeyword) {
      let raw;
      try {
        raw = await fetchProductsByPrice({
          cheapest: isCheapest,
          includeOOS,
          limit: 5,
        });
      } catch (e) {
        console.error("WC PRICE FETCH ERROR:", e?.message || e);
        raw = null;
      }

      if (Array.isArray(raw) && raw.length) {
        const mapped = raw
          .map((p) => {
            const condition =
              p.condition || getMetaValue(p.meta_data, "condition") || "";
            const price = toNum(p.price);
            const regular = toNum(p.regular_price);
            const sale = toNum(p.sale_price);
            const effectivePrice = sale ?? price ?? regular ?? null;
            const discountPercent = calcDiscountPercent(regular, sale);
            const discountAmount =
              regular && sale && sale < regular ? regular - sale : 0;

            return {
              id: p.id,
              name: p.name,
              price: p.price,
              regular_price: p.regular_price,
              sale_price: p.sale_price,
              numericPrice: effectivePrice ?? 0,
              effectivePrice,
              stock: p.stock_status,
              stockQuantity:
                typeof p.stock_quantity === "number" ? p.stock_quantity : null,
              description: p.description || "",
              link: p.permalink,
              image: p.images?.[0]?.src || "",
              category: p.categories
                ?.map((c) => c.name.toLowerCase())
                .join(" "),
              condition,
              weight: cleanNumberString(p.weight),
              dimensions: {
                length: cleanNumberString(p.dimensions?.length),
                width: cleanNumberString(p.dimensions?.width),
                height: cleanNumberString(p.dimensions?.height),
              },
              type: p.type,
              discountPercent,
              discountAmount,
              isPromo: discountPercent > 0,
            };
          })
          .filter((x) => x.effectivePrice !== null);

        // sudah terurut dari API, tapi kita urutkan lagi biar aman
        mapped.sort((a, b) =>
          isCheapest
            ? a.effectivePrice - b.effectivePrice
            : b.effectivePrice - a.effectivePrice,
        );

        return await send({
          type: "products",
          intro: isCheapest
            ? "Berikut produk dengan harga paling murah yang saya temukan:"
            : "Berikut produk dengan harga tertinggi yang saya temukan:",
          products: mapped.slice(0, 3),
          closing: randomItem(closings),
        });
      }
    }

    let products;
    try {
      products = await getProductsCached();
    } catch (e) {
      console.error("WC FETCH ERROR:", e?.message || e);
      return await send({
        type: "text",
        message:
          "Server lagi sibuk ambil data produk. Coba ulangi 10–20 detik lagi ya 🙏",
      });
    }

    if (!Array.isArray(products)) {
      return res
        .status(500)
        .json({ type: "text", message: "Format produk tidak valid" });
    }

    function getMetaValue(metaData, key) {
      if (!Array.isArray(metaData)) return "";
      const found = metaData.find((m) => m?.key === key);
      return found?.value ?? "";
    }

    function cleanNumberString(x) {
      if (x == null) return "";
      const s = String(x).trim();
      return s === "0" ? "" : s;
    }

    function toNum(x) {
      const n = parseFloat(String(x ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }

    cleanProducts = products.map((p) => {
      // condition bisa datang dari:
      // 1) p.condition (kalau kamu inject via functions.php)
      // 2) meta_data key "condition" (ACF)
      const condition =
        p.condition || getMetaValue(p.meta_data, "condition") || "";

      const length = cleanNumberString(p.dimensions?.length);
      const width = cleanNumberString(p.dimensions?.width);
      const height = cleanNumberString(p.dimensions?.height);

      // ✅ ambil harga yang paling “real”
      const price = toNum(p.price);
      const regular = toNum(p.regular_price);
      const sale = toNum(p.sale_price);

      // prefer sale, lalu price, lalu regular
      const effectivePrice = sale ?? price ?? regular ?? null;

      const discountPercent = calcDiscountPercent(regular, sale);
      const discountAmount =
        regular && sale && sale < regular ? regular - sale : 0;

      return {
        id: p.id,
        name: p.name,
        price: p.price,
        regular_price: p.regular_price,
        sale_price: p.sale_price,
        numericPrice: effectivePrice ?? 0, // untuk sorting lama kamu
        effectivePrice, // ✅ baru: boleh dipakai langsung
        stock: p.stock_status,
        stockQuantity:
          typeof p.stock_quantity === "number" ? p.stock_quantity : null,
        totalSales: Number(p.total_sales || 0),
        averageRating: Number(p.average_rating || 0),
        ratingCount: Number(p.rating_count || 0),
        description: p.description || "",
        link: p.permalink,
        image: p.images?.[0]?.src || "",
        category: p.categories?.map((c) => c.name.toLowerCase()).join(" "),
        condition,
        weight: cleanNumberString(p.weight),
        dimensions: { length, width, height },
        type: p.type, // simple/variable
        discountPercent,
        discountAmount,
        isPromo: discountPercent > 0,
      };
    });

    const dbg = cleanProducts.filter((p) =>
      (p.name || "").toLowerCase().includes("grend"),
    );
    console.log("DBG grend candidates:", dbg.map((x) => x.name).slice(0, 10));

    // ===============================
    // 🔎 TYPO MATCH CHECK
    // ===============================
    function isFuzzyMatch(word, target) {
      if (!word || !target) return false;

      word = word.toLowerCase();
      target = target.toLowerCase();

      // direct include
      if (target.includes(word)) return true;

      // batasi typo tolerance hanya untuk kata > 4 huruf
      if (word.length <= 4) return false;

      return levenshtein(word, target) <= 2;
    }

    // ===============================
    //  FITUR BANDINGKAN TAPI PAKAI LLM GEMINI UNTUK PENJELASAN
    // ===============================

    function pickCompareIntent(q) {
      const s = q.toLowerCase();
      return {
        preferCheap:
          s.includes("murah") || s.includes("termurah") || s.includes("hemat"),
        preferPremium:
          s.includes("mahal") ||
          s.includes("premium") ||
          s.includes("koleksi") ||
          s.includes("rare"),
        wantReady:
          s.includes("ready") || s.includes("stok") || s.includes("tersedia"),
      };
    }

    function keywordScore(q, product) {
      // kata “umum” yang sering muncul di pertanyaan compare
      const stop = new Set([
        "bandingkan",
        "vs",
        "versus",
        "mana",
        "yang",
        "bagus",
        "lebih",
        "baik",
        "dengan",
        "dan",
        "produk",
        "pilih",
        "rekomendasi",
      ]);

      const words = q
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !stop.has(w));

      if (!words.length) return 0;

      const text =
        `${product.name} ${product.category || ""} ${stripHtml(product.description || "")}`.toLowerCase();

      let score = 0;
      for (const w of words) {
        // supaya tidak terlalu agresif untuk kata pendek, minimal 4 huruf untuk include
        if (w.length >= 4 && text.includes(w)) score += 2;
      }
      return score;
    }

    function compareRuleBased(q, A, B) {
      const intent = pickCompareIntent(q);

      const reasonsA = [];
      const reasonsB = [];
      let scoreA = 0;
      let scoreB = 0;

      // 1) Stock
      if (A.stock === "instock") {
        scoreA += 3;
        reasonsA.push("Ready stock (bisa langsung diproses).");
      } else reasonsA.push("Stok tidak ready / out of stock.");

      if (B.stock === "instock") {
        scoreB += 3;
        reasonsB.push("Ready stock (bisa langsung diproses).");
      } else reasonsB.push("Stok tidak ready / out of stock.");

      // 2) Keyword relevance
      const kA = keywordScore(q, A);
      const kB = keywordScore(q, B);
      scoreA += kA;
      scoreB += kB;
      if (kA)
        reasonsA.push("Lebih relevan dengan kata kunci yang kamu sebutkan.");
      if (kB)
        reasonsB.push("Lebih relevan dengan kata kunci yang kamu sebutkan.");

      // 3) Price preference
      const pA = Number(A.numericPrice || 0);
      const pB = Number(B.numericPrice || 0);

      if (pA > 0 && pB > 0) {
        if (intent.preferCheap) {
          if (pA < pB) {
            scoreA += 2;
            reasonsA.push("Lebih hemat dibanding alternatif.");
          } else if (pB < pA) {
            scoreB += 2;
            reasonsB.push("Lebih hemat dibanding alternatif.");
          }
        } else if (intent.preferPremium) {
          if (pA > pB) {
            scoreA += 1;
            reasonsA.push("Cenderung premium (harga lebih tinggi).");
          } else if (pB > pA) {
            scoreB += 1;
            reasonsB.push("Cenderung premium (harga lebih tinggi).");
          }
        } else {
          // default: value for money (sedikit condong yang lebih murah)
          if (pA < pB) {
            scoreA += 1;
            reasonsA.push("Value lebih baik (harga lebih rendah).");
          } else if (pB < pA) {
            scoreB += 1;
            reasonsB.push("Value lebih baik (harga lebih rendah).");
          }
        }
      } else {
        reasonsA.push("Info harga tidak lengkap, penilaian harga terbatas.");
        reasonsB.push("Info harga tidak lengkap, penilaian harga terbatas.");
      }

      // Winner
      let winner = "A";
      if (scoreB > scoreA) winner = "B";
      else if (scoreA === scoreB) {
        // tie-breaker: instock, lalu lebih murah
        if (A.stock !== B.stock) winner = A.stock === "instock" ? "A" : "B";
        else if (pA > 0 && pB > 0) winner = pA <= pB ? "A" : "B";
      }

      const facts = {
        A: {
          name: A.name,
          price: pA,
          stock: A.stock,
          category: A.category || "",
          link: A.link,
          // tambahan penting:
          description: stripHtml(A.description || "").slice(0, 250),
          condition: A.condition || "(tidak tercantum)",
        },
        B: {
          name: B.name,
          price: pB,
          stock: B.stock,
          category: B.category || "",
          link: B.link,
          description: stripHtml(B.description || "").slice(0, 250),
          condition: B.condition || "(tidak tercantum)",
        },
      };

      return {
        winner,
        scores: { A: scoreA, B: scoreB },
        reasons: { A: reasonsA, B: reasonsB },
        facts,
        intent,
      };
    }

    // ===============================
    // FITUR BERAT< TINGGI DLL
    // ===============================
    function isSpecQuestion(q) {
      const s = q.toLowerCase();
      return [
        "berat",
        "weight",
        "ukuran",
        "dimensi",
        "size",
        "panjang",
        "length",
        "lebar",
        "width",
        "tinggi",
        "height",
        "kondisi",
        "condition",
        "misb",
        "mint in box",
      ].some((k) => s.includes(k));
    }

    // ===============================
    // 🔥 FITUR COMPARE
    // ===============================

    function cleanupCompareName(s = "") {
      let x = String(s).trim();

      // buang tanda kutip
      x = x.replace(/^["'“”]+|["'“”]+$/g, "").trim();

      // potong ekor pertanyaan yang sering “nempel”
      // contoh: "Grendizer U mana yg lebih bagus untuk saya beli?"
      x = x
        .split(
          /\b(mana|yang|yg|lebih|bagus|proper|cocok|rekomendasi|recommend|terbaik|rekomen|dicari|recommended|recommendation|pilih|beli|buy)\b/i,
        )[0]
        .trim();

      // rapikan spasi
      x = x.replace(/\s+/g, " ").trim();

      return x;
    }

    function extractCompareNames(rawQuestion = "") {
      const q = rawQuestion.trim();

      // pola: bandingkan A dengan B
      let m =
        q.match(/bandingkan\s+(.+?)\s+(?:dengan|vs|versus)\s+(.+)$/i) ||
        q.match(/(.+?)\s+(?:vs|versus)\s+(.+)$/i);

      if (!m) return null;

      const a = cleanupCompareName(m[1]);
      const b = cleanupCompareName(m[2]);

      if (!a || !b) return null;

      return { a, b };
    }

    console.log("RJ_SHIP_TOKEN exists?", !!process.env.RJ_SHIP_TOKEN);

    // fuzzy sederhana: exact / include / typo ringan
    if (
      q.includes("bandingkan") &&
      !q.includes("dengan") &&
      !q.includes("vs")
    ) {
      const name = q.replace("bandingkan", "").trim();

      if (name) {
        setLastBotQuestion(session, "ask_product_name", {
          source: "compare_second",
          first_product: name,
        });

        return await send({
          type: "text",
          message: `Mau dibandingkan dengan produk apa? (misalnya: bandingkan ${name} dengan produk lain)`,
        });
      }
    }

    /**
     * Pilih produk dengan:
     * - minimal 1 "anchor token" match (token terpanjang dari query)
     * - skor keseluruhan tinggi (rata-rata token match)
     */

    const isCompareIntent =
      q.includes("bandingkan") ||
      q.includes(" vs ") ||
      q.includes("versus") ||
      q.includes("apa bedanya") ||
      q.includes("bedanya") ||
      q.includes("perbedaan") ||
      (q.includes(" beda ") && q.includes(" dengan "));

    if (isCompareIntent) {
      const pair = extractCompareNames(rawQuestion); // pakai rawQuestion asli
      if (!pair) {
        return await send({
          type: "text",
          message: "Formatnya: bandingkan [Produk A] dengan [Produk B]",
        });
      }
      const list = await getCleanProducts();
      const aPick = bestMatchByName(pair.a, list);
      const bPick = bestMatchByName(pair.b, list);

      console.log("COMPARE PICK:", {
        a: { q: pair.a, best: aPick.best?.name, score: aPick.bestScore },
        b: { q: pair.b, best: bPick.best?.name, score: bPick.bestScore },
      });

      // threshold (kalau sudah exact match harusnya 1.0)
      if (
        !aPick.best ||
        !bPick.best ||
        aPick.bestScore < 0.35 ||
        bPick.bestScore < 0.35
      ) {
        return await send({
          type: "text",
          message:
            `Maaf, aku belum yakin produk yang dimaksud.\n` +
            `A: "${pair.a}" → kandidat: ${aPick.top.map((x) => `${x.name} (${x.score})`).join(", ")}\n` +
            `B: "${pair.b}" → kandidat: ${bPick.top.map((x) => `${x.name} (${x.score})`).join(", ")}\n\n` +
            `Coba copy-paste judul persis dari halaman produk, atau kirim link kedua produknya ya.`,
        });
      }

      const A = aPick.best;
      const B = bPick.best;

      const rule = compareRuleBased(rawQuestion.toLowerCase(), A, B);

      let aiText = null;
      if (
        GEMINI_MODE.enableCompareExplain &&
        shouldExplainWithGemini(rawQuestion)
      ) {
        try {
          aiText = await explainCompareWithGemini({
            facts: rule.facts,
            winner: rule.winner,
            reasons: rule.reasons,
          });
        } catch {
          aiText = null;
        }
      }

      session.lastProducts = [A, B];
      session.lastTopic = "compare";
      session.lastIntent = "compare";

      return await send({
        type: "compare_reasoned",
        intro: "Berikut perbandingan dua produk yang kamu pilih:",
        products: [A, B],
        winner: rule.winner,
        scores: rule.scores,
        reasoning_text:
          aiText ||
          "Aku bandingkan berdasarkan stok, harga, kategori, dan deskripsi yang tersedia.",
        _noTruncateReasoning: true,
      });
    }

    // ===============================
    // Rekomendasi Hybird dengan Gemini dan Ruled based
    // ==============================
    if (intentResult.intent === "recommendation") {
      const list = await getCleanProducts();

      let candidates = [...list].filter((p) => p.stock === "instock");
      const isPopularityQuery = isPopularityStyleQuestion(rawQuestion);

      let shortlist = [];

      if (isPopularityQuery) {
        shortlist = candidates
          .map((p) => ({
            ...p,
            popularityScore: basePopularityScore(p),
          }))
          .sort((a, b) => b.popularityScore - a.popularityScore)
          .slice(0, 10);
      } else {
        // shortlist = candidates
        //   .sort((a, b) => (b.numericPrice || 0) - (a.numericPrice || 0))
        //   .slice(0, 8);

        shortlist = candidates.slice(0, 50);
      }

      console.log(
        "shortlist:",
        shortlist.map((p) => ({
          id: p.id,
          name: p.name,
          totalSales: p.totalSales,
          ratingCount: p.ratingCount,
          averageRating: p.averageRating,
        })),
      );

      const recNeeds = extractRecommendationNeeds(rawQuestion, semantic);

      if (recNeeds.budgetMin != null) {
        updateSlot(session, "budgetMin", recNeeds.budgetMin);
      }
      if (recNeeds.budgetMax != null) {
        updateSlot(session, "budgetMax", recNeeds.budgetMax);
      }

      // pakai sumber kandidat yang lebih luas, jangan langsung shortlist mahal
      let recommendationSource = [...candidates];

      // 🔥 FILTER BUDGET (INI YANG PALING PENTING)
      if (recNeeds.budgetMin != null) {
        recommendationSource = recommendationSource.filter(
          (p) => Number(p.numericPrice || 0) >= recNeeds.budgetMin,
        );
      }

      if (recNeeds.budgetMax != null) {
        recommendationSource = recommendationSource.filter(
          (p) => Number(p.numericPrice || 0) <= recNeeds.budgetMax,
        );
      }

      // kalau ada kebutuhan display / pajangan, boleh bantu sempitkan sedikit
      // sempitkan sedikit kalau ada use-case tertentu
      if (recNeeds.wantsDisplay || recNeeds.wantsCollection) {
        const narrowed = recommendationSource.filter((p) => {
          const text = getProductSearchText(p);

          if (recNeeds.wantsDisplay) {
            return (
              text.includes("display") ||
              text.includes("pajangan") ||
              text.includes("figure") ||
              text.includes("diecast") ||
              text.includes("chogokin") ||
              text.includes("misb")
            );
          }

          if (recNeeds.wantsCollection) {
            return (
              text.includes("koleksi") ||
              text.includes("collector") ||
              text.includes("collectible") ||
              text.includes("limited") ||
              text.includes("misb") ||
              text.includes("chogokin")
            );
          }

          return true;
        });

        if (narrowed.length) {
          recommendationSource = narrowed;
        }
      }

      // selalu ranking pintar
      let recommendedProducts = pickRecommendedProducts(
        recommendationSource,
        recNeeds,
        5,
      );

      // fallback: kalau hasil ranking kosong, jangan langsung gagal
      if (!recommendedProducts.length) {
        // coba filter budget saja dari seluruh candidates
        const budgetOnly = candidates.filter((p) => {
          const price = Number(p.numericPrice || 0);
          if (price <= 0) return false;
          if (recNeeds.budgetMin != null && price < recNeeds.budgetMin)
            return false;
          if (recNeeds.budgetMax != null && price > recNeeds.budgetMax)
            return false;
          return true;
        });

        if (budgetOnly.length) {
          recommendedProducts = budgetOnly
            .sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0))
            .slice(0, 3);
        }
        recommendationSource = [...candidates];
      }

      if (!recommendedProducts.length) {
        return await send(
          {
            type: "text",
            message:
              "Aku belum menemukan rekomendasi yang cocok dengan budget / kebutuhan itu 🙏",
          },
          "recommendation",
        );
      }

      recommendationSource = recommendationSource
        .map((p) => ({
          ...p,
          score:
            (p.stock === "instock" ? 30 : 0) +
            (Number(p.discountPercent || 0) > 0 ? 10 : 0) +
            Math.min(Number(p.totalSales || 0), 10),
        }))
        .sort((a, b) => b.score - a.score);

      let geminiResult = null;
      try {
        geminiResult = await recommendWithGemini({
          rawQuestion,
          candidates: recommendedProducts,
          mode: isPopularityQuery
            ? "popularity"
            : recNeeds.wantsDisplay
              ? "display_recommendation"
              : "recommendation",
        });
      } catch (e) {
        console.error("GEMINI FAIL:", e?.message || e);
        geminiResult = null;
      }

      console.log("geminiResult:", geminiResult);

      let chosen = [];

      if (geminiResult?.chosen_product_ids?.length) {
        chosen = geminiResult.chosen_product_ids
          .map((id) => recommendedProducts.find((p) => p.id === id))
          .filter(Boolean)
          .slice(0, 3);
      }

      const fallbackProducts = recommendedProducts.slice(0, 3);
      const finalProducts = chosen.length ? chosen : fallbackProducts;

      if (!finalProducts.length) {
        return await send(
          {
            type: "text",
            message: "Aku belum menemukan rekomendasi yang cocok 🙏",
          },
          "recommendation",
        );
      }

      let geminiReasoning = null;

      try {
        const explain = await explainRecommendationWithGemini({
          rawQuestion,
          chosenProducts: finalProducts,
          recNeeds,
        });

        geminiReasoning = explain?.reasoning_text || null;
      } catch (e) {
        console.error("GEMINI EXPLAIN FAIL:", e?.message || e);
        geminiReasoning = null;
      }

      session.lastProducts = finalProducts;
      session.lastTopic = isPopularityQuery ? "popularity" : "recommendation";
      session.lastIntent = "recommendation";

      console.log("geminiReasoning:", geminiReasoning);
      console.log("geminiResult.reasoning_text:", geminiResult?.reasoning_text);
      console.log(
        "fallbackReasoning:",
        buildRecommendationReasoning(finalProducts, recNeeds),
      );
      return await send(
        {
          type: "products",
          intro: isPopularityQuery
            ? "Ini produk yang paling menonjol berdasarkan analisis AI dan data toko yang tersedia:"
            : recNeeds.wantsDisplay &&
                recNeeds.budgetMin != null &&
                recNeeds.budgetMax != null
              ? `Ini rekomendasi untuk pajangan dengan budget ${formatRupiah(recNeeds.budgetMin)} - ${formatRupiah(recNeeds.budgetMax)}:`
              : recNeeds.wantsDisplay
                ? "Ini rekomendasi yang cocok untuk pajangan:"
                : "Ini rekomendasi terbaik yang aku temukan:",
          products: finalProducts,
          reasoning_text:
            geminiReasoning ||
            geminiResult?.reasoning_text ||
            buildRecommendationReasoning(finalProducts, recNeeds),
          _noTruncateReasoning: true,
        },
        "recommendation",
      );
    }

    // semantic gemini untuk rekomendasi
    if (semantic?.intent === "recommendation") {
      const allProducts = await getCleanProducts();

      let candidates = [...allProducts];

      const semanticKeywords = [
        ...(semantic.keywords || []),
        semantic.category_hint || "",
        session?.slots?.category || "",
      ]
        .map((x) =>
          String(x || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);

      if (semanticKeywords.length) {
        candidates = candidates.filter((p) => {
          const text =
            `${p.name} ${p.category || ""} ${stripHtml(p.description || "")}`.toLowerCase();

          return semanticKeywords.some((kw) => text.includes(kw));
        });
      }

      if (semantic.sort_preference === "ready_stock") {
        candidates = candidates.filter((p) => p.stock === "instock");
      }

      if (semantic.sort_preference === "cheapest") {
        candidates.sort(
          (a, b) => (a.numericPrice || 0) - (b.numericPrice || 0),
        );
      }

      if (!candidates.length) {
        candidates = [...allProducts];
      }

      const shortlist = candidates.slice(0, 8);

      const facts = shortlist.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.numericPrice || 0),
        stock: p.stock,
        stockQuantity: p.stockQuantity ?? null,
        category: p.category || "",
        condition: p.condition || "",
        weight: p.weight || "",
        dimensions: p.dimensions || {},
        description: stripHtml(p.description || "").slice(0, 500),
        link: p.link,
      }));

      let explain = null;
      let chosenNames = [];

      try {
        const prompt = `
Kamu adalah asisten rekomendasi produk Robot Jadul.

TUGAS:
Pilih maksimal 3 produk terbaik dari DATA berdasarkan kebutuhan user.
Gunakan HANYA data yang ada.
Jangan mengarang.
- Boleh gunakan simbol sederhana seperti: • ✅ ⚠️ 💰 📦

PERTANYAAN USER:
${rawQuestion}

HASIL PEMAHAMAN USER:
${JSON.stringify(semantic, null, 2)}

DATA PRODUK:
${JSON.stringify(facts, null, 2)}

Kembalikan JSON valid:
{
  "chosen_product_names": ["nama1", "nama2", "nama3"],
  "reasoning_text": "penjelasan kenapa produk ini dipilih berdasarkan kebutuhan user, bukan template umum"
}
`;

        const resp = await genai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        let txt = (resp.text || "").trim();
        txt = txt
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();

        const parsed = JSON.parse(txt);
        chosenNames = Array.isArray(parsed.chosen_product_names)
          ? parsed.chosen_product_names
          : [];
        explain = parsed.reasoning_text || null;
      } catch (e) {
        console.error("SEMANTIC RECOMMEND ERROR:", e?.message || e);
      }

      let finalProducts = shortlist;

      if (chosenNames.length) {
        const picked = [];
        for (const name of chosenNames) {
          const found = shortlist.find(
            (p) => p.name.toLowerCase() === String(name).toLowerCase(),
          );
          if (found && !picked.some((x) => x.id === found.id))
            picked.push(found);
        }
        if (picked.length) finalProducts = picked;
      }

      finalProducts = finalProducts.slice(0, 3);

      session.lastProducts = finalProducts;
      session.lastTopic = "recommendation";
      session.lastIntent = "recommendation";

      return await send(
        {
          type: "products",
          intro:
            "Ini rekomendasi yang menurutku paling cocok untuk kebutuhan kamu:",
          products: finalProducts,
          reasoning_text:
            explain ||
            "Aku pilih produk ini karena paling relevan dengan kebutuhan yang kamu sebutkan dan stoknya juga lebih aman.",
          _noTruncateReasoning: true,
        },
        "recommendation",
      );
    }

    // ===============================
    // follow up ketika user nanya step selanjutnya agar tidak masuk kesearch mode
    // ===============================
    const isNext =
      q.includes("lanjut") || q.includes("next") || q.includes("selanjutnya");

    if (isNext && session.lastIntent === "how_to_buy") {
      const steps = await getHowToBuy();
      const nextStep = (session.lastStep || 0) + 1;
      const step = steps?.find((x) => Number(x.step) === Number(nextStep));

      if (step) {
        session.lastStep = nextStep;
        let aiHelp = null;
        try {
          aiHelp = await explainStepWithGemini({ rawQuestion, step });
        } catch {}

        return await send({
          type: "text",
          message: aiHelp || `Step ${nextStep}: ${step.text}`,
        });
      }
    }

    // ===============================
    // PROMO FAST PATH (lebih ringan)
    // ===============================
    if (
      intentResult.intent === "price_promo" &&
      (q.includes("promo") ||
        q.includes("diskon") ||
        q.includes("sale") ||
        q.includes("cashback"))
    ) {
      const promoKeywords = extractMeaningfulKeywords(q);
      const hasSpecificPromoKeyword = promoKeywords.length > 0;

      let promoProducts = [];

      try {
        // query umum promo -> langsung ambil produk on sale dari Woo
        promoProducts = await fetchPromoProducts(12);
      } catch (e) {
        console.error("PROMO FETCH ERROR:", e?.message || e);
        promoProducts = [];
      }

      // kalau query spesifik, baru filter hasil promo ringan tadi
      if (hasSpecificPromoKeyword && promoProducts.length) {
        promoProducts = promoProducts.filter((p) => {
          const text = normalize(
            `${p.name || ""} ${p.category || ""} ${stripHtml(p.description || "")}`,
          );
          return promoKeywords.some((kw) => text.includes(kw));
        });
      }

      if (!promoProducts.length) {
        return await send(
          {
            type: "text",
            message: hasSpecificPromoKeyword
              ? "Saat ini aku belum menemukan produk promo untuk kata kunci itu 🙏"
              : "Saat ini belum ada produk yang sedang promo 🙏",
          },
          "price_promo",
        );
      }

      promoProducts.sort((a, b) => {
        if ((b.discountPercent || 0) !== (a.discountPercent || 0)) {
          return (b.discountPercent || 0) - (a.discountPercent || 0);
        }
        return (a.numericPrice || 0) - (b.numericPrice || 0);
      });

      const topPromo = promoProducts.slice(0, 5);

      return await send(
        {
          type: "products",
          intro: getPromoIntro(topPromo),
          products: topPromo,
          reasoning_text: buildPromoReasoning(topPromo),
          _noTruncateReasoning: true,
        },
        "price_promo",
      );
    }

    // =============================
    // Price recommendation
    // ============================
    const handledPriceRecommendation = await handlePriceRecommendationMode({
      rawQuestion,
      cleanProducts,
      send,
    });

    if (handledPriceRecommendation) return;

    // =====================
    // single matchnya
    // =====================

    if (
      intentResult.intent === "price_promo" &&
      !isCheapest &&
      !isMostExpensive &&
      !isAbove &&
      !isBelow &&
      !isBetween
    ) {
      const bestProduct = findBestSingleProductMatch(
        rawQuestion,
        cleanProducts,
      );

      if (bestProduct) {
        session.lastProducts = [bestProduct];
        session.lastTopic = "price";
        session.lastIntent = "price_promo";

        return await send(
          {
            type: "products",
            products: [bestProduct],
          },
          "price_promo",
        );
      }
    }

    if (intentResult.intent === "stock_availability") {
      const bestProduct = findBestSingleProductMatch(
        rawQuestion,
        cleanProducts,
      );

      if (bestProduct) {
        session.lastProducts = [bestProduct];
        session.lastTopic = "stock";
        session.lastIntent = "stock_availability";

        return await send(
          {
            type: "products",
            products: [bestProduct],
          },
          "stock_availability",
        );
      }
    }

    if (intentResult.intent === "product_detail") {
      const bestProduct = findBestSingleProductMatch(
        effectiveQuestion,
        cleanProducts,
      );

      if (bestProduct) {
        session.lastProducts = [bestProduct];
        session.lastTopic = "product_detail";
        session.lastIntent = "product_detail";

        let reasoning_text = buildProductDetailMessage(bestProduct);

        if (isOpinionQuestion(rawQuestion)) {
          const opinionText = buildProductOpinionReasoning(
            bestProduct,
            rawQuestion,
          );

          if (opinionText) {
            reasoning_text += `\n\n💡 **Pendapat / Pertimbangan:**\n${opinionText}`;
          }
        }

        return await send(
          {
            type: "products",
            products: [bestProduct],
            reasoning_text,
            _noTruncateReasoning: true,
          },
          "product_detail",
        );
      }

      return await send(
        {
          type: "text",
          message:
            "Maaf, aku belum menemukan produk yang dimaksud 🙏\n\nCoba sebutkan nama produk yang lebih spesifik ya, misalnya Voltron, Grendizer, atau Gashapon Vintage.",
        },
        "product_detail",
      );
    }

    // ===============================
    // Routing by dataset intent
    // ===============================

    // Shipping / transaksi: arahkan ke how-to-buy atau jawab singkat
    if (intentResult.intent === "shipping_transaction") {
      // ==============================-
      // Asuransi pengiriman
      // =============================
      if (
        q.includes("asuransi") ||
        q.includes("asuransi pengiriman") ||
        q.includes("proteksi pengiriman") ||
        q.includes("pakai asuransi") ||
        q.includes("ada asuransi")
      ) {
        return await send(
          {
            type: "text",
            message:
              "🛡️ **Asuransi Pengiriman**\n\n" +
              "Untuk keamanan pesanan, pengiriman **bisa menggunakan asuransi** terutama untuk produk koleksi atau barang bernilai tinggi.\n\n" +
              "📦 Dengan asuransi, pesanan kamu mendapatkan perlindungan tambahan selama proses pengiriman.\n\n" +
              "📲 Untuk menambahkan asuransi sebelum pengiriman, silakan hubungi admin kami melalui WhatsApp:\n" +
              "📞 <a href='https://wa.me/6285975313930' target='_blank'>085975313930</a>\n\n" +
              "Admin akan membantu proses penambahan asuransi dengan cepat 😊",
          },
          "shipping_transaction",
        );
      }

      // ===============================
      // PAYMENT METHODS HANDLER
      // ===============================
      if (
        q.includes("bayar") ||
        q.includes("pembayaran") ||
        q.includes("metode pembayaran") ||
        q.includes("qris") ||
        q.includes("gopay") ||
        q.includes("transfer") ||
        q.includes("bank") ||
        q.includes("kartu kredit") ||
        q.includes("visa")
      ) {
        return await send(
          {
            type: "text",
            message:
              "Tentu, kami menyediakan beberapa metode pembayaran yang praktis 😊\n\n" +
              "💳 **Pilihan Pembayaran Tersedia:**\n\n" +
              "🟦 **GoPay**\n" +
              "🏦 **CIMB Niaga**\n" +
              "🏦 **BNI**\n" +
              "🔳 **QRIS**\n" +
              "🏦 **Mandiri**\n" +
              "🏦 **BRI**\n" +
              "💳 **Kartu Kredit**\n" +
              "🌐 **Visa**\n" +
              "🏦 **PermataBank**\n\n" +
              "Silakan pilih metode pembayaran yang paling nyaman ya. Kalau mau, aku juga bisa bantu jelaskan cara pembayarannya 🙌",
          },
          "shipping_transaction",
        );
      }

      // ===============================
      // ESTIMASI PENGIRIMAN
      // ===============================
      if (
        q.includes("estimasi") ||
        q.includes("berapa lama") ||
        q.includes("berapa hari") ||
        q.includes("kapan sampai") ||
        q.includes("lama pengiriman") ||
        q.includes("estimasi sampai")
      ) {
        return await send(
          {
            type: "text",
            message:
              "⏱️ **Estimasi Pengiriman Pesanan**\n\n" +
              "📦 Pesanan biasanya diproses dalam waktu **1–2 hari kerja** setelah pembayaran dikonfirmasi.\n\n" +
              "🚚 Estimasi pengiriman:\n" +
              "• Jabodetabek: **1–2 hari**\n" +
              "• Pulau Jawa: **2–4 hari**\n" +
              "• Luar Jawa: **3–7 hari**\n\n" +
              "Estimasi bisa berbeda tergantung ekspedisi dan lokasi tujuan ya 😊\n\n" +
              "Kalau mau, aku bisa bantu cek ongkir dan estimasi lebih detail ke kotamu 🙌",
          },
          "shipping_transaction",
        );
      }

      // 1) pertanyaan ongkir
      if (q.includes("ongkir") || q.includes("ongkos kirim")) {
        const locationGuess = extractShippingDestination(rawQuestion);

        if (!locationGuess) {
          setPending(session, {
            type: "shipping_quote",
            stage: "need_location",
            data: {},
          });

          return await send(
            {
              type: "text",
              message:
                "Untuk cek ongkir, sebutkan dulu **kota/kabupaten atau kecamatan tujuan** ya 😊\nContoh: **Surabaya**, **Kota Pekalongan**, atau **Pekalongan Barat**.",
            },
            "shipping_transaction",
          );
        }

        const resolved = await resolveShippingLocation(locationGuess);

        if (resolved.kind === "single_city") {
          const city = resolved.city;

          setPending(session, {
            type: "shipping_quote",
            stage: "need_district",
            data: {
              city_id: city.city_id,
              city_name: city.name,
            },
          });

          return await send(
            {
              type: "text",
              message: `Oke, tujuan **${city.name}**. Sekarang kecamatannya apa?`,
            },
            "shipping_transaction",
          );
        }

        if (resolved.kind === "multi_city") {
          setPending(session, {
            type: "shipping_quote",
            stage: "choose_city",
            data: {
              candidates: resolved.cities.slice(0, 8),
            },
          });

          return await send(
            {
              type: "options",
              intro: `Aku nemu beberapa hasil untuk **${locationGuess}**. Pilih kota/kabupaten yang benar ya:`,
              options: resolved.cities.slice(0, 8).map((c) => ({
                label: c.name,
                value: c.name,
              })),
            },
            "shipping_transaction",
          );
        }
      }
    }

    // ===============================
    // RETURN PRODUCT HANDLER
    // ===============================

    const isReturnRefundQuestion =
      q.includes("refund") ||
      q.includes("uang kembali") ||
      q.includes("pengembalian uang") ||
      q.includes("barang rusak") ||
      q.includes("produk rusak") ||
      q.includes("datang rusak") ||
      q.includes("nyampe rusak") ||
      q.includes("cacat") ||
      q.includes("salah kirim") ||
      q.includes("tidak sesuai");

    if (intentResult.intent === "return_product" && isReturnRefundQuestion) {
      return await send(
        {
          type: "text",
          message: buildReturnProductReasoning(rawQuestion),
        },
        "return_product",
      );
    }

    if (intentResult.intent === "return_product") {
      if (intentResult.intent === "return_product") {
        const q = rawQuestion.toLowerCase();

        // ===============================
        // REFUND / PENGEMBALIAN UANG
        // ===============================
        if (
          q.includes("refund") ||
          q.includes("pengembalian uang") ||
          q.includes("uang kembali") ||
          q.includes("dana kembali") ||
          q.includes("retur uang") ||
          q.includes("bisa refund") ||
          q.includes("barang rusak") ||
          q.includes("produk rusak") ||
          q.includes("datang rusak") ||
          q.includes("nyampe rusak") ||
          q.includes("barang cacat") ||
          q.includes("produk cacat") ||
          q.includes("salah kirim") ||
          q.includes("tidak sesuai") ||
          q.includes("balikin uang") ||
          q.includes("kembalikan uang") ||
          q.includes("uangnya balik")
        ) {
          return await send(
            {
              type: "text",
              message:
                "💸 **Pengembalian Uang (Refund)**\n\n" +
                "Jika barang yang diterima **rusak, cacat, salah kirim, atau tidak sesuai** dan memenuhi ketentuan retur, maka **pengembalian uang/refund dapat diproses** ya.\n\n" +
                "📝 Proses refund umumnya dilakukan setelah barang diterima dan diperiksa terlebih dahulu.\n\n" +
                "📲 Untuk pengajuan refund atau konfirmasi lebih lanjut, silakan hubungi admin kami melalui WhatsApp:\n" +
                "👉 <a href='https://wa.me/6285975313930' target='_blank' rel='noopener noreferrer'>085975313930</a>\n\n" +
                "Admin akan membantu pengecekan dan proses pengembalian dana sesuai ketentuan yang berlaku 😊",
            },
            "return_product",
          );
        }

        // handler return_product lain di bawah sini...
      }

      session.lastIntent = "return_product";
      session.lastTopic = "return_product";

      return await send(
        {
          type: "text",
          message: buildReturnResponse(rawQuestion),
        },
        "return_product",
      );
    }

    // Stock intent: kalau ada kata kunci produk -> cari produk & tampilkan stoknya
    if (intentResult.intent === "stock_availability") {
      if (
        q.split(/\s+/).length <= 2 &&
        !q.includes("stok") &&
        !q.includes("ready")
      ) {
        setLastBotQuestion(session, "ask_product_name", {
          source: "stock",
        });

        return await send({
          type: "text",
          message: "Mau cek stok produk apa? Sebutkan nama produknya ya 😊",
        });
      }
    }
    // Detail intent: cenderung jawab 1 produk teratas + spesifikasinya
    if (intentResult.intent === "product_detail") {
      const hasContextProduct =
        !!session.slots?.productName ||
        (Array.isArray(session.lastProducts) &&
          session.lastProducts.length > 0);

      if (isSpecQuestion(q) && !hasContextProduct) {
        setLastBotQuestion(session, "ask_product_name", {
          source: "detail",
        });

        return await send({
          type: "text",
          message:
            "Mau cek detail produk apa? Misalnya Voltron, Grendizer, atau Gashapon Vintage 😊",
        });
      }

      if (q.split(/\s+/).length <= 3 && !isSpecQuestion(q)) {
        setLastBotQuestion(session, "ask_product_name", {
          source: "detail",
        });

        return await send({
          type: "text",
          message:
            "Boleh sebutkan nama produknya? Nanti aku cek detail seperti kondisi, berat, dan dimensi kalau tersedia 😊",
        });
      }
    }

    // ===============================
    // PRODUCT DISCOVERY HANDLER
    // ===============================
    if (
      intentResult.intent === "product_discovery" &&
      !isSpecQuestion(q) &&
      !hasPriceIntent &&
      !isCompareIntent
    ) {
      function cleanQueryForSearch(q = "") {
        return q
          .replace(/rekomendasi|carikan|dong|yang|produk|barang/gi, "")
          .replace(/jutaan|ribu|murah|mahal|budget/gi, "")
          .trim();
      }
      const cleanedQuery = cleanQueryForSearch(effectiveQuestion);

      let discoveryMatches = searchProductsForDiscovery(
        cleanedQuery,
        cleanProducts,
      );

      // fallback kalau kosong
      if (!discoveryMatches.length) {
        const best = findBestMatchingProduct(effectiveQuestion, cleanProducts);

        if (best) {
          discoveryMatches = [best];
        }
      }

      if (!discoveryMatches.length && effectiveQuestion !== rawQuestion) {
        discoveryMatches = searchProductsForDiscovery(
          rawQuestion,
          cleanProducts,
        );
      }

      if (!discoveryMatches.length) {
        return await send(
          {
            type: "text",
            message:
              "Aku belum menemukan produk yang cocok dari kata kunci itu 🙏 Coba sebutkan nama seri atau robot yang kamu cari, misalnya: Voltes V, Goldrake, atau Getter Robo.",
          },
          "product_discovery",
        );
      }

      const top = discoveryMatches[0];
      const topName = top?.name || "produk";

      let intro = "Aku nemu beberapa produk yang relevan buat kamu:";
      const rawLower = rawQuestion.toLowerCase();

      if (rawLower.includes("goldrake")) {
        intro =
          "Kalau kamu lagi cari **Goldrake**, ini beberapa pilihan yang paling relevan:";
      } else if (rawLower.includes("voltes")) {
        intro =
          "Kalau kamu lagi cari produk seperti **Voltes V**, ini beberapa pilihan yang aku temukan:";
      } else if (rawLower.includes("getter")) {
        intro =
          "Kalau kamu lagi cari **Getter Robo**, ini beberapa pilihan yang ada:";
      } else if (rawLower.includes("chogokin")) {
        intro =
          "Untuk kategori **Chogokin**, ini beberapa produk yang relevan:";
      } else if (rawLower.includes("robot jadul")) {
        intro =
          "Untuk kategori **robot jadul**, ini beberapa pilihan yang bisa kamu lihat:";
      }

      session.lastProducts = discoveryMatches;
      session.lastTopic = "product_discovery";
      session.lastIntent = "product_discovery";

      return await send(
        {
          type: "products",
          intro,
          products: discoveryMatches.slice(0, 5),
          closing:
            "Kalau mau, aku juga bisa bantu sempitkan lagi berdasarkan harga, stok ready, atau seri tertentu 😊",
        },
        "product_discovery",
      );
    }

    if (isCheapest) {
      let candidates = cleanProducts.filter((p) => p.numericPrice > 0);

      if (!candidates.length) {
        return await send({
          type: "text",
          message: "Aku belum menemukan produk dengan data harga 🙏",
        });
      }

      // urutkan dari harga termurah
      candidates.sort((a, b) => (a.numericPrice || 0) - (b.numericPrice || 0));

      const cheapest = candidates.slice(0, 5);

      return await send(
        {
          type: "products",
          intro: "💸 Ini produk dengan harga paling terjangkau:",
          products: cheapest,
          reasoning_text:
            "Aku urutkan berdasarkan harga paling rendah agar kamu bisa langsung lihat opsi paling hemat.",
          _noTruncateReasoning: true,
        },
        "price_promo", // atau bisa bikin intent baru
      );
    }

    // ===============================
    // 🔎 SMART SEARCH MODE (WORD BASED)
    // ===============================
    if (!hasPriceIntent) {
      // kata umum yang tidak penting
      const stopWords = [
        "adakah",
        "produk",
        "yang",
        "yg",
        "judul",
        "nama",
        "namanya",
        "ada",
        "kata",
        "cari",
        "berawalan",
        "mengandung",
        "diakhiri",
      ];

      // pecah jadi kata penting
      const words = q
        .replace(/nya/g, "")
        .split(" ")
        .map((w) => w.trim())
        .filter((w) => w.length > 2 && !stopWords.includes(w));

      if (words.length === 0) {
        return await send({
          type: "text",
          message: "Silakan sebutkan kata kunci produk yang ingin dicari 😊",
        });
      }

      const scored = cleanProducts.map((p) => {
        let score = 0;
        const productWords = p.name.toLowerCase().split(" ");
        const categoryWords = (p.category || "").split(" ");

        words.forEach((word) => {
          // 🔎 NAME MATCH
          productWords.forEach((pWord) => {
            if (isFuzzyMatch(word, pWord)) score += 3;
          });

          // 🔎 CATEGORY MATCH
          categoryWords.forEach((cWord) => {
            if (isFuzzyMatch(word, cWord)) score += 2;
          });
        });

        return { ...p, score };
      });

      const matched = scored
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score);

      // ===============================
      // 🎯 MODE REKOMENDASI (TAMBAHAN)
      // ===============================
      function isRecommendationQuestion(q) {
        const s = q.toLowerCase();
        return (
          s.includes("rekomendasi") ||
          s.includes("paling bagus") ||
          s.includes("paling rekomen") ||
          s.includes("paling recommen") ||
          s.includes("dicari") ||
          s.includes("recommended") ||
          s.includes("terbaik") ||
          s.includes("bagus yang mana") ||
          s.includes("pilih yang mana")
        );
      }

      const recTopic = extractRecommendationTopic(rawQuestion);

      if (
        isRecommendationQuestion(q) &&
        matched.length > 0 &&
        intentResult.intent !== "recommendation"
      ) {
        if (recTopic) {
          session.lastTopic = recTopic;
          updateSlot(session, "category", recTopic);
        }

        const candidates = matched.slice(0, 5);

        const best = candidates.slice().sort((a, b) => {
          const aStock = a.stock === "instock" ? 1 : 0;
          const bStock = b.stock === "instock" ? 1 : 0;
          if (aStock !== bStock) return bStock - aStock;
          return (b.numericPrice || 0) - (a.numericPrice || 0);
        })[0];

        const facts = candidates.map((p) => {
          const rawDesc = stripHtml(p.description || "");
          const fullDesc = rawDesc
            ? rawDesc.slice(0, 4000)
            : "(tidak tercantum)";

          return {
            name: p.name,
            price: Number(p.numericPrice || 0),
            stock: p.stock,
            stockQuantity: p.stockQuantity ?? null,
            condition: p.condition || "(tidak tercantum)",
            weight: p.weight || "(tidak tercantum)",
            dimensions: p.dimensions || {},
            description: fullDesc,
            link: p.link,
          };
        });

        let explain = null;

        if (
          GEMINI_MODE.enableRecommendationExplain &&
          shouldExplainWithGemini(rawQuestion)
        ) {
          const prompt = `
Kamu CS Robot Jadul.
Pilih 1 produk terbaik dari DATA dan jelaskan alasannya.
Gunakan hanya data yang ada. Jangan mengarang.

Format:
1) Produk terbaik
2) Alasan utama (bullet)
- Boleh gunakan simbol sederhana seperti: • ✅ ⚠️ 💰 📦
3) 2 alternatif + alasan singkat

DATA:
${JSON.stringify(facts, null, 2)}
`;

          if (genai) {
            try {
              const resp = await withTimeout(
                genai.models.generateContent({
                  model: "gemini-3.1-flash-lite-preview",
                  contents: [{ role: "user", parts: [{ text: prompt }] }],
                }),
                2500,
              );

              explain = resp.text || null;
              if (!explain && resp?.response?.text) {
                explain = resp.response.text();
              }
            } catch (e) {
              console.error("RECOMMEND EXPLAIN ERROR:", e?.message || e);
            }
          }
        }

        const recommendedProducts = [
          best,
          ...candidates.filter((p) => p.id !== best.id).slice(0, 2),
        ];

        session.lastProducts = recommendedProducts;
        session.lastTopic = recTopic || "recommendation";
        session.lastIntent = "recommendation";

        return await send({
          type: "products",
          intro: recTopic
            ? `Untuk kategori **${recTopic}**, ini rekomendasi yang paling cocok menurutku:`
            : `Ini rekomendasi yang menurutku paling cocok buat kamu:`,
          products: recommendedProducts,
          reasoning_text:
            explain || explainBestRuleBased(best, candidates, rawQuestion),
          _noTruncateReasoning: true,
        });
      }

      if (isRecommendationQuestion(q) && !q.match(/\d/)) {
        session.lastTopic = recTopic || session.lastTopic;
        updateSlot(session, "category", recTopic || null);

        setLastBotQuestion(session, "ask_budget", {
          source: "recommendation",
          recTopic: recTopic || null,
        });

        return await send({
          type: "text",
          message:
            "Kamu mau cari robot dengan budget berapa kira-kira? Misalnya di bawah 1 juta atau 2 juta 😊",
        });
      }

      if (matched.length === 0) {
        return await send({
          type: "text",
          message: "Saya tidak menemukan produk dengan kata tersebut 🙏",
        });
      }

      // Jika user nanya spesifikasi (berat/ukuran/kondisi), jawab detail produk teratas
      if (isSpecQuestion(q)) {
        const top = matched[0]; // produk paling relevan

        const specText = formatSpec(top);

        if (!specText) {
          return await send({
            type: "text",
            message: `Saya sudah menemukan produknya: **${top.name}**.\nNamun info berat/dimensi/kondisi belum tercantum di data produk 🙏`,
          });
        }

        return await send({
          type: "products",
          intro: `Detail **${top.name}**:\n${specText}`,
          products: [top],
          _noTruncateReasoning: true,
        });
      }

      return await send({
        type: "products",
        intro: `Saya menemukan ${matched.length} produk yang relevan dengan pencarian Anda:`,
        products: matched.slice(0, 5),
        _noTruncateReasoning: true,
      });
    }
    // ===============================
    // 🔥 FILTER HARGA
    // ===============================

    // filter yang toleransi terhadap format harga alami seperti "10k", "2 juta", "500 ribu"
    function parsePrice(text) {
      if (!text) return null;
      const s = text
        .toLowerCase()
        .replace(/rp|\./g, "") // buang "rp" dan pemisah ribuan titik
        .replace(/,/g, "."); // koma jadi desimal (2,5jt)

      // cari semua pasangan: angka + opsional spasi + satuan
      // contoh match: "1.5 juta", "500 ribu", "10k", "2jt"
      const re = /(\d+(?:\.\d+)?)\s*(juta|jt|ribu|rb|k)\b/g;

      let total = 0;
      let matched = false;

      for (const m of s.matchAll(re)) {
        matched = true;
        const val = parseFloat(m[1]);
        const unit = m[2];

        if (Number.isNaN(val)) continue;

        if (unit === "juta" || unit === "jt") total += val * 1_000_000;
        else if (unit === "ribu" || unit === "rb" || unit === "k")
          total += val * 1_000;
      }

      // fallback: kalau tidak ada satuan, ambil angka panjang (mis. 150000)
      if (!matched) {
        const digits = s.match(/\d{4,}/); // minimal 4 digit biar bukan "2024"?? (sesuaikan)
        if (!digits) return null;
        return parseInt(digits[0], 10);
      }

      return Math.round(total);
    }

    function parsePriceRange(text) {
      // support "antara X sampai Y", "X - Y", "X s/d Y"
      const s = text.toLowerCase();

      let m = s.match(/antara\s+(.+?)\s+sampai\s+(.+)/);
      if (!m) m = s.match(/(.+?)\s*(?:-|s\/d|sd|sampai)\s*(.+)/);

      if (!m) return null;

      const min = parsePrice(m[1]);
      const max = parsePrice(m[2]);
      if (!min || !max) return null;

      return { min: Math.min(min, max), max: Math.max(min, max) };
    }

    const onlyReadyStock = ["ready", "stok", "tersedia"].some((k) =>
      q.split(" ").some((w) => isFuzzyMatch(w, k)),
    );
    q.includes("ready stock") ||
      q.includes("tersedia") ||
      q.includes("stok ada");

    // ===============================
    // 🔥 FILTER BASED ON INTENT
    // ===============================
    // 🔥 SMART PRODUCT KEYWORD FILTER
    // ===============================

    // kata umum yang tidak dianggap sebagai nama produk
    const stopWords = [
      "robot",
      "produk",
      "mainan",
      "yang",
      "paling",
      "termurah",
      "termahal",
      "mahal",
      "murah",
      "harga",
      "di",
      "atas",
      "bawah",
      "antara",
      "sampai",
      "ready",
      "stock",
      "tersedia",
    ];

    // ambil kata penting saja
    const keywords = q
      .split(" ")
      .map((w) => w.trim())
      .filter((word) => word.length > 2 && !stopWords.includes(word));

    // cek apakah ada keyword yg benar-benar match nama produk
    let keywordFiltered = cleanProducts.filter((p) => {
      const nameWords = p.name.toLowerCase().split(" ");
      const categoryWords = (p.category || "").split(" ");

      return keywords.some(
        (word) =>
          nameWords.some((nw) => isFuzzyMatch(word, nw)) ||
          categoryWords.some((cw) => isFuzzyMatch(word, cw)),
      );
    });
    // ===============================
    // 🎯 LOGIC PENENTUAN SCOPE
    // ===============================

    // Jika user cari mahal/murah
    // tapi tidak ada keyword spesifik → GLOBAL
    let filteredProducts =
      keywordFiltered.length > 0 ? keywordFiltered : [...cleanProducts];

    // 🔹 Filter ready stock
    if (onlyReadyStock) {
      filteredProducts = filteredProducts.filter((p) => p.stock === "instock");
    }

    // 🔹 Filter harga range
    const priceRange = parsePriceRange(q);
    if (priceRange) {
      filteredProducts = filteredProducts.filter(
        (p) =>
          p.numericPrice >= priceRange.min && p.numericPrice <= priceRange.max,
      );
    }

    // 🔹 Filter di atas
    const extractedSinglePrice = parsePrice(q);

    if (isAbove && extractedSinglePrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.numericPrice >= extractedSinglePrice,
      );
    }

    // 🔹 Filter di bawah
    if (isBelow && extractedSinglePrice) {
      filteredProducts = filteredProducts.filter(
        (p) => p.numericPrice <= extractedSinglePrice,
      );
    }

    if ((isCheapest || isMostExpensive) && !includeOOS) {
      filteredProducts = filteredProducts.filter((p) => p.stock === "instock");
    }

    // ===============================
    // 🔥 SMART MATCH DEFAULT
    // ===============================

    let matched = filteredProducts;

    if (matched.length === 0) {
      return await send({
        type: "text",
        message: "Tidak ada produk yang sesuai dengan kriteria tersebut 🙏",
      });
    }

    // 🔥 SORTING
    function priceForSort(p) {
      return Number.isFinite(p.effectivePrice)
        ? p.effectivePrice
        : Number.POSITIVE_INFINITY;
    }

    if (isMostExpensive) {
      matched = matched.sort((a, b) => priceForSort(b) - priceForSort(a));
    } else if (isCheapest) {
      matched = matched.sort((a, b) => priceForSort(a) - priceForSort(b));
    } else {
      matched = matched.sort((a, b) => priceForSort(b) - priceForSort(a));
    }

    const bestMatches = matched.slice(0, 3);

    let finalIntro = randomItem(intros);

    if (intentResult?.intent === "price_promo") {
      if (isCheapest && hasScopedKeyword) {
        finalIntro = `Berikut produk ${meaningfulKeywords.join(" ")} dengan harga paling murah yang saya temukan:`;
      } else if (isCheapest) {
        finalIntro =
          "Berikut produk dengan harga paling murah yang saya temukan:";
      } else if (isMostExpensive && hasScopedKeyword) {
        finalIntro = `Berikut produk ${meaningfulKeywords.join(" ")} dengan harga tertinggi yang saya temukan:`;
      } else if (isMostExpensive) {
        finalIntro = "Berikut produk dengan harga tertinggi:";
      } else {
        finalIntro = "Berikut produk sesuai rentang harga yang kamu cari:";
      }
    }

    session.lastProducts = bestMatches;
    session.lastTopic = "product_list";

    // ===============================
    // 🔥 FALLBACK KE ADMIN (LOW CONFIDENCE / TIDAK TERJAWAB)
    // ===============================
    if (
      q.includes("admin") ||
      q.includes("cs") ||
      q.includes("customer service") ||
      q.includes("hubungi admin")
    ) {
      return await send(
        {
          type: "text",
          message: buildContactAdminMessage(),
        },
        "general",
      );
    }

    if (
      !intentResult.intent ||
      intentResult.intent === "general" ||
      intentResult.method === "fallback_rule_low_confidence" ||
      (intentResult.score ?? 0) < 0.4
    ) {
      return await send(
        {
          type: "text",
          message: buildContactAdminMessage(),
        },
        "general",
      );
    }

    return await send({
      type: "products",
      intro: finalIntro,
      products: bestMatches,
      closing: randomItem(closings),
    });
  } catch (err) {
    console.error("FATAL ERROR:", err?.stack || err);
    return res.status(500).json({
      type: "text",
      message: "Server error",
    });
  }
}

// untuk promo per jenis produk apakah bisa berikan penjelasannya juga agar telihat menarik? agar ketika ada yg nanya adakah promo untuk chogokin?

// model: "gemini-2.5-flash"
