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
- Tahap 4 didiagnosis: `mistral-small-latest` valid, tetapi request tetap HTTP 429 `rate_limited` code `1300` tanpa header reset.
- Seluruh regression suite lulus 364/364 dan coverage replay lulus 9/9 turn.
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

1. Periksa Admin Panel Mistral pada API > Limits dan Subscriptions > Billing; standard API key tidak dapat membaca Admin API.
2. Sinkronkan environment Vercel, deploy perubahan yang sudah lulus lokal, lalu lakukan smoke test production text dan image.

## Blockers

- Deployment membutuhkan sinkronisasi environment Vercel dan rilis production.
- Mistral mengembalikan HTTP 429 untuk text dan vision; limit/billing akun harus diperiksa oleh pemilik akun atau dengan Admin API key.
- Reproduksi model training ketiga belum mungkin hanya dari file aktif repository.

## Notes For Next Session

- Panduan membedakan bukti source aktif, riwayat Git, dan penjelasan konsep; pertahankan perbedaan tersebut saat model diperbarui.
- Jangan menyatakan report 8 kelas sebagai evaluasi lengkap kontrak 13 intent.
- Tidak ada source produksi, schema, dependency, atau deployment yang diubah dalam task dokumentasi ini.

