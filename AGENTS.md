# AGENTS.md

## Project Identity

- Nama: Robot Jadul AI Chatbot (`ai-vercel`).
- Jenis: chatbot commerce untuk frontend WordPress/WooCommerce dengan backend API Vercel.
- Bahasa utama pelanggan: Indonesia.
- Prinsip utama: **progress tanpa regression**. Baca `rule.txt` sebelum perubahan penting.

## Required Reading

Sebelum task implementasi yang substansial, baca:

1. `rule.txt`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/CURRENT_TASK.md`
4. `docs/FEATURE_BASELINE.md`
5. Dokumentasi teknis lain yang relevan dengan task.

Repository adalah sumber memory project. Jangan mengandalkan chat lama sebagai satu-satunya sumber konteks.

## Technology Stack

- Runtime: Node.js dengan ES modules.
- Backend: Vercel Functions di `api/`.
- Frontend: HTML, CSS, dan JavaScript yang ditanam di WordPress.
- Commerce/content: WordPress dan WooCommerce REST API.
- Database/observability: Supabase/PostgreSQL melalui `@supabase/supabase-js`.
- AI: Groq, Gemini, Mistral, dan Cloudflare Workers AI sesuai kemampuan dan konfigurasi provider.
- Testing: native Node test runner.

## Project Structure

- `api/`: endpoint Vercel. `ask.js` adalah orkestrator chat utama dan `ask-image.js` adalah pipeline pencarian foto.
- `lib/chatbot/`: modul intent, pemahaman bahasa, katalog, transaksi, LLM, presentasi, dan observability.
- `wordpress-frontend-chatbot/`: UI chatbot yang ditanam ke WordPress.
- `tests/`: regression tests lokal.
- `scripts/`: benchmark, smoke test, laporan observability, dan builder visual index.
- `benchmarks/`: dataset, replay, dan hasil benchmark.
- `data/product-visual-index.json`: visual index katalog.
- `supabase/`: skema SQL yang tersedia di repository.
- `docs/`: memory permanen project.

## Coding Rules

- Pahami alur end-to-end dan semua caller sebelum mengubah shared logic.
- Pertahankan pola dan helper yang sudah ada. Hindari dependency atau abstraksi baru tanpa kebutuhan nyata.
- Lakukan perubahan sekecil mungkin pada akar masalah.
- Jangan melakukan refactor kosmetik pada area stabil.
- Jangan menghapus atau mengganti fallback lama sebelum jalur baru terbukti lebih baik melalui test/benchmark.
- Perlakukan `api/ask-backup3.js` dan `api/asal.text` sebagai artefak lama, bukan source produksi utama.
- Gunakan ASCII untuk penambahan kode bila tidak ada alasan kuat memakai karakter lain.

## LLM And Data Rules

- LLM memahami maksud dan menyusun bahasa, tetapi tidak boleh menciptakan harga, stok, promo, dimensi, status pesanan, ongkir, atau kebijakan.
- Fakta commerce harus berasal dari WooCommerce, endpoint pengiriman, Biteship, WordPress, atau konfigurasi toko yang terverifikasi.
- Safety validator tidak boleh mengubah intent pelanggan atau menambahkan fakta generik yang tidak diminta.
- Pertanyaan majemuk harus mempertahankan semua goal dan menjawab atau mengklarifikasi setiap poin.
- Produk eksplisit pada turn baru mengalahkan konteks produk lama. Jangan mengganti objek pelanggan dengan hasil sebelumnya.
- Klarifikasi hanya saat ambigu, sebutkan apa yang sudah dipahami, dan pertahankan goal setelah pilihan ditekan.

## Database Rules

- Jangan menjalankan migration atau mengubah schema tanpa permintaan eksplisit.
- Jangan menganggap skema `chat_sessions` lengkap; SQL pembuatannya belum tersedia di repository.
- Gunakan service-role Supabase hanya di server.
- Jangan mencatat session ID mentah ke tabel observability/feedback; gunakan helper hashing yang tersedia.
- Jika schema berubah, update `docs/DATABASE.md` dan SQL terkait.

## API Rules

- Pertahankan validasi method, CORS, input, timeout, dan error handling endpoint.
- `X-Session-Id` adalah identitas percakapan, bukan autentikasi pengguna.
- Jangan membocorkan keberadaan pesanan sebelum verifikasi email/telepon billing berhasil.
- Perubahan response shape harus diperiksa terhadap renderer frontend dan replay/benchmark.

## Security Rules

- Jangan membaca, menulis, mencetak, atau mendokumentasikan nilai secret dari `.env`.
- Dokumentasikan nama environment variable saja.
- Jangan memasukkan API key, token, password, private key, atau data pelanggan ke commit/log.
- Pertahankan DOMPurify untuk HTML hasil Markdown dan redaksi data sensitif pada history.
- Nilai CORS wildcard saat ini adalah risiko yang harus dievaluasi sebelum production hardening, bukan diubah diam-diam.

## Testing Rules

- Untuk perubahan logic, jalankan minimal `npm test`.
- Untuk pertanyaan majemuk/coverage, jalankan `npm run benchmark:coverage-replay`.
- Untuk perubahan LLM-led, jalankan benchmark shadow sebelum mengaktifkan perilaku baru.
- Untuk image search, validasi dataset dan gunakan production gate di benchmark; beberapa contoh berhasil tidak cukup.
- Benchmark live memakai quota/provider eksternal dan tidak boleh dianggap lulus jika tidak dijalankan.
- Tambahkan regression test untuk setiap bug yang diperbaiki.

## Documentation Rules

Setelah pekerjaan besar, periksa dan update:

- `docs/PROJECT_CONTEXT.md`
- `docs/CURRENT_TASK.md`
- `docs/FEATURE_BASELINE.md`
- `docs/CHANGELOG.md`

Update `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, atau `docs/DATABASE.md` bila area tersebut berubah. Gunakan `Belum diketahui / perlu dikonfirmasi` bila bukti tidak tersedia.

## Feature Regression Protection

- Baca `docs/FEATURE_BASELINE.md` sebelum mengubah fitur terlindungi.
- Identifikasi dependency dan consumer, lalu lakukan impact analysis.
- Pertahankan fakta terverifikasi, konteks produk, seluruh goal majemuk, privasi transaksi, dan structured actions.
- Status `STABLE` hanya berlaku pada perilaku dan ruang verifikasi yang tertulis, bukan seluruh chatbot.

## Git Safety

- Jangan reset, checkout, revert, atau menghapus perubahan pengguna tanpa instruksi eksplisit.
- Jangan membuat commit atau mengubah history kecuali diminta.
- Periksa worktree sebelum dan sesudah perubahan.
- Jangan memasukkan `.env`, log, `node_modules`, atau state lokal Vercel ke Git.

## Session Handoff

- Catat task aktif, hasil, blocker, file yang berubah, dan next step di `docs/CURRENT_TASK.md`.
- Setelah task selesai, pindahkan kondisi permanen ke context/baseline/changelog dan tulis `Belum ada task aktif.`
- Jangan meninggalkan keputusan penting hanya dalam percakapan.

