# Current Task

## Status

Belum ada task aktif.

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

Menunggu instruksi pengguna. Peningkatan akademik yang disarankan, tetapi belum dikerjakan, adalah memulihkan source/dataset training ketiga, mem-pin dependency Python, dan mengevaluasi seluruh 13 intent.

## Blockers

- Tidak ada blocker untuk panduan.
- Reproduksi model training ketiga belum mungkin hanya dari file aktif repository.

## Notes For Next Session

- Panduan membedakan bukti source aktif, riwayat Git, dan penjelasan konsep; pertahankan perbedaan tersebut saat model diperbarui.
- Jangan menyatakan report 8 kelas sebagai evaluasi lengkap kontrak 13 intent.
- Tidak ada source produksi, schema, dependency, atau deployment yang diubah dalam task dokumentasi ini.

