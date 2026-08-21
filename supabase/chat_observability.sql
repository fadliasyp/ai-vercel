create table if not exists public.chat_observability (
  id uuid primary key,
  session_hash text not null check (char_length(session_hash) = 64),
  status text not null check (status in ('success', 'error')),
  intent text not null,
  intent_method text not null,
  intent_score double precision,
  response_type text not null,
  assistant_provider text not null,
  assistant_model text not null,
  assistant_reason text not null,
  router_provider text not null,
  router_model text not null,
  latency_ms integer not null check (latency_ms >= 0),
  product_count integer not null default 0 check (product_count >= 0),
  option_count integer not null default 0 check (option_count >= 0),
  action_count integer not null default 0 check (action_count >= 0),
  answer_coverage_before double precision check (answer_coverage_before between 0 and 1),
  answer_coverage_after double precision check (answer_coverage_after between 0 and 1),
  coverage_requested text[] not null default '{}'::text[],
  coverage_repaired text[] not null default '{}'::text[],
  coverage_clarified text[] not null default '{}'::text[],
  coverage_unresolved text[] not null default '{}'::text[],
  llm_assistant_mode text not null default 'legacy',
  llm_composer_status text not null default 'disabled',
  llm_composer_accepted boolean not null default false,
  error_code text not null default 'none',
  created_at timestamptz not null default now()
);

alter table public.chat_observability
  add column if not exists answer_coverage_before double precision
    check (answer_coverage_before between 0 and 1),
  add column if not exists answer_coverage_after double precision
    check (answer_coverage_after between 0 and 1),
  add column if not exists coverage_requested text[] not null default '{}'::text[],
  add column if not exists coverage_repaired text[] not null default '{}'::text[],
  add column if not exists coverage_clarified text[] not null default '{}'::text[],
  add column if not exists coverage_unresolved text[] not null default '{}'::text[];

alter table public.chat_observability
  add column if not exists llm_assistant_mode text not null default 'legacy',
  add column if not exists llm_composer_status text not null default 'disabled',
  add column if not exists llm_composer_accepted boolean not null default false;

create index if not exists chat_observability_created_at_idx
  on public.chat_observability (created_at desc);

create index if not exists chat_observability_intent_status_idx
  on public.chat_observability (intent, status);

create index if not exists chat_observability_provider_idx
  on public.chat_observability (assistant_provider, assistant_reason);

alter table public.chat_observability enable row level security;
