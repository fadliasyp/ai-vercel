# Architecture

## High-Level View

```text
Customer browser / WordPress
        |
        | POST /api/ask or /api/ask-image
        v
Vercel Functions
        |
        +--> LLM understanding (Groq -> Gemini/Mistral -> local fallback)
        |
        +--> Tool/data execution
        |      +--> WooCommerce catalog/order
        |      +--> WordPress content/shipping endpoints
        |      +--> Biteship tracking
        |      +--> Store policy/config
        |
        +--> Legacy deterministic response builder
        |
        +--> LLM answer composer + safety/coverage validation
        |
        +--> Supabase session/observability (optional)
        v
Structured JSON response
        |
        v
Frontend renderer, local history, feedback, actions
```

## Frontend

`wordpress-frontend-chatbot/frontend.html` adalah script UI yang ditanam pada halaman WordPress. CSS utama berada di `addtional.css`.

Responsibilities:

- Membuka/menutup chat dan menangani mobile VisualViewport.
- Menyimpan session ID dan history teredaksi di browser storage.
- Mengirim text/image, history terbatas, page context, dan structured action.
- Merender Markdown melalui `marked` dan membersihkan HTML dengan DOMPurify.
- Merender products, comparison, options, suggestions, how-to-buy, payment methods, feedback, dan admin handoff.
- Mengompres gambar sebelum dikirim.

Frontend tidak menjadi sumber kebenaran produk. Semua data response berasal dari backend.

## Backend API

### `POST /api/ask`

Orkestrator chat text. Menerima pertanyaan, history, structured suggested action, bootstrap flag, dan product-page context. Response dapat berupa text, products, options, suggestions, compare, payment methods, atau how-to-buy.

Alur utama:

1. Validasi request/session dan muat state.
2. Analisis pending context dan semantic understanding.
3. Fusion/lock intent sesuai mode LLM-led dan exception tepercaya.
4. Decompose pertanyaan dan buat answer/tool plan.
5. Ambil data Woo/WordPress/shipping/order/tracking/policy.
6. Bangun response deterministik terverifikasi.
7. Periksa answer coverage dan lakukan repair/klarifikasi.
8. Pada shadow/active, jalankan composer dan safety validator.
9. Tambahkan controlled actions, metadata, metrics, dan simpan session.

### `POST /api/ask-image`

Pipeline visual-search dengan deadline request:

1. Validasi data URL image dan ukuran.
2. Analisis visual melalui provider yang tersedia.
3. Bentuk kandidat dari Woo catalog dan Visual Index v2.
4. Terapkan constraint teks, budget, stock, dan product identity.
5. Provider-independent visual rerank.
6. Terapkan confidence/false-positive safeguards.
7. Kembalikan produk dan metadata visual.

### `POST /api/feedback`

Memvalidasi rating dan session, membuat event dengan session hash, lalu mencoba insert ke Supabase. Endpoint tetap memberi respons sukses dengan `persisted: false` bila Supabase tidak tersedia.

### `GET /api/test`

Health response sederhana. Tidak memeriksa dependency eksternal.

## LLM Architecture

### Understanding

- Groq semantic router adalah jalur utama bila aktif.
- Gemini dan Mistral dapat menjadi fallback semantic.
- Local rules adalah fallback dan guard untuk explicit/pending cases.
- Output structured mencakup intent, goals, entities, relation/topic switch, confidence, emotion, dan kebutuhan klarifikasi.

### Tool Execution

`llmAssistant.js` memetakan goals ke tool logis: `woo_catalog`, `shipping_quote`, `store_policy`, `woo_order`, dan `shipment_tracking`. Source aktual tetap dipanggil oleh orkestrator.

### Answer Composer

Composer hanya boleh mengubah text fields. Structured payload dan protected facts di-lock. Candidate diperiksa terhadap safety issue dan answer coverage. Mode:

- `legacy`: LLM-led assistant nonaktif.
- `shadow`: understanding/composer dievaluasi, response legacy tetap disajikan.
- `active`: understanding terpilih dapat mengunci intent dan candidate aman dapat disajikan.

## Product Data

`wooCatalog.js` memakai WooCommerce REST products endpoint dengan Basic Auth server-side, pagination, field selection, cache memory, dan stale fallback. Product search/ranking/formatting dipisah ke modul `productSearch`, `productRanking`, `productRecommendation`, dan `productFormatter`.

Deskripsi WooCommerce digunakan untuk condition, strengths, caveats, material, completeness, dan alasan recommendation/compare bila tersedia.

## Conversation State

- `session.js`: state memory per serverless instance.
- `sessionStore.js`: load/upsert state Supabase `chat_sessions` bila Supabase aktif.
- Frontend mengirim history terbatas dan menyimpan history browser.
- Pending state memiliki TTL default lima menit.

Karena serverless memory tidak persisten, Supabase dan request history adalah bagian penting continuity lintas instance.

## Database And Storage

- Supabase/PostgreSQL: `chat_sessions`, `chat_observability`, `chat_feedback`.
- Repository JSON: `data/product-visual-index.json`.
- Browser storage: session ID, chat history, dan feedback state.
- Tidak ada ORM.

Lihat `docs/DATABASE.md` untuk status schema.

## Authentication And Authorization

- Tidak ada login pelanggan di chatbot API.
- `X-Session-Id` adalah correlation/conversation identifier, bukan autentikasi.
- WooCommerce, shipping API, Biteship, Supabase, dan AI providers memakai server-side credentials.
- Status order memakai verifikasi per-order melalui billing email/phone.
- API-level authorization/rate limiting belum ditemukan.

## Background Jobs

Tidak ada queue, cron, atau background worker yang ditemukan. Visual index dibangun manual melalui npm script.

## Deployment

- Backend: Vercel Functions. `ask.js` dan `ask-image.js` mendeklarasikan Node runtime dan durasi maksimum 90 detik.
- Frontend: dipasang terpisah di WordPress.
- Content/catalog: WordPress/WooCommerce live.
- CI/CD: belum diketahui / tidak ada config di repository.

## Architectural Rules

- LLM-led, data-grounded: LLM mengerti/menulis, tool menyediakan fakta.
- Shadow migration sebelum aktivasi perubahan LLM besar.
- Structured payload bersifat immutable bagi composer.
- Satu response harus mencakup semua goal majemuk atau klarifikasi kekurangan.
- Local rules hanya guard/fallback dan tidak boleh diam-diam menimpa semantic intent baru.
- Bug pelanggan menjadi replay/regression test.

## Risks

- Orkestrator besar meningkatkan risiko branch yang saling menimpa.
- Multi-provider fallback dapat meningkatkan latency dan biaya/quota.
- CORS wildcard dan tidak adanya API authentication membuka risiko abuse.
- Persistensi session bergantung schema Supabase yang belum terdokumentasi penuh.
- Live API/schema WordPress dapat berubah di luar repository.
- Image search bergantung kualitas visual index, dataset, quota, dan production gate.

