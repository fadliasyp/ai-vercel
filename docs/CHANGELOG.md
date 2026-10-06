# Changelog

Changelog ini hanya mencatat perubahan yang dapat diverifikasi dari task saat ini dan Git history yang tersedia. Riwayat sebelum commit yang dicantumkan belum dirangkum lengkap.

## Unreleased

### Added

- Added a product-grounding language matrix for compact model codes, reordered names, attribute questions, light typos, ambiguity, and unknown-product inverse cases.
- Added a structured LLM recommendation contract for price mode, target/range, purpose, stock, condition, and promo constraints.
- Added verified recommendation context fields so natural follow-ups can retain target price and purpose without leaking them into explicit new topics.
- Added `npm run benchmark:context` with six multi-turn gates covering recommendation price refinement, ordinal selection, focused-product pronouns, explicit product switches, restock topic switches, and interruption of pending shipping questions.
- Expanded `benchmark:context` to nine multi-turn production gates with focused-product promo/photo follow-ups and two-product references.

### Fixed

- Fixed compact model codes such as `GX92` failing to match catalog forms such as `GX-92`.
- Prevented material, dimension, weight, accessory, and nett-price wording from being treated as part of the requested product name.
- Kept ambiguous references and wrong model numbers conservative instead of substituting a nearby catalog product.
- Fixed the exact production case `Bang, rekomen robot yang bagus dong, sekitar 7 jutaan.` returning Rp650 thousand and Rp3 million products. Explicit approximate-price wording now corrects an LLM `maximum` misclassification to a target before ranking.
- Prevented an existing recommendation goal from rewriting a complete new recommendation request into `rekomendasi robot budget ...`; only terse budget refinements are expanded from context.
- Fixed casual recommendation language being interpreted inconsistently between the LLM router and local grounding stages. Shared normalization now covers `rekomen`, `pilihin`, `mnurut lu`, `jtan/jtaan`, `sd`, and abbreviated follow-up wrappers.
- Kept ready stock and display/gift/collection wording as recommendation constraints when the customer is asking which product to choose, instead of replacing the main intent with stock availability.
- Added inverse intent cases so ordinary price and stock questions remain outside recommendation.
- Fixed recommendation messages that state an earlier range and then a newer alternative, such as `antara 5 sampai 8 juta ... kalau yang 3 jutaan ada?`. The latest explicit amount is now a target price while the earlier purpose remains active; genuinely explicit maximum-budget wording is unchanged.
- Fixed generic recommendation requests such as `Cari robot antara 5 sampai 8 juta buat pajangan dong` being rejected as an unavailable named product even though the LLM correctly returned an empty `product_names` list.
- Recommendation catalog guards now use trusted semantic product entities first, while the local fallback ignores range words such as `antara`, `sampai`, `sekitar`, and `kisaran`. Explicit unavailable product names remain protected from unrelated substitutions.
- Connected LLM recommendation understanding to the actual catalog filter/ranker instead of discarding it during legacy semantic conversion.
- Rejected LLM-generated recommendation amounts unless they are grounded in the current customer message or a verified follow-up goal.
- Fixed fallback parsing for `jangan lebih dari 6 juta`, mixed lower/upper bounds with negation, and informal `budget gue/gw` wording.
- Fixed bare recommendation amounts such as `rekomen cok robot 19 jutaan` not becoming a target price when the customer omitted the word `harga`.
- Removed the distant-product fallback for target-price recommendations. When no product is within 20% of the requested target, the system now returns no matching candidate instead of unrelated Rp1.5-Rp3.5 million products.
- Fixed natural focused-product follow-ups such as `masih ready gak?`, `ada diskon gak?`, `ada fotonya?`, and `full die-cast nggak?` losing the product discussed in the preceding turn.
- Fixed `keduanya` being interpreted as only the second product. Pair references now resolve only when exactly two prior products are available.
- Prevented price, promotion, photo, and product-detail questions containing `ada` from being hijacked by the catalog-availability guard.
- Prevented stale comparison context from overriding a locked LLM `stock_availability` decision for follow-ups such as `keduanya ready gak?`; explicit comparison wording remains unchanged.

### Verification

- Product-grounding verification passes 400/400 local tests, 9/9 answer-coverage replay turns (59.4% before repair, 88.9% after repair), and 5/5 user-run production smoke cases.
- Multi-turn Product Continuity passes 403/403 local tests, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. Production smoke is pending.
- The first 9-case production context smoke passed 8/9. The failing compare-to-stock transition now has an active-LLM endpoint regression and passes locally; production rerun is pending deployment.
- User-verified production smoke passes 3/3 for an approximate target, a bounded range with product-purpose constraints, and a terse same-session price refinement.
- Added unit and full `/api/ask` regressions using the production question and a deliberately wrong Groq-shaped `maximum` result. All 399 local tests pass; only products within the Rp5.6-Rp8.4 million target window survive.
- Added a data-driven language matrix and follow-up regressions. All 397 local tests pass, answer-coverage replay passes 9/9 turns, and the customer conversation benchmark passes 26/26 turns with 135 assertions (100%).
- Added parser, ranking, and `/api/ask` regressions for latest-price correction, including a deliberately incorrect LLM `maximum` result. All 393 local tests pass, answer-coverage replay passes 9/9 turns, and customer conversation benchmark passes 26/26 turns.
- Added exact endpoint regressions for generic Rp5-Rp8 million display recommendations and the inverse unavailable-named-product case. All 391 local tests pass, answer-coverage replay passes 9/9 turns, and customer conversation benchmark passes 26/26 turns.
- Added semantic-contract, grounding, follow-up inheritance, negated-budget, ranking, and `/api/ask` regressions. All 390 local tests pass, answer-coverage replay passes 9/9 turns, and customer conversation benchmark passes 26/26 turns.
- Added parser, ranking, and `/api/ask` regression coverage for conversational recommendation targets. All 386 local tests pass and answer-coverage replay passes 9/9 turns.
- Added `gemini-3.8-flash`, `gemini-3.7-flash`, and `gemma-4-26b-a4b-it` to the bounded Google text fallback pools without adding them to vision or increasing the three-attempt cap.
- Added per-model Google generation config: low thinking and no legacy sampling parameters for Gemini 3.7/3.8, plus minimal thinking and locally validated prompt-JSON for Gemma 4.
- Added grounded per-product restock schedules from WPC Product Timer `woopt_actions` metadata.
- Added catalog-wide restock questions that list every upcoming product in chronological order and product-specific questions that return only the matched product.
- Added deterministic WIB date formatting, past-schedule filtering, storefront-role filtering, honest admin handoff when no schedule exists, and regression coverage for all three outcomes.
- Added an early HTTP 204 guard for `meta-externalagent` requests so the identified Meta crawler cannot reach chatbot session storage, Supabase, intent ML, catalog calls, or LLM providers.

### Fixed

- Fixed natural recommendation follow-ups such as `Kalau yang 6 jutaan ada apa aja?` losing the active recommendation goal and being routed as a standalone price/promotion search. Conversational wrappers are now removed before the existing budget parser runs, while terse forms such as `yg 3 jutaan dong` and explicit budget forms retain their previous behavior.
- Fixed natural recommendation requests such as `budget sekitar 12 jutaan` being treated only as a loose maximum, which allowed Rp1.5-Rp3.5 million products to outrank products near Rp12 million. Approximate budget wording now supplies both a target price and a hard maximum, while explicit maximum/minimum/range constraints keep their previous behavior.
- Corrected two context benchmark cases that referenced the local-only fixture name `Action Toys Ideon`. Live validation confirmed the production catalog name is `Soul of Chogokin GX-92 Ideon Full Action`; the stale fixture name caused safe product clarification to be reported as a context failure even though the intent and topic switch were correct.
- Added product option names to smoke benchmark reports so an ambiguous or incorrect catalog match can be diagnosed directly from the saved result.
- Fixed `yang kedua stoknya berapa?` being classified as price/promotion because the generic word `berapa` outranked the explicit `stoknya` signal.
- Resolved focused-product possessives such as `stoknya`, `harganya`, `kondisinya`, and `bahannya` before routing, while preserving explicit new products and WooCommerce page context.
- Fixed terse recommendation follow-ups such as `yg 3 jutaan` being routed as a standalone price/product search. The conversation resolver now expands them from the active recommendation goal before local and LLM routing, while explicit topic changes remain untouched.
- Added a two-turn endpoint regression proving a Rp12 million recommendation can be refined to Rp3 million without repeating the previous product group.
- Fixed recommendation requests such as `harga 7 jutaan` being treated as a generic maximum budget, which allowed much cheaper high-promo products to dominate and made different price-target questions repeat the same list.
- Added target-price proximity filtering and scoring while preserving explicit maximum, minimum, and range budget constraints.
- Kept `gemma-4-31b-it` out of the default pool after live recovery showed that a valid response took about 115 seconds, beyond the Vercel function's 90-second limit; the model remains opt-in through the existing environment model lists.
- Migrated the Groq router fallback and local naturalizer model from unavailable `qwen/qwen3.6-27b` to account-verified `qwen/qwen3.8-27b`.
- Added regression coverage for the current default Groq fallback model.
- Revalidated Gemini model IDs against the account's 2026-09-15 `models.list` response, which at that time listed `gemini-2.5-flash-lite` and `gemini-3-flash-preview`; the newer runtime 404 supersedes that evidence for Flash-Lite as recorded below.
- Documented that the dashboard label "Gemini 3 Flash" maps to the API ID `gemini-3-flash-preview`; `gemini-3-flash` is not the listed API ID.
- Updated Cloudflare Workers AI response parsing to accept structured `result.response` objects as well as text.
- Replaced rate-limited `mistral-small-latest` with live-verified `ministral-8b-2512` and `ministral-3b-2512` fallback defaults for text and vision.
- Bounded image-analysis JSON arrays to five short items so vision output completes within the configured token limit.
- Skipped Groq naturalization for responses above 2,400 editable characters, preserving the complete deterministic answer while avoiding repeated JSON-generation failures and wasted quota.
- Classified Groq `failed_generation` separately and allowed only explicitly configured Groq fallback models to retry it; cross-provider retries remain disabled for this nonfatal case.
- Added a deterministic buy-one-get-one guard so unsupported `beli 1 gratis 1` questions no longer display ordinary discounted products and instead receive an honest admin handoff.
- Normalized informal Indonesian `sampe` in the shared budget parser so gift recommendations with ranges such as `3 juta sampe 6 jutaan` no longer ask for the budget again.
- Added parser and end-to-end regression coverage that preserves the requested Rp3-Rp6 million range and excludes JUNK gift candidates.
- Fixed gift filtering that treated positive catalog phrases such as `bukan barang JUNK` as an actual JUNK condition; explicit non-negated JUNK, `rongsok`, and `part only` markers remain blocked.
- Fixed two-turn product comparisons so `produk lain` requests the second product instead of being searched as a literal catalog name; follow-up phrasing such as `bandingkan dengan [Produk B]` now retains Product A.
- Fixed generic conversational restock questions such as `kapan restock sih udah nunggu lama nih?` and `kapan restock barang emang` being misread as unknown product names.
- Prevented deterministic greetings such as `halo` from invoking the Groq, Gemini, and Mistral answer-composer fallback chain. The existing template response is returned directly with `deterministic_intent` observability metadata, avoiding quota waste and misleading provider error logs for greetings.
- Fixed `Dari kemarin nunggu kapan restock sih` being treated as a specific product lookup by recognizing `dari kemarin` as conversational time filler only within restock classification.
- Skipped the answer-composer provider chain for grounded restock responses, preserving the WooCommerce-derived schedule while avoiding unnecessary quota use and provider errors.
- Removed `gemini-2.5-flash-lite` from default Gemini pools after the production API returned HTTP 404 stating that the model is unavailable to this project; explicit Vercel model-list overrides still require operator cleanup.
- Identified the production request burst as Meta `meta-externalagent/1.1`: a read-only audit found 3,386 requests, 3,372 greetings, and 3,360 unique sessions on 2026-09-30.
- Retried one transient WooCommerce transport failure per catalog page, covering native `fetch failed` and common Undici/network error codes while leaving non-transient HTTP 4xx responses single-attempt.
- Added a sanitized `WC FETCH ERROR CODE` log so production can distinguish connect timeout, socket reset, DNS, and application timeout failures.

### Verification

- Verified the exact two-turn sequence `budget sekitar 12 jutaan` -> `Kalau yang 6 jutaan ada apa aja?` through the conversation resolver and `/api/ask`; the response remains `recommendation` and fixture prices stay within Rp4.8-Rp7.2 million. Full tests pass 385/385 and coverage replay passes 9/9 turns.
- Verified the exact reported `budget sekitar 12 jutaan` sentence through recommendation parsing and the `/api/ask` routing fixture; the full suite passes 385/385 and answer-coverage replay passes 9/9 turns.
- Reverified 384/384 local tests, 9/9 answer-coverage replay turns, smoke-script syntax, and a clean diff check after correcting the live context benchmark data.
- Verified the revised production context benchmark passes 6/6 cases, including explicit product switching and interruption of a pending shipping clarification.
- Verified 384/384 local tests, 26/26 deterministic customer-conversation turns, and 9/9 answer-coverage replay turns after the first continuity-hardening stage.
- Verified 383/383 local tests and 9/9 answer-coverage replay turns after the contextual recommendation follow-up fix.
- Verified target-price ranking directly and through the `/api/ask` regression fixture: Rp7 million and Rp4 million requests return different relevant product groups.
- Verified 382/382 local tests and 9/9 answer-coverage replay turns after the recommendation target-price fix.
- Verified live JSON responses through the chatbot adapter for `gemini-3.8-flash`, `gemini-3.7-flash`, and `gemma-4-26b-a4b-it`.
- Verified `gemma-4-31b-it` exists and can answer, but its successful probe took about 115 seconds; fast constrained probes returned provider HTTP 500, so it is not production-default evidence.
- Verified 380/380 local tests and 9/9 answer-coverage replay turns after the Google text fallback expansion.
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
- Verified 368/368 local tests and 9/9 answer-coverage replay turns pass after the buy-one-get-one routing fix, including active LLM semantic-lock coverage.
- Verified 368/368 local tests and 9/9 answer-coverage replay turns pass after the informal budget-range fix.
- Verified the corrected filter against the public catalog: 18 products were in the Rp4-Rp12 million range and 17 ready products remained eligible for gift ranking.
- Verified 369/369 local tests and 9/9 answer-coverage replay turns pass after the negated-JUNK fix.
- Verified the two-turn comparison regression, the full 369/369 local suite, and 9/9 answer-coverage replay turns after the comparison-context fix.
- Verified the restock parser against live WooCommerce metadata for product ID 4994.
- Verified 373/373 local tests and 9/9 answer-coverage replay turns after the restock schedule feature.
- Verified the greeting composer regression test makes zero calls to all three text providers; the full suite passes 374/374 and answer-coverage replay remains 9/9.
- Verified the exact reported restock sentence through parser and endpoint regressions, plus zero composer-provider calls; the full suite passes 375/375 and answer-coverage replay remains 9/9.
- Verified the crawler guard returns HTTP 204 for `meta-externalagent`, preserves HTTP 200 greeting behavior for a normal Chrome User-Agent, and passes the full 376/376 local suite.
- Verified production defense-in-depth after deployment: Vercel WAF returns HTTP 403 for `meta-externalagent/1.1`, while a normal Chrome request returns HTTP 200 with the deterministic greeting template.
- Verified the catalog retry regression reaches a successful second fetch after `UND_ERR_CONNECT_TIMEOUT`, does not retry HTTP 401, and passes the full 378/378 local suite.

### Documentation

- Added `docs/PANDUAN_TEKNIS_INTENT_ML_DAN_ALUR_CHATBOT.md` sebagai panduan komprehensif untuk skripsi dan live coding.
- Added a chronological 21-step walkthrough from browser input through request validation, context restoration, compound analysis, hybrid/semantic routing, grounded commerce handlers, coverage/composer safety, JSON response, and frontend rendering, with active file and line references.
- Synchronized the guide with the active 13-intent artifact: word/character TF-IDF FeatureUnion, Logistic Regression, metadata/checksum validation, current evaluation scope, and the production API test path.
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

