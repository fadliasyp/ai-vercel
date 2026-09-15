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
- Strength/caveat rekomendasi serta perbandingan dapat memakai deskripsi produk WooCommerce.
- Kebijakan pembayaran, COD, packing, asuransi, retur/refund, jam/lokasi toko, dan pengiriman internasional.
- Ongkir domestik melalui endpoint WordPress custom dengan pemilihan kota/kecamatan.
- Verifikasi status pesanan dengan Order ID plus email/telepon billing.
- Pelacakan resi melalui Biteship.
- How-to-buy dari halaman WordPress dan renderer langkah bergambar.
- Pencarian produk via foto dengan Visual Index v2 dan rerank Gemini/Mistral/Cloudflare.
- Saran pertanyaan terstruktur, opsi klarifikasi, feedback, dan WhatsApp admin handoff.
- Session frontend persisten, Markdown ter-sanitasi, upload/kompresi gambar, dan viewport mobile.
- Observability intent/provider/coverage dan conversation replay benchmarks.

## Business Logic

- LLM tidak menjadi sumber kebenaran harga, stok, promo, dimensi, order, ongkir, atau kebijakan.
- Katalog WooCommerce adalah sumber fakta produk. Data shipping/order/tracking berasal dari API masing-masing.
- Jika produk ambigu, sistem harus menawarkan pilihan dan mempertahankan semua kebutuhan pelanggan setelah pilihan dipilih.
- Nama produk baru pada pertanyaan pelanggan harus mengalahkan stale context dari produk sebelumnya.
- Jika data katalog tidak tersedia, bot harus menyatakan keterbatasan atau meminta klarifikasi, bukan mengganti produk diam-diam.
- Pertanyaan majemuk harus melacak semua facet yang diminta; facet tidak tersedia diklarifikasi secara spesifik.
- Pengiriman internasional tidak dihitung dengan tarif domestik dan diarahkan ke admin untuk konfirmasi kurir, packing, serta biaya.
- Status order tidak boleh diungkap sebelum email/telepon billing cocok. Verifikasi dihentikan setelah tiga kegagalan.
- Saran pertanyaan harus relevan, tidak menduplikasi informasi yang sudah dijawab, dan tidak mengunci pelanggan pada topik lama.

## Technical Facts

- Node.js ESM, Vercel Functions, native `fetch`, dan native Node tests.
- Tidak ada ORM atau framework backend tambahan.
- Woo catalog memakai pagination dan cache memory dengan stale fallback.
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
| Gemini | Semantic fallback, composer fallback, vision | `gemini.js`, `ask-image.js` |
| Mistral | Text/vision fallback | `mistral.js` |
| Cloudflare Workers AI | Vision fallback | `cloudflare.js` |
| Biteship | Public shipment tracking | `tracking.js` |
| WhatsApp | Admin handoff | `storePolicy.js`, frontend |

## Important Constraints

- Vercel request duration dan provider timeout membatasi jumlah call LLM/API per turn.
- Provider quota/rate limit dapat membuat jalur fallback aktif dan mengubah latency.
- Audit 2026-09-15 menemukan Mistral mengembalikan HTTP 429 untuk text/vision; Groq Qwen dan Gemini Flash-Lite migrations serta parser Cloudflare sudah diperbaiki lokal tetapi belum di-deploy.
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

## Pending Work

- Pengujian manual percakapan dinamis setelah deployment aktif.
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
- `lib/chatbot/followUpClosings.js`: controlled follow-up suggestions.
- `wordpress-frontend-chatbot/frontend.html`: browser integration.
- `data/product-visual-index.json`: visual catalog index.
- `tests/`: regression protection.

## Latest Verification

Pada 2026-09-15:

- `npm test`: 364 test lulus.
- `npm run benchmark:coverage-replay`: 9/9 turn lulus; coverage 59,4% menjadi 88,9%; 1 facet unresolved.
- Live provider smoke berhasil untuk Groq `qwen/qwen3.8-27b`, Gemini `gemini-3.5-flash-lite`, dan Cloudflare vision dengan prompt image chatbot.
- Mistral live smoke belum lulus karena HTTP 429 account rate limit.
- Image production gate lengkap belum dijalankan.

## Session Handoff

Bootstrap memory project telah selesai. Tidak ada task implementasi aktif. Session berikutnya harus membaca `AGENTS.md`, context ini, `CURRENT_TASK.md`, dan `FEATURE_BASELINE.md` sebelum mengubah source.

