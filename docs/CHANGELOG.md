# Changelog

Changelog ini hanya mencatat perubahan yang dapat diverifikasi dari task saat ini dan Git history yang tersedia. Riwayat sebelum commit yang dicantumkan belum dirangkum lengkap.

## Unreleased

- Added a single-line Vercel log for the Intent ML top-three predictions and confidence values without changing routing decisions.
- Changed frontend intent badges to consistent Indonesian labels without changing internal intent names, routing, or API behavior.
- Changed shared product resolution in active mode to consume the LLM's structured product entity before raw-text parsing, while retaining catalog and user-message grounding plus the local fallback.
- Changed product discovery in active mode to query the WooCommerce catalog with a grounded LLM product entity before falling back to cleaned customer text.

### Added

- Added structured return-problem and return-process goals so the semantic router can distinguish damaged, incomplete, dented-box, wrong-item, change-of-mind, evidence, refund-timing, and return-status requests.
- Added the structured `comparison` goal and required ordered pair of product entities for natural product-comparison requests.
- Added a product-grounding language matrix for compact model codes, reordered names, attribute questions, light typos, ambiguity, and unknown-product inverse cases.
- Added a structured LLM recommendation contract for price mode, target/range, purpose, stock, condition, and promo constraints.
- Added verified recommendation context fields so natural follow-ups can retain target price and purpose without leaking them into explicit new topics.
- Added `npm run benchmark:context` with six multi-turn gates covering recommendation price refinement, ordinal selection, focused-product pronouns, explicit product switches, restock topic switches, and interruption of pending shipping questions.
- Expanded `benchmark:context` to nine multi-turn production gates with focused-product promo/photo follow-ups and two-product references.
- Added default pacing to `benchmark:context` (8 seconds between cases and up to 2 seconds between turns), with an optional `--delay-ms` override.
- Added a separate seven-case `benchmark:transactions` gate for staged domestic shipping, pending-flow topic switches, international handoff, and compound shipping safeguards without changing the stable context benchmark.

### Changed

- Changed Vercel intent-log presentation to show `method: "ML"` and hide provider/model identities from the main intent and response-editor logs. The untouched original method plus router/response provider and model are emitted in a clearly labeled debug block immediately before the response.

### Fixed

- Fixed unavailable-stock results omitting verified WooCommerce restock schedules, then losing the product group on `kira2 kapan dia restok`. The first response now includes known schedules, and the follow-up resolves the casual pronoun to the previously displayed group instead of opening an unrelated product clarification.
- Fixed global unavailable-stock questions such as `yg habis /soldout robot apa ajaa` returning ready products. Semantic understanding now carries `entities.stock_status`, explicit local wording can correct a conflicting provider value, and the catalog filter keeps stock facts grounded in WooCommerce.
- Fixed `gua udah nunggu lama nih, kira2 kapan restok sih?` being treated as an unavailable product name. Casual first-person/waiting fillers are ignored by product grounding; on a general page the request lists verified upcoming restocks, while on a verified product page it uses that page product.
- Fixed `Rekomen dong robot buat kado budget 9 jutaan` being treated as a loose maximum after the semantic provider returned `price_mode: maximum`. Casual `budget X jutaan` now supplies target X plus hard maximum X, while explicit maximum wording remains unchanged.
- Fixed the production sentence `Gue punya budget maksimal 4 juta, enaknya ambil robot yang mana?` being locked as `price_promo`. Explicit product-selection language now survives a conflicting semantic provider result, stays recommendation through the budget stage, and no longer treats `gue punya budget` as a missing product name.
- Connected trusted return goals to the deterministic store-policy builder. Casual complaints such as a missing robot hand now receive the incomplete-item procedure, while refund-duration questions receive the verified timeline without allowing the LLM to invent policy.
- Connected two grounded LLM product entities to the comparison handler before the legacy regex parser, while retaining WooCommerce matching and the existing fallback path.
- Fixed `brang apa saja yang dijual?` being treated as a search for a product named `brang` even though Gemini correctly returned a product-free catalog-search route. Shared normalization now maps `brang` to `barang`, and trusted object-free `product_search` understanding opens the WooCommerce catalog overview while named-series searches remain unchanged.
- Normalized `lgs`, `lgsg`, and `lngs` to `langsung` and taught the semantic router that `bisa langsung dibungkus ... apa aja` requests the ready-stock list.
- Added a narrow `global_ready_stock_guard` so a high-confidence provider misclassification cannot turn that fulfillment phrase into a product keyword; product facts still come only from WooCommerce.
- Added an endpoint regression using the exact wrong Groq route captured in production (`product_discovery`, confidence 0.92, no product entity).
- Connected trusted product-free `stock` understanding to the WooCommerce ready-stock listing instead of treating conversational filler as a missing product name.
- Added the structured `stock_policy` goal so informal questions about always-ready or PO policy remain separate from requests to list ready products; all counts still come from WooCommerce.
- Narrowed the catalog-availability conflict guard to named products, preserving `tampilkan Voltes yang tersedia` as discovery without overriding product-free stock requests.
- Removed the overly broad `barang apa aja` stock phrase so ordinary catalog-overview questions are no longer mislabeled as stock checks.
- Connected the trusted LLM `promo` goal to the existing catalog-promotion handler, including casual or misspelled requests that do not contain the local literal promo keywords.
- Used grounded LLM product entities for product-specific promotion lookup while keeping entity-free promotion questions scoped to the whole catalog.
- Preserved factual single-product promotion intros through response presentation so `belum sedang promo` is not replaced by a generic product-found sentence.
- Connected trusted LLM product-detail goals to the WooCommerce fact formatter, so casual typos such as `bahanya` and `komplit` still return the requested material/completeness without adding unrelated price or stock facts.
- Kept explicit manufacturing-origin statements such as `Made in`, country of origin, and import status visible in full product details while retaining the existing unknown-data admin handoff.
- Fixed named-family recommendations such as `dari semua variasi Voltes mana yang paling worth it` ranking the entire catalog when Groq returned an empty `product_names` array. Catalog-grounded fallback now scopes candidates before ranking and Gemini selection, and never substitutes another series when no scoped ready product exists.
- Prevented an LLM product entity from narrowing a family request such as `Voltes` to a full catalog variant that the customer did not mention. Every entity token must now be grounded in the current message.
- Fixed `Aku kepengen banget lihat koleksi lawas seri Voltes` being locked as a recommendation and returning unrelated alternatives. Explicit catalog browsing now wins this narrow conflict, and the semantic prompt distinguishes browsing a collection from asking for a recommendation.
- Fixed bulk-discount questions such as `Kalau beli tiga barang, bisa dapat potongan harga nggak?` falling through to product lookup. The active LLM `bulk_discount` goal now routes directly to verified store policy, with Indonesian word-number extraction retained as fallback.
- Fixed informal restock questions such as `kalau Voltron habis, kapan restok?` being rejected as unknown products. Restock wording is now removed from product identity matching while stock and schedule facts remain catalog-grounded.
- Fixed requests such as `Coba tampilin robot Voltron yang tersedia` being locked as stock checks. Catalog availability now remains product discovery even if the LLM returns high-confidence `stock_availability`, while explicit quantity/ready/restock questions keep their existing route.
- Normalized casual display verbs (`tampilin`, `nampilin`, and `tunjukin`) and removed `coba` from product identity tokens so valid catalog matches are not rejected by conversational filler.
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
- Made focused-product promo follow-ups bypass the global promo listing. The active-LLM regression and production smoke gate now require exactly one referenced product.
- Stopped the context smoke benchmark early when WooCommerce returns the existing transient catalog-unavailable payload, so one HTTP 508 resource incident is no longer reported as failures across every remaining chatbot case.
- Fixed validated LLM transaction facets being discarded by the deterministic policy builder. Natural payment wording such as `Kalau bayar bisa pakai apa aja?` now renders verified payment methods instead of a generic transaction-topic clarification.

### Verification

- The unavailable-stock to grouped-restock two-turn regression passes the full 413/413 suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. Production smoke is pending deployment.
- Ready-versus-unavailable stock-list regressions pass the full 412/412 suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. Production smoke is pending deployment.
- The casual-restock regression passes the full 412/412 suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. Production smoke is pending deployment.
- The exact Rp9 million gift-budget regression rejects distant cheap products and passes the full 411/411 suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. Production smoke is pending deployment.
- The recommendation-selection conflict regression reproduces the exact production Groq route and passes the full 410/410 suite, 9/9 answer-coverage replay turns, 26/26 customer-conversation turns with 135 assertions, and the user-confirmed 3/3 production smoke.
- Intent-log presentation changes pass the full 410/410 local suite without changing routing or response behavior.
- LLM-grounded Product Return passes active-LLM endpoint regressions, the full 410/410 local suite, 9/9 answer-coverage replay turns, 26/26 customer-conversation turns with 135 assertions, and the user-confirmed 5/5 production smoke.
- The user confirmed the five Product Comparison production smoke cases pass.
- LLM-grounded Product Comparison passes active-LLM endpoint regression, the full local suite, 9/9 answer-coverage replay turns, 26/26 customer-conversation turns with 135 assertions, and the user-confirmed 5/5 production smoke.
- The user confirmed the five Stock Availability and catalog-overview production smoke cases pass.
- The exact production fallback route for `brang apa saja yang dijual?` and a separate object-free `lihat produk` route pass endpoint regression; the full suite, 9/9 coverage replay, and 26/26 customer turns with 135 assertions pass.
- LLM-grounded Stock Availability passes the full local suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. The first production smoke exposed the `lngs dibungkus` provider error; its correction is locally verified and awaits redeployment.
- LLM-grounded Price/Promo passes the full local suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. The LLM shadow benchmark is blocked by an invalid local Vercel CLI token; the user-confirmed production smoke passes 5/5.
- The user confirmed the deployed Product Detail smoke cases pass 3/3 in production.
- LLM-grounded Product Detail passes the full 408/408 suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions; the user-confirmed production smoke passes 3/3.
- The user confirmed the deployed named-family Voltes recommendation now returns the correct scoped results in production.
- Named-family recommendation regression reproduces the production Groq response with confidence 0.92 and empty `product_names`; the full 406/406 suite, 9/9 coverage replay, and 26/26 customer turns with 135 assertions pass.
- LLM-first product discovery passes the full 405/405 local suite, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions. Production smoke is pending deployment.
- Transaction Continuity Batch 1 passes syntax/JSON/diff checks, the full 403/403 local suite, and the rules-only international-shipping smoke.
- The first transaction production gate passed 6/7 and isolated the payment-facet bridge bug. After the fix, targeted tests pass 12/12, the full suite passes 403/403, coverage replay passes 9/9, and the customer benchmark passes 26/26 turns with 135 assertions.
- After deployment, the user-confirmed transaction production rerun passes all 7/7 cases on 2026-10-06.
- Product-grounding verification passes 400/400 local tests, 9/9 answer-coverage replay turns (59.4% before repair, 88.9% after repair), and 5/5 user-run production smoke cases.
- Multi-turn Product Continuity passes 403/403 local tests, 9/9 answer-coverage replay turns, and 26/26 customer-conversation turns with 135 assertions.
- The first 9-case production context smoke passed 8/9. After fixing the compare-to-stock transition and deploying it, the production rerun passed 9/9.
- Payload inspection found that the earlier 9/9 result still contained a loose focused-promo assertion. After tightening the one-product gate and routing, the user-confirmed strict production rerun passes 9/9.
- The strict production rerun was blocked by WooCommerce HTTP 508 `Insufficient Resource`. The accompanying log still showed the correct Groq `stock_availability` decision before catalog retrieval failed. The benchmark-runner hardening passes syntax checks, diff checks, and the full 403/403 local test suite.
- After WooCommerce recovered, the same strict production context benchmark passed all 9/9 cases on 2026-10-06.
- User-confirmed production smoke passes 3/3 for focused-product stock continuity, exact two-product stock continuity, and focused-product promotion scope.
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

