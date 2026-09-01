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

### Do Not Break

- Jangan menjadikan output LLM sebagai sumber fakta commerce.
- Jangan menghapus safety validator untuk menaikkan composer acceptance.
- Jangan naturalize array `products`, `options`, `steps`, payment methods, atau admin handoff.

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
- Setiap facet dilacak sampai answered, clarified, atau unresolved.
- Auto-repair tidak boleh mengubah objek produk atau intent utama.
- Klarifikasi menjelaskan informasi yang masih kurang.

### Do Not Break

- Jangan mereduksi pertanyaan majemuk menjadi intent tunggal yang membuang goal lain.
- Jangan menambahkan paragraf generik yang tidak menjawab facet.
- Jangan menganggap partial answer sebagai complete answer.

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

## Controlled Conversation Actions

### Status

STABLE (structured-action contract scope)

### Function

Menyediakan pilihan klarifikasi dan follow-up yang membawa metadata action/required fields agar klik pelanggan konsisten dengan konteks.

### Correct Behavior

- Pilihan produk membawa object action terstruktur.
- Pending goal dipertahankan setelah pelanggan memilih opsi.
- Saran lama dihapus saat pelanggan mengirim pertanyaan baru.
- Greeting menampilkan enam saran dari pool variatif: empat global dan dua lebih spesifik.
- Follow-up tidak mengulang informasi yang sudah dijawab.

### Do Not Break

- Jangan mengubah structured option menjadi teks tanpa metadata.
- Jangan memaksa pending clarification bila pelanggan mengganti topik.
- Jangan menampilkan saran produk/topik stale dari respons lama.

### Important Files

- `lib/chatbot/followUpClosings.js`
- `lib/chatbot/conversationUi.js`
- `lib/chatbot/pendingContext.js`
- `wordpress-frontend-chatbot/frontend.html`

### Verification

- `npm test`
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
- Gemini mencoba model family terkonfigurasi dan memakai cooldown.
- Mistral menjadi fallback text/vision bila aktif.
- Cloudflare menjadi vision fallback bila aktif.
- Local deterministic understanding tetap tersedia saat provider gagal.

### Do Not Break

- Jangan retry tanpa batas dalam satu request.
- Jangan menganggap provider fallback sebagai izin mengarang fakta.
- Jangan menghapus cooldown/deadline yang melindungi request Vercel.

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

## Statuses Not Yet Baseline-Stable

- LLM-led conversational accuracy end-to-end: WORKING, masih perlu replay/manual test berkelanjutan.
- Product identity/search accuracy untuk seluruh variasi nama/typo: WORKING, bukan klaim sempurna.
- Image-search production readiness: PARTIAL sampai production gate lengkap lulus.
- WordPress frontend responsive/browser behavior: WORKING berdasarkan implementation, belum ada E2E suite.
- Live shipping, Woo order, tracking, dan Supabase persistence: WORKING bila service aktif, belum diverifikasi dalam bootstrap ini.

