const DIRECT_WORD_MAP = Object.freeze({
  almt: "alamat",
  aj: "aja",
  ad: "ada",
  bndingin: "bandingkan",
  bndingkan: "bandingkan",
  bka: "buka",
  bru: "baru",
  bwt: "buat",
  byr: "bayar",
  brp: "berapa",
  brapa: "berapa",
  brg: "barang",
  cariin: "carikan",
  disc: "diskon",
  dsc: "diskon",
  dgn: "dengan",
  dmn: "dimana",
  gmn: "gimana",
  gmna: "gimana",
  hrg: "harga",
  hr: "hari",
  jg: "juga",
  jm: "jam",
  krm: "kirim",
  lg: "lagi",
  klo: "kalau",
  kalo: "kalau",
  krn: "karena",
  lck: "lacak",
  mn: "mana",
  msh: "masih",
  ong: "ongkir",
  ordr: "order",
  pdhl: "padahal",
  prd: "produk",
  prom: "promo",
  psn: "pesan",
  rek: "rekomendasi",
  rekom: "rekomendasi",
  rtr: "retur",
  spek: "spesifikasi",
  stk: "stok",
  skrg: "sekarang",
  smpe: "sampai",
  stat: "status",
  sy: "saya",
  tdk: "tidak",
  trck: "tracking",
  utk: "untuk",
  yg: "yang",
  blm: "belum",
  sdh: "sudah",
  udh: "sudah",
  mw: "mau",
  bsa: "bisa",
  dpt: "dapat",
  vitage: "vintage",
  vintge: "vintage",
  msib: "misb",
  orginal: "original",
  oriignal: "original",
  dikirm: "dikirim",
  dibwah: "dibawah",
  dtg: "datang",
  gundm: "gundam",
  ilang: "hilang",
  komplen: "komplain",
  kondsi: "kondisi",
  lengkp: "lengkap",
  redy: "ready",
  smpai: "sampai",
  voltrn: "voltron",
  cogokin: "chogokin",
  chocogin: "chogokin",
  termura: "termurah",
  murh: "murah",
});

const NUMERIC_REDUPLICATION_MAP = Object.freeze({
  kira2: "kira kira",
  apa2: "apa apa",
  mana2: "mana mana",
  macam2: "macam macam",
  macem2: "macem macem",
  jenis2: "jenis jenis",
  produk2: "produk",
  barang2: "barang",
  robot2: "robot",
  item2: "item",
  mainan2: "mainan",
  figure2: "figure",
  figur2: "figur",
  foto2: "foto",
  topi2: "topi",
  baju2: "baju",
  kaos2: "kaos",
});

const REPEATED_WORDS = Object.freeze([
  "ada",
  "admin",
  "apa",
  "bagus",
  "baju",
  "bandai",
  "barang",
  "bayar",
  "belum",
  "berapa",
  "bisa",
  "bot",
  "cacat",
  "chatbot",
  "checkout",
  "chogokin",
  "dikirim",
  "diskon",
  "ditoko",
  "engga",
  "figure",
  "figur",
  "foto",
  "gak",
  "ga",
  "gashapon",
  "getter",
  "gundam",
  "halo",
  "harga",
  "hadiah",
  "item",
  "juga",
  "jual",
  "kak",
  "kaos",
  "kirim",
  "mainan",
  "mazinger",
  "misb",
  "murah",
  "nggak",
  "ongkir",
  "original",
  "packing",
  "patah",
  "pembayaran",
  "pengiriman",
  "pesanan",
  "produk",
  "promo",
  "ready",
  "rekomendasi",
  "refund",
  "resi",
  "retur",
  "robot",
  "sudah",
  "stok",
  "takara",
  "termurah",
  "toko",
  "topi",
  "tracking",
  "transaksi",
  "vintage",
  "voltes",
  "voltron",
]);

const FUZZY_COMMERCE_WORDS = Object.freeze([
  "alamat",
  "asuransi",
  "bandingkan",
  "bayar",
  "chogokin",
  "checkout",
  "diskon",
  "gashapon",
  "grendizer",
  "gundam",
  "ketersediaan",
  "kelengkapan",
  "mazinger",
  "ongkir",
  "original",
  "pembayaran",
  "pencarian",
  "pengembalian",
  "pengiriman",
  "perbandingan",
  "pesanan",
  "preorder",
  "promo",
  "rekomendasi",
  "refund",
  "restock",
  "retur",
  "spesifikasi",
  "status",
  "tracking",
  "transaksi",
  "vintage",
  "voltes",
  "voltron",
]);

function collapseRepeatedLetters(value = "") {
  return String(value).replace(/([a-z])\1+/g, "$1");
}

function buildRepeatedWordIndex(words = []) {
  const candidates = new Map();

  for (const word of words) {
    const signature = collapseRepeatedLetters(word);
    const previous = candidates.get(signature);
    if (!previous) candidates.set(signature, word);
    else if (previous !== word) candidates.set(signature, null);
  }

  return candidates;
}

const REPEATED_WORD_INDEX = buildRepeatedWordIndex(REPEATED_WORDS);

function editDistance(left = "", right = "") {
  const a = String(left);
  const b = String(right);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const substitution = previous[column - 1] +
        Number(a[row - 1] !== b[column - 1]);
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        substitution,
      );
    }
    previous = current;
  }

  return previous[b.length];
}

export function isLikelyTypoMatch(left = "", right = "") {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a === b) return true;
  if (!/^[a-z]{4,}$/.test(a) || !/^[a-z]{4,}$/.test(b)) return false;
  if (Math.abs(a.length - b.length) > 2) return false;

  const longest = Math.max(a.length, b.length);
  const allowedDistance = longest >= 9 ? 2 : 1;
  const distance = editDistance(a, b);
  return distance <= allowedDistance && 1 - distance / longest >= 0.78;
}

function correctKnownCommerceTypo(word = "") {
  // Short unknown words are often product or Indonesian place names. Keep
  // their spelling intact; common short chat abbreviations live in the map.
  if (!/^[a-z]{6,}$/.test(word)) return word;

  let best = word;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of FUZZY_COMMERCE_WORDS) {
    if (Math.abs(candidate.length - word.length) > 2) continue;
    const distance = editDistance(word, candidate);
    const allowedDistance = candidate.length >= 8 ? 2 : 1;
    if (distance <= allowedDistance && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

function normalizeWordToken(token = "") {
  const word = String(token).toLowerCase();
  if (!word) return word;

  if (NUMERIC_REDUPLICATION_MAP[word]) {
    return NUMERIC_REDUPLICATION_MAP[word];
  }

  // Product codes, prices, order IDs, and tracking numbers must stay intact.
  if (/\d/.test(word)) return word;

  if (DIRECT_WORD_MAP[word]) return DIRECT_WORD_MAP[word];
  if (REPEATED_WORDS.includes(word)) return word;

  if (/^[a-z]+$/.test(word) && /([a-z])\1+/.test(word)) {
    const collapsed = collapseRepeatedLetters(word);
    const canonical = REPEATED_WORD_INDEX.get(collapsed);
    if (canonical) return canonical;

    const correctedCollapsed = correctKnownCommerceTypo(collapsed);
    if (correctedCollapsed !== collapsed) return correctedCollapsed;
  }

  return correctKnownCommerceTypo(word);
}

export function normalizeIndonesianCommerceText(value = "") {
  return String(value || "")
    .normalize("NFKC")
    .replace(
      /[A-Za-z0-9]+(?:[-/.#][A-Za-z0-9]+)*/g,
      (token) => normalizeWordToken(token),
    )
    .replace(/\s+/g, " ")
    .trim();
}
