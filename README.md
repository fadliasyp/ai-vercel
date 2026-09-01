# Robot Jadul AI Chatbot

Chatbot commerce berbahasa Indonesia untuk membantu pelanggan Robot Jadul mencari dan membandingkan produk, memeriksa fakta katalog, memahami kebijakan transaksi, menghitung ongkir, melacak paket, serta mencari produk melalui foto.

Frontend ditanam di WordPress. Backend berjalan sebagai Vercel Functions dan memakai data WordPress/WooCommerce sebagai sumber fakta commerce.

## Stack

- Node.js ES modules
- Vercel Functions
- WordPress dan WooCommerce REST API
- Supabase/PostgreSQL untuk session, observability, dan feedback
- Groq, Gemini, Mistral, dan Cloudflare Workers AI
- HTML/CSS/JavaScript frontend
- Native Node test runner

## Requirements

- Node.js yang mendukung `node --test` dan ES modules
- npm
- Akun/credential layanan yang diperlukan untuk fitur yang akan digunakan
- Vercel CLI untuk development/deployment serverless

## Installation

```powershell
npm install
```

Buat `.env` lokal atau environment variables di Vercel. File `.env*` diabaikan Git. Jangan memasukkan nilai secret ke dokumentasi atau commit.

## Environment

Kelompok variable yang dipakai source saat ini:

| Area | Variables |
| --- | --- |
| WordPress/WooCommerce | `WP_BASE_URL`, `WC_PRODUCTS_URL`, `WC_KEY`, `WC_SECRET` |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OBSERVABILITY_HASH_SALT`, `FEEDBACK_HASH_SALT` |
| Groq | `GROQ_API_KEY`, `GROQ_API_URL`, `GROQ_ROUTER_ENABLED`, `GROQ_ROUTER_MODEL`, `GROQ_ROUTER_FALLBACK_MODELS`, `GROQ_ROUTER_TIMEOUT_MS`, `GROQ_ROUTER_MIN_CONFIDENCE` |
| Groq composer | `GROQ_NATURALIZER_ENABLED`, `GROQ_NATURALIZER_MODEL`, `GROQ_NATURALIZER_FALLBACK_MODELS`, `GROQ_NATURALIZER_TIMEOUT_MS` |
| Gemini | `GEMINI_API_KEY` atau `GOOGLE_API_KEY`, `GEMINI_FAST_MODEL`, `GEMINI_SMART_MODEL`, `GEMINI_VISION_MODEL`, `GEMINI_SCOPE_MODEL`, `GEMINI_TEXT_MODEL`, `GEMINI_FAST_MODELS`, `GEMINI_SMART_MODELS`, `GEMINI_VISION_MODELS`, `GEMINI_TEXT_MODELS`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_MODEL_ATTEMPTS`, `GEMINI_MODEL_COOLDOWN_MS`, `GEMINI_DAILY_MODEL_COOLDOWN_MS` |
| Mistral | `MISTRAL_API_KEY`, `MISTRAL_ENABLED`, `MISTRAL_API_URL`, `MISTRAL_MODEL`, `MISTRAL_FALLBACK_MODELS`, `MISTRAL_TIMEOUT_MS`, `MISTRAL_VISION_ENABLED`, `MISTRAL_VISION_MODEL`, `MISTRAL_VISION_FALLBACK_MODELS`, `MISTRAL_VISION_TIMEOUT_MS` |
| Cloudflare Vision | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_API_TOKEN` atau `CLOUDFLARE_AUTH_TOKEN`, `CLOUDFLARE_VISION_ENABLED`, `CLOUDFLARE_VISION_MODEL`, `CLOUDFLARE_AI_API_URL`, `CLOUDFLARE_VISION_TIMEOUT_MS` |
| LLM-led mode | `LLM_LED_ASSISTANT_MODE` (`legacy`, `shadow`, atau `active`) |
| Pengiriman | `RJ_SHIP_TOKEN`, `SHIP_ORIGIN_TEXT`, `BITESHIP_API_KEY`, `BITESHIP_BASE_URL` |
| Toko/transaksi | `COD_ENABLED`, `STORE_ADDRESS_TEXT`, `STORE_HOURS_TEXT` |
| Image pipeline | `IMAGE_SEARCH_BUDGET_MS`, `GEMINI_VISION_ANALYSIS_TIMEOUT_MS`, `GEMINI_VISION_RERANK_TIMEOUT_MS`, `GEMINI_VISION_STAGE_MAX_ATTEMPTS`, `GEMINI_QUOTA_COOLDOWN_MS`, `IMAGE_PIPELINE_DEBUG` |
| Visual index builder | `VISUAL_INDEX_OUTPUT_PATH`, `VISUAL_INDEX_LIMIT`, `VISUAL_INDEX_OFFSET`, `VISUAL_INDEX_IMAGES_PER_PRODUCT`, `VISUAL_INDEX_SCAN_GEMINI`, `VISUAL_INDEX_SCAN_MISTRAL`, `VISUAL_INDEX_SCAN_CLOUDFLARE`, `VISUAL_INDEX_RESUME`, `VISUAL_INDEX_GEMINI_TIMEOUT_MS` |
| Optional intent service | `INTENT_API_URL`, `INTENT_ML_MIN_CONFIDENCE` |
| Benchmark | `CHATBOT_BENCHMARK_ENDPOINT`, `LLM_SHADOW_BENCHMARK_DELAY_MS` |

Lihat source resolver terkait untuk default dan batas validasi. Tidak semua variable wajib; kebutuhan bergantung fitur/provider yang diaktifkan.

## Development

Jalankan serverless app lokal:

```powershell
npx vercel dev
```

Endpoint utama:

- `POST /api/ask`: chat teks.
- `POST /api/ask-image`: pencarian produk dengan foto.
- `POST /api/feedback`: feedback membantu/belum membantu.
- `GET /api/test`: pemeriksaan API sederhana.

Frontend WordPress berada di `wordpress-frontend-chatbot/frontend.html` dan `wordpress-frontend-chatbot/addtional.css`.

## Testing

```powershell
npm test
npm run benchmark:coverage-replay
```

Benchmark penting lainnya:

```powershell
npm run benchmark:llm-shadow -- https://domain.vercel.app/api/ask
npm run benchmark:images -- --validate-only
```

Benchmark live memakai endpoint dan quota provider. Jalankan dengan sengaja, bukan sebagai unit test rutin.

## Build

Tidak ada frontend bundle build. Visual index katalog dapat dibangun ulang dengan:

```powershell
npm run build:visual-index
```

Rebuild visual index mengakses katalog dan provider vision, sehingga membutuhkan konfigurasi, waktu, dan quota yang sesuai.

## Deployment

Backend ditujukan untuk Vercel. Environment variables production harus dipasang di project Vercel. Frontend chatbot dipasang pada WordPress secara terpisah. Prosedur CI/CD otomatis belum ditemukan di repository.

## Documentation

- [Project context](docs/PROJECT_CONTEXT.md)
- [Current task](docs/CURRENT_TASK.md)
- [Feature baseline](docs/FEATURE_BASELINE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [Decisions](docs/DECISIONS.md)
- [Changelog](docs/CHANGELOG.md)
- [Permanent agent rules](AGENTS.md)
