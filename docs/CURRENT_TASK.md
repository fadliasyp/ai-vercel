# Current Task

## Status

Belum ada task aktif. Perbaikan rekomendasi hadiah dengan rentang budget informal sudah selesai dan lulus verifikasi lokal.

## Current Progress

- Tahap 1 selesai secara lokal: migrasi Groq Qwen dari `qwen/qwen3.6-27b` ke `qwen/qwen3.8-27b`.
- Default fallback source, konfigurasi `.env` lokal, dan regression fixture sudah diperbarui.
- Smoke test naturalizer aktual berhasil memakai `qwen/qwen3.8-27b` dengan status `success`.
- Tahap 2 dikoreksi setelah audit ulang API akun: `gemini-2.5-flash-lite` masih valid dan dikembalikan ke fallback bersama `gemini-3.5-flash-lite`; wrapper Gemini aktual berhasil.
- Tahap 3 selesai secara lokal: parser Cloudflare menerima `result.response` berbentuk object; smoke test dengan prompt image chatbot aktual berhasil.
- Label dashboard "Gemini 3 Flash" terdaftar oleh API dengan ID `gemini-3-flash-preview`; ID tersebut dikembalikan ke fallback bersama `gemini-3.5-flash`.
- Tahap 4 selesai secara lokal: Mistral memakai `ministral-8b-2512` dengan fallback `ministral-3b-2512` untuk text dan vision.
- Live structured-text smoke berhasil pada 8B; live vision smoke menghasilkan JSON lengkap dalam 238 completion token.
- Prompt analisis gambar membatasi setiap array maksimal 5 item agar output tidak terpotong dan konsumsi token lebih terkendali.
- Seluruh regression suite lulus 365/365 dan coverage replay terakhir lulus 9/9 turn.
- Environment Vercel sudah disesuaikan dan deployment production sudah dilakukan oleh pengguna.
- Smoke production text berhasil: router `openai/gpt-oss-20b`, composer `qwen/qwen3.8-27b`, `active_accepted`, dan validasi fakta/struktur lulus.
- Smoke production image berhasil: Gemini `gemini-2.5-flash` memproses gambar tanpa provider fallback atau error.
- Audit `models.list` akun mengonfirmasi enam ID text-output yang dipakai pool: `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, dan `gemini-3.5-flash-lite`.
- Regression suite setelah sinkronisasi fallback Gemini lulus 365/365.
- Panduan teknis tahap 8 diperluas untuk menjelaskan tujuan `INTENT_API_URL`, batas proses Node/Python, lokasi inference TF-IDF + Logistic Regression, kontrak request/response, fallback, dan demo lokal.
- Subbagian 8.4 kini menjelaskan bagaimana `joblib.load()`, `named_steps["tfidf"]`, `named_steps["clf"]`, `predict()`, dan `predict_proba()` menjalankan TF-IDF serta Logistic Regression.
- Script `scripts/test-intent-ml-model.py` ditambahkan; mode demo aman lulus dan panduan menjelaskan cara menguji artefak Joblib lokal yang tepercaya.
- Log production menunjukkan respons rekomendasi sekitar 3.100 karakter berulang kali memicu Groq `failed_generation`, sementara jawaban faktual asli tetap lengkap dan berhasil dikirim.
- Naturalizer kini melewati respons di atas 2.400 karakter agar tidak membuang request/token pada output yang berisiko melewati batas 850 completion token; `failed_generation` juga dicatat terpisah dan dapat memakai model Groq cadangan yang memang dikonfigurasi.
- Regression suite setelah perbaikan naturalizer lulus 367/367 dan coverage replay lulus 9/9 turn.
- Pertanyaan buy-one-get-one kini dikenali terpisah dari diskon katalog, termasuk variasi `beli barang1 gratis 1`, `buy 1 get 1`, dan `beli satu dapat satu gratis`.
- Guard berjalan sebelum katalog/pending handler, mengalahkan semantic intent lock `price_promo`, tidak menampilkan produk diskon, dan mengirim jawaban belum terverifikasi beserta `admin_handoff`.
- Regression suite setelah perbaikan promo bersyarat lulus 368/368 dan coverage replay lulus 9/9 turn.
- Parser budget kini menormalkan kata informal `sampe` menjadi `sampai`, sehingga permintaan hadiah dengan rentang seperti `3 juta sampe 6 jutaan` tidak lagi meminta budget ulang.
- Regression end-to-end memastikan permintaan tersebut menghasilkan produk ready non-JUNK pada rentang Rp3.000.000-Rp6.000.000 tanpa melonggarkan filter hadiah.
- Regression suite setelah perbaikan rentang informal tetap lulus 368/368 dan coverage replay lulus 9/9 turn.

## Last Completed Task

- Task: memperbaiki rekomendasi hadiah dengan rentang budget informal `sampe` tanpa mengubah logic rekomendasi yang sudah benar.
- Tanggal selesai: 2026-09-20.
- Goal: membaca rentang harga informal secara deterministik dan tetap mempertahankan filter budget, stok, serta keamanan hadiah.

## Completed

- Membuat `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md`.
- Mendokumentasikan pipeline training historis TF-IDF + Logistic Regression dan inference model aktif.
- Mendokumentasikan request frontend, normalisasi, hybrid decision, semantic fusion, commerce grounding, coverage, response, dan renderer.
- Menambahkan panduan live coding, pertanyaan penguji, limitation, dan checklist reproducibility.
- Memverifikasi 362 unit/regression tests tetap lulus tanpa perubahan source produksi.
- Menambahkan normalisasi `sampe` pada parser budget bersama.
- Menambahkan regression parser dan end-to-end untuk pertanyaan persis dari laporan pengguna.

## Findings

- Runtime aktif memakai `intent_model_tfidf_logreg_training_3.joblib`.
- Source training yang tersedia hanya dapat dibuktikan dari Git commit `181d6a8`; script/dataset persis training ketiga tidak tersedia di HEAD.
- Laporan evaluasi tersimpan mencakup 8 kelas, sedangkan kontrak chatbot saat ini memiliki 13 intent.
- Intent ML adalah classifier/routing signal; fakta commerce tetap berasal dari WooCommerce dan API terverifikasi.

## Files Modified

- `README.md`
- `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md`
- `lib/chatbot/gemini.js`
- `tests/geminiFallback.test.js`
- `lib/chatbot/responseNaturalizer.js`
- `tests/responseNaturalizer.test.js`
- `api/ask.js`
- `lib/chatbot/storePolicy.js`
- `tests/askRouting.test.js`
- `tests/storePolicy.test.js`
- `lib/chatbot/priceIntent.js`
- `tests/priceIntent.test.js`
- `scripts/test-intent-ml-model.py`
- `docs/FEATURE_BASELINE.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/CURRENT_TASK.md`
- `docs/CHANGELOG.md`

## Next Steps

1. Deploy perbaikan parser budget informal bersama perubahan lokal lain yang memang siap dirilis.
2. Ulangi di production: `rekomen dong robot buat hadiah budget nya 3 juta sampe 6 jutaan deh`; hasil yang diharapkan adalah kartu produk ready non-JUNK pada rentang Rp3-Rp6 juta tanpa pertanyaan budget ulang.
3. Ulangi pertanyaan `beli barang1 gratis 1 engga?`; hasil yang diharapkan adalah jawaban belum terverifikasi dengan tombol admin dan tanpa kartu produk diskon.
4. Ulangi pertanyaan rekomendasi panjang yang sebelumnya menghasilkan `failed_generation`; hasil yang diharapkan adalah jawaban asli tetap terkirim tanpa panggilan Qwen naturalizer.
5. Jalankan smoke production dan image production gate lengkap ketika quota provider mencukupi.
6. Siapkan rate limiting, batas upload gambar, dan monitoring quota sebelum uji pengguna ramai.
7. Tambahkan replay dari temuan pengujian pengguna nyata.

## Blockers

- `mistral-small-latest` tetap HTTP 429 pada akun ini, tetapi tidak lagi menjadi model aktif lokal karena diganti dengan Ministral 8B dan 3B yang sudah lulus live smoke.
- Reproduksi model training ketiga belum mungkin hanya dari file aktif repository.

## Notes For Next Session

- Panduan membedakan bukti source aktif, riwayat Git, dan penjelasan konsep; pertahankan perbedaan tersebut saat model diperbarui.
- Jangan menyatakan report 8 kelas sebagai evaluasi lengkap kontrak 13 intent.
- Deployment 2026-09-15 telah diverifikasi melalui satu smoke text dan satu smoke image, tetapi dibuat sebelum sinkronisasi pool Gemini terbaru; fallback production Mistral/Cloudflare belum dipaksa karena primary provider berhasil.

