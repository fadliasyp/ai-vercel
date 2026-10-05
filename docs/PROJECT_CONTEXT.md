# Project Context

## Overview

Robot Jadul AI Chatbot adalah project existing untuk pelayanan pelanggan toko koleksi Robot Jadul. UI chatbot tertanam pada WordPress, sedangkan orkestrasi pertanyaan berjalan di Vercel Functions. Sistem menggabungkan pemahaman LLM dengan rule deterministik dan API commerce agar bahasa tetap natural tanpa mengarang fakta.

## Purpose And Target Users

- Membantu calon pembeli/pelanggan menemukan informasi produk dan toko lebih cepat.
- Menjawab pertanyaan tunggal, majemuk, follow-up, typo, dan pergantian topik dalam bahasa Indonesia.
- Target user utama: pengunjung dan pelanggan situs Robot Jadul.
- Target operator: pemilik/developer toko yang memelihara katalog WooCommerce dan chatbot.

## Current Status

Status project: **aktif dikembangkan**.

- Core text pipeline: WORKING, dengan unit/regression suite lulus pada 2026-09-01.
- LLM-led understanding/composer: WORKING dan mendukung mode `legacy`, `shadow`, `active`; akurasi percakapan dinamis tetap perlu benchmark dan pengujian manual.
- Product/image search: PARTIAL untuk kesiapan production; pipeline tersedia tetapi quality gate visual harus tetap dipenuhi.
- Integrasi transaksi/ongkir/tracking: WORKING di source, tetapi hasil live bergantung API, credential, dan data eksternal.
- Observability/feedback: WORKING bila tabel Supabase sudah diterapkan dan environment tersedia.

## Completed Capabilities

- Semantic intent routing dan structured understanding dengan Groq, fallback Gemini/Mistral, lalu fallback lokal.
- Intent lock pada mode LLM-led active dengan pengecualian untuk pending state dan structured action tepercaya.
- Pemecahan pertanyaan majemuk, answer planner, coverage validator, dan auto-repair.
- Context/pending state untuk follow-up, klarifikasi produk, lokasi pengiriman, status pesanan, dan pergantian topik.
- Normalisasi bahasa Indonesia, variasi ejaan, typo fallback, dan analisis bentuk kata.
- Pencarian katalog, detail, harga/promo, stok, rekomendasi, dan perbandingan WooCommerce.
- Jadwal restock per produk dari metadata WPC Product Timer, termasuk daftar semua restock mendatang dan pencarian satu produk.
- Strength/caveat rekomendasi serta perbandingan dapat memakai deskripsi produk WooCommerce.
- Rekomendasi membedakan target harga seperti `harga 7 jutaan` dan `rekomen robot 19 jutaan` dari batas budget; target harga hanya menerima kandidat dalam toleransi 20%, sedangkan batas/rentang tetap menjadi filter keras. Frasa `budget sekitar/kisaran X` memakai X sebagai target sekaligus batas maksimum.
- Goal rekomendasi aktif melengkapi follow-up nominal singkat maupun berbungkus percakapan: `yg 3 jutaan` dan `Kalau yang 6 jutaan ada apa aja?` menjadi target harga baru, sedangkan `3 juta` menjadi batas budget; pergantian intent eksplisit tetap tidak diwarisi.
- Produk fokus mendukung follow-up atribut alami seperti `stoknya`, `harganya`, `kondisinya`, dan `bahannya`; nama produk eksplisit serta produk halaman tetap memiliki prioritas lebih tinggi.
- Kebijakan pembayaran, COD, packing, asuransi, retur/refund, jam/lokasi toko, dan pengiriman internasional.
- Ongkir domestik melalui endpoint WordPress custom dengan pemilihan kota/kecamatan.
- Verifikasi status pesanan dengan Order ID plus email/telepon billing.
- Pelacakan resi melalui Biteship.
- How-to-buy dari halaman WordPress dan renderer langkah bergambar.
- Pencarian produk via foto dengan Visual Index v2 dan rerank Gemini/Mistral/Cloudflare.
- Saran pertanyaan terstruktur, opsi klarifikasi, feedback, dan WhatsApp admin handoff.
- Session frontend persisten, Markdown ter-sanitasi, upload/kompresi gambar, dan viewport mobile.
- Observability intent/provider/coverage dan conversation replay benchmarks.
- Request text dari crawler `meta-externalagent` dihentikan sebelum session, Supabase, intent ML, katalog, atau provider LLM dipanggil.

## Business Logic

- LLM tidak menjadi sumber kebenaran harga, stok, promo, dimensi, order, ongkir, atau kebijakan.
- Katalog WooCommerce adalah sumber fakta produk. Data shipping/order/tracking berasal dari API masing-masing.
- Jika produk ambigu, sistem harus menawarkan pilihan dan mempertahankan semua kebutuhan pelanggan setelah pilihan dipilih.
- Nama produk baru pada pertanyaan pelanggan harus mengalahkan stale context dari produk sebelumnya.
- Jika data katalog tidak tersedia, bot harus menyatakan keterbatasan atau meminta klarifikasi, bukan mengganti produk diam-diam.
- Tanggal restock hanya boleh berasal dari aksi `set_instock` WPC Product Timer yang memiliki waktu pasti dan berlaku bagi pengunjung; jadwal yang tidak tersedia diarahkan ke admin.
- Pertanyaan majemuk harus melacak semua facet yang diminta; facet tidak tersedia diklarifikasi secara spesifik.
- Pengiriman internasional tidak dihitung dengan tarif domestik dan diarahkan ke admin untuk konfirmasi kurir, packing, serta biaya.
- Status order tidak boleh diungkap sebelum email/telepon billing cocok. Verifikasi dihentikan setelah tiga kegagalan.
- Saran pertanyaan harus relevan, tidak menduplikasi informasi yang sudah dijawab, dan tidak mengunci pelanggan pada topik lama.

## Technical Facts

- Node.js ESM, Vercel Functions, native `fetch`, dan native Node tests.
- Intent ML production memakai artefak 13 intent `intent_model_tfidf_logreg_training_13.joblib`: FeatureUnion TF-IDF kata/karakter dan Logistic Regression, disertai metadata/checksum serta dependency terpin di repository `intent-ml-api`.
- Tidak ada ORM atau framework backend tambahan.
- Woo catalog memakai pagination, satu retry terbatas untuk kegagalan transport sementara/429/5xx, cache memory, dan stale fallback.
- Metadata `woopt_actions` dinormalisasi oleh `restockSchedule.js`; waktu plugin dibaca sebagai waktu toko `Asia/Jakarta`/WIB dan jadwal lampau tidak ditampilkan sebagai restock mendatang.
- Session memiliki fallback memory per instance dan persistensi opsional ke tabel Supabase `chat_sessions`.
- Browser menyimpan history teredaksi di local/session storage.
- Visual index disimpan sebagai JSON repository dan dapat dibangun ulang melalui script.
- `vercel.json` memasang CORS wildcard untuk route API.
- CI/CD configuration tidak ditemukan.

## External Services

| Service | Purpose | Main files |
| --- | --- | --- |
| WordPress/WooCommerce | Katalog, order, konten how-to-buy | `wooCatalog.js`, `transactionStatus.js`, `howToBuy.js` |
| Custom WordPress shipping API | Kota, kecamatan, tarif ongkir | `shippingApi.js`, `shippingLocation.js` |
| Supabase | Session, metrics, feedback | `sessionStore.js`, `observability.js`, `api/feedback.js` |
| Groq | Semantic router dan response composer | `groq.js`, `responseNaturalizer.js` |
| Google Gemini/Gemma | Semantic fallback, composer fallback, vision Gemini | `gemini.js`, `ask-image.js` |
| Mistral | Text/vision fallback | `mistral.js` |
| Cloudflare Workers AI | Vision fallback | `cloudflare.js` |
| Biteship | Public shipment tracking | `tracking.js` |
| WhatsApp | Admin handoff | `storePolicy.js`, frontend |

## Important Constraints

- Vercel request duration dan provider timeout membatasi jumlah call LLM/API per turn.
- Provider quota/rate limit dapat membuat jalur fallback aktif dan mengubah latency.
- Default text pool Google menambahkan `gemini-3.8-flash`, `gemini-3.7-flash`, dan `gemma-4-26b-a4b-it` dengan config per-model, cooldown, dan maksimum tiga percobaan per call. `gemma-4-31b-it` tidak default karena smoke valid sekitar 115 detik melebihi deadline Vercel.
- Audit dan perbaikan 2026-09-15 memigrasikan Groq Qwen, Gemini Flash-Lite, dan Mistral ke model yang lulus live smoke serta memperbaiki parser Cloudflare; perubahan sudah di-deploy dan primary text/image paths terverifikasi di production.
- Cache/session memory serverless tidak dijamin bertahan antar-instance; Supabase dibutuhkan untuk persistensi lintas instance.
- Live catalog dan shipping quality bergantung data WordPress serta endpoint custom.
- Visual accuracy tidak boleh disimpulkan hanya dari gambar katalog yang sama dengan visual index.
- Jangan memindahkan fakta commerce ke prompt statis atau membiarkan composer mengubah structured payload.

## Known Issues And Technical Debt

- `api/ask.js` masih merupakan orkestrator besar. Refactor sebelumnya sudah memindahkan modul, tetapi pembagian lebih lanjut harus berbasis kebutuhan dan regression test.
- `api/ask-backup3.js`, `api/asal.text`, dan beberapa log adalah artefak lama; status retensinya perlu dikonfirmasi sebelum penghapusan.
- SQL untuk tabel `chat_sessions` tidak tersedia di repository, walaupun tabel digunakan source.
- RLS diaktifkan untuk observability/feedback, tetapi policy SQL tidak tersedia di repository.
- CORS wildcard memperluas akses endpoint dan perlu threat assessment sebelum hardening.
- `api/ask.js` masih mencetak nilai URL Supabase ke log; nilai key tidak dicetak, tetapi logging konfigurasi perlu ditinjau pada task security khusus.
- Image search pernah belum memenuhi production gate pada benchmark manual; hasil terkini harus diuji ulang dengan dataset minimum lengkap.
- Tidak ada browser/E2E test yang ditemukan untuk frontend WordPress.
- Global Timer WPC Product Timer disimpan sebagai option WordPress dan belum tersedia melalui metadata produk WooCommerce; dukungan saat ini hanya untuk timer per produk dengan kondisi waktu pasti `date_time_after`.

## Pending Work

- Deploy sinkronisasi pool Gemini terbaru yang sudah lulus regression suite lokal.
- Pengujian manual percakapan dinamis lanjutan pada deployment aktif.
- Menambah dan menjaga dataset replay dari bug pelanggan nyata.
- Menjalankan image production gate dengan minimal 30 positif, 5 negatif, 10 internet, dan 10 crop.
- Mengonfirmasi/mendokumentasikan schema `chat_sessions` yang benar.
- Menentukan kebutuhan CORS/API abuse protection dan CI/CD.

## Things We Must Not Break

- Fakta produk harus berasal dari katalog yang cocok dengan objek pertanyaan.
- Seluruh poin pertanyaan majemuk harus dipertahankan sampai terjawab/diklarifikasi.
- Structured product/options/steps dan protected facts tidak boleh diubah composer.
- Pelanggan bebas mengganti topik saat pending clarification.
- Privasi verifikasi order dan redaksi PII.
- Fallback provider dan local rules saat LLM gagal/limit.
- Saran pertanyaan harus kontekstual dan tidak mengulangi jawaban.
- How-to-buy harus tetap merender step khusus, bukan paragraf generik.

## Important Files

- `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md`: panduan end-to-end TF-IDF, Logistic Regression, intent fusion, fakta commerce, response, dan persiapan live coding.
- `api/ask.js`: orchestration utama.
- `api/ask-image.js`: image search pipeline.
- `lib/chatbot/llmAssistant.js`: LLM-led tool plan dan composer orchestration.
- `lib/chatbot/semanticRouter.js`: structured understanding contract.
- `lib/chatbot/answerCoverage.js`: coverage evaluator/repair.
- `lib/chatbot/productSearch.js`, `productRanking.js`, `productRecommendation.js`: product logic.
- `lib/chatbot/restockSchedule.js`: parser, penyaring, pengurutan, dan format jadwal WPC Product Timer.
- `lib/chatbot/followUpClosings.js`: controlled follow-up suggestions.
- `wordpress-frontend-chatbot/frontend.html`: browser integration.
- `data/product-visual-index.json`: visual catalog index.
- `tests/`: regression protection.

## Latest Verification

Pada 2026-09-15:

- `npm test`: 365 test lulus.
- `npm run benchmark:coverage-replay`: 9/9 turn lulus; coverage 59,4% menjadi 88,9%; 1 facet unresolved.
- Live provider smoke berhasil untuk Groq `qwen/qwen3.8-27b`, Gemini `gemini-3.5-flash-lite`, dan Cloudflare vision dengan prompt image chatbot.
- Live structured-text dan vision smoke berhasil pada Mistral `ministral-8b-2512`; `ministral-3b-2512` juga terverifikasi aktif sebagai fallback.
- Production text smoke: HTTP 200, Groq router `openai/gpt-oss-20b`, composer `qwen/qwen3.8-27b`, status `active_accepted`.
- Production image smoke: HTTP 200, analisis Gemini `gemini-2.5-flash`, tanpa fallback provider.
- Live Gemini `models.list` audit mengonfirmasi enam ID pool text-output: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, dan `gemini-3.5-flash-lite`; regression suite sesudah sinkronisasi lulus 365/365.
- Image production gate lengkap belum dijalankan.

Pada 2026-09-16:

- Respons naturalizer di atas 2.400 karakter dilewati untuk menghindari Groq `failed_generation` berulang dan menghemat request/token; jawaban faktual asli tetap dikirim.
- `failed_generation` dikenali terpisah dan hanya memakai fallback Groq yang dikonfigurasi, tanpa retry lintas provider.
- `npm test`: 367 test lulus; coverage replay: 9/9 turn lulus.
- Guard buy-one-get-one mencegah pertanyaan `beli 1 gratis 1` diarahkan ke daftar produk diskon; jawaban menyatakan informasi belum terverifikasi dan menyediakan admin handoff.
- `npm test`: 368 test lulus; coverage replay tetap 9/9 turn lulus setelah perbaikan promo bersyarat.

Pada 2026-09-20:

- Rentang budget informal dengan kata `sampe` dinormalisasi oleh parser harga bersama; pertanyaan rekomendasi hadiah `3 juta sampe 6 jutaan` kini langsung menghasilkan produk pada rentang tersebut.
- Filter hadiah tetap menolak produk JUNK dan tidak mengendurkan batas budget atau status stok.
- `npm test`: 368 test lulus; coverage replay: 9/9 turn lulus, coverage 59,4% menjadi 88,9%.
- Audit production mengonfirmasi parser dan constraint sudah benar, lalu menemukan false positive kondisi: frasa katalog `bukan barang JUNK` dibaca sebagai JUNK sehingga seluruh kandidat hadiah terhapus.
- Deteksi JUNK kini peka terhadap negasi dan tetap menolak penanda JUNK aktual; validasi katalog publik menghasilkan 17 kandidat hadiah ready dari 18 produk pada rentang Rp4-Rp12 juta.
- `npm test`: 369 test lulus; coverage replay tetap 9/9 turn lulus setelah perbaikan negasi kondisi.
- Perbandingan dua turn kini mengenali `produk lain` sebagai placeholder, menyimpan produk pertama, dan menggabungkan jawaban seperti `bandingkan dengan [Produk B]` tanpa kehilangan konteks.
- Regression suite tetap 369/369 dan coverage replay 9/9 turn lulus setelah perbaikan follow-up perbandingan.

Pada 2026-09-30:

- Pertanyaan umum seperti `kapan robot-robot restock?` menampilkan semua produk dengan jadwal restock mendatang secara berurutan.
- Pertanyaan spesifik hanya menampilkan jadwal produk yang cocok; produk tanpa jadwal terverifikasi menghasilkan jawaban jujur dan admin handoff.
- Pertanyaan restock umum dengan filler percakapan tidak lagi dianggap sebagai nama produk, sementara nama produk eksplisit yang tidak ditemukan tetap mendapat respons no-match.
- Audit read-only katalog live menemukan metadata `woopt_actions` produk ID 4994 dan parser menampilkan `30 September 2026 pukul 10.24 WIB`.
- `npm test`: 373/373 test lulus; coverage replay tetap 9/9 turn dengan coverage 59,4% menjadi 88,9%.
- Log production menunjukkan sapaan `halo` masih memasuki answer composer saat Groq sudah mencapai batas token harian, lalu mencoba Gemini dan Mistral meskipun respons template sudah memadai.
- Answer composer kini melewati seluruh provider untuk intent `greeting`; regression membuktikan nol panggilan Groq/Gemini/Mistral, sementara fallback intent lain tetap utuh.
- `npm test`: 374/374 test lulus; coverage replay tetap 9/9 turn dengan coverage 59,4% menjadi 88,9%.
- Kalimat `Dari kemarin nunggu kapan restock sih` kini diklasifikasikan sebagai restock umum; kata waktu `dari kemarin` tidak lagi dianggap nama produk.
- Respons restock melewati answer composer karena jadwal sudah dibangun dari metadata WooCommerce. Ini menghindari Groq/Gemini/Mistral error pada tahap penyuntingan tanpa mengurangi fakta jawaban.
- Production API mengembalikan 404 untuk `gemini-2.5-flash-lite`; model tersebut dikeluarkan dari pool default. Override `GEMINI_*_MODEL(S)` pada Vercel tetap harus bebas dari ID tersebut.
- `npm test`: 375/375 test lulus; coverage replay tetap 9/9 turn dengan coverage 59,4% menjadi 88,9%.
- Audit read-only `intent_logs` menemukan 3.386 request pada hari yang sama: 3.372 greeting dan 3.360 session unik. Detail request Vercel mengidentifikasi sumber burst sebagai crawler Meta `meta-externalagent/1.1`, bukan pertanyaan manual pelanggan.
- `/api/ask` kini mengembalikan HTTP 204 untuk `meta-externalagent` sebelum memuat session atau memanggil dependency eksternal. Browser pelanggan biasa tetap menerima greeting HTTP 200.
- `npm test`: 376/376 test lulus setelah crawler guard.
- Smoke production pascadeploy: WAF mengembalikan HTTP 403 untuk `meta-externalagent/1.1`; Chrome biasa tetap menerima greeting HTTP 200 dari template deterministik.
- Log satu pertanyaan restock membuktikan semantic routing berhasil, tetapi fetch katalog gagal sebelum menerima status HTTP dengan `TypeError: fetch failed`; ini bukan kegagalan Groq/Gemini atau klasifikasi restock.
- Fetch katalog kini mencoba ulang satu kali untuk kegagalan transport sementara dan mencatat kode penyebab; HTTP 4xx non-transient tidak diulang.
- `npm test`: 378/378 test lulus setelah perbaikan ketahanan katalog.
- `npm test`: 380/380 test lulus setelah ekspansi fallback text Google; coverage replay tetap 9/9 turn.
- Live adapter smoke: `gemini-3.8-flash`, `gemini-3.7-flash`, dan `gemma-4-26b-a4b-it` menghasilkan JSON valid. `gemma-4-31b-it` terbukti tersedia, tetapi konfigurasi yang berhasil memerlukan sekitar 115 detik dan tidak aman sebagai default untuk fungsi 90 detik.

## Session Handoff

Bootstrap memory project telah selesai. Tidak ada task implementasi aktif. Session berikutnya harus membaca `AGENTS.md`, context ini, `CURRENT_TASK.md`, dan `FEATURE_BASELINE.md` sebelum mengubah source.

