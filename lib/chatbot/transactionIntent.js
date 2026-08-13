export function isCODQuestion(q = "") {
  const s = String(q || "").toLowerCase();
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

export function looksLikePaymentMethodQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    looksLikePayLaterQuestion(s) ||
    s.includes("metode pembayaran") ||
    s.includes("metode bayar") ||
    s.includes("pembayaran apa") ||
    s.includes("bayar apa") ||
    s.includes("bayar pakai apa") ||
    s.includes("bayar pake apa") ||
    s.includes("bisa bayar pakai") ||
    s.includes("bisa bayar pake") ||
    s.includes("payment method") ||
    s.includes("qris") ||
    s.includes("gopay") ||
    s.includes("transfer") ||
    s.includes("kartu kredit") ||
    s.includes("visa") ||
    s.includes("cimb") ||
    s.includes("bni") ||
    s.includes("mandiri") ||
    s.includes("bri") ||
    s.includes("permatabank") ||
    /\b(?:pembayaran(?:nya)?|bayarnya)\b.{0,30}\b(?:pakai|pake|make|menggunakan|apa(?:\s+(?:aja|saja))?)\b/.test(
      s,
    )
  );
}

export function looksLikePayLaterQuestion(q = "") {
  return /\b(?:pay\s*later|paylater|spaylater|shopee\s*paylater|kredivo|akulaku|indodana)\b/i.test(
    String(q || ""),
  );
}

export function looksLikeInsuranceQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    s.includes("asuransi") ||
    s.includes("proteksi pengiriman") ||
    s.includes("barang diasuransikan") ||
    s.includes("bisa diasuransikan") ||
    s.includes("pakai asuransi") ||
    s.includes("ada asuransi")
  );
}

export function looksLikeShippingEstimateQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    s.includes("berapa lama pengiriman") ||
    s.includes("berapa hari") ||
    s.includes("kapan sampai") ||
    s.includes("lama pengiriman") ||
    (s.includes("estimasi pengiriman") && !s.includes(" ke ")) ||
    (s.includes("estimasi sampai") && !s.includes(" ke "))
  );
}

export function looksLikePackingProtectionQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    /\b(?:packing|kemasan)\s+(?:kayu|aman|tambahan|khusus)\b/.test(s) ||
    /\b(?:bubble\s*wrap|double\s*box)\b/.test(s) ||
    /\b(?:pengiriman|paket|barang)\b.*\b(?:aman|penyok|rusak)\b/.test(s)
  );
}

export function looksLikeSameDayDispatchQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    /\b(?:kirim|dikirim|diproses|sampai)\b.*\b(?:hari\s+ini|same\s*day)\b/.test(s) ||
    /\b(?:hari\s+ini|same\s*day)\b.*\b(?:kirim|dikirim|diproses|sampai)\b/.test(s)
  );
}

export function looksLikeTransactionPolicyQuestion(q = "") {
  return (
    isCODQuestion(q) ||
    looksLikePaymentMethodQuestion(q) ||
    looksLikeInsuranceQuestion(q) ||
    looksLikeShippingEstimateQuestion(q) ||
    looksLikePackingProtectionQuestion(q) ||
    looksLikeSameDayDispatchQuestion(q) ||
    looksLikeShippingCoverageQuestion(q)
  );
}

export function looksLikeProductTransactionCompoundQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  const asksProductFact =
    /\b(?:harga(?:nya)?|promo(?:nya)?|diskon(?:nya)?|stok(?:nya)?|stock|ready|masih\s+ada|kondisi(?:nya)?|detail(?:nya)?|spesifikasi(?:nya)?)\b/.test(
      s,
    );

  return asksProductFact && looksLikeTransactionPolicyQuestion(s);
}

export function looksLikeHowToBuyQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    s.includes("how to buy") ||
    s.includes("cara beli") ||
    s.includes("cara membeli") ||
    s.includes("cara order") ||
    s.includes("cara pesan") ||
    s.includes("cara checkout") ||
    s.includes("cara pembayaran") ||
    s.includes("bagaimana membeli") ||
    s.includes("bagaimana cara membeli") ||
    s.includes("membeli produk") ||
    s.includes("beli produk ini") ||
    s.includes("mau beli gimana") ||
    s.includes("mau order gimana") ||
    s.includes("proses pembelian") ||
    s.includes("proses beli") ||
    s.includes("cara melakukan pembelian") ||
    s.includes("langkah beli") ||
    s.includes("langkah order") ||
    s.includes("place order") ||
    s.includes("proceed to checkout")
  );
}

export function looksLikeCompareQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    s.includes("bandingkan") ||
    s.includes("compare") ||
    s.includes(" vs ") ||
    s.includes(" versus ") ||
    s.includes("apa bedanya") ||
    s.includes("bedanya") ||
    s.includes("perbedaan") ||
    s.includes("beda dengan") ||
    s.includes("lebih bagus mana") ||
    s.includes("lebih baik mana") ||
    s.includes("bagusan mana") ||
    s.includes("pilih yang mana") ||
    (s.includes("mana") &&
      (s.includes("lebih bagus") ||
        s.includes("lebih baik") ||
        s.includes("bagusan")))
  );
}

export function looksLikeShippingOriginQuestion(q = "") {
  const s = String(q || "").toLowerCase();
  if (looksLikeProductManufacturingOriginQuestion(s)) return false;

  return (
    s.includes("pengiriman dari mana") ||
    s.includes("dikirim dari mana") ||
    s.includes("asal pengiriman") ||
    s.includes("barang dikirim dari mana") ||
    s.includes("kirim dari mana") ||
    s.includes("kirim dari") ||
    s.includes("dikirim dari") ||
    s.includes("gudang") ||
    s.includes("warehouse") ||
    s.trim() === "dari mana"
  );
}

export function looksLikeProductManufacturingOriginQuestion(q = "") {
  const s = String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    /\b(?:diproduksi|produksi|dibuat|buatan|manufaktur|pabrik)\b/.test(s) ||
    /\b(?:impor|import)(?:ir|an)?\b/.test(s) ||
    /\b(?:made\s+in|negara\s+asal|asal\s+(?:produksi|pembuatan|manufaktur)|(?:produk|barang|robot|mainan|figure|figur)(?:nya)?\s+buatan\s+mana)\b/.test(
      s,
    )
  );
}

export function looksLikeShippingCoverageQuestion(q = "") {
  const s = String(q || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const hasShippingContext =
    /\b(?:kirim|dikirim|pengiriman|antar|diantar)\b/.test(s);
  const hasBroadDestination =
    /\b(?:luar\s+(?:pulau|jawa|kota|daerah)|antar\s*-?pulau|seluruh\s+indonesia|se\s*-?indonesia)\b/.test(
      s,
    );
  const asksSupportedDestination =
    hasShippingContext &&
    /\b(?:bisa|dapat|melayani)\b/.test(s) &&
    /\bke\b/.test(s);

  return (
    (hasShippingContext && hasBroadDestination) ||
    asksSupportedDestination ||
    /\b(?:jangkauan|cakupan)\s+pengiriman\b/.test(s) ||
    /\bpengiriman\s+(?:bisa\s+)?sampai\s+mana\b/.test(s)
  );
}

export function looksLikeRecommendationRequest(q = "") {
  const s = String(q || "").toLowerCase();
  return (
    s.includes("rekomendasi") ||
    s.includes("rekomen") ||
    s.includes("recommended") ||
    s.includes("cocok") ||
    s.includes("mending") ||
    s.includes("bagusnya") ||
    s.includes("paling cocok") ||
    s.includes("worth it") ||
    s.includes("value for money") ||
    s.includes("kolektor baru") ||
    s.includes("baru mulai") ||
    s.includes("buat pajangan") ||
    s.includes("untuk pajangan") ||
    s.includes("display") ||
    s.includes("buat koleksi") ||
    s.includes("untuk koleksi") ||
    s.includes("hadiah")
  );
}

export function needsRecommendationBudgetClarification(
  q = "",
  budgetDetected = false,
) {
  if (budgetDetected || !looksLikeRecommendationRequest(q)) return false;
  return /\b(?:budget|anggaran|dana)\b/i.test(String(q || ""));
}

export function buildPaymentMethodsMessage({ includeClosing = true } = {}) {
  return (
    "Tentu, kami menyediakan beberapa metode pembayaran yang praktis.\n\n" +
    "**Pilihan Pembayaran Tersedia:**\n\n" +
    "- GoPay\n" +
    "- CIMB Niaga\n" +
    "- BNI\n" +
    "- QRIS\n" +
    "- Mandiri\n" +
    "- BRI\n" +
    "- Kartu Kredit\n" +
    "- Visa\n" +
    "- PermataBank" +
    (includeClosing
      ? "\n\nSilakan pilih metode pembayaran yang paling nyaman saat checkout."
      : "")
  );
}

export function buildPayLaterPolicyMessage() {
  return (
    "Saat ini **PayLater belum tercantum sebagai metode pembayaran resmi yang tersedia** di Robot Jadul.\n\n" +
    "Metode yang tercatat adalah transfer bank, QRIS, GoPay, dan kartu kredit. Gunakan hanya pilihan yang benar-benar muncul saat checkout."
  );
}

export function buildShippingCoverageMessage() {
  return (
    "Pengiriman ke luar kota atau luar pulau **bisa dilakukan selama alamat tujuan didukung oleh kurir yang tersedia**.\n\n" +
    "Ketersediaan layanan dan ongkir akhirnya mengikuti kota/kecamatan tujuan serta pilihan kurir saat checkout."
  );
}

export function buildTransactionTopicClarification() {
  return "Kamu boleh lanjut menanyakan pembayaran, COD, ongkir, estimasi pengiriman, asuransi, packing, atau cara membeli. Tidak perlu menjawab alur sebelumnya kalau ingin membahas hal lain.";
}

export function buildCODPolicyMessage({ enabled = false } = {}) {
  if (enabled) {
    return (
      "**COD / bayar di tempat tersedia** untuk area atau kondisi tertentu.\n\n" +
      "Ketersediaannya tetap mengikuti lokasi pengiriman dan pilihan layanan yang muncul saat checkout."
    );
  }

  return (
    "Saat ini **COD / bayar di tempat belum tersedia**.\n\n" +
    "Gunakan metode pembayaran resmi yang tersedia saat checkout, seperti transfer bank, QRIS, GoPay, atau kartu kredit."
  );
}

export function buildInsuranceMessage() {
  return (
    "**Asuransi Pengiriman**\n\n" +
    "Untuk keamanan pesanan, pengiriman bisa menggunakan asuransi terutama untuk produk koleksi atau barang bernilai tinggi.\n\n" +
    "Dengan asuransi, pesanan kamu mendapatkan perlindungan tambahan selama proses pengiriman.\n\n" +
    "Untuk menambahkan asuransi sebelum pengiriman, silakan hubungi admin kami melalui WhatsApp:\n" +
    "<a href='https://wa.me/6285975313930' target='_blank'>085975313930</a>\n\n" +
    "Admin akan membantu proses penambahan asuransi dengan cepat."
  );
}

export function buildShippingEstimateMessage({ includeOffer = false } = {}) {
  return (
    "**Estimasi Pengiriman Pesanan**\n\n" +
    "Pesanan biasanya diproses dalam waktu **1-2 hari kerja** setelah pembayaran dikonfirmasi.\n\n" +
    "Estimasi pengiriman:\n" +
    "- Jabodetabek: **1-2 hari**\n" +
    "- Pulau Jawa: **2-4 hari**\n" +
    "- Luar Jawa: **3-7 hari**\n\n" +
    "Estimasi bisa berbeda tergantung ekspedisi dan lokasi tujuan." +
    (includeOffer
      ? "\n\nKalau mau, aku bisa bantu cek ongkir dan estimasi lebih detail ke kotamu."
      : "")
  );
}

export function buildPackingProtectionMessage() {
  return (
    "**Keamanan dan packing pesanan**\n\n" +
    "Pesanan dikemas dengan pelindung yang disesuaikan dengan produk. **Packing kayu tidak otomatis disertakan atau dijamin tersedia**. Untuk produk bernilai tinggi atau box koleksi, ajukan packing tambahan ke WhatsApp Admin sebelum checkout: https://wa.me/6285975313930.\n\n" +
    "Admin akan memastikan ketersediaan dan biaya tambahannya sebelum pesanan diproses."
  );
}

export function buildSameDayDispatchMessage() {
  return (
    "**Pengiriman pada hari yang sama tidak dapat dijamin otomatis**. Pesanan umumnya diproses dalam **1-2 hari kerja** setelah pembayaran dikonfirmasi.\n\n" +
    "Jika pesanan mendesak, konfirmasikan nama produk dan waktu pembayaran ke WhatsApp Admin sebelum checkout: https://wa.me/6285975313930. Pengiriman hari itu bergantung pada stok, waktu konfirmasi, proses packing, dan jadwal kurir."
  );
}

export function buildTransactionPolicyMessage(
  question = "",
  { codEnabled = false, includeShippingOffer = false } = {},
) {
  const sections = [];

  if (isCODQuestion(question)) {
    sections.push(buildCODPolicyMessage({ enabled: codEnabled }));
  }
  if (looksLikePayLaterQuestion(question)) {
    sections.push(buildPayLaterPolicyMessage());
  } else if (looksLikePaymentMethodQuestion(question)) {
    sections.push(buildPaymentMethodsMessage({ includeClosing: false }));
  }
  if (looksLikeInsuranceQuestion(question)) {
    sections.push(buildInsuranceMessage());
  }
  if (looksLikePackingProtectionQuestion(question)) {
    sections.push(buildPackingProtectionMessage());
  }
  if (looksLikeSameDayDispatchQuestion(question)) {
    sections.push(buildSameDayDispatchMessage());
  } else if (looksLikeShippingEstimateQuestion(question)) {
    sections.push(
      buildShippingEstimateMessage({ includeOffer: includeShippingOffer }),
    );
  }
  if (looksLikeShippingCoverageQuestion(question)) {
    sections.push(buildShippingCoverageMessage());
  }

  return sections.join("\n\n");
}
