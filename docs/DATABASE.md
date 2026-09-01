# Database

## Overview

Project menggunakan Supabase/PostgreSQL melalui `@supabase/supabase-js`. Tidak ada ORM, migration framework, seed script, atau foreign-key relationship yang dapat dibuktikan dari repository. SQL yang tersedia bersifat idempotent `create table if not exists` dan `alter table ... add column if not exists`.

Supabase bersifat optional pada runtime: API masih dapat menjawab dengan memory/local fallback, tetapi session lintas instance, metrics, dan feedback persistence dapat hilang.

## Tables

### `public.chat_observability`

Schema tersedia di `supabase/chat_observability.sql`.

Fields:

| Field | Type / rule | Purpose |
| --- | --- | --- |
| `id` | uuid primary key | Event ID generated in app |
| `session_hash` | text, length 64 | SHA-256 session correlation tanpa raw ID |
| `status` | success/error | Request outcome |
| `intent`, `intent_method`, `intent_score` | text/text/double | Intent decision metadata |
| `response_type` | text | Response shape |
| `assistant_provider`, `assistant_model`, `assistant_reason` | text | Assistant/composer source |
| `router_provider`, `router_model` | text | Semantic router source |
| `latency_ms` | nonnegative integer | Request latency |
| `product_count`, `option_count`, `action_count` | nonnegative integer | Response counts |
| `answer_coverage_before`, `answer_coverage_after` | 0..1 nullable | Coverage scores |
| `coverage_requested`, `coverage_repaired`, `coverage_clarified`, `coverage_unresolved` | text arrays | Facet tracking |
| `llm_assistant_mode` | text, default legacy | legacy/shadow/active telemetry |
| `llm_composer_status` | text | Composer result status |
| `llm_composer_accepted` | boolean | Whether candidate was accepted |
| `error_code` | text | Sanitized error classification |
| `created_at` | timestamptz | Event time |

Indexes:

- `chat_observability_created_at_idx` on `created_at desc`.
- `chat_observability_intent_status_idx` on `(intent, status)`.
- `chat_observability_provider_idx` on `(assistant_provider, assistant_reason)`.

Constraints:

- Session hash length 64.
- Status enum-like check.
- Nonnegative counts/latency.
- Coverage score between 0 and 1.

RLS is enabled. RLS policy definitions are not present in repository. Server writes use service-role credentials.

### `public.chat_feedback`

Schema tersedia di `supabase/chat_feedback.sql`.

Fields:

| Field | Type / rule | Purpose |
| --- | --- | --- |
| `id` | uuid primary key | Feedback event ID |
| `session_hash` | text, length 64 | Hashed session |
| `rating` | helpful/unhelpful | User rating |
| `intent` | text | Intent associated with answer |
| `response_type` | text | Response shape |
| `assistant_provider`, `assistant_reason` | text | Provider metadata |
| `created_at` | timestamptz | Event time |

Indexes:

- `chat_feedback_created_at_idx` on `created_at desc`.
- `chat_feedback_rating_intent_idx` on `(rating, intent)`.

RLS is enabled; policy definitions are not present.

### `public.chat_sessions`

Status schema: **UNKNOWN / perlu dikonfirmasi**.

Source `sessionStore.js` membuktikan fields yang digunakan:

- `session_id`: query equality dan upsert conflict target, sehingga production kemungkinan memerlukan unique/primary-key constraint.
- `state`: object/JSON state.
- `updated_at`: timestamp ISO saat upsert.

Tidak ada SQL pembuat tabel, type, index, constraint, atau RLS policy untuk tabel ini di repository. Jangan membuat migration berdasarkan dugaan; introspeksi schema production atau cari migration authoritative terlebih dahulu.

## Relationships

Tidak ada foreign keys yang ditemukan. `session_hash` pada metrics/feedback bukan foreign key dan sengaja tidak menyimpan raw `session_id`.

## Data Safety

- `SUPABASE_SERVICE_ROLE_KEY` hanya boleh digunakan server-side.
- Session observability/feedback di-hash dengan salt; set `OBSERVABILITY_HASH_SALT` dan `FEEDBACK_HASH_SALT` production.
- Jangan menyimpan email/telepon billing dalam observability atau chat history.
- Feedback endpoint tetap menerima request tanpa Supabase, tetapi melaporkan `persisted: false`.
- Backup/schema change harus dilakukan melalui task database khusus dan diverifikasi sebelum deploy.

## Migration And Seed Status

- Migration framework: tidak ada.
- Raw SQL: dua file di `supabase/`.
- Seed: tidak ditemukan.
- Applied state di Supabase production: belum diketahui / perlu dikonfirmasi.

