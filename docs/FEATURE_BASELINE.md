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

### Do Not Break

- Jangan menjadikan output LLM sebagai sumber fakta commerce.
- Jangan menghapus safety validator untuk menaikkan composer acceptance.
- Jangan naturalize array `products`, `options`, `steps`, payment methods, atau admin handoff.
- Jangan mengganti pertanyaan promo bersyarat dengan daftar produk diskon biasa.

### Important Files

- `lib/chatbot/llmAssistant.js`
- `lib/chatbot/responseNaturalizer.js`
- `lib/chatbot/answerCoverage.js`
- `lib/chatbot/wooCatalog.js`

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

### Do Not Break

- Jangan mengubah semua frasa nominal menjadi target harga; kata `budget`, batas atas/bawah, dan rentang tetap memakai constraint lama.
- Jangan menerima nominal baru yang hanya muncul dari output LLM dan tidak ada pada pesan atau goal follow-up terverifikasi.
- Jangan melewati guard produk untuk nama produk eksplisit yang tidak tersedia; pengecualian guard hanya berlaku ketika structured understanding tepercaya menyatakan `product_names` kosong.
- Jangan mewariskan konteks rekomendasi ke pertanyaan yang jelas mengganti intent, misalnya `kapan restock ya`.
- Jangan melonggarkan filter stok, kondisi, promo, hadiah, atau metadata produk untuk mengisi jumlah kartu.

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

## Statuses Not Yet Baseline-Stable

- LLM-led conversational accuracy end-to-end: WORKING, masih perlu replay/manual test berkelanjutan.
- Product identity/search accuracy untuk seluruh variasi nama/typo: WORKING, bukan klaim sempurna.
- Image-search production readiness: PARTIAL sampai production gate lengkap lulus.
- WordPress frontend responsive/browser behavior: WORKING berdasarkan implementation, belum ada E2E suite.
- Live shipping, Woo order, tracking, dan Supabase persistence: WORKING bila service aktif, belum diverifikasi dalam bootstrap ini.

