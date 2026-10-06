# Feature Baseline

Dokumen ini melindungi perilaku yang sudah terbukti oleh implementation dan test. Status `STABLE` hanya berlaku pada ruang lingkup yang tertulis. Integrasi live tetap harus diverifikasi terpisah.

## Grounded Commerce Facts

### Status

STABLE (contract dan regression-test scope)

### Function

Memisahkan pemahaman/bahasa LLM dari fakta commerce yang harus diambil melalui tool/data terverifikasi.

### Correct Behavior

- Harga, stok, promo, nama/link produk, order, ongkir, dan policy tidak dikarang LLM.
- Structured payload produk/options/steps dipertahankan oleh composer.
- Naturalizer ditolak atau field dikembalikan ke legacy bila protected facts berubah.
- LLM/tool plan memilih sumber data sesuai goal.
- Promo bersyarat yang tidak tercatat sebagai fakta katalog, seperti beli 1 gratis 1, tidak boleh disimpulkan dari produk yang sekadar memiliki harga diskon; chatbot menyatakan belum memiliki informasi terverifikasi dan menyediakan admin handoff.
- Goal LLM `bulk_discount` tidak memerlukan nama produk dan harus menuju kebijakan penawaran sebelum katalog diambil. Jumlah barang boleh ditampilkan hanya jika berasal dari pesan pelanggan.

### Do Not Break

- Jangan menjadikan output LLM sebagai sumber fakta commerce.
- Jangan menghapus safety validator untuk menaikkan composer acceptance.
- Jangan naturalize array `products`, `options`, `steps`, payment methods, atau admin handoff.
- Jangan mengganti pertanyaan promo bersyarat dengan daftar produk diskon biasa.
- Jangan mengubah pertanyaan potongan pembelian banyak menjadi pencarian satu produk atau klaim bahwa diskon pasti diberikan.

### Important Files

- `lib/chatbot/llmAssistant.js`
- `lib/chatbot/responseNaturalizer.js`
- `lib/chatbot/answerCoverage.js`
- `lib/chatbot/wooCatalog.js`
- `lib/chatbot/storePolicy.js`

### Verification

- `npm test`
- `npm run benchmark:llm-shadow -- <endpoint>` sebelum perubahan mode/composer live.

## Compound Question Coverage

### Status

STABLE (local replay scope)

### Function

Memecah permintaan majemuk menjadi goal/facet, merencanakan jawaban, lalu mendeteksi poin terlewat untuk diperbaiki atau diklarifikasi.

### Correct Behavior

- Satu pertanyaan dapat memuat produk, budget, stok, kondisi, shipping, pembayaran, dan policy sekaligus.
- Rentang budget bahasa sehari-hari seperti `3 juta sampe 6 jutaan` harus dipertahankan sebagai minimum Rp3 juta dan maksimum Rp6 juta, termasuk saat digabung dengan tujuan hadiah.
- Frasa katalog yang secara eksplisit menegasikan kondisi buruk, seperti `bukan barang JUNK`, tidak boleh dianggap sebagai bukti bahwa produk JUNK.
- Setiap facet dilacak sampai answered, clarified, atau unresolved.
- Auto-repair tidak boleh mengubah objek produk atau intent utama.
- Klarifikasi menjelaskan informasi yang masih kurang.

### Do Not Break

- Jangan mereduksi pertanyaan majemuk menjadi intent tunggal yang membuang goal lain.
- Jangan menambahkan paragraf generik yang tidak menjawab facet.
- Jangan menganggap partial answer sebagai complete answer.
- Jangan meminta budget ulang bila rentang informal sudah terbaca, dan jangan melonggarkan filter budget atau mengikutkan produk JUNK hanya untuk mengisi hasil hadiah.
- Jangan menghapus perlindungan terhadap `kondisi JUNK`, `rongsok`, atau `part only`; hanya kemunculan yang benar-benar dinegasikan yang boleh diabaikan.

### Important Files

- `lib/chatbot/compoundQuestion.js`
- `lib/chatbot/questionUnderstanding.js`
- `lib/chatbot/answerCoverage.js`
- `lib/chatbot/llmAssistant.js`
- `api/ask.js`

### Verification

- `npm test`
- `npm run benchmark:coverage-replay`
- Bukti 2026-09-01: 9/9 turn lulus, coverage 59,4% ke 88,9%.

## Recommendation Price Intent

### Status

STABLE (local ranking dan endpoint regression scope)

### Function

Membedakan harga sasaran dari batas budget agar rekomendasi mengikuti kisaran yang benar.

### Correct Behavior

- Pada mode LLM-led, `recommendation_request` terstruktur menjadi sumber utama pemahaman mode harga, tujuan penggunaan, kebutuhan stok, kondisi, dan promo; filter/ranking tetap memakai fakta WooCommerce.
- Nominal hasil LLM hanya diterima jika terdapat pada pesan pelanggan. Nominal dari goal lama hanya boleh diterima ketika relasi turn adalah `follow_up` atau `clarification_answer`.
- `harga 7 jutaan` dan `harga sekitar 7 juta` diperlakukan sebagai target harga, lalu kandidat terdekat diprioritaskan.
- Nominal yang langsung mengikuti permintaan rekomendasi, misalnya `rekomen robot 19 jutaan` atau `rekomendasiin robot 6 jutaan`, juga diperlakukan sebagai target harga meskipun kata `harga` tidak ditulis.
- `budget sekitar 12 jutaan` dan `dana kisaran 12 juta` diperlakukan sebagai target mendekati Rp12 juta sekaligus batas maksimum Rp12 juta, sehingga produk yang jauh lebih murah tidak menang hanya karena promo/popularitas.
- `budget maksimal 7 juta`, `di bawah 7 juta`, dan rentang `5 juta sampai 7 juta` tetap menjadi batas keras.
- Permintaan generik seperti `Cari robot antara 5 sampai 8 juta buat pajangan` tidak boleh dianggap menyebut nama produk hanya karena mengandung kata rentang atau tujuan penggunaan.
- Setelah hasil rekomendasi, follow-up seperti `yg 3 jutaan` atau `Kalau yang 6 jutaan ada apa aja?` diwarisi sebagai target harga baru untuk rekomendasi yang sama; pelanggan tidak perlu mengulang kata `rekomendasi robot`.
- Dalam satu pesan yang menyebut rentang lama lalu alternatif baru, misalnya `antara 5 sampai 8 juta ... kalau yang 3 jutaan ada?`, harga eksplisit paling akhir menjadi target baru dan tujuan penggunaan sebelumnya tetap dipertahankan.
- Variasi sehari-hari seperti `rekomen`, `pilihin`, `mnurut lu`, `pengen`, `7jtan/jtaan`, dan rentang `3 sd 6 juta` harus menghasilkan constraint rekomendasi yang sama dengan bentuk bakunya.
- Frasa rekomendasi `sekitar/kisaran X` tanpa kata `budget` adalah target harga, bahkan bila LLM keliru mengembalikannya sebagai batas maksimum. Grounding lokal harus mengoreksi mode sebelum katalog diranking.
- Pertanyaan rekomendasi baru yang sudah lengkap tidak boleh ditulis ulang sebagai budget follow-up hanya karena goal sebelumnya juga rekomendasi.
- Pada kalimat pemilihan seperti `yang ready dan paling cocok buat display yang mana?`, ready stock dan display adalah constraint rekomendasi; keduanya tidak boleh mengganti intent utama menjadi cek stok.
- Follow-up berbungkus singkatan seperti `klo yg 4jtan ada gak?` tetap menjadi refinement target harga selama goal rekomendasi aktif.
- Nominal polos seperti `3 juta` tetap diwarisi sebagai batas budget, bukan target harga.
- Target harga yang berbeda harus menghasilkan kelompok kandidat yang relevan dengan target tersebut, bukan selalu daftar rekomendasi generik yang sama.
- Promo, penjualan, dan rating hanya meranking kandidat yang relevan; sinyal tersebut tidak boleh mengalahkan target harga hingga menghasilkan produk yang jauh lebih murah.
- Jika tidak ada kandidat dalam toleransi 20% dari target, jangan kembali ke daftar rekomendasi umum yang jauh dari nominal pelanggan.
- Rekomendasi yang menyebut keluarga produk, misalnya `dari semua variasi Voltes mana yang paling worth it`, hanya boleh meranking anggota keluarga tersebut. Matcher katalog memulihkan scope dari pesan ketika LLM melewatkan `product_names`.
- Filter keluarga produk dilakukan sebelum ranking dan pemilihan Gemini. Jika tidak ada varian ready, respons menyatakan hal itu tanpa mengganti dengan seri lain.

### Do Not Break

- Jangan mengubah semua frasa nominal menjadi target harga; kata `budget`, batas atas/bawah, dan rentang tetap memakai constraint lama.
- Jangan menerima nominal baru yang hanya muncul dari output LLM dan tidak ada pada pesan atau goal follow-up terverifikasi.
- Jangan melewati guard produk untuk nama produk eksplisit yang tidak tersedia; pengecualian guard hanya berlaku ketika structured understanding tepercaya menyatakan `product_names` kosong.
- Jangan mewariskan konteks rekomendasi ke pertanyaan yang jelas mengganti intent, misalnya `kapan restock ya`.
- Jangan melonggarkan filter stok, kondisi, promo, hadiah, atau metadata produk untuk mengisi jumlah kartu.
- Jangan membiarkan `product_names` LLM yang kosong menghapus nama keluarga produk yang dapat dibuktikan oleh pesan pelanggan dan katalog.

### Important Files

- `lib/chatbot/productRecommendation.js`
- `lib/chatbot/semanticRouter.js`
- `lib/chatbot/conversationGoal.js`
- `tests/productRecommendationReasoning.test.js`
- `tests/conversationGoal.test.js`
- `tests/askRouting.test.js`

### Verification

- `npm test`
- `npm run benchmark:coverage-replay`
- Bukti 2026-10-06: 399/399 test lulus, replay 9/9 turn lulus, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus.
- Bukti production 2026-10-06: smoke manual pengguna lulus 3/3 untuk target harga, rentang + kebutuhan, dan refinement harga singkat dalam sesi yang sama.
- Bukti lokal 2026-10-06 untuk named-family recommendation: full suite 406/406, replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus. Smoke production belum dijalankan.

## Product Grounding

### Status

STABLE (shared matcher dan local endpoint regression scope)

### Function

Menghubungkan bahasa pelanggan ke produk WooCommerce yang benar sebelum harga, stok, promo, atau detail dijawab.

### Correct Behavior

- Kode model `GX92`, `GX-92`, dan `GX 92` memiliki representasi pencarian yang setara.
- Kata pertanyaan atribut seperti bahan, dimensi, tinggi, berat, aksesori, kondisi, dan harga nett tidak dianggap bagian nama produk.
- Nama keluarga produk yang cukup spesifik dapat cocok dengan nama katalog yang lebih panjang.
- Nama eksplisit pada turn baru mengalahkan produk lama atau konteks halaman yang berbeda.
- Kandidat dekat yang sama kuat menghasilkan klarifikasi; kombinasi nama asing atau model salah tidak boleh dipaksakan ke produk terdekat.
- Nama lini katalog yang memakai kata atribut, misalnya `POSE+ METAL series SASURAIGER`, tetap dapat ditemukan dari token identitas lainnya dan exact-name matching.
- Pada mode active, satu `product_names` terstruktur dari LLM dipakai sebelum parsing nama dari kalimat mentah. Hasilnya tetap wajib cocok dengan WooCommerce dan memiliki bukti token dari pesan pelanggan.
- Jalur `product_discovery` memakai entitas LLM yang grounded sebagai query katalog utama agar filler bahasa sehari-hari tidak mencemari pencarian, lalu kembali ke parser lokal jika entitas tersebut tidak menghasilkan kecocokan.
- Semua token entitas LLM wajib hadir pada pesan pelanggan. Nama keluarga seperti `Voltes` tetap boleh menghasilkan beberapa produk dan tidak boleh dipersempit ke satu varian yang hanya dibuat oleh LLM.
- Perintah eksplisit seperti `lihat koleksi lawas seri Voltes` tetap `product_discovery` jika provider keliru memilih `recommendation`; kata `koleksi` saja bukan permintaan rekomendasi tanpa permintaan memilih atau menilai.
- Permintaan seperti `tampilin robot Voltron yang tersedia` adalah pencarian katalog dengan filter ketersediaan, bukan pertanyaan jumlah stok. Salah klasifikasi LLM ke `stock_availability` tidak boleh mengunci routing ini.
- Kata percakapan `coba`, `tampilin`, `nampilin`, dan `tunjukin` tidak boleh menjadi token identitas produk.
- Kata tujuan restock seperti `habis`, `kapan`, `restock/restok`, `bakal masuk lagi`, dan `kembali` tidak boleh mencemari nama keluarga produk yang disebut pelanggan.

### Do Not Break

- Jangan menurunkan threshold hanya untuk membuat semua query menghasilkan produk.
- Jangan mengganti produk tidak dikenal dengan produk ready stock atau populer.
- Jangan menerima nama produk keluaran LLM yang tidak memiliki bukti pada pesan pelanggan; parser lokal tetap fallback ketika LLM tidak tersedia atau entitasnya tidak tepercaya.
- Jangan memakai kecocokan satu token untuk menerima nama varian lengkap dari LLM; hal itu dapat mengubah permintaan keluarga produk menjadi satu produk yang tidak diminta.
- Jangan mengubah permintaan melihat daftar/seri menjadi rekomendasi umum yang mengganti produk dengan alternatif tidak terkait.
- Jangan membuang seluruh goal majemuk setelah produk ditemukan.
- Jangan memakai stale context ketika pelanggan menyebut produk baru.
- Jangan mengubah pertanyaan stok eksplisit seperti `sisa berapa pcs`, `ready`, atau `restock` menjadi pencarian katalog.

### Important Files

- `lib/chatbot/productSearch.js`
- `api/ask.js`
- `tests/productSearch.test.js`
- `tests/productGroundingLanguageMatrix.test.js`
- `tests/askRouting.test.js`

### Verification

- Bukti lokal 2026-10-06: 400/400 test lulus.
- Answer-coverage replay lulus 9/9 turn; coverage 59,4% menjadi 88,9%.
- Bukti production 2026-10-06: smoke manual pengguna lulus 5/5 untuk kode rapat, material + harga, dimensi + stok, ambiguity, dan unknown model.
- Bukti lokal 2026-10-06 untuk batas pencarian/stok: full suite 403/403, replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus. Smoke production untuk patch ini belum dijalankan.
- Bukti lokal 2026-10-06 untuk restock informal: full suite 404/404, replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus. Smoke production untuk patch ini belum dijalankan.
- Bukti lokal 2026-10-06 untuk LLM-first product discovery: full suite 405/405, replay 9/9 turn, dan benchmark pelanggan 26/26 turn (135 assertion, 100%) lulus. Smoke production untuk patch ini belum dijalankan.

## LLM-Grounded Product Detail

### Status

STABLE (local formatter, endpoint regression, dan production smoke scope)

### Function

Memakai pemahaman facet dari LLM untuk menjawab detail produk secara fokus, sementara seluruh fakta tetap berasal dari produk WooCommerce yang sudah di-grounding.

### Correct Behavior

- Goal LLM `material`, `dimensions`, `product_condition`, `completeness`, `price`, `stock`, dan `promo` boleh menentukan fakta mana yang perlu ditampilkan.
- Goal tersebut hanya dipakai setelah semantic route tepercaya; nama produk tetap harus lolos Product Grounding terhadap pesan pelanggan dan katalog.
- Pertanyaan spesifik menampilkan fakta yang diminta tanpa memenuhi jawaban dengan harga, stok, atau detail lain yang tidak diminta.
- Pertanyaan detail umum tetap memakai detail lengkap, dan pertanyaan kelebihan/kekurangan tetap memakai catatan yang benar-benar ada di katalog.
- Informasi asal produksi atau impor hanya dijawab bila deskripsi WooCommerce memuat bukti eksplisit seperti `Made in`, `diproduksi`, negara asal, atau impor. Jika tidak ada, respons tidak boleh menebak.
- Typo yang dipahami LLM, misalnya `bahanya` atau `komplit`, tetap dapat menghasilkan jawaban material/kelengkapan dari deskripsi WooCommerce.

### Do Not Break

- Jangan memakai LLM sebagai sumber material, ukuran, kondisi, kelengkapan, harga, stok, promo, atau asal produksi.
- Jangan membiarkan facet LLM mengganti produk yang sudah dipilih oleh resolver katalog.
- Jangan menghapus fallback detail lengkap ketika pelanggan tidak meminta facet tertentu.
- Jangan menyatakan kelengkapan atau asal produksi pasti bila data katalog tidak mencantumkannya.
- Jangan mengubah response shape `products` yang dipakai frontend.

### Important Files

- `api/ask.js`
- `lib/chatbot/productFormatter.js`
- `tests/productFormatter.test.js`
- `tests/askRouting.test.js`

### Verification

- Bukti lokal 2026-10-06: full suite 408/408, answer-coverage replay 9/9 turn (59,4% menjadi 88,9%), dan benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Bukti production 2026-10-06: pengguna mengonfirmasi smoke manual Detail Produk lulus 3/3.

## LLM-Grounded Price And Promotion

### Status

STABLE (local endpoint regression dan production smoke scope)

### Function

Memakai intent dan goal LLM untuk memahami pertanyaan harga/promo informal, sementara nama, nominal, dan status promo tetap diambil dari katalog WooCommerce.

### Correct Behavior

- Goal LLM `promo` yang tepercaya dapat mengaktifkan handler promo tanpa bergantung pada kata literal lokal.
- Pertanyaan promo umum dengan `product_names` kosong mencari promo di seluruh katalog; pertanyaan produk spesifik memakai entitas LLM yang tetap wajib grounded pada pesan pelanggan dan katalog.
- Produk yang tidak sedang promo harus dijelaskan apa adanya dan tetap menampilkan harga katalog saat ini.
- Intro faktual dari handler tidak boleh dihapus oleh presenter harga tunggal.
- Parser/rule lokal tetap menjadi fallback ketika LLM tidak tersedia, limit, confidence rendah, atau entitas tidak tepercaya.

### Do Not Break

- Jangan memakai LLM sebagai sumber nominal harga, persentase diskon, harga normal, harga sale, atau status promo.
- Jangan mengubah promo umum menjadi pencarian kata filler dari kalimat pelanggan.
- Jangan menerima nama produk LLM yang tidak grounded atau mengganti produk dengan item populer lain.
- Jangan mengubah response shape `products` yang dipakai frontend.

### Important Files

- `api/ask.js`
- `lib/chatbot/responsePresentation.js`
- `tests/askRouting.test.js`

### Verification

- Bukti lokal 2026-10-06: full suite lulus, answer-coverage replay 9/9 turn (59,4% menjadi 88,9%), dan benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Benchmark LLM shadow belum berjalan karena token Vercel CLI lokal tidak valid; active-LLM endpoint regression dengan provider mock lulus.
- Bukti production 2026-10-06: pengguna mengonfirmasi smoke manual Harga/Promo lulus 5/5.

## LLM-Grounded Stock Availability

### Status

STABLE (local endpoint regression scope)

### Function

Membedakan cek stok produk tertentu, daftar produk ready, dan kebijakan stok umum melalui structured understanding, sementara status serta jumlah stok tetap berasal dari WooCommerce.

### Correct Behavior

- Goal `stock` dengan `product_names` kosong dan `requires_product: false` berarti pelanggan meminta daftar produk ready dari katalog.
- Goal `stock_policy` berarti pelanggan menanyakan kebijakan umum seperti apakah semua barang selalu ready atau tersedia melalui PO.
- Produk bernama tetap memakai Product Grounding dan hanya menampilkan status/jumlah stok produk yang cocok.
- Permintaan katalog bernama seperti `tampilkan Voltes yang tersedia` tetap `product_discovery`, bukan cek jumlah stok.
- Rule lokal stok, structured action, restock, produk fokus, dan fallback tanpa LLM tetap dipertahankan.

### Do Not Break

- Jangan memakai LLM sebagai sumber status stok, jumlah unit, mode PO, atau jadwal restock.
- Jangan mengubah pencarian seri/kategori menjadi `stock_availability` hanya karena memuat kata `tersedia`.
- Jangan meminta nama produk lagi ketika structured understanding tepercaya sudah menyatakan permintaan daftar ready global.
- Jangan mengganti produk yang tidak ditemukan dengan produk ready atau populer lain.

### Important Files

- `api/ask.js`
- `lib/chatbot/semanticRouter.js`
- `lib/chatbot/llmAssistant.js`
- `lib/chatbot/storePolicy.js`
- `tests/askRouting.test.js`
- `tests/llmAssistant.test.js`
- `tests/semanticRouter.test.js`

### Verification

- Bukti lokal 2026-10-06: full suite lulus, answer-coverage replay 9/9 turn (59,4% menjadi 88,9%), dan benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Active-LLM endpoint regression membuktikan daftar ready global, kebijakan stok informal, dan guard pencarian katalog bernama.
- Smoke production pertama menemukan Groq salah membaca `yg bisa lngs dibungkus ada apa aja` sebagai pencarian produk. Koreksi prompt, normalisasi singkatan, dan guard konflik sudah lulus regression lokal dengan output provider production yang sama; redeploy dan smoke ulang masih diperlukan.

## Multi-turn Product Continuity

### Status

STABLE (local resolver, endpoint regression, dan production smoke scope)

### Function

Mempertahankan objek produk yang benar ketika pelanggan melanjutkan percakapan dengan bahasa singkat, sambil tetap membedakan follow-up dari produk atau topik baru.

### Correct Behavior

- Follow-up fakta seperti `masih ready gak?`, `ada diskon gak?`, `ada fotonya?`, `lengkap gak?`, dan `full die-cast nggak?` memakai produk fokus terakhir.
- Kata `keduanya` dan `dua-duanya` merujuk ke dua produk terakhir hanya jika kandidatnya tepat dua.
- Pilihan ordinal seperti `yang kedua` tetap merujuk ke urutan produk sebelumnya.
- Nama produk baru yang disebut eksplisit mengganti fokus lama dan menjadi konteks untuk follow-up berikutnya.
- Pertanyaan katalog umum seperti `ada promo apa aja?` dan `semua yang ready apa aja?` tidak dipersempit ke produk fokus.

### Do Not Break

- Jangan mewarisi produk lama ketika pelanggan menyebut produk baru.
- Jangan menebak arti `keduanya` ketika konteks memuat lebih dari dua produk.
- Jangan mengubah pertanyaan promo, harga, foto, atau detail menjadi pencarian ketersediaan katalog hanya karena memakai kata `ada`.
- Jangan mengubah response shape produk yang dipakai renderer frontend.

### Important Files

- `lib/chatbot/conversationGoal.js`
- `lib/chatbot/questionUnderstanding.js`
- `lib/chatbot/productSearch.js`
- `api/ask.js`
- `tests/conversationGoal.test.js`
- `tests/askRouting.test.js`
- `scripts/smoke-ask.js`

### Verification

- Bukti lokal 2026-10-06: 403/403 test lulus.
- Answer-coverage replay lulus 9/9 turn.
- Benchmark pelanggan lulus 26/26 turn dengan 135 assertion (100%).
- Run production pertama lulus 8/9; satu konflik intent compare-versus-stock kemudian diperbaiki. Keputusan semantic LLM yang terkunci kini mengalahkan inferensi compare dari turn sebelumnya, sementara kata eksplisit `bandingkan`/`versus` tetap masuk jalur compare.
- Rerun production setelah deploy lulus 9/9, termasuk `context_pair_stock_followup` yang sebelumnya gagal.
- Inspeksi payload pada run tersebut menemukan false positive: follow-up promo produk fokus masih membawa tiga produk. Jalur promo sudah diperbaiki dan gate kini menetapkan `maxProducts: 1`.
- Rerun berikutnya tertahan oleh HTTP 508 `Insufficient Resource` dari WooCommerce. Log membuktikan semantic intent sudah benar sebelum fetch katalog gagal, sehingga hasil tersebut diklasifikasikan sebagai dependency unavailable dan bukan regression chatbot.
- Runner `benchmark:context` memberi jeda default 8 detik antarkasus serta berhenti lebih awal ketika katalog sementara tidak tersedia; operator dapat mengubah jeda dengan `--delay-ms`.
- Setelah dependency pulih, pengguna mengonfirmasi rerun gate production ketat lulus 9/9 pada 2026-10-06.
- Smoke manual production juga lulus 3/3 untuk produk fokus -> stok, perbandingan dua produk -> `keduanya` stok, dan produk fokus -> promo tanpa melebar ke katalog global.

## Transaction Continuity

### Status

STABLE (local regression dan seven-case production smoke scope)

### Function

Mempertahankan alur transaksi multi-turn ketika pelanggan melengkapi lokasi ongkir atau berpindah secara eksplisit ke pembayaran, retur, produk, maupun pengiriman internasional.

### Correct Behavior

- Ongkir domestik menerima kota dan kecamatan sekaligus maupun alur tiga langkah kota -> kabupaten/kota -> kecamatan.
- Pending ongkir tidak menahan pelanggan yang jelas berpindah ke metode pembayaran, retur, atau pertanyaan produk.
- Facet transaksi terstruktur dari LLM yang sudah divalidasi diteruskan ke builder kebijakan; detektor kata lokal tetap menjadi fallback.
- Pengiriman internasional diarahkan ke Admin Robot Jadul tanpa mengarang tarif, kurir, total, atau bea masuk.
- Pertanyaan ongkir majemuk mempertahankan kebutuhan asuransi dan packing sambil meminta lokasi yang masih kurang.

### Do Not Break

- Jangan membuang facet LLM yang sudah divalidasi hanya karena susunan kata pelanggan tidak cocok dengan pola lokal.
- Jangan meneruskan pending ongkir setelah pelanggan menyatakan intent baru dengan jelas.
- Jangan menghitung ongkir internasional memakai endpoint domestik atau mengarang biayanya.
- Jangan mengubah kebijakan toko menjadi fakta buatan LLM.

### Important Files

- `api/ask.js`
- `lib/chatbot/transactionIntent.js`
- `lib/chatbot/pendingContext.js`
- `scripts/smoke-ask.js`
- `tests/transactionIntent.test.js`
- `tests/askRouting.test.js`

### Verification

- Bukti lokal 2026-10-06: targeted 12/12, full suite 403/403, coverage replay 9/9, dan benchmark pelanggan 26/26 turn dengan 135 assertion (100%).
- Production gate pertama lulus 6/7 dan menemukan facet `payment_methods` tidak sampai ke builder kebijakan.
- Setelah fix dan deploy, pengguna mengonfirmasi production gate lulus 7/7 pada 2026-10-06.

## Product Restock Schedule

### Status

STABLE (timer per-product, local regression, dan read-only live metadata scope)

### Function

Menjawab jadwal restock dari metadata WPC Product Timer tanpa meminta LLM menebak tanggal atau jam.

### Correct Behavior

- Pertanyaan restock tetap memakai intent `stock_availability`.
- Pertanyaan umum seperti `kapan robot-robot restock?` menampilkan semua produk dengan jadwal mendatang, diurutkan dari waktu paling dekat.
- Pertanyaan umum tanpa nama produk tetap dikenali meskipun memakai filler percakapan/waktu, misalnya `kapan restock sih udah nunggu lama nih?`, `kapan restock barang emang`, atau `dari kemarin nunggu kapan restock sih`.
- Pertanyaan yang menyebut satu produk hanya menjawab produk tersebut.
- Hanya aksi `set_instock` dengan `date_time_after` yang pasti dan berlaku bagi storefront yang boleh ditampilkan.
- Jadwal lampau tidak ditampilkan sebagai jadwal mendatang.
- Produk tanpa jadwal terverifikasi tidak diberi tanggal perkiraan dan diarahkan ke admin.
- Jawaban restock yang sudah dibangun dari metadata WooCommerce tidak memanggil answer composer Groq, Gemini, atau Mistral.

### Do Not Break

- Jangan menyamakan timer `set_outofstock`, timer role admin, atau kondisi berulang/majemuk yang belum dapat dihitung pasti sebagai jadwal restock.
- Jangan membiarkan nama produk yang mengandung kata `restock` mengubah pertanyaan katalog umum menjadi pencarian produk spesifik.
- Jangan menganggap filler percakapan sebagai nama produk, tetapi pertahankan nama produk eksplisit/asing yang benar-benar disebut pelanggan sebagai pencarian spesifik.
- Jangan mengubah jalur pertanyaan stok ready/sisa quantity yang sudah stabil.
- Jangan mengklaim Global Timer didukung sebelum tersedia endpoint WordPress yang menggabungkan action global dan per produk.

### Important Files

- `lib/chatbot/restockSchedule.js`
- `lib/chatbot/wooCatalog.js`
- `api/ask.js`
- `tests/restockSchedule.test.js`
- `tests/askRouting.test.js`

### Verification

- `npm test`
- `npm run benchmark:coverage-replay`
- Bukti 2026-09-30: 375/375 test lulus; coverage replay 9/9 turn lulus.
- Audit read-only live: produk ID 4994 menghasilkan jadwal `30 September 2026 pukul 10.24 WIB`.

## Controlled Conversation Actions

### Status

STABLE (structured-action contract scope)

### Function

Menyediakan pilihan klarifikasi dan follow-up yang membawa metadata action/required fields agar klik pelanggan konsisten dengan konteks.

### Correct Behavior

- Pilihan produk membawa object action terstruktur.
- Pending goal dipertahankan setelah pelanggan memilih opsi.
- Perbandingan bertahap menyimpan produk pertama ketika pelanggan meminta dibandingkan dengan `produk lain`, lalu menerima nama produk kedua pada turn berikutnya.
- Referensi ordinal seperti `yang kedua stoknya berapa?` mempertahankan produk pilihan dan memprioritaskan sinyal stok eksplisit di atas kata tanya umum `berapa`.
- Follow-up atribut dengan akhiran `-nya`, seperti `stoknya`, `harganya`, `kondisinya`, atau `bahannya`, merujuk produk fokus terakhir hanya bila tidak ada nama produk baru atau produk halaman.
- Nama produk baru dan konteks halaman produk mengalahkan produk fokus lama; intent baru seperti restock tetap dapat memutus rekomendasi sebelumnya.
- Saran lama dihapus saat pelanggan mengirim pertanyaan baru.
- Greeting menampilkan enam saran dari pool variatif: empat global dan dua lebih spesifik.
- Follow-up tidak mengulang informasi yang sudah dijawab.

### Do Not Break

- Jangan mengubah structured option menjadi teks tanpa metadata.
- Jangan memaksa pending clarification bila pelanggan mengganti topik.
- Jangan membiarkan produk fokus lama menimpa nama produk eksplisit atau `pageContext` WooCommerce.
- Jangan menghapus konteks produk pertama ketika turn berikutnya memang menjawab permintaan produk kedua untuk perbandingan.
- Jangan menampilkan saran produk/topik stale dari respons lama.

### Important Files

- `lib/chatbot/followUpClosings.js`
- `lib/chatbot/conversationUi.js`
- `lib/chatbot/pendingContext.js`
- `lib/chatbot/conversationGoal.js`
- `lib/chatbot/questionUnderstanding.js`
- `scripts/smoke-ask.js`
- `wordpress-frontend-chatbot/frontend.html`

### Verification

- `npm test`
- `npm run benchmark:context -- --endpoint <endpoint>` setelah deployment.
- Test manual klik pilihan produk, pilihan lokasi, pergantian topik, dan reload history.

## Order Privacy Verification

### Status

STABLE (local logic scope)

### Function

Melindungi status pesanan dengan Order ID dan verifikasi email atau nomor telepon billing.

### Correct Behavior

- Bot tidak mengungkap apakah order ada sebelum verifikasi cocok.
- Email/telepon dibandingkan dengan billing data.
- Informasi sensitif disamarkan dari history.
- Verifikasi dihentikan setelah tiga percobaan gagal.

### Do Not Break

- Jangan memakai hanya Order ID sebagai autentikasi.
- Jangan membedakan pesan error order tidak ada dan verifikasi salah sebelum autentikasi.
- Jangan menyimpan email/telepon mentah di chat history/observability.

### Important Files

- `lib/chatbot/transactionStatus.js`
- `api/ask.js`
- `tests/transactionStatus.test.js`

### Verification

- `npm test`
- Live verification hanya dengan order test yang diizinkan.

## Provider Failure Fallback

### Status

STABLE (fallback control-flow scope)

### Function

Mempertahankan layanan ketika model/provider tertentu timeout, rate limited, atau tidak dikonfigurasi.

### Correct Behavior

- Groq memiliki fallback model untuk semantic router/naturalizer.
- Gemini mencoba model family terkonfigurasi dan memakai cooldown; pool default tidak memuat `gemini-2.5-flash-lite` setelah production API mengembalikan 404 unavailable untuk project ini.
- Pool text Google memuat fallback live-verified `gemini-3.8-flash`, `gemini-3.7-flash`, dan `gemma-4-26b-a4b-it` tanpa menambah batas maksimal tiga percobaan per call; ketiganya tidak ditambahkan ke pool vision.
- Gemini 3.7/3.8 memakai config kompatibel tanpa sampling parameter lama dan dengan thinking rendah. Gemma 4 memakai thinking minimal, tidak meminta structured-output API yang belum terdokumentasi, dan output JSON tetap wajib lolos parser/validator lokal.
- `gemma-4-31b-it` tidak menjadi default karena smoke yang berhasil memerlukan sekitar 115 detik, melebihi batas Vercel 90 detik; model ini hanya boleh diaktifkan kembali setelah smoke latency memenuhi deadline chatbot.
- Mistral menjadi fallback text/vision bila aktif.
- Cloudflare menjadi vision fallback bila aktif.
- Local deterministic understanding tetap tersedia saat provider gagal.
- Intent `greeting` yang sudah memiliki jawaban template final tidak memanggil Groq, Gemini, atau Mistral answer composer; metadata mencatat `provider: template` dan `status: deterministic_intent`.
- Pertanyaan restock juga melewati answer composer karena tanggal, jam, dan daftar produk sudah berupa fakta terstruktur dari WooCommerce.
- Respons dengan teks editable di atas 2.400 karakter mempertahankan payload faktual asli tanpa memanggil naturalizer, untuk menghindari pemborosan quota dan kegagalan JSON akibat batas output.
- Groq `failed_generation` hanya mencoba model Groq cadangan yang memang dikonfigurasi; bila tidak ada yang berhasil, payload asli tetap dikirim tanpa retry lintas provider.

### Do Not Break

- Jangan retry tanpa batas dalam satu request.
- Jangan menganggap provider fallback sebagai izin mengarang fakta.
- Jangan menghapus cooldown/deadline yang melindungi request Vercel.
- Jangan mengaktifkan kembali composer LLM untuk sapaan deterministik karena hanya menambah pemakaian quota dan peluang error provider tanpa menambah fakta.
- Jangan menambahkan model 404 ke pool default; environment Vercel yang menimpa pool harus diaudit terpisah.
- Jangan mengaktifkan `gemma-4-31b-it` sebagai default hanya berdasarkan quota dashboard; bukti runtime latency dan deadline Vercel harus mengalahkan ketersediaan model di daftar akun.

### Important Files

- `lib/chatbot/groq.js`
- `lib/chatbot/gemini.js`
- `lib/chatbot/mistral.js`
- `lib/chatbot/cloudflare.js`
- `lib/chatbot/llmAssistant.js`
- `api/ask-image.js`

### Verification

- `npm test`
- Provider-specific smoke/benchmark dengan credential test dan quota tersedia.
- Bukti lokal 2026-09-15: 365/365 test lulus; smoke Groq Qwen 3.8, Gemini 3.5 Flash-Lite, Cloudflare vision, serta Mistral 8B text/vision lulus.
- Bukti production 2026-09-15: text path Groq GPT-OSS 20B/Qwen 3.8 dan image path Gemini 2.5 Flash berhasil tanpa error.
- Bukti API akun 2026-09-15: seluruh enam ID Gemini pada default pool terdaftar untuk `generateContent`; test setelah sinkronisasi lulus 365/365.
- Bukti lokal 2026-09-16: perbaikan naturalizer lulus 367/367 test dan coverage replay 9/9 turn.
- Bukti lokal 2026-09-30: sapaan deterministik terbukti menghasilkan nol panggilan Groq/Gemini/Mistral; 374/374 test dan coverage replay 9/9 turn lulus.
- Bukti lokal 2026-09-30: kalimat `Dari kemarin nunggu kapan restock sih` menghasilkan daftar restock dan nol panggilan answer composer; pool default bebas `gemini-2.5-flash-lite`; 375/375 test serta replay 9/9 lulus.

## Automated Crawler Guard

### Status

STABLE (identified Meta crawler and local regression scope)

### Function

Mencegah crawler Meta `meta-externalagent` menjalankan pipeline chatbot text dan menghabiskan resource eksternal.

### Correct Behavior

- `POST /api/ask` dengan User-Agent `meta-externalagent` berhenti dengan HTTP 204 sebelum session, Supabase, intent ML, katalog, atau provider LLM dipanggil.
- User-Agent browser pelanggan biasa tetap menjalankan pipeline dan menerima response JSON normal.
- Guard tidak memblokir `facebookexternalhit` atau User-Agent Meta lain yang belum terbukti menjadi sumber burst.

### Do Not Break

- Jangan memblokir semua User-Agent yang memuat kata `facebook` atau `meta` secara umum.
- Jangan mengandalkan session rate limit untuk burst ini karena crawler membuat UUID baru pada hampir setiap request.
- Jangan memindahkan guard setelah load session atau pemanggilan dependency eksternal.

### Important Files

- `api/ask.js`
- `tests/crawlerRequestGuard.test.js`

### Verification

- Bukti production 2026-09-30: 3.386 intent log, 3.372 greeting, dan 3.360 session unik; tiga detail request Vercel menunjukkan `meta-externalagent/1.1` dengan referer `https://fadli.site/`.
- Bukti lokal 2026-09-30: crawler mendapat HTTP 204, Chrome biasa mendapat greeting HTTP 200, dan `npm test` lulus 376/376.
- Bukti production 2026-09-30 pascadeploy: WAF menolak `meta-externalagent/1.1` dengan HTTP 403 sebelum Function; request Chrome biasa tetap HTTP 200 dengan template deterministik.

## WooCommerce Catalog Transport Resilience

### Status

STABLE (local retry-contract scope; production smoke pending)

### Correct Behavior

- Satu kegagalan transport sementara seperti `fetch failed`, connect timeout, socket reset, atau DNS retryable dicoba ulang paling banyak satu kali per halaman katalog.
- HTTP 429 dan 5xx tetap retryable; HTTP 4xx non-transient seperti 401 tidak diulang.
- Jika refresh gagal tetapi instance memiliki cache katalog lama, stale cache tetap dapat dipakai.
- Log menyertakan kode transport bila tersedia tanpa mencetak credential WooCommerce.

### Do Not Break

- Jangan membuat retry tanpa batas atau me-retry semua jenis error.
- Jangan mengubah kegagalan katalog menjadi fakta produk buatan LLM.
- Jangan menghapus stale-cache fallback atau timeout request.

### Important Files

- `lib/chatbot/wooCatalog.js`
- `lib/chatbot/wpApi.js`
- `tests/wooCatalog.test.js`

### Verification

- Bukti lokal 2026-09-30: transient `UND_ERR_CONNECT_TIMEOUT` berhasil pada percobaan kedua, HTTP 401 tetap satu percobaan, dan suite lulus 378/378.
- Bukti lokal/live 2026-09-30: `gemini-3.8-flash`, `gemini-3.7-flash`, dan `gemma-4-26b-a4b-it` menghasilkan JSON valid melalui adapter; regression suite lulus 380/380 dan coverage replay 9/9. `gemma-4-31b-it` tersedia tetapi respons valid memerlukan sekitar 115 detik sehingga dikeluarkan dari default pool.
- Bukti production 2026-10-06: WooCommerce mengembalikan HTTP 508 `Insufficient Resource` pada pengambilan halaman pertama katalog. Ini tetap blocker hosting eksternal; sistem tidak mengubah kegagalan tersebut menjadi fakta stok buatan.

## Statuses Not Yet Baseline-Stable

- LLM-led conversational accuracy end-to-end: WORKING, masih perlu replay/manual test berkelanjutan.
- Product identity/search accuracy untuk seluruh variasi nama/typo: WORKING, bukan klaim sempurna.
- Image-search production readiness: PARTIAL sampai production gate lengkap lulus.
- WordPress frontend responsive/browser behavior: WORKING berdasarkan implementation, belum ada E2E suite.
- Live shipping, Woo order, tracking, dan Supabase persistence: WORKING bila service aktif, belum diverifikasi dalam bootstrap ini.

