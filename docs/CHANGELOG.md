# Changelog

Changelog ini hanya mencatat perubahan yang dapat diverifikasi dari task saat ini dan Git history yang tersedia. Riwayat sebelum commit yang dicantumkan belum dirangkum lengkap.

## Unreleased

### Fixed

- Migrated the Groq router fallback and local naturalizer model from unavailable `qwen/qwen3.6-27b` to account-verified `qwen/qwen3.8-27b`.
- Added regression coverage for the current default Groq fallback model.
- Revalidated Gemini model IDs against the account's live `models.list` response: restored valid `gemini-2.5-flash-lite` and `gemini-3-flash-preview` fallbacks while retaining `gemini-3.5-flash-lite` and `gemini-3.5-flash`.
- Documented that the dashboard label "Gemini 3 Flash" maps to the API ID `gemini-3-flash-preview`; `gemini-3-flash` is not the listed API ID.
- Updated Cloudflare Workers AI response parsing to accept structured `result.response` objects as well as text.
- Replaced rate-limited `mistral-small-latest` with live-verified `ministral-8b-2512` and `ministral-3b-2512` fallback defaults for text and vision.
- Bounded image-analysis JSON arrays to five short items so vision output completes within the configured token limit.
- Skipped Groq naturalization for responses above 2,400 editable characters, preserving the complete deterministic answer while avoiding repeated JSON-generation failures and wasted quota.
- Classified Groq `failed_generation` separately and allowed only explicitly configured Groq fallback models to retry it; cross-provider retries remain disabled for this nonfatal case.

### Verification

- Verified the safe in-memory TF-IDF + Logistic Regression self-check: Pipeline and explicit step execution matched, probabilities summed to one, and three representative predictions completed.
- Verified the Groq naturalizer end-to-end against `qwen/qwen3.8-27b` with a successful live response.
- Verified Gemini `gemini-3.5-flash-lite` through the chatbot wrapper and Cloudflare vision through the production image-analysis prompt.
- Verified 364/364 full local tests and 9/9 answer-coverage replay turns pass.
- Confirmed Mistral `mistral-small-latest` is valid but currently returns HTTP 429 rate limit code `1300` for this account.
- Verified structured text and vision JSON through the active Mistral integration using `ministral-8b-2512`.
- Verified 365/365 full local tests pass after the Mistral migration.
- Verified 365/365 full local tests pass after synchronizing the Gemini fallback IDs.
- Verified the deployed production text path uses Groq GPT-OSS 20B plus Qwen 3.8 with an accepted, fact-preserving composition.
- Verified the deployed production image endpoint returns HTTP 200 using Gemini 2.5 Flash without provider fallback.
- Verified 367/367 local tests and 9/9 answer-coverage replay turns pass after the naturalizer efficiency fix.

### Documentation

- Added `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md` sebagai panduan komprehensif untuk skripsi dan live coding.
- Documented frontend request, Indonesian preprocessing, TF-IDF, Logistic Regression, Intent ML API, hybrid/semantic intent fusion, commerce grounding, answer coverage, response rendering, dan batas reproducibility.
- Added direct source excerpts, evaluation interpretation, demonstration commands, examiner Q&A, dan pre-defense checklist.
- Expanded stage 8 with the explicit Node-to-FastAPI request path, local versus production `INTENT_API_URL`, `.joblib` loading, inference location, response validation, failure fallback, and a live-coding walkthrough.
- Expanded subsection 8.4 with the internal scikit-learn Pipeline execution, explicit TF-IDF/classifier equivalents, serialized training state, class-probability mapping, confidence calculation, and a defense-ready explanation.
- Added repeatable local commands for safe demo mode and trusted production-Joblib mode, including actual 2026-09-16 verification output and pickle safety limitations.

## 2026-09-01

### Documentation

- Added repository project memory: `AGENTS.md`, `README.md`, dan dokumentasi di `docs/`.
- Added verified feature baseline, architecture, database knowledge, decision log, dan session handoff.
- Documented known unknowns tanpa mengubah source code.

### Technical

- Verified 362 local tests pass.
- Verified answer coverage replay passes 9/9 turns with coverage 59,4% to 88,9%.

### Added

- Commit `6476b2f`: menambah project setup blueprint.

## 2026-08-24

### Changed

- Commit `8e0cbfc`: memperbaiki intent rekomendasi lagi.
- Commit `2c267cf`: membuat LLM menjadi penentu.
- Commit `f4c0cc9`: memperbaiki pertanyaan sisa pcs.
- Commit `18d2f3e`: memperbaiki opsi greeting.

### Added

- Commit `23d68e3`: menambah dataset foto.

### Technical

- Commit `5570466`: memperkuat LLM gambar tahap 4.

## 2026-08-23

### Technical

- Commit `14b5bd9`: memperkuat LLM gambar tahap 3.

## 2026-08-22

### Added

- Commits `6c8f913` dan `305f287`: menambah integrasi LLM Cloudflare.
- Commit `0baf197`: membuat enam saran greeting.

### Changed

- Commit `88126da`: membagi provider/model agar terstruktur ketika limit.
- Commits `4d6e852` dan `1cf9030`: memperkuat LLM gambar.
- Commit `8f145a9`: memperbaiki rekomendasi.

## Older History

Belum dirangkum / perlu dikonfirmasi dari Git history bila diperlukan untuk task mendatang.

