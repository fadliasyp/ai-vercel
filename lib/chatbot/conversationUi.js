export function isGreetingOnly(text = "") {
  const s = String(text).toLowerCase().trim();

  const cleaned = s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

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

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length > 3) return false;

  return greetings.some((g) => cleaned === g || cleaned.startsWith(g + " "));
}

export function buildGreetingMessage() {
  const greetings = [
    "Halo! Aku bisa bantu cari produk robot, cek stok, bandingin barang, atau cek ongkir.",
    "Hai! Ada yang bisa aku bantu? Kamu bisa tanya produk, stok, atau ongkir.",
    "Selamat datang di Robot Jadul. Mau cari robot apa hari ini?",
    "Halo! Senang bisa bantu. Kamu bisa tanya produk, harga, atau cara checkout.",
  ];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

const SUGGESTION_GROUPS = {
  product: [
    "Ada Chogokin murah?",
    "Ada Mazinger Z yang ready?",
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
  ],

  stock: [
    "Stok Action Gokin Voltron Lion Force masih ada?",
    "Chogokin yg ready stock apa aja?",
    "Masih ada produk Grendizer?",
    "Stok soul of chogokin masih tersedia apa aja?",
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
    "Ada promo untuk robot vintage?",
    "Produk di bawah 1 juta apa saja?",
    "Yang paling worth it mana?",
    "Produk paling mahal di sini apa?",
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
    "Kalau mau mulai koleksi, produk apa yang cocok?",
    "Yang bagus untuk hadiah apa?",
  ],

  location: [
    "Alamat toko di mana?",
    "Ada toko offline?",
    "Bisa datang langsung ke toko?",
    "Lokasi Robot Jadul di mana?",
    "Toko fisiknya di mana?",
    "Bisa pickup di toko?",
  ],
};

function pickRandom(arr = []) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getSmartSuggestions(session = null) {
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

  const chosen = [];
  const shuffledBuckets = [...buckets].sort(() => 0.5 - Math.random());
  shuffledBuckets.slice(0, 6).forEach((group) => {
    const item = pickUnused(group);
    if (item && !chosen.includes(item)) chosen.push(item);
  });

  return chosen.slice(0, 6);
}
