# Image Search Benchmark

Dataset ini menguji pencarian produk menggunakan foto yang tidak berasal dari
request API saat benchmark berjalan.

Nama file internal tidak dikirim sebagai petunjuk ke model. Runner memakai
nama netral `benchmark-upload` kecuali sebuah case sengaja mengatur
`expose_filename: true`.

Target awal yang disarankan:

- 10 foto toko dengan tampilan penuh.
- 10 foto internet dengan background atau pose berbeda.
- 10 foto crop/detail produk.
- 5 foto produk yang tidak ada di katalog.

Buat 10 baseline dari foto katalog:

```powershell
npm run dataset:images -- --seed-store 10
```

Baseline ini hanya menguji bahwa pipeline dasar bekerja. Nilainya tidak boleh
dipakai untuk menyimpulkan akurasi foto internet karena gambar yang sama juga
ada di visual index.

Tambahkan foto positif:

```powershell
npm run dataset:images -- --add "C:\foto\energer-internet.jpg" --product-id 3323 --source internet --view different_angle
```

Tambahkan foto crop:

```powershell
npm run dataset:images -- --add "C:\foto\energer-crop.jpg" --product-id 3323 --source internet --view crop
```

Tambahkan foto negatif:

```powershell
npm run dataset:images -- --add-negative "C:\foto\produk-tidak-ada.jpg" --source negative --view full
```

Impor banyak foto dari manifest label:

```powershell
npm run dataset:images -- --import-labels "C:\foto\labels.json"
```

Setiap case di manifest dapat berisi `file`, `case_id`, `product_id`,
`source_type`, `view_type`, dan `notes`. Gunakan
`acceptable_product_ids` saat foto hanya menunjukkan karakter atau versi lama
yang dapat cocok dengan lebih dari satu varian katalog. Case dengan
`"status": "review"` atau `"enabled": false` akan dilewati.

Cari ID produk:

```powershell
npm run dataset:images -- --list-products "energer"
```

Validasi dataset tanpa memakai API:

```powershell
npm run benchmark:images -- --validate-only
```

Jalankan beberapa kasus terlebih dahulu untuk menjaga kuota:

```powershell
npm run benchmark:images -- --limit 3 --fresh
```

Benchmark endpoint Vercel staging:

```powershell
npm run benchmark:images -- --endpoint "https://domain.vercel.app/api/ask-image" --limit 3
```

Runner menyimpan checkpoint setelah setiap foto. Jika kuota habis atau proses
terputus, jalankan ulang perintah tanpa `--fresh` untuk melanjutkan.
Hasil fallback tanpa visual rerank tidak dihitung. Runner akan berhenti dan
mempertahankan checkpoint sampai layanan vision tersedia kembali.

Metrik utama:

- `top1_accuracy`: produk benar berada di posisi pertama.
- `top3_accuracy`: produk benar berada dalam tiga kandidat pertama.
- `negative_rejection_accuracy`: foto yang tidak ada berhasil diberi confidence rendah.
- `false_confident_rate`: bot salah tetapi memberi confidence tinggi.
- Latency rata-rata, p50, p95, serta hasil per jenis sumber dan tampilan.

Production gate memerlukan minimal 30 case positif, 5 negatif, 10 foto
internet, 10 crop, Top-1 minimal 80%, Top-3 minimal 95%, false-confidence
maksimal 5%, API success minimal 95%, dan latency p95 maksimal 60 detik.
