# Current Task

## Status

Aktif: perbaikan bertahap integrasi model LLM berdasarkan audit provider 2026-09-15.

## Current Progress

- Tahap 1 selesai secara lokal: migrasi Groq Qwen dari `qwen/qwen3.6-27b` ke `qwen/qwen3.8-27b`.
- Default fallback source, konfigurasi `.env` lokal, dan regression fixture sudah diperbarui.
- Smoke test naturalizer aktual berhasil memakai `qwen/qwen3.8-27b` dengan status `success`.
- Tahap 2 selesai secara lokal: seluruh fallback `gemini-2.5-flash-lite` diganti dengan `gemini-3.5-flash-lite`; wrapper Gemini aktual berhasil.
- Tahap 3 selesai secara lokal: parser Cloudflare menerima `result.response` berbentuk object; smoke test dengan prompt image chatbot aktual berhasil.
- Gemini `gemini-3-flash-preview` sudah dikeluarkan dari default pool karena versi stable `gemini-3.5-flash` telah tersedia dan aktif.
- Tahap 4 selesai secara lokal: Mistral memakai `ministral-8b-2512` dengan fallback `ministral-3b-2512` untuk text dan vision.
- Live structured-text smoke berhasil pada 8B; live vision smoke menghasilkan JSON lengkap dalam 238 completion token.
- Prompt analisis gambar membatasi setiap array maksimal 5 item agar output tidak terpotong dan konsumsi token lebih terkendali.
- Seluruh regression suite lulus 365/365 dan coverage replay terakhir lulus 9/9 turn.
- Environment Vercel production belum diubah atau di-deploy; deployment masih dapat memakai Qwen 3.6 sampai tahap deployment dilakukan.

## Last Completed Task

- Task: menyusun panduan teknis skripsi untuk Intent ML dan alur chatbot end-to-end.
- Tanggal selesai: 2026-09-15.
- Goal: menyediakan referensi sidang/live coding yang menghubungkan frontend, TF-IDF, Logistic Regression, hybrid intent routing, fakta commerce, dan response dengan kutipan source.

## Completed

- Membuat `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md`.
- Mendokumentasikan pipeline training historis TF-IDF + Logistic Regression dan inference model aktif.
- Mendokumentasikan request frontend, normalisasi, hybrid decision, semantic fusion, commerce grounding, coverage, response, dan renderer.
- Menambahkan panduan live coding, pertanyaan penguji, limitation, dan checklist reproducibility.
- Memverifikasi 362 unit/regression tests tetap lulus tanpa perubahan source produksi.

## Findings

- Runtime aktif memakai `intent_model_tfidf_logreg_training_3.joblib`.
- Source training yang tersedia hanya dapat dibuktikan dari Git commit `181d6a8`; script/dataset persis training ketiga tidak tersedia di HEAD.
- Laporan evaluasi tersimpan mencakup 8 kelas, sedangkan kontrak chatbot saat ini memiliki 13 intent.
- Intent ML adalah classifier/routing signal; fakta commerce tetap berasal dari WooCommerce dan API terverifikasi.

## Files Modified

- `README.md`
- `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/CURRENT_TASK.md`
- `docs/CHANGELOG.md`

## Next Steps

1. Sinkronkan environment Vercel, deploy perubahan yang sudah lulus lokal, lalu lakukan smoke test production text dan image.
2. Jalankan image production gate lengkap setelah deployment dan quota provider mencukupi.

## Blockers

- Deployment membutuhkan sinkronisasi environment Vercel dan rilis production.
- `mistral-small-latest` tetap HTTP 429 pada akun ini, tetapi tidak lagi menjadi model aktif lokal karena diganti dengan Ministral 8B dan 3B yang sudah lulus live smoke.
- Reproduksi model training ketiga belum mungkin hanya dari file aktif repository.

## Notes For Next Session

- Panduan membedakan bukti source aktif, riwayat Git, dan penjelasan konsep; pertahankan perbedaan tersebut saat model diperbarui.
- Jangan menyatakan report 8 kelas sebagai evaluasi lengkap kontrak 13 intent.
- Tidak ada source produksi, schema, dependency, atau deployment yang diubah dalam task dokumentasi ini.

