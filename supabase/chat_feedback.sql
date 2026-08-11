create table if not exists public.chat_feedback (
  id uuid primary key,
  session_hash text not null check (char_length(session_hash) = 64),
  rating text not null check (rating in ('helpful', 'unhelpful')),
  intent text not null,
  response_type text not null,
  assistant_provider text not null,
  assistant_reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_feedback_created_at_idx
  on public.chat_feedback (created_at desc);

create index if not exists chat_feedback_rating_intent_idx
  on public.chat_feedback (rating, intent);

alter table public.chat_feedback enable row level security;
