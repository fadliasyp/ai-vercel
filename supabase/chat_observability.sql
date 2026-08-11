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
  error_code text not null default 'none',
  created_at timestamptz not null default now()
);

create index if not exists chat_observability_created_at_idx
  on public.chat_observability (created_at desc);

create index if not exists chat_observability_intent_status_idx
  on public.chat_observability (intent, status);

create index if not exists chat_observability_provider_idx
  on public.chat_observability (assistant_provider, assistant_reason);

alter table public.chat_observability enable row level security;
